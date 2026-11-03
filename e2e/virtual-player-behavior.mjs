import { createRequire } from 'node:module';

const requireBackend = createRequire(new URL('../backend/server.js', import.meta.url));
const { normalizeMarked, validateBingoClaim } = requireBackend('../backend/socket/utils/bingoValidator.js');
const BINGO_MODES = new Set(['line', 'fourCorners', 'centralCross', 'full']);

function sameIdentity(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function optionList(challenge) {
  const candidates = [challenge?.data?.options, challenge?.options, challenge?.challenge?.data?.options];
  return candidates.find(Array.isArray) || [];
}

function challengeType(challenge) {
  return String(challenge?.type || challenge?.challenge?.type || '').toLowerCase();
}

function challengeTarget(challenge) {
  return challenge?.playerId || challenge?.player?._id || challenge?.player?.id || challenge?.player;
}

function candidateId(candidate) {
  if (typeof candidate === 'string') return candidate;
  return candidate?.performerId || candidate?.playerId || candidate?._id || candidate?.id;
}

function validProbability(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a number between 0 and 1`);
  }
  return value;
}

export class VirtualPlayerBehavior {
  constructor({ triviaResponseProbability = 0.9, voteResponseProbability = 0.9 } = {}) {
    this.triviaResponseProbability = validProbability('triviaResponseProbability', triviaResponseProbability);
    this.voteResponseProbability = validProbability('voteResponseProbability', voteResponseProbability);
  }

  attach(bot) {
    if (!bot?.socket || !bot.playerId || !bot.roomCode || !Array.isArray(bot.bingoCardMatrix)) {
      throw new TypeError('A connected player identity, room, socket and card matrix are required');
    }
    const socket = bot.socket;
    const state = bot.virtualPlayerState ||= {
      calledNumbers: new Set(),
      markedCells: new Map(),
      pending: new Map(),
      claimedPatterns: new Set()
    };
    if (!(state.calledNumbers instanceof Set)) state.calledNumbers = new Set();
    if (!(state.markedCells instanceof Map)) {
      state.markedCells = new Map(normalizeMarked(state.markedCells).map(([row, col]) => [`${row},${col}`, [row, col]]));
    }
    if (!(state.pending instanceof Map)) state.pending = new Map();
    if (!(state.claimedPatterns instanceof Set)) state.claimedPatterns = new Set();

    const initialMarks = normalizeMarked(bot.bingoCardMarkedCells || bot.bingoCard?.markedCells || []);
    for (const [row, col] of initialMarks) state.markedCells.set(`${row},${col}`, [row, col]);
    if (bot.bingoCardMatrix[2]?.[2] === 'BINGO') state.markedCells.set('2,2', [2, 2]);

    const schedule = (key, action, delay = bot.reactionDelay?.() ?? 0) => {
      if (state.pending.has(key)) return;
      const timer = setTimeout(() => {
        state.pending.delete(key);
        if (!socket.connected) return;
        action();
      }, delay);
      state.pending.set(key, timer);
    };
    const clearPending = () => {
      for (const timer of state.pending.values()) clearTimeout(timer);
      state.pending.clear();
    };

    const maybeClaimBingo = () => {
      const bingoType = bot.gameMode;
      if (!BINGO_MODES.has(bingoType) || state.claimedPatterns.has(bingoType)) return;
      const validation = validateBingoClaim({
        matrix: bot.bingoCardMatrix,
        markedCells: [...state.markedCells.values()],
        calledNumbers: [...state.calledNumbers],
        bingoType
      });
      if (!validation.isValid) return;
      const key = `claim:${bingoType}`;
      schedule(key, () => {
        const finalCheck = validateBingoClaim({
          matrix: bot.bingoCardMatrix,
          markedCells: [...state.markedCells.values()],
          calledNumbers: [...state.calledNumbers],
          bingoType
        });
        if (!finalCheck.isValid || state.claimedPatterns.has(bingoType)) return;
        state.claimedPatterns.add(bingoType);
        socket.emit('claim-bingo', { roomCode: bot.roomCode, playerId: bot.playerId, bingoType });
      });
    };

    const onNumberCalled = payload => {
      const number = payload?.number;
      if (!Number.isInteger(number) || !Array.isArray(payload?.calledNumbers) || !payload.calledNumbers.includes(number)) return;
      state.calledNumbers = new Set(payload.calledNumbers);
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (bot.bingoCardMatrix[col]?.[row] !== number) continue;
          const cellKey = `${row},${col}`;
          if (state.markedCells.has(cellKey)) continue;
          schedule(`mark:${cellKey}`, () => {
            if (!state.calledNumbers.has(number) || state.markedCells.has(cellKey)) return;
            socket.emit('mark-cell', { roomCode: bot.roomCode, playerId: bot.playerId, row, col });
          });
        }
      }
      maybeClaimBingo();
    };

    const onCellMarked = payload => {
      if (!sameIdentity(payload?.playerId, bot.playerId) || !Number.isInteger(payload?.row) || !Number.isInteger(payload?.col) ||
          payload.row < 0 || payload.row > 4 || payload.col < 0 || payload.col > 4) return;
      state.markedCells.set(`${payload.row},${payload.col}`, [payload.row, payload.col]);
      maybeClaimBingo();
    };

    const onTrivia = challenge => {
      if (challengeType(challenge) !== 'trivia') return;
      const target = challengeTarget(challenge);
      if (target && !sameIdentity(target, bot.playerId)) return;
      const options = optionList(challenge);
      if (options.length === 0 || this.triviaResponseProbability === 0) return;
      if (this.triviaResponseProbability < 1 && bot.random() >= this.triviaResponseProbability) return;
      const answer = Math.floor(bot.random() * options.length);
      const challengeId = challenge?.challengeId || challenge?.challenge?._id || challenge?.id || 'active';
      schedule(`trivia:${challengeId}`, () => {
        socket.emit('trivia-answered', { roomCode: bot.roomCode, playerId: bot.playerId, answer });
      });
    };

    const onVotingStarted = payload => {
      if (!payload?.voteId || sameIdentity(payload.performerId, bot.playerId) || this.voteResponseProbability === 0) return;
      if (this.voteResponseProbability < 1 && bot.random() >= this.voteResponseProbability) return;
      const voteId = payload.voteId;
      const stars = 1 + Math.floor(bot.random() * 5);
      schedule(`vote:${voteId}`, () => socket.emit('castVote', {
        voteId,
        voterId: bot.playerId,
        stars
      }));
    };

    const onTieBreakStarted = payload => {
      if (!Array.isArray(payload?.candidates) || payload.candidates.length === 0 || this.voteResponseProbability === 0) return;
      if (this.voteResponseProbability < 1 && bot.random() >= this.voteResponseProbability) return;
      const candidates = payload.candidates.map(candidateId).filter(id => id && !sameIdentity(id, bot.playerId));
      if (candidates.length === 0) return;
      const performerId = candidates[Math.floor(bot.random() * candidates.length)];
      const stars = 1 + Math.floor(bot.random() * 5);
      schedule(`tie-vote:${performerId}`, () => socket.emit('cast-tiebreak-vote', {
        roomCode: bot.roomCode,
        voterId: bot.playerId,
        performerId,
        stars
      }));
    };

    const onGameStateUpdate = payload => {
      if (!sameIdentity(payload?.roomCode, bot.roomCode) || !sameIdentity(payload?.playerData?.playerId, bot.playerId)) return;
      state.calledNumbers = new Set(Array.isArray(payload.calledNumbers) ? payload.calledNumbers : []);
      state.markedCells = new Map(normalizeMarked(payload.playerData.markedCells).map(([row, col]) => [`${row},${col}`, [row, col]]));
      if (bot.bingoCardMatrix[2]?.[2] === 'BINGO') state.markedCells.set('2,2', [2, 2]);
      state.claimedPatterns.clear();
    };

    socket.on('number-called', onNumberCalled);
    socket.on('cell-marked', onCellMarked);
    socket.on('challenge-triggered', onTrivia);
    socket.on('votingStarted', onVotingStarted);
    socket.on('tiebreak-voting-started', onTieBreakStarted);
    socket.on('game-state-update', onGameStateUpdate);
    socket.on('disconnect', clearPending);

    return () => {
      clearPending();
      socket.off('number-called', onNumberCalled);
      socket.off('cell-marked', onCellMarked);
      socket.off('challenge-triggered', onTrivia);
      socket.off('votingStarted', onVotingStarted);
      socket.off('tiebreak-voting-started', onTieBreakStarted);
      socket.off('game-state-update', onGameStateUpdate);
      socket.off('disconnect', clearPending);
    };
  }
}
