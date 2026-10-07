/**
 * Socket.IO Event Handlers Orchestrator
 *
 * Este archivo orquesta todos los handlers de socket.io importándolos
 * desde módulos especializados.
 */

const { registerRoomHandlers } = require('./handlers/roomHandlers');
const { registerPlayerHandlers } = require('./handlers/playerHandlers');
const { registerBingoHandlers } = require('./handlers/bingoHandlers');
const { registerChallengeHandlers } = require('./handlers/challengeHandlers');
const { registerMusicHandlers } = require('./handlers/musicHandlers');
const { registerGameHandlers } = require('./handlers/gameHandlers');
const { registerConnectionHandlers } = require('./handlers/connectionHandlers');
const votingHandlers = require('./handlers/votingHandlers');
const logger = require('../config/logger');

/**
 * Registra todos los event handlers para un socket
 * @param {SocketIO.Server} io - Instancia de Socket.IO
 * @param {SocketIO.Socket} socket - Socket del cliente
 */
module.exports = (io, socket) => {
  logger.logSocketEvent(socket.id, 'Socket connected', {
    isGuest: socket.isGuest,
    userId: socket.user?.userId,
    role: socket.user?.role
  });

  // Registrar handlers por categoría
  registerConnectionHandlers(io, socket); // Handlers de conexión (ping, verify, sync)
  registerRoomHandlers(io, socket);
  registerPlayerHandlers(io, socket);
  registerBingoHandlers(io, socket);
  registerChallengeHandlers(io, socket);
  registerMusicHandlers(io, socket);
  registerGameHandlers(io, socket);
  registerVotingHandlers(io, socket);

  logger.info(`All handlers registered for socket ${socket.id}`);
};

/**
 * Registrar handlers de votación
 */
function registerVotingHandlers(io, socket) {
  socket.on('startVoting', (data) => votingHandlers.startVoting(io, socket, data));
  socket.on('castVote', (data) => votingHandlers.castVote(io, socket, data));
  socket.on('endVoting', (data) => votingHandlers.endVoting(io, socket, data));
  socket.on('getSpecialRankings', (data) => votingHandlers.getSpecialRankings(io, socket, data));
  socket.on('getGameVotings', (data) => votingHandlers.getGameVotings(io, socket, data));
}
