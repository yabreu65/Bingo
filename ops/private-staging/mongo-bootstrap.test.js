const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'mongo-bootstrap.js'), 'utf8');
const expectedConfig = {
  _id: 'bingo-rs',
  members: [{ _id: 0, host: 'mongo:27017' }]
};

function runBootstrap({
  configResults,
  existingUser = false,
  envOverrides = {},
  rootAuth = () => 1,
  appAuth = () => 1,
  userRoles = [{ role: 'readWrite', db: 'bingo_private' }]
} = {}) {
  let configCalls = 0;
  let initiateCalls = 0;
  let userCreateCalls = 0;
  const output = [];
  let exitCode = 0;
  const admin = {
    auth: rootAuth,
    runCommand(command) {
      if (command.replSetInitiate) {
        initiateCalls += 1;
        return { ok: 1 };
      }
      if (command.hello) return { setName: 'bingo-rs', isWritablePrimary: true };
      throw new Error('unexpected admin command');
    }
  };
  const appDb = {
    runCommand(command) {
      if (command.usersInfo) {
        return {
          ok: 1,
          users: existingUser ? [{ roles: userRoles }] : []
        };
      }
      if (command.createUser) {
        userCreateCalls += 1;
        assert.equal(command.roles.length, 1);
        assert.equal(command.roles[0].role, 'readWrite');
        assert.equal(command.roles[0].db, 'bingo_private');
        return { ok: 1 };
      }
      throw new Error('unexpected app database command');
    },
    auth: appAuth
  };
  const context = {
    process: {
      env: {
        MONGO_ROOT_USERNAME: 'test-root',
        MONGO_ROOT_PASSWORD: 'test-root-password',
        MONGODB_URI: 'mongodb://test-app:test-app-password@mongo:27017/bingo_private?replicaSet=bingo-rs&authSource=bingo_private',
        ...envOverrides
      }
    },
    db: {
      getSiblingDB(name) {
        if (name === 'admin') return admin;
        if (name === 'bingo_private') return appDb;
        throw new Error('unexpected database');
      }
    },
    rs: {
      conf() {
        configCalls += 1;
        const result = configResults(configCalls);
        if (result instanceof Error) throw result;
        return result;
      }
    },
    decodeURIComponent,
    sleep() {},
    print(message) { output.push(message); },
    quit(code) {
      exitCode = code;
      throw Object.assign(new Error('mongosh quit'), { exitCode: code });
    }
  };

  try {
    vm.runInNewContext(source, context, { filename: 'mongo-bootstrap.js' });
  } catch (error) {
    assert.equal(error.exitCode, 1);
  }
  return { configCalls, initiateCalls, userCreateCalls, output, exitCode };
}

const notInitialized = () => Object.assign(new Error('not initialized'), { code: 94 });

test('retries config retrieval after replica-set initiation and continues when config appears', () => {
  const result = runBootstrap({
    configResults(call) {
      if (call === 1 || call === 2) return notInitialized();
      return expectedConfig;
    }
  });

  assert.equal(result.initiateCalls, 1);
  assert.equal(result.configCalls, 3);
  assert.equal(result.userCreateCalls, 1);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, ['Mongo private-staging replica set and least-privilege app user are ready.']);
});

test('accepts the already-initialized expected replica set without reinitiating it', () => {
  const result = runBootstrap({ configResults: () => expectedConfig, existingUser: true });

  assert.equal(result.configCalls, 1);
  assert.equal(result.initiateCalls, 0);
  assert.equal(result.userCreateCalls, 0);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, ['Mongo private-staging replica set and least-privilege app user are ready.']);
});

test('fails closed after bounded post-init config retries are exhausted', () => {
  const result = runBootstrap({
    configResults(call) {
      return call === 1 ? notInitialized() : notInitialized();
    }
  });

  assert.equal(result.initiateCalls, 1);
  assert.ok(result.configCalls > 2);
  assert.ok(result.configCalls <= 32);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.output, [
    'Mongo private-staging bootstrap failed phase=replica-set-initiation reason=replica-config-unavailable.'
  ]);
});

test('accepts mongosh object-shaped root and application auth results', () => {
  const result = runBootstrap({configResults: () => expectedConfig, rootAuth: () => ({ok: 1}), appAuth: () => ({ok: 1})});
  assert.equal(result.exitCode, 0);
  assert.equal(result.userCreateCalls, 1);
});

test('rejects mongosh object-shaped failed root authentication', () => {
  const result = runBootstrap({configResults: () => expectedConfig, rootAuth: () => ({ok: 0})});
  assert.equal(result.exitCode, 1);
  assert.match(result.output.join(' '), /root-auth-failed/);
});

test('classifies root authentication failure without emitting credentials', () => {
  const result = runBootstrap({ configResults: () => expectedConfig, rootAuth: () => 0 });
  const output = result.output.join(' ');

  assert.equal(result.exitCode, 1);
  assert.equal(output, 'Mongo private-staging bootstrap failed phase=root-authentication reason=root-auth-failed.');
  assert.doesNotMatch(output, /test-root|test-root-password|test-app-password/);
});

test('classifies unexpected replica-config errors without printing exception details', () => {
  const secret = 'SYNTHETIC-DO-NOT-LOG';
  const error = Object.assign(new Error(`mongodb://test-app:${secret}@internal/db`), { code: 13 });
  const result = runBootstrap({ configResults: () => error });
  const output = result.output.join(' ');

  assert.equal(result.exitCode, 1);
  assert.equal(output, 'Mongo private-staging bootstrap failed phase=replica-set-config reason=replica-config-unavailable.');
  assert.doesNotMatch(output, /SYNTHETIC|mongodb:|test-app/);
});

test('rejects an application user whose role exceeds the database-scoped minimum', () => {
  const result = runBootstrap({
    configResults: () => expectedConfig,
    existingUser: true,
    userRoles: [{ role: 'root', db: 'admin' }]
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.output, [
    'Mongo private-staging bootstrap failed phase=app-user-role-validation reason=user-role-mismatch.'
  ]);
});

test('classifies application authentication failure without exposing the URI', () => {
  const result = runBootstrap({ configResults: () => expectedConfig, appAuth: () => ({ ok: 0 }) });
  const output = result.output.join(' ');

  assert.equal(result.exitCode, 1);
  assert.equal(output, 'Mongo private-staging bootstrap failed phase=app-user-authentication reason=app-auth-failed.');
  assert.doesNotMatch(output, /test-app|test-app-password|mongodb:/);
});
