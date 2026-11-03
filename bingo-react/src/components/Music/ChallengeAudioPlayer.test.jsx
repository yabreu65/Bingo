import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChallengeAudioPlayer from './ChallengeAudioPlayer';

let play;
let pause;
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); play.mockRestore(); pause.mockRestore(); });

it('reproduce MP3 del reto desde el segundo configurado, sin recortar la canción', async () => {
  const { container } = render(
    <ChallengeAudioPlayer src="/music/retos/uptown-funk.mp3" startSeconds={40} duration={30} />
  );
  const audio = container.querySelector('audio');
  expect(audio.getAttribute('src')).toBe('/music/retos/uptown-funk.mp3');
  Object.defineProperty(audio, 'duration', { configurable: true, value: 250 });
  await act(async () => { fireEvent.loadedMetadata(audio); await Promise.resolve(); });
  expect(audio.currentTime).toBe(40);
  expect(play).toHaveBeenCalledTimes(1);
  audio.currentTime = 69;
  fireEvent.timeUpdate(audio);
  expect(pause).not.toHaveBeenCalled();
  audio.currentTime = 70;
  fireEvent.timeUpdate(audio);
  expect(pause).toHaveBeenCalled();
  expect(screen.getByTestId('challenge-local-audio')).toBeInTheDocument();
});

it('si el navegador bloquea autoplay, mantiene controles manuales', async () => {
  play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  const { container } = render(
    <ChallengeAudioPlayer src="/music/retos/gasolina.mp3" startSeconds={20} duration={30} />
  );
  const audio = container.querySelector('audio');
  Object.defineProperty(audio, 'duration', { configurable: true, value: 200 });
  await act(async () => { fireEvent.loadedMetadata(audio); await Promise.resolve(); await Promise.resolve(); });
  expect(audio.hasAttribute('controls')).toBe(true);
  expect(screen.getByText(/navegador bloqueó/)).toBeInTheDocument();
});
