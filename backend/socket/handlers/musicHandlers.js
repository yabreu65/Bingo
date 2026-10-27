const Room = require('../../models/Room');
const logger = require('../../config/logger');
const { isRoomHost, emitPermissionError } = require('../../middleware/socketAuthMiddleware');

async function isHost(socket, room, data) {
  return isRoomHost(socket, room, data?.hostCapability);
}

/**
 * Handler para reproducir música
 */
function handleMusicPlay(io, socket) {
  return async (data) => {
    try {
      const { roomCode, songId, currentTime } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      // Verificar que sea el host
      if (!(await isHost(socket, room, data))) {
        return emitPermissionError(socket);
      }

      room.musicState.isPlaying = true;
      room.musicState.currentSongId = songId;
      room.musicState.currentTime = currentTime || 0;
      room.musicState.lastUpdated = new Date();
      await room.save();

      io.to(roomCode).emit('music-sync', {
        isPlaying: true,
        currentSongId: songId,
        currentTime: currentTime || 0
      });

      logger.info(`[${roomCode}] Music play`, {
        songId,
        currentTime
      });
    } catch (error) {
      logger.error('Error in music-play:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para pausar música
 */
function handleMusicPause(io, socket) {
  return async (data) => {
    try {
      const { roomCode, currentTime } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      // Verificar que sea el host
      if (!(await isHost(socket, room, data))) {
        return emitPermissionError(socket);
      }

      room.musicState.isPlaying = false;
      room.musicState.currentTime = currentTime;
      room.musicState.lastUpdated = new Date();
      await room.save();

      io.to(roomCode).emit('music-sync', {
        isPlaying: false,
        currentSongId: room.musicState.currentSongId,
        currentTime
      });

      logger.info(`[${roomCode}] Music pause`, {
        currentTime
      });
    } catch (error) {
      logger.error('Error in music-pause:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cambiar de canción
 */
function handleMusicSongChange(io, socket) {
  return async (data) => {
    try {
      const { roomCode, songId } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      // Verificar que sea el host
      if (!(await isHost(socket, room, data))) {
        return emitPermissionError(socket);
      }

      room.musicState.currentSongId = songId;
      room.musicState.currentTime = 0;
      room.musicState.lastUpdated = new Date();
      await room.save();

      io.to(roomCode).emit('music-sync', {
        isPlaying: room.musicState.isPlaying,
        currentSongId: songId,
        currentTime: 0
      });

      logger.info(`[${roomCode}] Music song change`, {
        songId
      });
    } catch (error) {
      logger.error('Error in music-song-change:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Handler para cambiar el volumen
 */
function handleMusicVolumeChange(io, socket) {
  return async (data) => {
    try {
      const { roomCode, volume } = data;

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        return socket.emit('error', { message: 'Sala no encontrada' });
      }

      // Verificar que sea el host
      if (!(await isHost(socket, room, data))) {
        return emitPermissionError(socket);
      }

      room.musicState.volume = volume;
      room.musicState.lastUpdated = new Date();
      await room.save();

      io.to(roomCode).emit('music-volume-sync', { volume });

      logger.info(`[${roomCode}] Music volume change`, {
        volume
      });
    } catch (error) {
      logger.error('Error in music-volume-change:', error);
      socket.emit('error', { message: error.message });
    }
  };
}

/**
 * Registra todos los handlers de música
 * @param {SocketIO} io
 * @param {Socket} socket
 */
function registerMusicHandlers(io, socket) {
  socket.on('music-play', handleMusicPlay(io, socket));
  socket.on('music-pause', handleMusicPause(io, socket));
  socket.on('music-song-change', handleMusicSongChange(io, socket));
  socket.on('music-volume-change', handleMusicVolumeChange(io, socket));
}

module.exports = {
  registerMusicHandlers,
  // Exports individuales para testing
  handleMusicPlay,
  handleMusicPause,
  handleMusicSongChange,
  handleMusicVolumeChange
};
