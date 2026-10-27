const stripTriviaAnswers = (value) => {
  if (Array.isArray(value)) return value.map(stripTriviaAnswers);
  if (!value || typeof value !== 'object') return value;

  const plainValue = typeof value.toJSON === 'function' ? value.toJSON() : value;
  if (plainValue !== value) return stripTriviaAnswers(plainValue);

  const safeValue = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    safeValue[key] = stripTriviaAnswers(nestedValue);
  }

  const redactChallengeAnswer = (challenge) => {
    if ((challenge?.type === 'trivia' || challenge?.type === 'riddle') &&
        challenge.data && typeof challenge.data === 'object') {
      delete challenge.data.correct;
      delete challenge.data.answers;
    }
  };
  redactChallengeAnswer(safeValue);
  redactChallengeAnswer(safeValue.activeChallenge);
  return safeValue;
};

const stripGuestCapabilityHashes = (value) => {
  if (Array.isArray(value)) return value.map(stripGuestCapabilityHashes);
  if (!value || typeof value !== 'object') return value;

  if (typeof value.toJSON === 'function') {
    return stripGuestCapabilityHashes(value.toJSON());
  }

  const safeValue = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'guestCapabilityHash' || key === 'hostCapabilityHash' || key === 'tvCapabilityHash') continue;
    safeValue[key] = stripGuestCapabilityHashes(nestedValue);
  }
  return safeValue;
};

// Room-level responses are public to every participant. A player's card and
// marks are private state and are returned only through the player's own
// authenticated/capability-bound response.
const stripPrivatePlayerData = (value) => {
  if (Array.isArray(value)) return value.map(stripPrivatePlayerData);
  if (!value || typeof value !== 'object') return value;

  if (typeof value.toJSON === 'function') {
    return stripPrivatePlayerData(value.toJSON());
  }

  const safeValue = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'bingoCard' || key === 'socketId') continue;
    safeValue[key] = stripPrivatePlayerData(nestedValue);
  }
  return safeValue;
};

module.exports = { stripGuestCapabilityHashes, stripTriviaAnswers, stripPrivatePlayerData };
