import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrganizerDashboard from './OrganizerDashboard';

const socketTest = vi.hoisted(() => {
  const listeners = {};
  return {
    listeners,
    socket: { on: vi.fn((name, callback) => { listeners[name] = callback; }), off: vi.fn(), emit: vi.fn() },
    joinRoom: vi.fn()
  };
});

vi.mock('../../context/useSocket', () => ({
  useSocket: () => ({ socket: socketTest.socket, joinRoom: socketTest.joinRoom })
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

const roomData = {
  roomCode: 'ABC123',
  playerId: 'owner-1',
  playerName: 'Organizador',
  hostCapability: 'test-only',
  tvCapability: 'tv-only',
  isHost: true,
  room: {
    code: 'ABC123',
    players: [{ _id: 'owner-1', name: 'Organizador', isHost: true, isConnected: true }],
    config: { gameMode: 'line', gameModes: ['line', 'fourCorners', 'centralCross'], eventMode: 'LOCAL' }
  }
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('Organizador: jerarquía visual y navegación móvil', () => {
  it('ofrece cuatro secciones móviles con Juego como sección inicial', () => {
    const { container } = render(<OrganizerDashboard roomData={roomData} />);
    const dashboard = container.querySelector('.organizer-dashboard');
    expect(dashboard).toHaveAttribute('data-mobile-view', 'juego');
    const nav = screen.getByRole('navigation', { name: 'Secciones del organizador' });
    expect(nav.querySelectorAll('button')).toHaveLength(4);
    const juego = screen.getByRole('button', { name: /Juego/i });
    expect(juego).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Retos/i }));
    expect(dashboard).toHaveAttribute('data-mobile-view', 'retos');
    expect(screen.getByRole('button', { name: /Retos/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Jugadores/i }));
    expect(dashboard).toHaveAttribute('data-mobile-view', 'jugadores');
    fireEvent.click(screen.getByRole('button', { name: /Acceso/i }));
    expect(dashboard).toHaveAttribute('data-mobile-view', 'acceso');
    fireEvent.click(juego);
    expect(dashboard).toHaveAttribute('data-mobile-view', 'juego');
  });

  it('coloca número y controles antes de los retos, con panes independientes', () => {
    const { container } = render(<OrganizerDashboard roomData={roomData} />);
    const panes = [...container.querySelectorAll('.organizer-main > .organizer-pane')];
    expect(panes.map(node => node.getAttribute('data-mobile-section'))).toEqual(['juego', 'retos', 'juego']);
    expect(panes[0]).toHaveTextContent('Número Cantado');
    expect(panes[0]).toHaveTextContent('Controles del Juego');
    expect(panes[1]).toHaveTextContent('Eventos Especiales');
    expect(panes[1]).toHaveTextContent('Lanzar Karaoke');
    expect(panes[1]).not.toHaveTextContent('Canto congelado');
    const aside = container.querySelector('.organizer-aside');
    expect([...aside.querySelectorAll(':scope > [data-mobile-section]')].map(el => el.dataset.mobileSection))
      .toEqual(['acceso', 'jugadores']);
    const actions = container.querySelector('.organizer-access-actions');
    expect(actions).toHaveClass('flex', 'flex-col', 'gap-2');
    expect(actions.querySelectorAll('button')).toHaveLength(2);
    expect(actions).toHaveTextContent('Copiar URL');
    expect(actions).toHaveTextContent('Abrir TV');
    expect(container).not.toHaveTextContent('Playlist A');
    expect(container).toHaveTextContent('Repertorio');
  });
});
