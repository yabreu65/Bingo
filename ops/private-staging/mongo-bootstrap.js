// One-shot, idempotent replica-set and app-user bootstrap for the private
// Compose network. Diagnostics use fixed allowlisted labels; never print credentials.
(() => {
  const safePhases = new Set([
    'input-validation', 'uri-validation', 'root-authentication',
    'replica-set-config', 'replica-set-initiation', 'replica-set-primary',
    'app-user-lookup', 'app-user-create', 'app-user-role-validation',
    'app-user-authentication', 'unexpected'
  ]);
  const safeReasons = new Set([
    'missing-required-setting', 'invalid-app-uri', 'root-auth-failed',
    'replica-config-unavailable', 'replica-initiation-rejected',
    'replica-config-mismatch', 'primary-election-timeout',
    'user-lookup-failed', 'user-create-failed', 'user-role-mismatch',
    'app-auth-failed', 'internal-error'
  ]);
  const authSucceeded = (response) => response === 1 || (response !== null && typeof response === 'object' && response.ok === 1);
  let phase = 'input-validation';
  let exiting = false;

  const fail = (reason) => {
    const safePhase = safePhases.has(phase) ? phase : 'unexpected';
    const safeReason = safeReasons.has(reason) ? reason : 'internal-error';
    exiting = true;
    print(`Mongo private-staging bootstrap failed phase=${safePhase} reason=${safeReason}.`);
    quit(1);
  };

  try {
    phase = 'input-validation';
    const rootUser = process.env.MONGO_ROOT_USERNAME;
    const rootPassword = process.env.MONGO_ROOT_PASSWORD;
    const appUriValue = process.env.MONGODB_URI;
    if (!rootUser || !rootPassword || !appUriValue) fail('missing-required-setting');

    phase = 'uri-validation';
    const uriMatch = /^mongodb:\/\/([^:@/]+):([^@/]+)@mongo:27017\/bingo_private\?([^#]+)$/.exec(appUriValue);
    if (!uriMatch) fail('invalid-app-uri');
    const appUser = decodeURIComponent(uriMatch[1]);
    const appPassword = decodeURIComponent(uriMatch[2]);
    const uriOptions = {};
    for (const part of uriMatch[3].split('&')) {
      const [key, value] = part.split('=');
      if (!key || value === undefined || uriOptions[decodeURIComponent(key)] !== undefined) {
        fail('invalid-app-uri');
      }
      uriOptions[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    if (!appUser || !appPassword || uriOptions.replicaSet !== 'bingo-rs' ||
        uriOptions.authSource !== 'bingo_private') fail('invalid-app-uri');

    const admin = db.getSiblingDB('admin');
    phase = 'root-authentication';
    let authenticated = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        authenticated = authSucceeded(admin.auth(rootUser, rootPassword));
      } catch (_) {
        authenticated = false;
      }
      if (authenticated) break;
      sleep(1000);
    }
    if (!authenticated) fail('root-auth-failed');

    phase = 'replica-set-config';
    let config;
    try {
      config = rs.conf();
    } catch (error) {
      // Only NotYetInitialized permits initiation; all other errors fail closed.
      if (error.code !== 94) fail('replica-config-unavailable');
      phase = 'replica-set-initiation';
      const initiated = admin.runCommand({
        replSetInitiate: {
          _id: 'bingo-rs',
          members: [{ _id: 0, host: 'mongo:27017' }]
        }
      });
      if (initiated.ok !== 1) fail('replica-initiation-rejected');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          config = rs.conf();
          break;
        } catch (retryError) {
          if (retryError.code !== 94 || attempt === 29) fail('replica-config-unavailable');
          sleep(1000);
        }
      }
      if (!config) fail('replica-config-unavailable');
    }
    if (config._id !== 'bingo-rs' || config.members.length !== 1 ||
        config.members[0]._id !== 0 || config.members[0].host !== 'mongo:27017') {
      fail('replica-config-mismatch');
    }

    phase = 'replica-set-primary';
    let primary = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      try {
        const hello = admin.runCommand({ hello: 1 });
        primary = hello.setName === 'bingo-rs' && hello.isWritablePrimary === true;
      } catch (_) {
        primary = false;
      }
      if (primary) break;
      sleep(1000);
    }
    if (!primary) fail('primary-election-timeout');

    const appDb = db.getSiblingDB('bingo_private');
    phase = 'app-user-lookup';
    const userInfo = appDb.runCommand({ usersInfo: appUser });
    if (userInfo.ok !== 1 || !Array.isArray(userInfo.users)) fail('user-lookup-failed');
    if (userInfo.users.length === 0) {
      phase = 'app-user-create';
      const created = appDb.runCommand({
        createUser: appUser,
        pwd: appPassword,
        roles: [{ role: 'readWrite', db: 'bingo_private' }]
      });
      if (created.ok !== 1) fail('user-create-failed');
    } else {
      phase = 'app-user-role-validation';
      const roles = userInfo.users[0].roles;
      if (userInfo.users.length !== 1 || roles.length !== 1 ||
          roles[0].role !== 'readWrite' || roles[0].db !== 'bingo_private') {
        fail('user-role-mismatch');
      }
    }

    phase = 'app-user-authentication';
    if (!authSucceeded(appDb.auth(appUser, appPassword))) fail('app-auth-failed');

    print('Mongo private-staging replica set and least-privilege app user are ready.');
  } catch (_) {
    // The failing command can contain a URI, username, server address, or secret.
    // Do not inspect/print it; emit only a fixed classification.
    if (exiting) throw _;
    phase = 'unexpected';
    fail('internal-error');
  }
})();
