"use client";
import { useCallback, useState, useEffect, useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useSocket } from '../../context/useSocket';
import { shufflePlaylist } from '../../config/musicPlaylists';
import { QRCodeSVG } from 'qrcode.react';
import { Radio, Tv, Users, Crown } from 'lucide-react';
import DeezerPlayer from '../Music/DeezerPlayer';
import KaraokeOverlay from '../Music/KaraokeOverlay';
 
import { getShareableUrl } from '../../utils/networkUtils';
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

const TVDisplay = ({ roomCode, tvCapability }) => {
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
  const [riddleResult, setRiddleResult] = useState(null);
  const [effectsMuted, setEffectsMuted] = useState(() => localStorage.getItem('bingo-tv-effects-muted') === 'true');
  const [musicStatus, setMusicStatus] = useState('loading');
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
  const isChallengeActiveRef = useRef(false); // Ref síncrono para trackear challenges
  const applauseAudioRef = useRef(null); // Ref para sonido de aplauso
  const donkeyAudioRef = useRef(null); // Ref para sonido de burro
  const currentSong = playlist[currentSongIndex];

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

  useEffect(() => {
    if (!socket) return;

    const handleNumberCalled = (data) => {
      setCurrentNumber(data.number);
      setCalledNumbers((prev) => [...prev, data.number]);
    };

    const handleGameStateChanged = (data) => setGameState(data.state);
    const handleGameStarted = () => {
        console.log('📺 TV: Game started!');
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
        isChallengeActiveRef.current = false;
        console.log('🟢 Challenge active flag SET to FALSE');

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
        console.log('📺 TVDisplay: ========== TRIVIA ANSWERED EVENT ==========');
        console.log('📺 TVDisplay: Full data received:', JSON.stringify(data, null, 2));
        console.log('📺 TVDisplay: Active challenge:', activeChallenge);

        const { answer, isCorrect } = data;

        console.log('📺 TVDisplay: Extracted values:', {
            answer,
            isCorrect,
            answerType: typeof answer,
            isCorrectType: typeof isCorrect
        });

        // Guardar la respuesta para resaltarla en el UI
        setTriviaAnswer({ answer, isCorrect });
        console.log('📺 TVDisplay: ✅ triviaAnswer state updated');

        // Reproducir sonido correspondiente
        const audioToPlay = isCorrect ? applauseAudioRef.current : donkeyAudioRef.current;
        const soundName = isCorrect ? 'applause (CORRECT)' : 'donkey (INCORRECT)';

        console.log(`📺 TVDisplay: Will play ${soundName} because isCorrect=${isCorrect}`);

        if (audioToPlay) {
            audioToPlay.currentTime = 0;
            audioToPlay.play()
                .then(() => {
                    console.log(`🔊 Successfully playing ${soundName} sound on TV`);
                })
                .catch(err => {
                    console.error(`❌ Error playing ${soundName} sound on TV:`, err);
                });
        } else {
            console.error(`❌ Audio ref is null for ${soundName}`);
        }

        console.log('📺 TVDisplay: ========== END TRIVIA ANSWERED EVENT ==========');
    };
    const handleTriviaResult = (data) => {
      const challengePlayerId = activeChallenge?.player?.id || activeChallenge?.player?._id || activeChallenge?.player?.playerId;
      if (!challengePlayerId || data?.playerId?.toString() !== challengePlayerId.toString()) return;
      setTriviaAnswer(data);
      setManualPlayerResults(prev => ({ ...prev, [data.playerId]: data }));
    };
    const handleRiddleResult = (data) => {
      const result = data.result || data;
      if (!data?.challengeId || !result.answer) return;
      const normalized = { ...data, answer: result.answer, success: data.success ?? result.success };
      setRiddleResult(normalized);
      if (!effectsMuted) {
        const audioToPlay = normalized.success ? applauseAudioRef.current : donkeyAudioRef.current;
        audioToPlay?.play().catch(() => {});
      }
      window.setTimeout(() => setRiddleResult(current => (
        current?.challengeId === normalized.challengeId ? null : current
      )), 6000);
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
        if (data.isPlaying) {
          console.log('▶️ Music sync: Attempting to play video');

          // Esperar un poco para asegurar que el video esté listo
          setTimeout(() => {
            if (videoPlayerRef.current && !isChallengeActiveRef.current) {
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
      if (!tvCapability) return;
      socket.emit('join-room', { roomCode, playerId: 'tv-display', tvCapability }, (response) => {
        if (response?.success) {
          console.log('📺 TV Display joined room successfully:', response);
        } else {
          console.error('📺 TV Display failed to join room:', response?.error);
        }
      });
    };
    joinTVRoom();
    socket.on('connect', joinTVRoom);

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
  }, [socket, roomCode, tvCapability, activeChallenge, gameState, playlist.length, effectsMuted]); // Solo re-ejecutar si cambia el contexto de la sala o el estado del juego

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

  // Manejar pausa manual del video
  const handleVideoPause = () => {
    // Solo emitir si no estamos en un challenge (para no interferir)
    if (!isChallengeActiveRef.current && gameState === 'playing') {
      console.log('⏸️ Video paused manually, pausing game');
      socket?.emit('pause-game', { roomCode });
    }
  };

  // Manejar reproducción manual del video
  const handleVideoPlay = () => {
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
          if (gameState === 'playing' && !isChallengeActiveRef.current) {
            console.log('📺 Auto-playing new song from second 20');
            videoElement.play()
              .then(() => {
                console.log('✅ New song playing successfully');
              })
              .catch(err => {
                console.warn('⚠️ Auto-play prevented for new song:', err);
                console.log('💡 Tip: Click on the video to start playback');
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
  }, [currentSong, gameState, activeChallenge, playlist.length]);

  // Sincronizar video con el estado del juego Y cuando termina un challenge
  useEffect(() => {
    if (!videoPlayerRef.current) return;

    console.log('🔄 useEffect [gameState] triggered - gameState:', gameState, 'activeChallenge:', activeChallenge, 'challengeRef:', isChallengeActiveRef.current);

    if (gameState === 'paused' && videoPlayerRef.current) {
      console.log('⏸️ Game state is PAUSED, pausing video');
      videoPlayerRef.current.pause();
    } else if (gameState === 'playing' && !activeChallenge) {
      // Solo intentar reproducir si el video NO se está cargando
      // (el useEffect de currentSong se encargará si hay cambio de canción)
      const isLoading = videoPlayerRef.current.readyState < 3; // HAVE_FUTURE_DATA

      if (!isLoading) {
        console.log('🎮 Game state is PLAYING, video is ready, attempting to play');
        setTimeout(() => {
          if (videoPlayerRef.current && !isChallengeActiveRef.current) {
            console.log('🎬 Calling video.play() from gameState effect...');
            videoPlayerRef.current.play()
              .then(() => {
                console.log('✅ Video playing after game state change');
              })
              .catch(err => {
                console.warn('⚠️ Auto-play prevented:', err);
              });
          }
        }, 300);
      } else {
        console.log('⏳ Video is loading, will auto-play when ready (from currentSong effect)');
      }
    } else {
      console.log('⏭️ Not playing - gameState:', gameState, 'activeChallenge:', !!activeChallenge);
    }
  }, [gameState, activeChallenge]);

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
      {/* Elementos de audio ocultos para sonidos de trivia */}
      <audio ref={applauseAudioRef} src="/sounds/aplauso.mp3" preload="auto" />
      <audio ref={donkeyAudioRef} src="/sounds/burro.mp3" preload="auto" />

      {/* OVERLAYS */}
      <AnimatePresence>
        {activeChallenge && (
          <MotionBox className="overlay challenge-overlay">
            <div className="challenge-content">
                <Crown className="challenge-icon" size={64} />
                <h2 className="challenge-title">RETO: {activeChallenge.type?.toUpperCase()}</h2>
                <p className="challenge-player">Jugador: {activeChallenge.player?.name}</p>

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

                {activeChallenge.deezerId && (
                  <div className="challenge-music-player" style={{ marginTop: '20px', maxWidth: '500px', margin: '20px auto' }}>
                    <DeezerPlayer
                      trackId={activeChallenge.deezerId}
                      autoPlay={true}
                      showControls={true}
                    />
                  </div>
                )}
                {activeChallenge.localFile && (
                  <KaraokeOverlay
                    localFile={activeChallenge.localFile}
                      maxDuration={activeChallenge.duration}
                      onVideoEnd={handleKaraokeVideoEnd}
                      onUnavailable={(message) => console.warn(message)}
                  />
                )}

                <div className="challenge-timer">{challengeTimeLeft}s</div>
            </div>
          </MotionBox>
        )}
        {riddleResult && (
          <MotionBox className="overlay challenge-overlay" role="status">
            <div className="challenge-content">
              <h2 className="challenge-title">RESULTADO DE LA ADIVINANZA</h2>
              <p className="challenge-player">Jugador: {riddleResult.playerName || 'Jugador'}</p>
              <p className="challenge-text">Respuesta: {riddleResult.answer}</p>
              <p style={{ color: riddleResult.success ? '#22c55e' : '#ef4444', fontSize: '2rem', fontWeight: 'bold' }}>
                {riddleResult.success ? '✅ ¡CORRECTO!' : '❌ INCORRECTO'}
              </p>
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
                        <QRCodeSVG value={`${getShareableUrl()}/?room=${roomCode}`} size={220} includeMargin={true} />
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

            {tieBreakStatus === 'playing' && tieBreakPerformer?.songData && (
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
                    src={`/music/${tieBreakPerformer.songData.localFile}`}
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
          <video
            ref={videoPlayerRef}
            onPause={handleVideoPause}
            onPlay={handleVideoPlay}
            onEnded={handleVideoEnded}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            controls
            autoPlay
            playsInline
            onLoadStart={() => setMusicStatus(currentSong?.localFile ? 'loading' : 'unavailable')}
            onCanPlay={() => setMusicStatus('ready')}
            onPlaying={() => setMusicStatus('playing')}
            onError={() => setMusicStatus('unavailable')}
          >
            {currentSong?.localFile && (
              <source src={`/music/${encodeURIComponent(currentSong.localFile)}`} type="video/mp4" />
            )}
            Tu navegador no soporta el elemento de video.
          </video>
          {musicStatus === 'unavailable' && (
            <p role="alert">La pista local no está disponible. El bingo puede continuar sin música.</p>
          )}
          {musicStatus === 'ready' && (
            <button type="button" onClick={() => videoPlayerRef.current?.play().then(() => setMusicStatus('playing')).catch(() => setMusicStatus('unavailable'))}>
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

      {/* Elementos de audio para sonidos de trivia */}
      <audio ref={applauseAudioRef} src="/sounds/aplauso.mp3" preload="auto" />
      <audio ref={donkeyAudioRef} src="/sounds/burro.mp3" preload="auto" />
    </div>
  );
};

export default TVDisplay;
