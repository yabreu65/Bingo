import { describe, expect, it } from 'vitest';
import { createPlayerEntryURL, resolveEntryRoute } from './entryRoutes';

const resolve = (pathname, search = '') => resolveEntryRoute({ pathname, search });

describe('explicit frontend entry routes', () => {
  it('generates QR links with an explicit path and no router query', () => {
    const url = createPlayerEntryURL('https://bingo.example', 'abc123');

    expect(url).toBe('https://bingo.example/player/ABC123');
    expect(url).not.toContain('?room=');
  });

  it('resolves a player route from its path, not the legacy room query', () => {
    expect(resolve('/player/abc123', '?room=OTHER1')).toEqual({
      type: 'player',
      roomCode: 'ABC123'
    });
  });

  it('resolves a TV route from its path and keeps its independent session token', () => {
    const token = 't'.repeat(43);
    expect(resolve('/tv/abc123', `?tv=OTHER1&tvToken=${token}`)).toEqual({
      type: 'tv',
      roomCode: 'ABC123',
      tvToken: token
    });
  });

  it('resolves the organizer entry as a distinct protected frontend path', () => {
    expect(resolve('/organizer/')).toEqual({ type: 'organizer' });
  });
});

describe('legacy entry URL compatibility', () => {
  it('translates a legacy QR URL to the explicit player path', () => {
    expect(resolve('/', '?room=abc123')).toEqual({
      type: 'redirect',
      to: '/player/ABC123',
      navigation: 'history'
    });
  });

  it('translates a legacy temporary TV link without moving its token into the router rule', () => {
    const token = 'v'.repeat(43);
    expect(resolve('/', `?tv=abc123&tvToken=${token}`)).toEqual({
      type: 'redirect',
      to: `/tv/ABC123?tvToken=${token}`,
      navigation: 'history'
    });
  });

  it('translates a legacy same-window TV URL without inventing a TV capability', () => {
    expect(resolve('/', '?tv=abc123')).toEqual({
      type: 'redirect',
      to: '/tv/ABC123',
      navigation: 'history'
    });
  });

  it('sends a bare or ambiguous root request through the protected organizer path', () => {
    expect(resolve('/')).toEqual({
      type: 'redirect',
      to: '/organizer',
      navigation: 'document'
    });
    expect(resolve('/', '?room=ABC123&tv=ABC123')).toEqual({
      type: 'redirect',
      to: '/organizer',
      navigation: 'document'
    });
  });

  it('does not convert malformed room codes into public player routes', () => {
    expect(resolve('/', '?room=../admin')).toEqual({
      type: 'redirect',
      to: '/organizer',
      navigation: 'document'
    });
    expect(resolve('/player/not-a-code')).toEqual({ type: 'not-found' });
  });
});
