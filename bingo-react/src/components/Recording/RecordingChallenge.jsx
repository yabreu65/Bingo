import { useState, useEffect, useRef } from 'react';
import './RecordingChallenge.css';
import { createRecordingAuthorizationHeaders } from '../../utils/recordingAuthorization';
import { API_URL } from '../../config/api';

const RECORDING_DURATION = 30 * 1000; // 30 segundos
const COUNTDOWN_DURATION = 3; // 3 segundos de cuenta regresiva

const RecordingChallenge = ({
  gameId,
  roomCode,
  playerId,
  playerName,
  playerCapability,
  hostCapability,
  challengeType,
  challengeText,
  onRecordingComplete,
  onRecordingError
}) => {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Cargar cámaras disponibles
  useEffect(() => {
    loadCameras();
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      countdownTimerRef.current = null;
      recordingTimerRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      stopStream();
    };
  }, []);

  const loadCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');

      setCameras(videoDevices);

      // Auto-seleccionar DroidCam si está disponible
      const droidcam = videoDevices.find(d =>
        d.label.toLowerCase().includes('droidcam') ||
        d.label.toLowerCase().includes('android') ||
        d.label.toLowerCase().includes('iphone')
      );

      if (droidcam) {
        setSelectedCamera(droidcam.deviceId);
      } else if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId);
      }

    } catch (err) {
      console.error('Error loading cameras:', err);
      setError('No se pudo acceder a las cámaras');
    }
  };

  const requestCameraPermission = async () => {
    try {
      setIsPreparing(true);
      setError(null);

      const constraints = {
        video: {
          deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setPermissionGranted(true);
      setIsPreparing(false);

    } catch (err) {
      console.error('Error requesting camera permission:', err);
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
      setIsPreparing(false);
    }
  };

  const startRecording = async () => {
    if (!permissionGranted) {
      await requestCameraPermission();
      return;
    }

    try {
      setError(null);

      // Cuenta regresiva antes de grabar
      setCountdown(COUNTDOWN_DURATION);
      let count = COUNTDOWN_DURATION;

      countdownTimerRef.current = setInterval(() => {
        count -= 1;
        setCountdown(count);

        if (count === 0) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          beginRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Error al iniciar la grabación');
    }
  };

  const beginRecording = () => {
    try {
      chunksRef.current = [];

      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      };

      // Fallback si VP9 no está disponible
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(mediaStreamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        uploadRecording(blob);
      };

      mediaRecorder.start(100); // Guardar chunks cada 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Timer para mostrar tiempo de grabación
      let time = 0;
      recordingTimerRef.current = setInterval(() => {
        time += 1;
        setRecordingTime(time);

        // Detener después de 30 segundos
        if (time >= RECORDING_DURATION / 1000) {
          stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('Error beginning recording:', err);
      setError('Error al grabar. Intenta de nuevo.');
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecording = async (blob) => {
    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append('recording', blob, `recording-${Date.now()}.webm`);
      formData.append('gameId', gameId);
      formData.append('roomCode', roomCode);
      formData.append('playerId', playerId);
      formData.append('playerName', playerName);
      formData.append('challengeType', challengeType);
      formData.append('challengeText', challengeText);
      formData.append('duration', Math.floor(recordingTime));

      const response = await fetch(`${API_URL}/api/recordings/upload`, {
        method: 'POST',
        headers: createRecordingAuthorizationHeaders({
          roomCode,
          playerId,
          playerCapability,
          hostCapability
        }),
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setIsUploading(false);
        stopStream();

        if (onRecordingComplete) {
          onRecordingComplete(data.recording);
        }
      } else {
        throw new Error(data.message || 'Error al subir la grabación');
      }

    } catch (err) {
      console.error('Error uploading recording:', err);
      setError('Error al subir la grabación');
      setIsUploading(false);

      if (onRecordingError) {
        onRecordingError(err);
      }
    }
  };

  const stopStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setPermissionGranted(false);
  };

  const handleCameraChange = (e) => {
    setSelectedCamera(e.target.value);
    if (permissionGranted) {
      stopStream();
      setPermissionGranted(false);
    }
  };

  // Solo mostrar para karaoke y dance
  if (challengeType !== 'karaoke' && challengeType !== 'dance') {
    return null;
  }

  return (
    <div className="recording-challenge">
      <div className="recording-header">
        <h3>Grabar Actuación</h3>
        <div className="challenge-badge">
          {challengeType === 'karaoke' ? '🎤 Karaoke' : '💃 Baile'}
        </div>
      </div>

      {error && (
        <div className="recording-error">
          ⚠️ {error}
        </div>
      )}

      {cameras.length > 1 && !isRecording && (
        <div className="camera-selector">
          <label htmlFor="camera-select">Seleccionar Cámara:</label>
          <select
            id="camera-select"
            value={selectedCamera}
            onChange={handleCameraChange}
            disabled={isPreparing || isRecording || isUploading}
          >
            {cameras.map(camera => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Cámara ${camera.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="recording-preview">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`preview-video ${!permissionGranted ? 'hidden' : ''}`}
        />

        {!permissionGranted && !isPreparing && (
          <div className="preview-placeholder">
            <div className="placeholder-icon">📹</div>
            <p>Presiona "Iniciar Grabación" para activar la cámara</p>
          </div>
        )}

        {countdown > 0 && (
          <div className="countdown-overlay">
            <div className="countdown-number">{countdown}</div>
          </div>
        )}

        {isRecording && (
          <div className="recording-indicator">
            <div className="rec-dot"></div>
            <span>REC {recordingTime}s / 30s</span>
          </div>
        )}

        {isUploading && (
          <div className="uploading-overlay">
            <div className="spinner"></div>
            <p>Subiendo grabación...</p>
          </div>
        )}
      </div>

      <div className="recording-controls">
        {!permissionGranted && !isPreparing && (
          <button
            className="btn-start-recording"
            onClick={requestCameraPermission}
            disabled={!selectedCamera}
          >
            🎥 Iniciar Grabación
          </button>
        )}

        {permissionGranted && !isRecording && countdown === 0 && (
          <button
            className="btn-record"
            onClick={startRecording}
          >
            ⏺️ Empezar a Grabar (30s)
          </button>
        )}

        {isPreparing && (
          <div className="preparing-message">
            Preparando cámara...
          </div>
        )}

        {isRecording && (
          <button
            className="btn-stop-recording"
            onClick={stopRecording}
          >
            ⏹️ Detener Grabación
          </button>
        )}
      </div>

      <div className="recording-tips">
        <p><strong>Tips:</strong></p>
        <ul>
          <li>Asegúrate de tener buena iluminación</li>
          <li>Mantén la cámara estable</li>
          <li>La grabación dura 30 segundos automáticamente</li>
          <li>El video se subirá al terminar</li>
        </ul>
      </div>
    </div>
  );
};

export default RecordingChallenge;
