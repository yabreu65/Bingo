import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TVDisplay from './TVDisplay';
const state = vi.hoisted(() => ({ handlers: {}, playlist: [], socket: {
  connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn()
} }));
vi.mock('../../context/useSocket', () => ({ useSocket: () => ({ socket: state.socket }) }));
vi.mock('../../config/musicPlaylists', () => ({ shufflePlaylist: () => state.playlist }));
afterEach(() => { state.playlist = []; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('loads before room policy and blocks production LOCAL_TV without any media request or fallback', () => {
  vi.stubEnv('PROD', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  state.socket.on.mockImplementation((name, callback) => { state.handlers[name] = callback; });
  const { container } = render(<TVDisplay roomCode="TVTEST" tvCapability={'x'.repeat(43)} />);
  act(() => state.handlers['room-info']({ code: 'TVTEST', players: [], config: {
    eventMode: 'REMOTE_PRESENTIAL', multimediaPolicy: { tvMediaSource: 'LOCAL_TV' }
  } }));
  expect(screen.getByRole('alert')).toHaveTextContent('LOCAL_TV está deshabilitado');
  expect(container.querySelector('video,audio,iframe')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});


it('QR en espera no inicia música, incluso si llega music-sync=true', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, callback) => { state.handlers[name] = callback; });
    const { container } = render(<TVDisplay roomCode="ABC123" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'ABC123', players: [], config: { eventMode: 'LOCAL' } }));
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Preparar TV y activar sonido' })).not.toBeInTheDocument();
    act(() => state.handlers['music-sync']({ isPlaying: true }));
    expect(play).not.toHaveBeenCalled();
    fireEvent.play(video);
    expect(pause).toHaveBeenCalled();
  } finally {
    play.mockRestore();
    pause.mockRestore();
  }
});

it('trivia: ignora respuesta preliminar, reproduce solo aplausos al validarse y evita duplicados', async () => {
  localStorage.removeItem('bingo-tv-effects-muted');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    const { container } = render(<TVDisplay roomCode="SOUND1" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'SOUND1', players: [], config: { eventMode: 'LOCAL' } }));
    const applause = container.querySelector('audio[src$="aplauso.mp3"]');
    const donkey = container.querySelector('audio[src$="burro.mp3"]');
    expect(container.querySelectorAll('audio[src$="aplauso.mp3"]')).toHaveLength(1);
    expect(container.querySelectorAll('audio[src$="burro.mp3"]')).toHaveLength(1);
    const applausePlay = vi.fn().mockResolvedValue();
    const donkeyPlay = vi.fn().mockResolvedValue();
    applause.play = applausePlay;
    donkey.play = donkeyPlay;

    act(() => state.handlers['challenge-triggered']({ type: 'trivia', challengeId: 'question-a', player: { id: 'player-a', name: 'Ana' }, data: { question: 'Prueba', options: ['a','b','c'] } }));
    act(() => state.handlers['trivia-answered']({ playerId: 'player-a', answer: 2 }));
    act(() => state.handlers['trivia-result-public']({ playerId: 'player-a', answer: 2 }));
    expect(applausePlay).not.toHaveBeenCalled();
    expect(donkeyPlay).not.toHaveBeenCalled();
    act(() => state.handlers['trivia-result-public']({ playerId: 'player-a', answer: 2, isCorrect: true }));
    expect(applausePlay).toHaveBeenCalledTimes(1);
    expect(donkeyPlay).not.toHaveBeenCalled();
    act(() => state.handlers['trivia-result-public']({ playerId: 'player-a', answer: 2, isCorrect: true }));
    expect(applausePlay).toHaveBeenCalledTimes(1);
    expect(screen.getByText('✅ ¡CORRECTO!')).toBeInTheDocument();
  } finally {
    play.mockRestore(); pause.mockRestore();
  }
});

it('adivinanza: correcto da aplausos e incorrecto burro, una vez por resultado', () => {
  localStorage.removeItem('bingo-tv-effects-muted');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    const { container } = render(<TVDisplay roomCode="SOUND2" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'SOUND2', players: [], config: { eventMode: 'LOCAL' } }));
    const applause = container.querySelector('audio[src$="aplauso.mp3"]');
    const donkey = container.querySelector('audio[src$="burro.mp3"]');
    const applausePlay = vi.fn().mockResolvedValue();
    const donkeyPlay = vi.fn().mockResolvedValue();
    applause.play = applausePlay;
    donkey.play = donkeyPlay;
    act(() => state.handlers['riddle-result-public']({ challengeId: 'riddle-a', playerId: 'player-a', playerName: 'Ana', answer: 'el reloj', success: true }));
    expect(applausePlay).toHaveBeenCalledTimes(1);
    expect(donkeyPlay).not.toHaveBeenCalled();
    act(() => state.handlers['riddle-result-public']({ challengeId: 'riddle-a', playerId: 'player-a', playerName: 'Ana', answer: 'el reloj', success: true }));
    expect(applausePlay).toHaveBeenCalledTimes(1);
    act(() => state.handlers['riddle-result-public']({ challengeId: 'riddle-b', playerId: 'player-b', playerName: 'Beto', answer: 'cualquier cosa', success: false }));
    expect(donkeyPlay).toHaveBeenCalledTimes(1);
  } finally {
    play.mockRestore(); pause.mockRestore();
  }
});

it('trivia incorrecta reproduce el burro una sola vez, y respeta efectos silenciados', () => {
  localStorage.removeItem('bingo-tv-effects-muted');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    const { container } = render(<TVDisplay roomCode="SOUND3" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'SOUND3', players: [], config: { eventMode: 'LOCAL' } }));
    const applause = container.querySelector('audio[src$="aplauso.mp3"]');
    const donkey = container.querySelector('audio[src$="burro.mp3"]');
    const applausePlay = vi.fn().mockResolvedValue();
    const donkeyPlay = vi.fn().mockResolvedValue();
    applause.play = applausePlay;
    donkey.play = donkeyPlay;
    act(() => state.handlers['trivia-result-public']({ challengeId: 't-wrong', playerId: 'p1', answer: 1, isCorrect: false }));
    expect(donkeyPlay).toHaveBeenCalledTimes(1);
    expect(applausePlay).not.toHaveBeenCalled();
    act(() => state.handlers['trivia-result-public']({ challengeId: 't-wrong', playerId: 'p1', answer: 1, isCorrect: false }));
    expect(donkeyPlay).toHaveBeenCalledTimes(1);
    act(() => state.handlers['room-info']({ code: 'SOUND3', players: [], config: { eventMode: 'LOCAL', challengeEffectsMuted: true } }));
    act(() => state.handlers['trivia-result-public']({ challengeId: 't-muted', playerId: 'p1', answer: 0, isCorrect: true }));
    expect(applausePlay).not.toHaveBeenCalled();
  } finally {
    play.mockRestore(); pause.mockRestore();
  }
});

it('baile grupal invita a todos sin mostrar el nombre del participante elegido', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    render(<TVDisplay roomCode="GROUP1" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'GROUP1', players: [], config: { eventMode: 'LOCAL' } }));
    act(() => state.handlers['challenge-triggered']({
      type: 'group', challengeId: 'group-a', player: { id: 'p1', name: 'Ana' },
      text: 'Todos bailan en círculo', duration: 45
    }));
    expect(screen.getByText('¡TODOS A BAILAR EN GRUPO!')).toBeInTheDocument();
    expect(screen.queryByText('Jugador: Ana')).not.toBeInTheDocument();
  } finally {
    pause.mockRestore();
  }
});

it('la TV mantiene el resultado de trivia correcta y aplausos durante 12 segundos tras completar el reto', () => {
  vi.useFakeTimers();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    render(<TVDisplay roomCode="SHOW12" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'SHOW12', players: [], config: { eventMode: 'LOCAL' } }));
    act(() => state.handlers['challenge-triggered']({
      type: 'trivia', challengeId: 't1', player: { id: 'p1', name: 'Ana' },
      data: { question: 'Pregunta', options: ['A', 'B'] }, duration: 30
    }));
    act(() => state.handlers['trivia-result-public']({
      challengeId: 't1', playerId: 'p1', answer: 0, isCorrect: true
    }));
    expect(screen.getByTestId('tv-answer-result')).toHaveTextContent('✅ ¡CORRECTO!');
    act(() => {
      state.handlers['challenge-complete']({ success: true });
      state.handlers['game-state-changed']({ state: 'playing' });
      vi.advanceTimersByTime(11000);
    });
    expect(screen.getByTestId('tv-answer-result')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('tv-answer-result')).toHaveStyle({ opacity: '0' });
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    play.mockRestore();
    pause.mockRestore();
  }
});

it('la TV mantiene el resultado de adivinanza incorrecta y burro por 7 segundos aunque el backend reanude antes', () => {
  vi.useFakeTimers();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    render(<TVDisplay roomCode="SHOW07" tvCapability={'x'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'SHOW07', players: [], config: { eventMode: 'LOCAL' } }));
    act(() => state.handlers['challenge-triggered']({
      type: 'riddle', challengeId: 'r1', player: { id: 'p1', name: 'Ana' },
      data: { prompt: '¿Qué es?' }, duration: 30
    }));
    act(() => {
      state.handlers['challenge-complete']({ success: true });
      state.handlers['game-state-changed']({ state: 'playing' });
      state.handlers['riddle-result-public']({
        challengeId: 'r1', playerId: 'p1', playerName: 'Ana',
        answer: 'una respuesta incorrecta', success: false
      });
    });
    expect(screen.getByTestId('tv-answer-result')).toHaveTextContent('❌ INCORRECTO');
    act(() => vi.advanceTimersByTime(6999));
    expect(screen.getByTestId('tv-answer-result')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('tv-answer-result')).toHaveStyle({ opacity: '0' });
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    play.mockRestore();
    pause.mockRestore();
  }
});

it('la TV remota requiere preparar el audio una sola vez y permanece en silencio durante la espera', async () => {
  state.playlist = [{ title: 'Pista prueba', artist: 'Prueba', localFile: 'pista.mp4' }];
  state.socket.emit.mockClear();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    const { container } = render(<TVDisplay roomCode="REMOTE" tvSessionToken={'s'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'REMOTE', players: [], config: { eventMode: 'REMOTE_PRESENTIAL' } }));
    const video = container.querySelector('.grid-video video');
    expect(video).toBeTruthy();
    const prepare = screen.getByRole('button', { name: 'Preparar TV y activar sonido' });
    expect(prepare.closest('.qr-content')).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(prepare);
    expect(play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
    await waitFor(() => expect(screen.getByText(/TV remota preparada/)).toBeInTheDocument());
    expect(video.muted).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(state.socket.emit).not.toHaveBeenCalledWith('pause-game', expect.anything());
    expect(screen.queryByRole('button', { name: 'Preparar TV y activar sonido' })).not.toBeInTheDocument();

    act(() => state.handlers['game-state-changed']({ state: 'playing' }));
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(video.muted).toBe(false);
  } finally {
    load.mockRestore(); play.mockRestore(); pause.mockRestore();
  }
});

it('si el navegador rechaza la preparación remota, permite reintentar sin fingir que el audio está listo', async () => {
  state.playlist = [{ title: 'Pista prueba', artist: 'Prueba', localFile: 'pista.mp4' }];
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }))
    .mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  try {
    state.socket.on.mockImplementation((name, handler) => { state.handlers[name] = handler; });
    render(<TVDisplay roomCode="REMOTE" tvSessionToken={'s'.repeat(43)} />);
    act(() => state.handlers['room-info']({ code: 'REMOTE', players: [], config: { eventMode: 'DISTRIBUTED' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar TV y activar sonido' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('El navegador bloqueó la reproducción'));
    expect(screen.queryByText(/TV remota preparada/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar TV y activar sonido' }));
    await waitFor(() => expect(screen.getByText(/TV remota preparada/)).toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(2);
  } finally {
    load.mockRestore(); play.mockRestore(); pause.mockRestore();
  }
});
