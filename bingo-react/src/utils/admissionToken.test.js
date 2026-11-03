import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdmissionToken } from './admissionToken';

describe('persistent room-bound admission token', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks();
    vi.stubGlobal('navigator', { locks: { request: async (_key, callback) => callback() } });
  });
  it('uses secure random bytes, survives reload-style calls and isolates rooms', async () => {
    const first = await getAdmissionToken('ABC123');
    expect(first).toMatch(/^ABC123\.[A-Za-z0-9_-]{43}$/);
    expect(await getAdmissionToken('ABC123')).toBe(first);
    expect(await getAdmissionToken('XYZ789')).not.toBe(first);
  });
  it('fails closed when durable storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(getAdmissionToken('ABC123')).rejects.toThrow();
  });
  it('does not create two identities when tabs race without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    const original = Storage.prototype.getItem;
    let second;
    let firstRead = true;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(key) {
      if (firstRead && key === 'bingo-admission:ABC123') {
        firstRead = false;
        second = getAdmissionToken('ABC123');
        return null; // First tab retains its empty snapshot while the other creates a key.
      }
      return original.call(this, key);
    });
    try {
      const first = getAdmissionToken('ABC123');
      const results = await Promise.allSettled([first, second]);
      expect(results.every(result => result.status === 'rejected')).toBe(true);
      expect(localStorage.getItem('bingo-admission:ABC123')).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('recovers an existing key without Web Locks instead of creating a new identity', async () => {
    const token = await getAdmissionToken('ABC123');
    vi.stubGlobal('navigator', {});
    expect(await getAdmissionToken('ABC123')).toBe(token);
  });
  it('rejects invalid room codes instead of storing credentials', async () => {
    await expect(getAdmissionToken('../bad')).rejects.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
