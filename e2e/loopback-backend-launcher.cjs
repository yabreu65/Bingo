'use strict';

const http = require('node:http');
const expectedPort = Number(process.env.PORT);

if (!Number.isInteger(expectedPort) || expectedPort < 1 || expectedPort > 65535) {
  throw new Error('E2E backend launcher requires a valid PORT');
}

const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  const requestedPort = Number(args[0]);
  const callback = args.length === 2 && typeof args[1] === 'function' ? args[1] : undefined;
  if (!Number.isInteger(requestedPort) || requestedPort !== expectedPort || args.length > 2 ||
      (args.length === 2 && !callback)) {
    throw new Error('E2E backend launcher rejected an unexpected HTTP listen request');
  }

  const verifyLoopback = (...callbackArgs) => {
    const address = this.address();
    if (!address || address.address !== '127.0.0.1' || address.port !== expectedPort) {
      console.error('E2E_BACKEND_BIND_REJECTED');
      this.close(() => process.exit(1));
      return;
    }
    process.stdout.write(`E2E_BACKEND_BIND_VERIFIED ${address.address}:${address.port}\n`);
    callback?.apply(this, callbackArgs);
  };

  return originalListen.call(this, expectedPort, '127.0.0.1', verifyLoopback);
};

require('../backend/server.js');
