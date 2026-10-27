import { describe, expect, it, vi } from 'vitest';
import {
  createTVDisplayURL,
  listenForTVAuthorization,
  openTVDisplay
} from './tvAuthorization';

const capability = 't'.repeat(43);

describe('TV capability handoff', () => {
  it('keeps the TV capability out of the display URL', () => {
    const url = createTVDisplayURL('https://bingo.example', 'abc123');

    expect(url).toBe('https://bingo.example/?tv=ABC123');
    expect(url).not.toContain(capability);
  });

  it('authorizes only a valid message from the same-origin opener for this room', () => {
    const opener = { postMessage: vi.fn() };
    const windowRef = {
      opener,
      location: { origin: 'https://bingo.example' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const onCapability = vi.fn();
    const cleanup = listenForTVAuthorization(windowRef, 'abc123', onCapability);
    const handler = windowRef.addEventListener.mock.calls[0][1];
    const data = { type: 'bingo-tv-authorize', roomCode: 'ABC123', tvCapability: capability };

    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'bingo-tv-ready', roomCode: 'ABC123' },
      'https://bingo.example'
    );
    handler({ source: {}, origin: 'https://bingo.example', data });
    handler({ source: opener, origin: 'https://attacker.example', data });
    handler({ source: opener, origin: 'https://bingo.example', data: { ...data, roomCode: 'OTHER1' } });
    handler({ source: opener, origin: 'https://bingo.example', data: { ...data, tvCapability: 'invalid' } });
    expect(onCapability).not.toHaveBeenCalled();

    handler({ source: opener, origin: 'https://bingo.example', data });
    expect(onCapability).toHaveBeenCalledWith(capability);
    cleanup();
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('message', handler);
  });

  it('sends the capability only to the matching same-origin TV popup', () => {
    const tvWindow = { postMessage: vi.fn() };
    const windowRef = {
      location: { origin: 'https://bingo.example' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      open: vi.fn(() => tvWindow),
      setTimeout: vi.fn(() => 9),
      clearTimeout: vi.fn()
    };
    const tvUrl = createTVDisplayURL('https://bingo.example', 'abc123');
    openTVDisplay(windowRef, tvUrl, 'abc123', capability);
    const handler = windowRef.addEventListener.mock.calls[0][1];
    const data = { type: 'bingo-tv-ready', roomCode: 'ABC123' };

    expect(windowRef.open).toHaveBeenCalledWith(tvUrl, 'bingo-tv-ABC123');
    expect(tvUrl).not.toContain(capability);
    handler({ source: {}, origin: 'https://bingo.example', data });
    handler({ source: tvWindow, origin: 'https://attacker.example', data });
    handler({ source: tvWindow, origin: 'https://bingo.example', data: { ...data, roomCode: 'OTHER1' } });
    expect(tvWindow.postMessage).not.toHaveBeenCalled();

    handler({ source: tvWindow, origin: 'https://bingo.example', data });
    expect(tvWindow.postMessage).toHaveBeenCalledWith({
      type: 'bingo-tv-authorize',
      roomCode: 'ABC123',
      tvCapability: capability
    }, 'https://bingo.example');
    expect(windowRef.clearTimeout).toHaveBeenCalledWith(9);
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('message', handler);
  });

  it('cleans up authorization listeners when the browser blocks the popup', () => {
    const onBlocked = vi.fn();
    const windowRef = {
      location: { origin: 'https://bingo.example' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      open: vi.fn(() => null),
      setTimeout: vi.fn(() => 9),
      clearTimeout: vi.fn()
    };

    expect(openTVDisplay(windowRef, '/?tv=ABC123', 'ABC123', capability, onBlocked)).toBeNull();
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(windowRef.clearTimeout).toHaveBeenCalledWith(9);
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
