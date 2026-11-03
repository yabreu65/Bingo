// Diagnostic preload only. Never force-exits or suppresses Jest's warning.
const asyncHooks = require('async_hooks');
const fs = require('fs');
const path = require('path');
const tracked = new Map();
const output = path.resolve(__dirname, '../.t8-handles-report.json');
const snapshots = [];
const hook = asyncHooks.createHook({
  init(id, type, trigger, resource) {
    if (['Timeout', 'TCPWRAP', 'TCPSERVERWRAP', 'PROCESSWRAP', 'PIPEWRAP'].includes(type)) {
      tracked.set(id, { type, trigger, resource, stack: new Error().stack.split('\n').slice(2, 14).join('\n') });
    }
  },
  destroy(id) { tracked.delete(id); }
});
hook.enable();
function snapshot(reason) {
  const resources = [...tracked.values()].map(({ type, resource, stack }) => ({
    type, referenced: typeof resource.hasRef === 'function' ? resource.hasRef() : null,
    timerMs: resource._idleTimeout, repeatMs: resource._repeat, destroyed: resource._destroyed, stack
  }));
  snapshots.push({ reason, timestamp: Date.now(), activeTypes: process.getActiveResourcesInfo(), resources });
  fs.writeFileSync(output, JSON.stringify(snapshots, null, 2));
}
const write = process.stderr.write;
process.stderr.write = function(chunk, ...args) {
  if (String(chunk).includes('Jest did not exit one second')) snapshot('jest-warning');
  return write.call(this, chunk, ...args);
};
process.once('beforeExit', () => snapshot('before-exit'));
