import { afterEach, expect, it, vi } from 'vitest';
import { getBackendUrl } from './api';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('uses same-origin API and socket base on production HTTPS without visitor localhost', () => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_BACKEND_URL', 'http://localhost:5001');
  vi.stubGlobal('window', { location: { origin: 'https://event.example', hostname: 'event.example', protocol: 'https:' } });
  expect(getBackendUrl()).toBe('https://event.example');
});
it('retains explicitly configured development backend', () => {
  vi.stubEnv('PROD', false);
  vi.stubEnv('VITE_BACKEND_URL', 'http://127.0.0.1:5123');
  expect(getBackendUrl()).toBe('http://127.0.0.1:5123');
});
