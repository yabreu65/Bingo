export function basicAuthHeader(username, password) {
  if (typeof username !== 'string' || !username || username.includes(':') ||
      typeof password !== 'string' || !password) {
    throw new TypeError('invalid Basic Auth credentials');
  }
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export function basicAuthHeaderFromEnv(env = process.env) {
  const username = env?.BINGO_BASIC_AUTH_USER;
  const password = env?.BINGO_BASIC_AUTH_PASSWORD;
  if (!username || !password) {
    throw new TypeError('BINGO_BASIC_AUTH_USER and BINGO_BASIC_AUTH_PASSWORD are required for Contabo mode');
  }
  return basicAuthHeader(username, password);
}
