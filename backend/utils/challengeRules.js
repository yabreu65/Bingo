const { GAME_CONSTANTS } = require('../constants');

const normalizeAnswer = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const evaluateRiddleAnswer = (answer, acceptedAnswers) => {
  if (!Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) return false;
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedAnswer) return false;
  return acceptedAnswers.some((accepted) => normalizeAnswer(accepted) === normalizedAnswer);
};

const getChallengePoints = (type, outcome = {}) => {
  if (outcome.cancelled || outcome.expired || !outcome.success) return 0;
  if (type === GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA) return GAME_CONSTANTS.POINTS.TRIVIA_CORRECT;
  if (type === GAME_CONSTANTS.CHALLENGE_TYPES.RIDDLE) return GAME_CONSTANTS.POINTS.RIDDLE_CORRECT;
  if (type === GAME_CONSTANTS.CHALLENGE_TYPES.KARAOKE) return GAME_CONSTANTS.POINTS.KARAOKE_COMPLETED;
  return GAME_CONSTANTS.POINTS.CHALLENGE_COMPLETED;
};

module.exports = { normalizeAnswer, evaluateRiddleAnswer, getChallengePoints };
