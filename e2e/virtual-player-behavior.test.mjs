import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { VirtualPlayerBehavior } from './virtual-player-behavior.mjs';

const roomCode = 'ABC123';
const playerId = 'bot-player-01';
const matrix = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 'BINGO', 14, 15],
  [16, 17, 18, 19, 20],
  [21, 22, 23, 24, 25]
];

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.connected = true;
    this.outgoing = [];
  }

  emit(event, payload) {
    this.outgoing.push({ event, payload });
    return true;
  }

  serverEmit(event, payload) {
    return super.emit(event, payload);
  }
}

function makeBot(overrides = {}) {
  return {
    alias: 'bot-01',
    roomCode,
    playerId,
    playerCapability: 'DO_NOT_EMIT_CAPABILITY',
    cardNumber: 1,
    gameMode: 'line',
    bingoCardMatrix: matrix,
    connected: true,
    socket: new FakeSocket(),
    random: () => 0.25,
    reactionDelay: () => 0,
    ...overrides
  };
}

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 5));
}

function emitted(socket, event) {
  return socket.outgoing.filter(item => item.event === event).map(item => item.payload);
}

test('marks only a called number found on its own card using public row/column coordinates', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior().attach(bot);

  bot.socket.serverEmit('number-called', { number: 12, calledNumbers: [4, 12] });
  await flush();

  assert.deepEqual(emitted(bot.socket, 'mark-cell'), [{ roomCode, playerId, row: 1, col: 2 }]);
});

test('ignores uncalled numbers and called numbers absent from its card', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior().attach(bot);

  bot.socket.serverEmit('number-called', { number: 12, calledNumbers: [11] });
  bot.socket.serverEmit('number-called', { number: 75, calledNumbers: [75] });
  await flush();

  assert.deepEqual(emitted(bot.socket, 'mark-cell'), []);
});

test('answers trivia using a visible option only and never forwards answer keys', async () => {
  const bot = makeBot({ random: () => 0.5 });
  new VirtualPlayerBehavior({ triviaResponseProbability: 1 }).attach(bot);

  bot.socket.serverEmit('challenge-triggered', {
    challengeId: 'fixture-trivia',
    playerId,
    type: 'trivia',
    data: { question: 'Synthetic question?', options: ['Visible A', 'Visible B', 'Visible C'] },
    correctAnswer: 'SECRET_SENTINEL'
  });
  await flush();

  const [answer] = emitted(bot.socket, 'trivia-answered');
  assert.deepEqual(answer, { roomCode, playerId, answer: 1 });
  assert.equal(JSON.stringify(bot.socket.outgoing).includes('SECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(bot.socket.outgoing).includes('DO_NOT_EMIT_CAPABILITY'), false);
});

test('allows seeded trivia expiry without emitting an answer', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior({ triviaResponseProbability: 0 }).attach(bot);

  bot.socket.serverEmit('challenge-triggered', {
    challengeId: 'fixture-expired', playerId, type: 'trivia',
    data: { question: 'Expire?', options: ['A', 'B'] }
  });
  await flush();

  assert.deepEqual(emitted(bot.socket, 'trivia-answered'), []);
});

test('casts ordinary votes within the server range and never votes for itself as performer', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior({ voteResponseProbability: 1 }).attach(bot);

  bot.socket.serverEmit('votingStarted', { voteId: 'vote-1', performerId: 'human-performer' });
  bot.socket.serverEmit('votingStarted', { voteId: 'vote-self', performerId: playerId });
  await flush();

  const [vote] = emitted(bot.socket, 'castVote');
  assert.equal(vote.voteId, 'vote-1');
  assert.equal(vote.voterId, playerId);
  assert.ok(Number.isInteger(vote.stars) && vote.stars >= 1 && vote.stars <= 5);
  assert.equal(emitted(bot.socket, 'castVote').length, 1);
});

test('votes for a listed tie-break candidate without claiming a performance', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior({ voteResponseProbability: 1 }).attach(bot);

  bot.socket.serverEmit('tiebreak-voting-started', {
    candidates: [{ playerId: 'candidate-a' }, { playerId: 'candidate-b' }]
  });
  await flush();

  const [vote] = emitted(bot.socket, 'cast-tiebreak-vote');
  assert.equal(vote.roomCode, roomCode);
  assert.equal(vote.voterId, playerId);
  assert.ok(['candidate-a', 'candidate-b'].includes(vote.performerId));
  assert.ok(Number.isInteger(vote.stars) && vote.stars >= 1 && vote.stars <= 5);
});

test('ignores physical challenges rather than faking a completion', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior().attach(bot);

  bot.socket.serverEmit('challenge-triggered', {
    challengeId: 'physical-dance', playerId, type: 'dance', data: { prompt: 'Dance now' }
  });
  bot.socket.serverEmit('challenge-triggered', {
    challengeId: 'physical-karaoke', playerId, type: 'karaoke', data: { prompt: 'Sing now' }
  });
  await flush();

  assert.deepEqual(emitted(bot.socket, 'challenge-complete'), []);
  assert.deepEqual(emitted(bot.socket, 'challenge-answer'), []);
});

test('claims Bingo only after a called-and-marked configured pattern is complete', async () => {
  const bot = makeBot({ gameMode: 'line' });
  new VirtualPlayerBehavior().attach(bot);
  const calledNumbers = [1, 6, 11, 16, 21];

  for (let col = 0; col < 5; col += 1) {
    const number = matrix[col][0];
    bot.socket.serverEmit('number-called', { number, calledNumbers: calledNumbers.slice(0, col + 1) });
    bot.socket.serverEmit('cell-marked', { playerId, row: 0, col });
  }
  await flush();

  assert.deepEqual(emitted(bot.socket, 'claim-bingo'), [{ roomCode, playerId, bingoType: 'line' }]);
});

test('does not claim an incomplete Bingo pattern', async () => {
  const bot = makeBot({ gameMode: 'fourCorners' });
  new VirtualPlayerBehavior().attach(bot);
  const positions = [[0, 0], [0, 4], [4, 0]];
  const calledNumbers = [];

  for (const [row, col] of positions) {
    const number = matrix[col][row];
    calledNumbers.push(number);
    bot.socket.serverEmit('number-called', { number, calledNumbers: [...calledNumbers] });
    bot.socket.serverEmit('cell-marked', { playerId, row, col });
  }
  await flush();

  assert.deepEqual(emitted(bot.socket, 'claim-bingo'), []);
});

test('restores called numbers and marks from the public reconnect sync event', async () => {
  const bot = makeBot();
  new VirtualPlayerBehavior().attach(bot);

  bot.socket.serverEmit('game-state-update', {
    roomCode,
    calledNumbers: [12],
    playerData: { playerId, markedCells: [[1, 2]], bingoCard: { matrix } }
  });
  bot.socket.serverEmit('number-called', { number: 12, calledNumbers: [12] });
  await flush();

  assert.deepEqual(emitted(bot.socket, 'mark-cell'), []);
});
