import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../../context/useGame';
import ReactPlayer from 'react-player';
import DeezerPlayer from '../Music/DeezerPlayer';
import { getRandomSongForChallenge } from '../../data/deezerSongs';
import { getKaraokeSongById } from '../../data/karaokeList';
import RecordingChallenge from '../Recording/RecordingChallenge';
import './ChallengeModal.css';

const ChallengeModal = ({
  externalActiveChallenge = null,
  externalCompleteChallenge = null,
  externalGameId = null,
  externalRoomCode = null,
  externalPlayerId = null,
  externalPlayerName = null,
  externalPlayerCapability = null,
  externalTriviaResult = null
}) => {
  const contextData = useGame();

  const activeChallenge = externalActiveChallenge || contextData.activeChallenge;
  const completeChallenge = externalCompleteChallenge || contextData.completeChallenge;
  const gameId = externalGameId || contextData.gameId;
  const roomCode = externalRoomCode || contextData.roomCode;
  const playerId = externalPlayerId || contextData.playerId;
  const playerName = externalPlayerName || contextData.playerName;
  const playerCapability = externalPlayerCapability || contextData.playerCapability;
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [timer, setTimer] = useState(0);
  const timerIntervalRef = useRef(null);
  const [deezerSong, setDeezerSong] = useState(null);
  const [karaokeSong, setKaraokeSong] = useState(null);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
  const [showRecording, setShowRecording] = useState(false);
  const [recordingCompleted, setRecordingCompleted] = useState(false);

  // Refs para los sonidos
  const applauseAudioRef = useRef(null);
  const donkeyAudioRef = useRef(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeChallenge?.type === 'trivia' && externalTriviaResult?.answer !== undefined) {
      setSelectedAnswer(externalTriviaResult.answer);
      setShowResult(true);
    }
  }, [activeChallenge, externalTriviaResult]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const startTimer = useCallback((initialTime) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    setTimer(initialTime);
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          timerIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    timerIntervalRef.current = interval;
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeChallenge) {
      console.log('🎯 ChallengeModal received activeChallenge:', activeChallenge);
      console.log('🎯 Challenge type:', activeChallenge.type);
      console.log('🎯 Challenge data:', activeChallenge.data);

      setSelectedAnswer(null);
      setTextAnswer('');
      setShowResult(false);
      setCurrentLyricIndex(0);

      // Seleccionar canción de Deezer para challenges de baile, canto y grupo
      if (activeChallenge.type === 'dance' || activeChallenge.type === 'sing' || activeChallenge.type === 'group') {
        // Si el challenge viene con un deezerId específico del backend, usarlo
        if (activeChallenge.data?.deezerId) {
          setDeezerSong({ id: activeChallenge.data.deezerId });
        }
        // Si no, seleccionar una canción aleatoria apropiada
        else {
          const song = getRandomSongForChallenge(activeChallenge.type);
          setDeezerSong(song);
        }
        setKaraokeSong(null);
      }
      // Para karaoke, cargar la canción con letras
      else if (activeChallenge.type === 'karaoke') {
        const karaokeId = activeChallenge.data?.karaokeId;
        if (karaokeId) {
          const song = getKaraokeSongById(karaokeId);
          setKaraokeSong(song);
          // No usar Deezer para karaoke, usaremos YouTube
          setDeezerSong(null);
        }
      } else {
        setDeezerSong(null);
        setKaraokeSong(null);
      }

      // Iniciar timer para retos de baile y canto
      if (activeChallenge.type === 'dance') {
        setTimer(20);
        startTimer(20);
      } else if (activeChallenge.type === 'sing') {
        setTimer(30);
        startTimer(30);
      } else if (activeChallenge.type === 'group') {
        setTimer(30);
        startTimer(30);
      } else if (activeChallenge.type === 'karaoke') {
        setTimer(90);
        startTimer(90);
      }
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setDeezerSong(null);
      setKaraokeSong(null);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [activeChallenge, startTimer]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-scroll de letras para karaoke
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeChallenge?.type === 'karaoke' && karaokeSong?.lyrics && timer > 0) {
      const totalLines = karaokeSong.lyrics.length;
      if (totalLines === 0) return;

      // Calcular cada cuánto tiempo cambiar de línea (90 segundos / número de líneas)
      const KARAOKE_DURATION = 90;
      const timePerLine = KARAOKE_DURATION / totalLines;
      const elapsed = KARAOKE_DURATION - timer;
      const newIndex = Math.min(
        Math.floor(elapsed / timePerLine),
        totalLines - 1
      );

      setCurrentLyricIndex(newIndex);
    }
  }, [timer, karaokeSong, activeChallenge]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleTriviaAnswer = (answerIndex) => {
    if (showResult) return;

    setSelectedAnswer(answerIndex);
    // Determinar si la respuesta es correcta
    const hasLocalAnswer = Number.isInteger(activeChallenge?.data?.correct);
    const isCorrect = hasLocalAnswer ? answerIndex === activeChallenge.data.correct : null;
    setShowResult(hasLocalAnswer);

    // IMPORTANTE: Emitir INMEDIATAMENTE la respuesta para sincronizar con TV
    console.log('📤 Emitting answer immediately for TV sync');
    completeChallenge(true, answerIndex);

    // Reproducir el sonido correspondiente
    const audioToPlay = hasLocalAnswer
      ? (isCorrect ? applauseAudioRef.current : donkeyAudioRef.current)
      : null;

    if (audioToPlay) {
      audioToPlay.currentTime = 0; // Reiniciar el audio
      audioToPlay.play()
        .then(() => {
          console.log(`🔊 Playing ${isCorrect ? 'applause' : 'donkey'} sound`);
        })
        .catch(err => {
          console.error('Error playing sound:', err);
        });
    }
  };

  const handleComplete = () => {
    // Para trivias, ya se llamó completeChallenge en handleTriviaAnswer
    if (activeChallenge.type !== 'trivia') {
      completeChallenge(true);
    }
  };

  const handleRiddleAnswer = () => {
    const answer = textAnswer.trim();
    if (!answer) return;
    completeChallenge(true, answer);
  };

  const handleRecordingComplete = (recording) => {
    console.log('Grabación completada:', recording);
    setRecordingCompleted(true);
    setShowRecording(false);
  };

  const handleRecordingError = (error) => {
    console.error('Error en grabación:', error);
  };

  const toggleRecording = () => {
    setShowRecording(!showRecording);
  };

  if (!activeChallenge) return null;

  const { type, player, data } = activeChallenge;

  return (
    <div className="challenge-modal">
      {/* Elementos de audio ocultos para sonidos de trivia */}
      <audio ref={applauseAudioRef} src="/sounds/aplauso.mp3" preload="auto" />
      <audio ref={donkeyAudioRef} src="/sounds/burro.mp3" preload="auto" />

      <div className="challenge-content">
        <div className="challenge-header">🎯 ¡RETO!</div>

        <div className="challenge-player">
          👤 {type === 'group' ? '¡TODOS LOS JUGADORES!' : player.name}
        </div>

        <div className={`challenge-type challenge-type-${type}`}>
          {type === 'trivia' && '🧠 TRIVIA NAVIDEÑA'}
          {type === 'dance' && '💃 RETO DE BAILE'}
          {type === 'sing' && '🎤 RETO DE CANTO'}
          {type === 'group' && '👥 RETO GRUPAL'}
          {type === 'karaoke' && '🎤 MODO KARAOKE'}
          {type === 'riddle' && '🧩 ADIVINANZA'}
        </div>

        {/* TRIVIA */}
        {type === 'trivia' && (
          <>
            {/* Validación de datos */}
            {!data || !data.question || !data.options ? (
              <div className="challenge-description" style={{ color: 'red' }}>
                ⚠️ Error: Datos de trivia no disponibles
                <br />
                <small>data: {JSON.stringify(data)}</small>
              </div>
            ) : (
              <>
                <div className="challenge-description">
                  {data.question}
                </div>

                <div className="trivia-options">
                  {data.options.map((option, index) => (
                    <button
                      key={index}
                      className={`trivia-option ${
                        showResult && externalTriviaResult?.isCorrect && index === selectedAnswer
                          ? 'correct'
                          : showResult && externalTriviaResult && !externalTriviaResult.isCorrect && index === selectedAnswer
                          ? 'incorrect'
                          : showResult && !externalTriviaResult && index === data.correct
                          ? 'correct'
                          : showResult && !externalTriviaResult && index === selectedAnswer
                          ? 'incorrect'
                          : ''
                      } ${selectedAnswer === index ? 'selected' : ''}`}
                      onClick={() => handleTriviaAnswer(index)}
                      disabled={showResult}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                {showResult && (
                  <div className={`trivia-result ${(externalTriviaResult?.isCorrect ?? selectedAnswer === data.correct) ? 'correct' : 'incorrect'}`}>
                    {(externalTriviaResult?.isCorrect ?? selectedAnswer === data.correct)
                      ? '✅ ¡CORRECTO! ¡Muy bien!'
                      : '❌ ¡INCORRECTO!'}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ADIVINANZA */}
        {type === 'riddle' && (
          <>
            <div className="challenge-description">{data?.prompt || activeChallenge.text}</div>
            <input
              type="text"
              value={textAnswer}
              onChange={(event) => setTextAnswer(event.target.value)}
              maxLength={200}
              placeholder="Escribí tu respuesta"
              aria-label="Respuesta de la adivinanza"
            />
            <button
              className="btn-close-challenge"
              onClick={handleRiddleAnswer}
              disabled={!textAnswer.trim()}
            >
              Enviar respuesta
            </button>
          </>
        )}

        {/* BAILE */}
        {type === 'dance' && (
          <>
            <div className="challenge-description">{data}</div>

            {/* Reproductor de Deezer */}
            {deezerSong && (
              <div className="challenge-music-player">
                <DeezerPlayer
                  trackId={deezerSong.id}
                  autoPlay={true}
                  showControls={true}
                  className="mb-4"
                />
              </div>
            )}

            <div className="challenge-timer">
              ⏱️ {timer > 0 ? `${timer} segundos` : '¡Tiempo terminado!'}
            </div>

            {/* Botón para mostrar/ocultar grabación */}
            <button
              className="btn-toggle-recording"
              onClick={toggleRecording}
              style={{ marginBottom: '15px' }}
            >
              {showRecording ? '📹 Ocultar Grabación' : '📹 Grabar Actuación'}
            </button>

            {/* Componente de grabación */}
            {showRecording && gameId && roomCode && playerId && playerName && (
              <RecordingChallenge
                gameId={gameId}
                roomCode={roomCode}
                playerId={playerId}
                playerName={playerName}
                playerCapability={playerCapability}
                challengeType={type}
                challengeText={data}
                onRecordingComplete={handleRecordingComplete}
                onRecordingError={handleRecordingError}
              />
            )}

            {recordingCompleted && (
              <div className="recording-success">
                ✅ ¡Grabación guardada exitosamente!
              </div>
            )}

            <button className="btn-close-challenge" onClick={handleComplete}>
              Completar Reto
            </button>
          </>
        )}

        {/* CANTO */}
        {type === 'sing' && (
          <>
            <div className="challenge-description">{data}</div>

            {/* Reproductor de Deezer */}
            {deezerSong && (
              <div className="challenge-music-player">
                <DeezerPlayer
                  trackId={deezerSong.id}
                  autoPlay={true}
                  showControls={true}
                  className="mb-4"
                />
              </div>
            )}

            <div className="challenge-timer">
              ⏱️ {timer > 0 ? `${timer} segundos` : '¡Tiempo terminado!'}
            </div>

            <button className="btn-close-challenge" onClick={handleComplete}>
              Completar Reto
            </button>
          </>
        )}

        {/* GRUPAL */}
        {type === 'group' && (
          <>
            <div className="challenge-description">{data}</div>

            {/* Reproductor de Deezer */}
            {deezerSong && (
              <div className="challenge-music-player">
                <DeezerPlayer
                  trackId={deezerSong.id}
                  autoPlay={true}
                  showControls={true}
                  className="mb-4"
                />
              </div>
            )}

            <div className="challenge-timer">
              ⏱️ {timer > 0 ? `${timer} segundos` : '¡Tiempo terminado!'}
            </div>

            <button className="btn-close-challenge" onClick={handleComplete}>
              Completar Reto
            </button>
          </>
        )}

        {/* KARAOKE */}
        {type === 'karaoke' && (
          <>
            {/* Título y artista de la canción */}
            {karaokeSong && (
              <div className="karaoke-song-info">
                <div className="karaoke-title">{karaokeSong.title}</div>
                <div className="karaoke-artist">{karaokeSong.artist}</div>
              </div>
            )}

            {/* Reproductor de video local */}
            {karaokeSong?.localFile && (
              <div className="karaoke-video-player">
                <video
                  src={`/music/karaoke/${karaokeSong.localFile}`}
                  controls
                  autoPlay
                  style={{
                    width: '100%',
                    maxHeight: '400px',
                    borderRadius: '8px',
                    marginBottom: '15px'
                  }}
                />
              </div>
            )}

            {/* Reproductor de YouTube (fallback) */}
            {!karaokeSong?.localFile && karaokeSong?.youtubeId && (
              <div className="karaoke-video-player">
                <ReactPlayer
                  url={`https://www.youtube.com/watch?v=${karaokeSong.youtubeId}`}
                  playing={true}
                  controls={true}
                  width="100%"
                  height="200px"
                  volume={0.7}
                  config={{
                    youtube: {
                      playerVars: {
                        start: 0,
                        end: 30,
                        modestbranding: 1
                      }
                    }
                  }}
                />
              </div>
            )}

            {/* Mensaje si no hay video */}
            {!karaokeSong?.localFile && !karaokeSong?.youtubeId && (
              <div className="karaoke-no-video">
                <p>📹 Video no disponible</p>
                <p className="text-sm">Agrega el localFile o youtubeId en karaokeList.js</p>
              </div>
            )}

            {/* Letras del karaoke con scroll automático */}
            {karaokeSong?.lyrics && karaokeSong.lyrics.length > 0 && (
              <div className="karaoke-lyrics-container">
                {karaokeSong.lyrics.map((line, index) => (
                  <div
                    key={index}
                    className={`karaoke-lyric-line ${
                      index === currentLyricIndex
                        ? 'active'
                        : index < currentLyricIndex
                        ? 'past'
                        : 'future'
                    }`}
                  >
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            )}

            {/* Mensaje si no hay letras disponibles */}
            {(!karaokeSong?.lyrics || karaokeSong.lyrics.length === 0) && (
              <div className="karaoke-no-lyrics">
                <p>🎵 ¡Canta esta canción!</p>
                <p className="text-sm">(Letras no disponibles - ¡improvisa!)</p>
              </div>
            )}

            <div className="challenge-timer">
              ⏱️ {timer > 0 ? `${timer} segundos` : '¡Tiempo terminado!'}
            </div>

            {/* Botón para mostrar/ocultar grabación */}
            <button
              className="btn-toggle-recording"
              onClick={toggleRecording}
              style={{ marginBottom: '15px' }}
            >
              {showRecording ? '📹 Ocultar Grabación' : '📹 Grabar Actuación'}
            </button>

            {/* Componente de grabación */}
            {showRecording && gameId && roomCode && playerId && playerName && (
              <RecordingChallenge
                gameId={gameId}
                roomCode={roomCode}
                playerId={playerId}
                playerName={playerName}
                playerCapability={playerCapability}
                challengeType={type}
                challengeText={karaokeSong?.title || data}
                onRecordingComplete={handleRecordingComplete}
                onRecordingError={handleRecordingError}
              />
            )}

            {recordingCompleted && (
              <div className="recording-success">
                ✅ ¡Grabación guardada exitosamente!
              </div>
            )}

            <button className="btn-close-challenge" onClick={handleComplete}>
              Completar Karaoke
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ChallengeModal;
