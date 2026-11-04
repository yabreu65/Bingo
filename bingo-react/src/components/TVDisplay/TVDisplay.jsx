"use client";
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useSocket } from '../../context/useSocket';
import { shufflePlaylist } from '../../config/musicPlaylists';
import { QRCodeSVG } from 'qrcode.react';
import { Radio, Tv, Users, Crown } from 'lucide-react';
import DeezerPlayer from '../Music/DeezerPlayer';
import KaraokeOverlay from '../Music/KaraokeOverlay';
import ChallengeAudioPlayer from '../Music/ChallengeAudioPlayer';
import { resolveMultimediaPolicy, shouldRenderTvMedia, shouldUseExternalSources } from '../../utils/multimediaPolicy';
import { isLocalTvMediaPolicy, resolveTvMediaUrl } from '../../utils/localTvMedia';
import { attemptMediaPlayback, checkLocalTvReadiness, isLoopbackBrowserOrigin, readLoopbackPermission } from '../../utils/localTvDiagnostics';
 
import { getShareableUrl } from '../../utils/networkUtils';
import { createPlayerEntryURL } from '../../utils/entryRoutes';
import './TVDisplay.css';

const MotionBox = ({ children, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.5, ease: "easeInOut" }}
    {...props}
  >
    {children}
  </motion.div>
);

const TVDisplay = ({ roomCode, tvCapability, tvSessionToken, tvAuthorizationError }) => {
  const { socket } = useSocket();
  const [currentNumber, setCurrentNumber] = useState(null);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [gameState, setGameState] = useState('waiting');
  const [roomInfo, setRoomInfo] = useState(null);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [cartonazoWinner, setCartonazoWinner] = useState(null);
  const [bingoWinner, setBingoWinner] = useState(null);
  const [triviaAnswer, setTriviaAnswer] = useState(null); // Para almacenar la respuesta del jugador
  const [manualPlayerAnswers, setManualPlayerAnswers] = useState({}); // Respuestas de jugadores manuales {playerId: answerIndex}
  const [manualPlayerResults, setManualPlayerResults] = useState({});
  const [resultReveal, setResultReveal] = useState(null);
  const [effectsMuted, setEffectsMuted] = useState(() => localStorage.getItem('bingo-tv-effects-muted') === 'true');
  const [tvConnectionError, setTvConnectionError] = useState(null);
  const [musicStatus, setMusicStatus] = useState('loading');
  const [remoteTvAudioPrepared, setRemoteTvAudioPrepared] = useState(false);
  const [remoteTvAudioPreparing, setRemoteTvAudioPreparing] = useState(false);
  const [remoteTvAudioError, setRemoteTvAudioError] = useState(null);
  const [localMediaDiagnostics, setLocalMediaDiagnostics] = useState(null);
  const [localMediaRequestPending, setLocalMediaRequestPending] = useState(false);
  const [activeVoting, setActiveVoting] = useState(null);

  // Estados para tie-break
  const [tieBreakActive, setTieBreakActive] = useState(false);
  const [tieBreakPerformer, setTieBreakPerformer] = useState(null); // { performerId, performerName, performerNumber, totalPerformers, songData, message }
  const [tieBreakStatus, setTieBreakStatus] = useState('waiting'); // waiting | playing | ready-to-vote | voting
  const [tieBreakCandidates, setTieBreakCandidates] = useState([]); // Todos los candidatos después de bailar
  const [tieBreakVotingProgress, setTieBreakVotingProgress] = useState({ voted: 0, total: 0 });
  const tieBreakVideoRef = useRef(null);

  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [playlist, setPlaylist] = useState(() => shufflePlaylist()); // Playlist aleatorio
  const videoPlayerRef = useRef(null);
  const remoteTvAudioPrimingRef = useRef(false);
  const gameStateRef = useRef('waiting');
  const isChallengeActiveRef = useRef(false); // Ref síncrono para trackear challenges
  const currentChallengeRef = useRef(null);
  const resultRevealRef = useRef(null);
  const resultRevealTimerRef = useRef(null);
  const applauseAudioRef = useRef(null); // Ref para sonido de aplauso
  const donkeyAudioRef = useRef(null); // Ref para sonido de burro
  const handledOutcomeKeysRef = useRef(new Set());
  const musicVolumeBeforeEffectRef = useRef(null);
  const currentSong = playlist[currentSongIndex];
  const multimediaPolicy = useMemo(
    () => roomInfo ? resolveMultimediaPolicy(roomInfo.config) : null,
    [roomInfo]
  );
  const canRenderTvMedia = shouldRenderTvMedia(multimediaPolicy);
  const canUseExternalSources = shouldUseExternalSources(multimediaPolicy);
  const localTvEnabled = isLocalTvMediaPolicy(multimediaPolicy);
  const canLoadTvMedia = canRenderTvMedia && (
    !localTvEnabled || localMediaDiagnostics?.allowed === true
  );
  const tvMediaUrl = useCallback(
    (relativePath) => resolveTvMediaUrl(relativePath, multimediaPolicy || { mode: 'LEGACY' }),
    [multimediaPolicy]
  );

  const emitTvMediaStatus = useCallback((status, diagnostics = {}) => {
    if (!localTvEnabled || !socket?.connected) return;
    socket.emit('tv-media-status', {
      roomCode,
      status,
      permission: diagnostics.permission,
      service: diagnostics.service,
      autoplay: diagnostics.autoplay
    });
  }, [localTvEnabled, roomCode, socket]);

  const reportLocalMediaPlayback = useCallback((status) => {
    if (!localTvEnabled) return;
    setLocalMediaDiagnostics((current) => ({ ...(current || {}), media: status }));
    emitTvMediaStatus(status);
  }, [emitTvMediaStatus, localTvEnabled]);

  const updateLocalMediaReadiness = useCallback(async ({ requestService = false } = {}) => {
    if (!localTvEnabled) return;

    setLocalMediaRequestPending(requestService);
    if (requestService) emitTvMediaStatus('checking');
    try {
      const diagnostics = await checkLocalTvReadiness({ requestService });
      const status = diagnostics.allowed
        ? 'available'
        : diagnostics.permission === 'denied'
          ? 'permission-denied'
          : diagnostics.service === 'permission-required'
            ? 'permission-required'
            : diagnostics.service === 'blocked-or-offline'
              ? 'unavailable'
              : 'blocked';
      const nextDiagnostics = { ...diagnostics, status };
      setLocalMediaDiagnostics(nextDiagnostics);
      emitTvMediaStatus(status === 'permission-denied' ? 'permission-denied' :
        status === 'unavailable' ? 'unavailable' : status === 'permission-required' ? 'permission-required' : 'available',
      diagnostics);
    } catch {
      const diagnostics = { status: 'unavailable', service: 'blocked-or-offline', permission: 'unknown', allowed: false };
      setLocalMediaDiagnostics(diagnostics);
      emitTvMediaStatus('unavailable', diagnostics);
    } finally {
      setLocalMediaRequestPending(false);
    }
  }, [emitTvMediaStatus, localTvEnabled]);

  useEffect(() => {
    if (!localTvEnabled) {
      return undefined;
    }

    let active = true;
    const initializeLocalMedia = async () => {
      const permission = await readLoopbackPermission();
      if (!active) return;
      if (permission === 'granted' || isLoopbackBrowserOrigin()) {
        await updateLocalMediaReadiness({ requestService: isLoopbackBrowserOrigin() });
        return;
      }

      const status = permission === 'denied' ? 'permission-denied' : 'permission-required';
      setLocalMediaDiagnostics({ permission, service: 'permission-required', status, allowed: false });
      emitTvMediaStatus(status, { permission, service: 'permission-required' });
    };
    initializeLocalMedia().catch(() => {
      if (!active) return;
      const diagnostics = { status: 'unavailable', service: 'blocked-or-offline', permission: 'unknown', allowed: false };
      setLocalMediaDiagnostics(diagnostics);
      emitTvMediaStatus('unavailable', diagnostics);
    });

    return () => {
      active = false;
    };
  }, [emitTvMediaStatus, localTvEnabled, updateLocalMediaReadiness]);

  const handleKaraokeVideoEnd = useCallback(() => {
    socket?.emit('karaoke-video-end', {
      roomCode,
      challengeId: activeChallenge?.challengeId
    });
  }, [socket, roomCode, activeChallenge?.challengeId]);

  const handleStartTiebreakPerformance = () => {
    if (!tieBreakPerformer) return;

    socket?.emit('start-tiebreak-performance', {
      roomCode,
      performerId: tieBreakPerformer.performerId
    });
  };

  const handleStartVoting = () => {
    socket?.emit('start-tiebreak-voting', { roomCode });
  };

  const restoreMusicVolumeAfterEffect = useCallback(() => {
    const video = videoPlayerRef.current;
    if (video && musicVolumeBeforeEffectRef.current !== null) {
      video.volume = musicVolumeBeforeEffectRef.current;
    }
    musicVolumeBeforeEffectRef.current = null;
  }, []);

  const playOutcomeSound = useCallback((kind, data, isCorrect) => {
    // A preliminary trivia event intentionally has no outcome.
    // Never interpret undefined as an incorrect answer.
    if (typeof isCorrect !== 'boolean') return;
    const key = [
      kind,
      data?.challengeId || activeChallenge?.challengeId || '',
      data?.playerId || '',
      String(data?.answer ?? data?.result?.answer ?? '')
    ].join(':');
    if (handledOutcomeKeysRef.current.has(key)) return;
    if (handledOutcomeKeysRef.current.size > 100) handledOutcomeKeysRef.current.clear();
    handledOutcomeKeysRef.current.add(key);
    if (effectsMuted) return;

    const sound = isCorrect ? applauseAudioRef.current : donkeyAudioRef.current;
    const other = isCorrect ? donkeyAudioRef.current : applauseAudioRef.current;
    if (!sound) return;
    other?.pause();
    if (other) other.currentTime = 0;
    sound.pause();
    sound.currentTime = 0;
    const video = videoPlayerRef.current;
    if (video && musicVolumeBeforeEffectRef.current === null) {
      musicVolumeBeforeEffectRef.current = video.volume;
      video.volume = Math.min(video.volume, 0.15);
    }
    Promise.resolve(sound.play()).catch((error) => {
      console.warn('La TV no pudo reproducir el efecto del reto:', error);
      restoreMusicVolumeAfterEffect();
    });
  }, [activeChallenge?.challengeId, effectsMuted, restoreMusicVolumeAfterEffect]);

  const displayAnswerResult = useCallback((kind, data, correct) => {
    if (typeof correct !== 'boolean') return;
    const challengeId = data?.challengeId || currentChallengeRef.current?.challengeId || '';
    const key = [kind, challengeId, data?.playerId || '', String(data?.answer ?? data?.result?.answer ?? '')].join(':');
    if (resultRevealRef.current?.key === key) return;

    if (resultRevealTimerRef.current) window.clearTimeout(resultRevealTimerRef.current);
    const reveal = {
      key,
      kind,
      correct,
      answer: kind === 'riddle' ? String(data?.answer ?? '') : null,
      playerName: data?.playerName || currentChallengeRef.current?.player?.name || ''
    };
    resultRevealRef.current = reveal;
    setResultReveal(reveal);
    isChallengeActiveRef.current = true;
    videoPlayerRef.current?.pause();

    // Complete audio effects: applause ~11.75 s, donkey ~5.15 s.
    const holdMs = correct ? 12000 : 7000;
    resultRevealTimerRef.current = window.setTimeout(() => {
      if (resultRevealRef.current?.key !== key) return;
      resultRevealRef.current = null;
      resultRevealTimerRef.current = null;
      setResultReveal(null);
      isChallengeActiveRef.current = Boolean(currentChallengeRef.current);
      if (!isChallengeActiveRef.current && gameStateRef.current === 'playing' && videoPlayerRef.current) {
        attemptMediaPlayback(videoPlayerRef.current).catch(() => {});
      }
    }, holdMs);
  }, []);

  useEffect(() => () => {
    if (resultRevealTimerRef.current) window.clearTimeout(resultRevealTimerRef.current);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNumberCalled = (data) => {
      setCurrentNumber(data.number);
      setCalledNumbers((prev) => [...prev, data.number]);
    };

    const handleGameStateChanged = (data) => {
      gameStateRef.current = data.state;
      setGameState(data.state);
    };
    const handleGameStarted = () => {
        console.log('📺 TV: Game started!');
        gameStateRef.current = 'playing';
        setGameState('playing');
    };
    const handleRoomInfo = (data) => {
      setRoomInfo(data);
      if (typeof data?.config?.challengeEffectsMuted === 'boolean') {
        setEffectsMuted(data.config.challengeEffectsMuted);
      }
    };
    const handleChallengeTriggered = (data) => {
        console.log('📺 TVDisplay: Challenge triggered received:', data);
        console.log('📺 TVDisplay: Challenge TYPE:', data.type);
        console.log('📺 TVDisplay: Challenge DATA:', data.data);
        console.log('📺 TVDisplay: deezerId:', data.deezerId);
        console.log('📺 TVDisplay: videoId:', data.videoId);

        // IMPORTANTE: Establecer el ref PRIMERO (síncrono) antes de pausar
        currentChallengeRef.current = data;
        isChallengeActiveRef.current = true;
        console.log('🔴 Challenge active flag SET to TRUE');

        setActiveChallenge(data);
        setChallengeTimeLeft(data?.duration || 30);

        // IMPORTANTE: SIEMPRE pausar el video cuando aparece cualquier challenge
        // Esto incluye trivias, que no tienen deezerId

        // Para todos los challenges, pausar el video de música
        console.log('⏸️ TVDisplay: Pausing video for challenge');

        if (videoPlayerRef.current) {
            console.log('✅ Player is ready, pausing...');
            videoPlayerRef.current.pause();
        } else {
            console.warn('⚠️ Video player not ready yet');
        }

        if (data.deezerId) {
            console.log('🎵 Challenge has Deezer track:', data.deezerId);
        }
    };
    const handleChallengeCountdown = (data) => {
        setChallengeTimeLeft(data.timeLeft);
    };
    const handleVotingStarted = (data) => setActiveVoting(data);
    const handleVotingResults = (data) => {
      setActiveVoting(null);
      setTimeout(() => setCartonazoWinner({
        name: data.performerName,
        message: `Promedio ${Number(data.averageStars || 0).toFixed(1)} ⭐ · +${data.bonusPoints || 0} puntos`
      }), 0);
    };
    const handleChallengeComplete = () => {
        console.log('🎮 Challenge complete, resuming game');

        // IMPORTANTE: Establecer el ref PRIMERO (síncrono)
        currentChallengeRef.current = null;
        isChallengeActiveRef.current = Boolean(resultRevealRef.current);
        console.log('🟢 Challenge active flag SET to', isChallengeActiveRef.current);

        setActiveChallenge(null);
        setChallengeTimeLeft(null);
        setTriviaAnswer(null); // Limpiar respuesta de trivia
        setManualPlayerAnswers({}); // Limpiar respuestas de jugadores manuales
        setManualPlayerResults({});

        // El backend enviará game-state-changed y music-sync
        // El useEffect de gameState se encargará de reproducir
        console.log('⏳ Waiting for game state change to resume video');
    };

    const handleTriviaAnswered = (data) => {
      // The backend broadcasts an early response without isCorrect and a
      // validated public result later. Only the validated result may trigger
      // a sound or show green/red feedback.
      if (typeof data?.isCorrect !== 'boolean') return;
      setTriviaAnswer({ answer: data.answer, isCorrect: data.isCorrect });
      displayAnswerResult('trivia', data, data.isCorrect);
      playOutcomeSound('trivia', data, data.isCorrect);
    };
    const handleTriviaResult = (data) => {
      const challengePlayerId = activeChallenge?.player?.id || activeChallenge?.player?._id || activeChallenge?.player?.playerId;
      if (!challengePlayerId || data?.playerId?.toString() !== challengePlayerId.toString()) return;
      setTriviaAnswer(data);
      setManualPlayerResults(prev => ({ ...prev, [data.playerId]: data }));
    };
    const handleRiddleResult = (data) => {
      const result = data?.result || data;
      const success = data?.success ?? result?.success;
      if (!data?.challengeId || !result?.answer || typeof success !== 'boolean') return;
      const normalized = { ...data, answer: result.answer, success };
      displayAnswerResult('riddle', normalized, success);
      playOutcomeSound('riddle', normalized, success);
    };
    const handleCountdownTick = (data) => {
        if (typeof data?.value === 'number') {
            setCountdown(data.value);
            if (data.value <= 0) {
                setTimeout(() => setCountdown(null), 1000);
            }
        }
    };

    // Handlers para tie-break
    const handleTiebreakStarted = (data) => {
        console.log('🧟 Tie-break started:', data);
        setTieBreakActive(true);
    };

    const handleTiebreakReadyForPerformer = (data) => {
        console.log('🧟 Ready for performer:', data);
        setTieBreakPerformer(data);
        setTieBreakStatus('waiting');
    };

    const handleTiebreakPerformanceStarted = (data) => {
        console.log('🧟 Performance started:', data);
        setTieBreakStatus('playing');

        // Reproducir el video
        if (tieBreakVideoRef.current) {
            tieBreakVideoRef.current.currentTime = 0;
            tieBreakVideoRef.current.play()
                .then(() => console.log('🎬 Tie-break video playing'))
                .catch(err => console.error('❌ Error playing tie-break video:', err));
        }
    };

    const handleAllPerformancesDone = (data) => {
        console.log('🎭 Todos han bailado:', data);
        setTieBreakStatus('ready-to-vote');
        setTieBreakCandidates(data.candidates || []);
        setTieBreakPerformer(null); // Limpiar performer actual
    };

    const handleTiebreakVotingStarted = (data) => {
        console.log('🗳️ Votación iniciada:', data);
        setTieBreakStatus('voting');
    };

    const handleTiebreakVotingProgress = (data) => {
        console.log('📊 Progreso votación:', data);
        setTieBreakVotingProgress(data);
    };

    const handleTiebreakResults = (data) => {
        console.log('🏆 Resultados:', data);
        setTieBreakActive(false);
        setTieBreakStatus('waiting');
        setTieBreakCandidates([]);
        setTieBreakVotingProgress({ voted: 0, total: 0 });
    };
     const handleMusicSongChange = (data) => {
      if (data.songId && videoPlayerRef.current) {
        const songIndex = (data.songId - 1) % playlist.length;
        setCurrentSongIndex(songIndex);
      }
    };

    const handleMusicSync = (data) => {
      console.log('🎵 Music sync received - isPlaying:', data.isPlaying, 'gameState:', gameState, 'challengeActive:', isChallengeActiveRef.current);

      // Solo bloquear si hay un challenge ACTIVO
      if (isChallengeActiveRef.current) {
        console.log('🚫 Music sync blocked - challenge is active');
        return;
      }

      if (videoPlayerRef.current) {
        if (data.isPlaying && gameStateRef.current === 'playing') {
          console.log('▶️ Music sync: Attempting to play video');

          // Esperar un poco para asegurar que el video esté listo
          setTimeout(() => {
            if (videoPlayerRef.current && !isChallengeActiveRef.current && gameStateRef.current === 'playing') {
              videoPlayerRef.current.play()
                .then(() => {
                  console.log('✅✅✅ Video PLAYING via music-sync ✅✅✅');
                })
                .catch(err => {
                  console.warn('⚠️ Could not play video via music-sync:', err);
                  console.log('💡 Clicking play button manually may help');
                });
            }
          }, 500);
        } else {
          console.log('⏸️ Music sync: Pausing video');
          videoPlayerRef.current.pause();
        }
      } else {
        console.warn('⚠️ Music sync: videoPlayerRef not available');
      }
    };

    const handleCartonazoWinner = (data) => {
      setCartonazoWinner(data);
      // Hide the winner announcement after 15 seconds
      setTimeout(() => {
        setCartonazoWinner(null);
      }, 15000);
    };


    // Join only after receiving the scoped capability through the opener handshake.
    const joinTVRoom = () => {
      if (!tvCapability && !tvSessionToken) return;
      const authorization = tvSessionToken
        ? { tvSessionToken }
        : { tvCapability };
      socket.emit('join-room', { roomCode, playerId: 'tv-display', ...authorization }, (response) => {
        if (response?.success) {
          setTvConnectionError(null);
          console.log('📺 TV Display joined room successfully:', response);
        } else {
          setTvConnectionError(response?.error || 'La autorización de TV no es válida o expiró.');
          console.error('📺 TV Display failed to join room:', response?.error);
        }
      });
    };
    const handleTvAuthorizationRevoked = () => {
      setTvConnectionError('La autorización temporal de esta TV fue revocada. Generá un nuevo enlace desde el organizador.');
    };
    joinTVRoom();
    socket.on('connect', joinTVRoom);
    socket.on('tv-authorization-revoked', handleTvAuthorizationRevoked);

    socket.on('number-called', handleNumberCalled);
    socket.on('game-started', handleGameStarted);
    socket.on('game-state-changed', handleGameStateChanged);
    socket.on('room-info', handleRoomInfo);
    socket.on('challenge-triggered', handleChallengeTriggered);
    socket.on('challenge-countdown', handleChallengeCountdown);
    socket.on('challenge-complete', handleChallengeComplete);
    socket.on('trivia-answered', handleTriviaAnswered);
    socket.on('trivia-result-public', handleTriviaAnswered);
    socket.on('trivia-result', handleTriviaResult);
    socket.on('riddle-result-public', handleRiddleResult);
    socket.on('votingStarted', handleVotingStarted);
    socket.on('votingResults', handleVotingResults);
    socket.on('countdown-tick', handleCountdownTick);
    socket.on('music-song-change', handleMusicSongChange);
    socket.on('music-sync', handleMusicSync);
    socket.on('cartonazo-winner', handleCartonazoWinner);
    socket.on('game-finished', (data) => {
      setBingoWinner(data);
      setTimeout(() => setBingoWinner(null), 15000);
    });

    // Tie-break events
    socket.on('tiebreak-started', handleTiebreakStarted);
    socket.on('tiebreak-ready-for-performer', handleTiebreakReadyForPerformer);
    socket.on('tiebreak-performance-started', handleTiebreakPerformanceStarted);
    socket.on('tiebreak-all-performances-done', handleAllPerformancesDone);
    socket.on('tiebreak-voting-started', handleTiebreakVotingStarted);
    socket.on('tiebreak-voting-progress', handleTiebreakVotingProgress);
    socket.on('tiebreak-results', handleTiebreakResults);


    return () => {
      socket.off('connect', joinTVRoom);
      socket.off('tv-authorization-revoked', handleTvAuthorizationRevoked);
      socket.off('number-called', handleNumberCalled);
      socket.off('game-started', handleGameStarted);
      socket.off('game-state-changed', handleGameStateChanged);
      socket.off('room-info', handleRoomInfo);
      socket.off('challenge-triggered', handleChallengeTriggered);
      socket.off('challenge-countdown', handleChallengeCountdown);
      socket.off('challenge-complete', handleChallengeComplete);
      socket.off('trivia-answered', handleTriviaAnswered);
      socket.off('trivia-result-public', handleTriviaAnswered);
      socket.off('trivia-result', handleTriviaResult);
      socket.off('riddle-result-public', handleRiddleResult);
      socket.off('votingStarted', handleVotingStarted);
      socket.off('votingResults', handleVotingResults);
      socket.off('countdown-tick', handleCountdownTick);
      socket.off('music-song-change', handleMusicSongChange);
      socket.off('music-sync', handleMusicSync);
      socket.off('cartonazo-winner', handleCartonazoWinner);
      socket.off('game-finished');
      socket.off('tiebreak-started', handleTiebreakStarted);
      socket.off('tiebreak-ready-for-performer', handleTiebreakReadyForPerformer);
      socket.off('tiebreak-performance-started', handleTiebreakPerformanceStarted);
      socket.off('tiebreak-all-performances-done', handleAllPerformancesDone);
      socket.off('tiebreak-voting-started', handleTiebreakVotingStarted);
      socket.off('tiebreak-voting-progress', handleTiebreakVotingProgress);
      socket.off('tiebreak-results', handleTiebreakResults);
    };
  }, [socket, roomCode, tvCapability, tvSessionToken, activeChallenge, gameState, playlist.length, effectsMuted, playOutcomeSound, displayAnswerResult]); // Los handlers respetan la configuración actual de sonido

  // Manejar cuando termina una canción
  const handleVideoEnded = () => {
    setCurrentSongIndex(prev => {
      const nextIndex = (prev + 1) % playlist.length;

      // Si volvemos al inicio (completamos todo el playlist), remezclar
      if (nextIndex === 0) {
        console.log('🔀 Playlist completado, remezclando...');
        setPlaylist(shufflePlaylist());
      }

      return nextIndex;
    });
  };

  // Preparación explícita del audio, solo para TV autorizada con enlace temporal.
  // play() debe ejecutarse durante este clic; un evento remoto no puede
  // conceder el permiso de autoplay del navegador.
  const handlePrepareRemoteTvAudio = () => {
    const video = videoPlayerRef.current;
    if (!tvSessionToken || !canLoadTvMedia || !video || remoteTvAudioPreparing) return;

    remoteTvAudioPrimingRef.current = true;
    setRemoteTvAudioPreparing(true);
    setRemoteTvAudioError(null);
    video.muted = true; // Nunca reproducir sonido antes de iniciar el juego.

    let started;
    try {
      started = video.play();
    } catch (error) {
      started = Promise.reject(error);
    }
    Promise.resolve(started).then(() => {
      const gameIsPlaying = gameStateRef.current === 'playing' && !isChallengeActiveRef.current;
      if (!gameIsPlaying) {
        video.pause();
        setMusicStatus('ready');
      }
      video.muted = false;
      setRemoteTvAudioPrepared(true);
      setRemoteTvAudioPreparing(false);
      if (gameIsPlaying) setMusicStatus('playing');
      // El evento pause se despacha después de pause(); no debe pausar la sala.
      window.setTimeout(() => { remoteTvAudioPrimingRef.current = false; }, 100);
    }).catch((error) => {
      video.pause();
      video.muted = false;
      setRemoteTvAudioPrepared(false);
      setRemoteTvAudioPreparing(false);
      setRemoteTvAudioError(error?.name === 'NotAllowedError'
        ? 'El navegador bloqueó la reproducción. Volvé a pulsar Preparar TV.'
        : 'No se pudo preparar el video. Revisá que la pista esté disponible.');
      window.setTimeout(() => { remoteTvAudioPrimingRef.current = false; }, 100);
    });
  };

  // Manejar pausa manual del video
  const handleVideoPause = () => {
    if (remoteTvAudioPrimingRef.current) return;
    // Solo emitir si no estamos en un challenge (para no interferir)
    if (!isChallengeActiveRef.current && gameState === 'playing') {
      console.log('⏸️ Video paused manually, pausing game');
      socket?.emit('pause-game', { roomCode });
    }
  };

  // Manejar reproducción manual del video
  const handleVideoPlay = () => {
    if (remoteTvAudioPrimingRef.current) return;
    if (gameStateRef.current === 'waiting' || gameStateRef.current === 'finished' || resultRevealRef.current) {
      videoPlayerRef.current?.pause();
      return;
    }
    // Solo emitir si el juego está pausado
    if (!isChallengeActiveRef.current && gameState === 'paused') {
      console.log('▶️ Video played manually, resuming game');
      socket?.emit('resume-game', { roomCode });
    }
  };

  // Auto-reproducir cuando cambia la canción
  useEffect(() => {
    if (videoPlayerRef.current && currentSong?.localFile) {
      const videoElement = videoPlayerRef.current;
      console.log('📺 Loading new song:', currentSong.title);
      console.log('   - Current gameState:', gameState);
      console.log('   - Challenge active:', isChallengeActiveRef.current);

      // Cargar el nuevo video
      videoElement.load();

      // Posicionar en el segundo 20 y reproducir cuando esté listo
      const handleLoadedMetadata = () => {
        if (videoElement) {
          videoElement.currentTime = 20;

          // Solo auto-reproducir si el juego está activo Y NO hay un challenge
          if (gameState === 'playing' && gameStateRef.current === 'playing' && !isChallengeActiveRef.current) {
            console.log('📺 Auto-playing new song from second 20');
            attemptMediaPlayback(videoElement).then((result) => {
              if (result === 'playing') {
                setMusicStatus('playing');
                reportLocalMediaPlayback('playing');
                console.log('✅ New song playing successfully');
              } else if (result === 'autoplay-blocked') {
                setMusicStatus('autoplay-blocked');
                reportLocalMediaPlayback(result);
                console.log('💡 Tip: Click on the video to start playback');
              } else {
                setMusicStatus('unavailable');
                reportLocalMediaPlayback(result);
              }
            });
          } else if (isChallengeActiveRef.current) {
            console.log('🚫 Not auto-playing new song - challenge is active');
          } else {
            console.log('🚫 Not auto-playing new song - gameState is:', gameState);
          }
        }
      };

      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

      return () => {
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [currentSong, gameState, activeChallenge, playlist.length, reportLocalMediaPlayback, canLoadTvMedia]);

  // Sincronizar video con el estado del juego Y cuando termina un challenge
  useEffect(() => {
    if (!videoPlayerRef.current) return;

    console.log('🔄 useEffect [gameState] triggered - gameState:', gameState, 'activeChallenge:', activeChallenge, 'challengeRef:', isChallengeActiveRef.current);

    gameStateRef.current = gameState;
    if (['waiting', 'paused', 'finished'].includes(gameState) && videoPlayerRef.current) {
      console.log('⏸️ Game state is PAUSED, pausing video');
      videoPlayerRef.current.pause();
    } else if (gameState === 'playing' && !activeChallenge) {
      // Solo intentar reproducir si el video NO se está cargando
      // (el useEffect de currentSong se encargará si hay cambio de canción)
      const isLoading = videoPlayerRef.current.readyState < 3; // HAVE_FUTURE_DATA

      if (!isLoading) {
        console.log('🎮 Game state is PLAYING, video is ready, attempting to play');
        setTimeout(() => {
          if (videoPlayerRef.current && !isChallengeActiveRef.current && gameStateRef.current === 'playing') {
            console.log('🎬 Calling video.play() from gameState effect...');
            attemptMediaPlayback(videoPlayerRef.current).then((result) => {
              if (result === 'playing') {
                setMusicStatus('playing');
                reportLocalMediaPlayback('playing');
              } else if (result === 'autoplay-blocked') {
                setMusicStatus('autoplay-blocked');
                reportLocalMediaPlayback(result);
              } else {
                setMusicStatus('unavailable');
                reportLocalMediaPlayback(result);
              }
            });
          }
        }, 300);
      } else {
        console.log('⏳ Video is loading, will auto-play when ready (from currentSong effect)');
      }
    } else {
      console.log('⏭️ Not playing - gameState:', gameState, 'activeChallenge:', !!activeChallenge);
    }
  }, [gameState, activeChallenge, reportLocalMediaPlayback]);

  const getBingoLetter = (num) => {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    if (num <= 75) return 'O';
    return '';
  };

  // Handler para responder trivias por jugadores manuales
  const handleManualPlayerAnswer = (playerId, playerName, answerIndex) => {
    console.log(`📺 TV: Manual player ${playerName} answered ${answerIndex}`);

    // Marcar que este jugador ya respondió
    setManualPlayerAnswers(prev => ({
      ...prev,
      [playerId]: answerIndex
    }));

    socket?.emit('trivia-answered', {
      roomCode,
      playerId,
      answer: answerIndex
    });

    console.log(`📺 TV: Emitted trivia-answered for manual player ${playerName}`, {
      answer: answerIndex
    });
  };

  return (
    <div className="tv-display-grid pf-tv-stage">
      {(tvAuthorizationError || tvConnectionError) && (
        <div className="tv-authorization-error" role="alert">
          {tvAuthorizationError || tvConnectionError}
        </div>
      )}
      {multimediaPolicy?.mediaBlocked && (
        <div className="tv-media-status" role="alert">
          LOCAL_TV está deshabilitado en producción hasta su certificación. No se usarán medios del servidor automáticamente.
        </div>
      )}
      {localTvEnabled && (
        <div className="tv-media-status" data-testid="local-tv-media-status" role="status">
          {localMediaDiagnostics?.permission === 'denied'
            ? 'Medios locales: permiso de red local denegado. Permitilo en el navegador para reproducir desde esta laptop.'
            : localMediaDiagnostics?.status === 'permission-required'
              ? 'Medios locales: habilitá el acceso de red local para esta TV antes de reproducir.'
            : localMediaDiagnostics?.media === 'playing'
              ? 'Medios locales: reproducción activa en esta TV.'
              : localMediaDiagnostics?.media === 'autoplay-blocked'
                ? 'Medios locales: reproducción automática bloqueada. Presioná Reproducir música.'
                : localMediaDiagnostics?.media === 'unavailable'
                  ? 'Medios locales: el archivo no está disponible. El bingo puede continuar sin música.'
                : localMediaDiagnostics?.service === 'blocked-or-offline'
                  ? 'Medios locales: no se pudo contactar el servicio local. El bingo puede continuar sin música.'
                  : 'Medios locales: verificando servicio y permisos del navegador…'}
          {localMediaDiagnostics?.status === 'permission-required' && (
            <button
              type="button"
              data-testid="enable-local-tv-media"
              disabled={localMediaRequestPending}
              onClick={() => updateLocalMediaReadiness({ requestService: true })}
            >
              {localMediaRequestPending ? 'Comprobando acceso…' : 'Habilitar reproducción local'}
            </button>
          )}
          {localMediaDiagnostics?.permission === 'denied' && (
            <button
              type="button"
              data-testid="retry-local-tv-permission"
              onClick={() => updateLocalMediaReadiness({ requestService: true })}
            >
              Reintentar después de cambiar el permiso
            </button>
          )}
        </div>
      )}
      {/* Un solo par de efectos para trivia y adivinanzas. */}
      {canLoadTvMedia && <audio ref={applauseAudioRef} src={tvMediaUrl('sounds/aplauso.mp3')} preload="auto" onEnded={restoreMusicVolumeAfterEffect} />}
      {canLoadTvMedia && <audio ref={donkeyAudioRef} src={tvMediaUrl('sounds/burro.mp3')} preload="auto" onEnded={restoreMusicVolumeAfterEffect} />}

      {/* OVERLAYS */}
      <AnimatePresence>
        {activeChallenge && !resultReveal && (
          <MotionBox className="overlay challenge-overlay">
            <div className="challenge-content">
                <Crown className="challenge-icon" size={64} />
                <h2 className="challenge-title">RETO: {activeChallenge.type?.toUpperCase()}</h2>
                <p className="challenge-player">{activeChallenge.type === 'group' ? '¡TODOS A BAILAR EN GRUPO!' : 'Jugador: ' + (activeChallenge.player?.name || '')}</p>

                {activeChallenge.type === 'trivia' && activeChallenge.data && (
                  <>
                    <div className="challenge-text" style={{ fontSize: '2rem', marginBottom: '30px', fontWeight: 'bold' }}>
                      {activeChallenge.data.question}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>
                      {activeChallenge.data.options?.map((option, index) => {
                        let bgColor = 'rgba(255, 255, 255, 0.1)';
                        let borderColor = 'rgba(255, 255, 255, 0.3)';

                        if (triviaAnswer) {
                          if (index === triviaAnswer.answer && triviaAnswer.isCorrect) {
                            bgColor = 'rgba(34, 197, 94, 0.3)';
                            borderColor = 'rgb(34, 197, 94)';
                          } else if (index === triviaAnswer.answer && !triviaAnswer.isCorrect) {
                            bgColor = 'rgba(239, 68, 68, 0.3)';
                            borderColor = 'rgb(239, 68, 68)';
                          }
                        }

                        return (
                          <div
                            key={index}
                            style={{
                              padding: '20px',
                              backgroundColor: bgColor,
                              borderRadius: '12px',
                              border: `2px solid ${borderColor}`,
                              fontSize: '1.5rem',
                              fontWeight: '600',
                              textAlign: 'center',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            {String.fromCharCode(65 + index)}. {option}
                          </div>
                        );
                      })}
                    </div>
                    {triviaAnswer && (
                      <div style={{
                        marginTop: '30px',
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        color: triviaAnswer.isCorrect ? '#22c55e' : '#ef4444'
                      }}>
                        {triviaAnswer.isCorrect ? '✅ ¡CORRECTO!' : '❌ INCORRECTO'}
                      </div>
                    )}

                    {/* Sección para responder por jugadores manuales - Solo si el jugador con el challenge es manual */}
                    {activeChallenge.player?.isManual && (
                      <div style={{
                        marginTop: '40px',
                        padding: '25px',
                        backgroundColor: 'rgba(251, 191, 36, 0.15)',
                        borderRadius: '16px',
                        border: '3px solid rgba(251, 191, 36, 0.5)'
                      }}>
                        <h3 style={{
                          fontSize: '1.8rem',
                          fontWeight: 'bold',
                          marginBottom: '15px',
                          color: '#fbbf24',
                          textAlign: 'center'
                        }}>
                          📄 Jugador con Cartón Manual - Responde aquí
                        </h3>
                        <p style={{
                          fontSize: '1.3rem',
                          fontWeight: '600',
                          marginBottom: '20px',
                          textAlign: 'center',
                          color: 'white'
                        }}>
                          {activeChallenge.player.name} (Cartón #{activeChallenge.player.cardNumber})
                        </p>
                        {manualPlayerAnswers[activeChallenge.player.id] !== undefined && manualPlayerResults[activeChallenge.player.id] && (
                          <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            marginBottom: '15px',
                            textAlign: 'center',
                            color: manualPlayerResults[activeChallenge.player.id].isCorrect ? '#22c55e' : '#ef4444'
                          }}>
                            {manualPlayerResults[activeChallenge.player.id].isCorrect ? '✅ Respuesta Correcta' : '❌ Respuesta Incorrecta'}
                          </div>
                        )}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '15px',
                          maxWidth: '600px',
                          margin: '0 auto'
                        }}>
                          {activeChallenge.data.options?.map((option, index) => {
                            const hasAnswered = manualPlayerAnswers[activeChallenge.player.id] !== undefined;
                            const playerAnswer = manualPlayerAnswers[activeChallenge.player.id];
                            const isCorrectAnswer = manualPlayerResults[activeChallenge.player.id]?.isCorrect === true;

                            return (
                              <button
                                key={index}
                                onClick={() => !hasAnswered && handleManualPlayerAnswer(activeChallenge.player.id, activeChallenge.player.name, index)}
                                disabled={hasAnswered}
                                style={{
                                  padding: '20px',
                                  backgroundColor: hasAnswered && playerAnswer === index
                                    ? (isCorrectAnswer ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)')
                                    : 'rgba(255, 255, 255, 0.15)',
                                  border: hasAnswered && playerAnswer === index
                                    ? `3px solid ${isCorrectAnswer ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}`
                                    : '2px solid rgba(255, 255, 255, 0.4)',
                                  borderRadius: '12px',
                                  fontSize: '1.3rem',
                                  fontWeight: 'bold',
                                  cursor: hasAnswered ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.3s ease',
                                  opacity: hasAnswered && playerAnswer !== index ? 0.4 : 1,
                                  color: 'white',
                                  textAlign: 'center'
                                }}
                              >
                                {String.fromCharCode(65 + index)}. {option}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeChallenge.type !== 'trivia' && (
                  <p className="challenge-text">{activeChallenge.type === 'riddle' ? activeChallenge.data?.prompt : activeChallenge.text}</p>
                )}

                {activeChallenge.deezerId && canUseExternalSources && !['dance', 'group', 'sing'].includes(activeChallenge.type) && (
                  <div className="challenge-music-player" style={{ marginTop: '20px', maxWidth: '500px', margin: '20px auto' }}>
                    <DeezerPlayer
                      trackId={activeChallenge.deezerId}
                      autoPlay={true}
                      showControls={true}
                    />
                  </div>
                )}
                {['dance', 'group'].includes(activeChallenge.type) && activeChallenge.audioFile && /^[a-z0-9-]+\.mp3$/.test(activeChallenge.audioFile) && canLoadTvMedia && (
                  <ChallengeAudioPlayer
                    key={activeChallenge.challengeId || activeChallenge.audioFile}
                    src={tvMediaUrl('music/retos/' + activeChallenge.audioFile)}
                    startSeconds={activeChallenge.startSeconds}
                    duration={activeChallenge.duration}
                  />
                )}
                {activeChallenge.localFile && canLoadTvMedia && (
                  <KaraokeOverlay
                    localFile={activeChallenge.localFile}
                    videoUrl={tvMediaUrl(`music/karaoke/${activeChallenge.localFile}`)}
                      maxDuration={activeChallenge.duration}
                      onVideoEnd={handleKaraokeVideoEnd}
                      onPlaybackStatus={reportLocalMediaPlayback}
                      onUnavailable={(message) => console.warn(message)}
                  />
                )}

                <div className="challenge-timer">{challengeTimeLeft}s</div>
            </div>
          </MotionBox>
        )}
        {resultReveal && (
          <MotionBox className="overlay challenge-overlay" role="status" data-testid="tv-answer-result">
            <div className="challenge-content">
              <h2 className="challenge-title">{resultReveal.kind === 'trivia' ? 'RESULTADO DE LA TRIVIA' : 'RESULTADO DE LA ADIVINANZA'}</h2>
              {resultReveal.playerName && <p className="challenge-player">{resultReveal.playerName}</p>}
              {resultReveal.answer && <p className="challenge-text">Respuesta: {resultReveal.answer}</p>}
              <p style={{ color: resultReveal.correct ? '#22c55e' : '#ef4444', fontSize: '3rem', fontWeight: 'bold' }}>
                {resultReveal.correct ? '✅ ¡CORRECTO!' : '❌ INCORRECTO'}
              </p>
              <p className="challenge-text">{resultReveal.correct ? '👏 ¡Aplausos!' : '🐴 ¡Inténtalo de nuevo!'}</p>
              <button type="button" onClick={() => {
                const next = !effectsMuted;
                setEffectsMuted(next);
                localStorage.setItem('bingo-tv-effects-muted', String(next));
              }}>
                {effectsMuted ? 'Activar efectos' : 'Silenciar efectos'}
              </button>
            </div>
          </MotionBox>
        )}
        {activeVoting && (
          <MotionBox className="overlay challenge-overlay">
            <div className="challenge-content">
              <h2 className="challenge-title">⭐ VOTACIÓN ABIERTA</h2>
              <p className="challenge-player">Actuación de {activeVoting.performerName}</p>
              <p className="challenge-text">Los jugadores pueden calificar de 1 a 5 estrellas.</p>
              <div className="challenge-timer">
                {activeVoting.votesReceived || 0} / {activeVoting.totalVoters || 0} votos
              </div>
            </div>
          </MotionBox>
        )}
        {gameState === 'waiting' && !countdown && !activeChallenge && (
            <MotionBox className="overlay qr-overlay">
                <div className="qr-content">
                    <Tv size={64} className="qr-icon" />
                    <h2 className="qr-title">Únete al Bingo Bailable</h2>
                    <p className="qr-instructions">Escanea el código QR o entra a la sala:</p>
                    <strong className="qr-room-code">{roomCode}</strong>
                    <div className="qr-code-container">
                        <QRCodeSVG value={createPlayerEntryURL(getShareableUrl(), roomCode)} size={220} includeMargin={true} />
                    </div>
                </div>
            </MotionBox>
        )}
        {countdown !== null && (
            <MotionBox className="overlay countdown-overlay">
                <div className="countdown-number">{countdown > 0 ? countdown : '¡YA!'}</div>
            </MotionBox>
        )}
        {cartonazoWinner && (
          <MotionBox className="overlay cartonazo-winner-overlay">
            <div className="cartonazo-winner-content">
              <Crown className="cartonazo-winner-icon" size={80} />
              <h2 className="cartonazo-winner-title">¡GANADOR DEL CARTONAZO!</h2>
              <p className="cartonazo-winner-name">{cartonazoWinner.name}</p>
              <p className="cartonazo-winner-message">{cartonazoWinner.message}</p>
            </div>
          </MotionBox>
        )}
        {bingoWinner && (
          <MotionBox className="overlay cartonazo-winner-overlay">
            <div className="cartonazo-winner-content">
              <Crown className="cartonazo-winner-icon" size={80} />
              <h2 className="cartonazo-winner-title">¡BINGO!</h2>
              <p className="cartonazo-winner-name">{bingoWinner.winnerName}</p>
              <p className="cartonazo-winner-message">{bingoWinner.achievement === 'full' ? 'Cartón completo' : bingoWinner.achievement}</p>
            </div>
          </MotionBox>
        )}

        {/* Tie-Break Overlay */}
        {tieBreakActive && tieBreakPerformer && (
          <MotionBox className="overlay tiebreak-overlay" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '30px',
            padding: '40px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: '3.5rem',
                fontWeight: 'bold',
                marginBottom: '20px',
                background: 'linear-gradient(45deg, #ff6b6b, #ee5a6f)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {tieBreakPerformer.message}
              </h1>
              <h2 style={{
                fontSize: '2.5rem',
                color: '#fff',
                marginBottom: '10px',
                fontWeight: '600'
              }}>
                {tieBreakPerformer.performerName}
              </h2>
              <p style={{
                fontSize: '1.5rem',
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '30px'
              }}>
                Candidato {tieBreakPerformer.performerNumber} de {tieBreakPerformer.totalPerformers}
              </p>
            </div>

            {tieBreakStatus === 'waiting' && (
              <button
                onClick={handleStartTiebreakPerformance}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '100px',
                  padding: '30px 80px',
                  fontSize: '3rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 15px 50px rgba(102, 126, 234, 0.6)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 10px 40px rgba(102, 126, 234, 0.4)';
                }}
              >
                ▶ INICIAR BAILE
              </button>
            )}

            {tieBreakStatus === 'playing' && tieBreakPerformer?.songData && canLoadTvMedia && (
              <div style={{
                width: '80%',
                maxWidth: '1200px',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
              }}>
                <video
                  ref={tieBreakVideoRef}
                  style={{ width: '100%', height: 'auto' }}
                  controls={false}
                  autoPlay
                >
                  <source
                    src={tvMediaUrl(`music/${tieBreakPerformer.songData.localFile}`)}
                    type="video/mp4"
                  />
                </video>
              </div>
            )}
          </MotionBox>
        )}

        {/* Tie-Break - Botón Abrir Votaciones */}
        {tieBreakActive && tieBreakStatus === 'ready-to-vote' && (
          <MotionBox className="overlay tiebreak-overlay" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '30px',
            padding: '40px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: '3.5rem',
                fontWeight: 'bold',
                marginBottom: '20px',
                background: 'linear-gradient(45deg, #22c55e, #10b981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🎭 ¡Todos han bailado!
              </h1>
              <p style={{
                fontSize: '1.8rem',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '30px'
              }}>
                {tieBreakCandidates.length} candidatos listos para votación
              </p>
            </div>

            <button
              onClick={handleStartVoting}
              style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '100px',
                padding: '30px 80px',
                fontSize: '3rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 10px 40px rgba(34, 197, 94, 0.4)',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '20px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 15px 50px rgba(34, 197, 94, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 10px 40px rgba(34, 197, 94, 0.4)';
              }}
            >
              🗳️ ABRIR VOTACIONES
            </button>
          </MotionBox>
        )}

        {/* Tie-Break - Progreso de Votación */}
        {tieBreakActive && tieBreakStatus === 'voting' && (
          <MotionBox className="overlay tiebreak-overlay" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '30px',
            padding: '40px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: '3.5rem',
                fontWeight: 'bold',
                marginBottom: '20px',
                background: 'linear-gradient(45deg, #3b82f6, #2563eb)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🗳️ Votación en Progreso
              </h1>

              <div style={{
                fontSize: '4rem',
                fontWeight: 'bold',
                color: '#fff',
                marginBottom: '20px'
              }}>
                {tieBreakVotingProgress.voted} / {tieBreakVotingProgress.total}
              </div>

              <p style={{
                fontSize: '1.5rem',
                color: 'rgba(255, 255, 255, 0.7)'
              }}>
                jugadores han votado
              </p>

              {/* Barra de progreso */}
              <div style={{
                width: '500px',
                height: '30px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '15px',
                overflow: 'hidden',
                marginTop: '30px'
              }}>
                <div style={{
                  width: `${(tieBreakVotingProgress.voted / Math.max(tieBreakVotingProgress.total, 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          </MotionBox>
        )}
      </AnimatePresence>

      {/* GRID LAYOUT */}
      <header className="grid-header">
        <div className="logo">
          <Radio size={32} />
          <h1>Bingo Bailable</h1>
        </div>
        <div className="room-status">
          <div className="room-info-item">
            <Users size={20} />
            <span>{roomInfo?.playerCount || 0} Jugadores</span>
          </div>
          <div className={`game-state-badge ${gameState}`}>
            {gameState === 'waiting' && 'En Espera'}
            {gameState === 'playing' && 'En Juego'}
            {gameState === 'paused' && 'Pausado'}
            {gameState === 'finished' && 'Finalizado'}
          </div>
        </div>
      </header>

      <section className="grid-video">
        <div className="video-wrapper">
          {tvSessionToken && canLoadTvMedia && !tvAuthorizationError && !tvConnectionError &&
            (!remoteTvAudioPrepared || gameState === 'waiting') && (
              <div className="tv-remote-audio-setup" data-testid="remote-tv-audio-setup" role="status">
                {remoteTvAudioPrepared ? (
                  <p>TV remota preparada. La música comenzará automáticamente al iniciar el juego.</p>
                ) : (
                  <>
                    <p>Antes de iniciar el bingo, prepará el sonido en esta laptop una sola vez.</p>
                    <button type="button" onClick={handlePrepareRemoteTvAudio} disabled={remoteTvAudioPreparing}>
                      {remoteTvAudioPreparing ? 'Preparando sonido…' : 'Preparar TV y activar sonido'}
                    </button>
                    {remoteTvAudioError && <p role="alert">{remoteTvAudioError}</p>}
                  </>
                )}
              </div>
            )}
          {canRenderTvMedia ? <video
            ref={videoPlayerRef}
            onPause={handleVideoPause}
            onPlay={handleVideoPlay}
            onEnded={handleVideoEnded}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            controls={gameState === 'playing' || gameState === 'paused'}
            playsInline
            onLoadStart={() => setMusicStatus(currentSong?.localFile ? 'loading' : 'unavailable')}
            onCanPlay={() => setMusicStatus('ready')}
            onPlaying={() => {
              setMusicStatus('playing');
              reportLocalMediaPlayback('playing');
            }}
            onError={() => {
              setMusicStatus('unavailable');
              reportLocalMediaPlayback('unavailable');
            }}
          >
            {currentSong?.localFile && canLoadTvMedia && (
              <source src={tvMediaUrl(`music/${currentSong.localFile}`)} type="video/mp4" />
            )}
            Tu navegador no soporta el elemento de video.
          </video> : (
            <p role="status">La reproducción multimedia está deshabilitada para esta TV.</p>
          )}
          {musicStatus === 'unavailable' && (
            <p role="alert">La pista local no está disponible. El bingo puede continuar sin música.</p>
          )}
          {musicStatus === 'autoplay-blocked' && (
            <button type="button" onClick={async () => {
              const result = await attemptMediaPlayback(videoPlayerRef.current);
              setMusicStatus(result === 'playing' ? 'playing' : result);
              reportLocalMediaPlayback(result);
            }}>
              Reproducir música
            </button>
          )}
        </div>
        <div className="now-playing-bar">
          <span>🎵</span>
          <p>{currentSong?.title || 'Cargando...'} – {currentSong?.artist || '...'}</p>
        </div>
      </section>

      <section className="grid-game-info">
        <AnimatePresence mode="wait">
          <MotionBox key={currentNumber} className="current-number-card">
            <span className="current-number-letter">{getBingoLetter(currentNumber)}</span>
            <span className="current-number-value">{currentNumber || '--'}</span>
          </MotionBox>
        </AnimatePresence>
        <div className="game-stats">
            <div className="stat-item">
                <h3>SALA</h3>
                <p>{roomCode}</p>
            </div>
            <div className="stat-item">
                <h3>CANTADOS</h3>
                <p>{calledNumbers.length} de 75</p>
            </div>
        </div>
      </section>

      <section className="grid-called-numbers">
        <div className="called-numbers-header">
            <h3>Números Cantados</h3>
        </div>
        <div className="called-numbers-list">
          <AnimatePresence>
            {calledNumbers.slice(-8).map((num) => (
              <motion.div
                key={num}
                className="called-number-item"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: 'backOut' }}
              >
                <span className="called-number-letter">{getBingoLetter(num)}</span>
                {num}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

    </div>
  );
};

export default TVDisplay;
