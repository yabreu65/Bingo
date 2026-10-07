const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware de autenticación para Socket.io
 * Verifica el JWT token enviado en el handshake
 * Permite conexiones sin autenticación (invitados) pero marca como tales
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    // Si no hay token, permitir conexión como invitado
    if (!token) {
      socket.user = null;
      socket.isGuest = true;
      return next();
    }

    try {
      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verificar que no sea un refresh token
      if (decoded.type === 'refresh') {
        socket.user = null;
        socket.isGuest = true;
        return next();
      }

      // Buscar usuario
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        socket.user = null;
        socket.isGuest = true;
        return next();
      }

      // Adjuntar información del usuario al socket
      socket.user = {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      };
      socket.isGuest = false;

      next();
    } catch (jwtError) {
      // En caso de error de JWT, permitir como invitado
      socket.user = null;
      socket.isGuest = true;
      next();
    }
  } catch (error) {
    console.error('Error en autenticación de socket:', error);
    socket.user = null;
    socket.isGuest = true;
    next();
  }
};

/**
 * Verifica si el socket pertenece a un host
 * Para usar dentro de los event handlers
 */
const isHost = (socket) => {
  return socket.user && (socket.user.role === 'host' || socket.user.role === 'admin');
};

/**
 * Verifica si el socket tiene permisos de host para una sala específica
 * @param {Object} socket - Socket instance
 * @param {Object} room - Room document from database
 * @returns {Boolean} - True si el usuario es host de la sala o admin
 */
const isRoomHost = async (socket, room) => {
  // Admins pueden hacer todo
  if (socket.user && socket.user.role === 'admin') {
    return true;
  }

  // Verificar si el usuario es el creador de la sala
  if (socket.user && room.host) {
    // Si room.host es una referencia poblada
    if (room.host._id) {
      return room.host._id.toString() === socket.user.userId.toString();
    }
    // Si room.host es solo el ObjectId
    return room.host.toString() === socket.user.userId.toString();
  }

  // Por retrocompatibilidad, verificar si es el jugador marcado como host
  if (room.players && room.players.length > 0) {
    const Player = require('../models/Player');
    const hostPlayer = await Player.findOne({
      room: room._id,
      isHost: true,
      user: socket.user?.userId
    });
    return !!hostPlayer;
  }

  return false;
};

/**
 * Middleware para eventos que requieren permisos de host
 * Devuelve una función que envuelve el handler original
 */
const requireHostForEvent = (handler) => {
  return async (data, callback) => {
    const socket = this; // El contexto 'this' es el socket

    if (!isHost(socket)) {
      const error = {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Solo los hosts pueden realizar esta acción'
        }
      };

      if (typeof callback === 'function') {
        callback(error);
      } else {
        socket.emit('error', error);
      }
      return;
    }

    // Si es host, ejecutar el handler original
    return handler.call(socket, data, callback);
  };
};

/**
 * Helper para emitir error de permisos
 */
const emitPermissionError = (socket, callback) => {
  const error = {
    success: false,
    error: {
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'No tienes permisos para realizar esta acción'
    }
  };

  if (typeof callback === 'function') {
    callback(error);
  } else {
    socket.emit('error', error);
  }
};

module.exports = {
  socketAuthMiddleware,
  isHost,
  isRoomHost,
  requireHostForEvent,
  emitPermissionError
};
