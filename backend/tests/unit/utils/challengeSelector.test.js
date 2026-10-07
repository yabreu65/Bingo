const {
  getNextChallengeType,
  selectRandomChallenge,
  selectEligiblePlayers,
  selectRandomPlayer,
  shouldTriggerChallenge,
  createChallengeData
} = require('../../../socket/utils/challengeSelector');
const { GAME_CONSTANTS } = require('../../../constants');

describe('challengeSelector utils', () => {
  describe('getNextChallengeType', () => {
    it('should return TRIVIA when no last type', () => {
      const nextType = getNextChallengeType(null);
      expect(nextType).toBe(GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA);
    });

    it('should rotate challenge types', () => {
      const trivia = GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA;
      const dance = GAME_CONSTANTS.CHALLENGE_TYPES.DANCE;
      const sing = GAME_CONSTANTS.CHALLENGE_TYPES.SING;
      const group = GAME_CONSTANTS.CHALLENGE_TYPES.GROUP;

      // El orden depende de Object.keys(), que en objetos es: DANCE, SING, TRIVIA, GROUP
      // dance -> sing
      expect(getNextChallengeType(dance)).toBe(sing);
      // sing -> trivia
      expect(getNextChallengeType(sing)).toBe(trivia);
      // trivia -> group
      expect(getNextChallengeType(trivia)).toBe(group);
      // group -> dance (loops back)
      expect(getNextChallengeType(group)).toBe(dance);
    });
  });

  describe('selectRandomChallenge', () => {
    it('should select a challenge from the pool', () => {
      const challengeType = GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA;
      const challenge = selectRandomChallenge(challengeType);

      expect(challenge).toBeDefined();
      expect(challenge).toHaveProperty('text');
      expect(typeof challenge.text).toBe('string');
    });

    it('should return challenge with deezerId for dance type', () => {
      const challengeType = GAME_CONSTANTS.CHALLENGE_TYPES.DANCE;
      const challenge = selectRandomChallenge(challengeType);

      expect(challenge).toHaveProperty('text');
      expect(challenge).toHaveProperty('deezerId');
      expect(challenge.deezerId).not.toBeNull();
    });

    it('should return challenge with null deezerId for trivia', () => {
      const challengeType = GAME_CONSTANTS.CHALLENGE_TYPES.TRIVIA;
      const challenge = selectRandomChallenge(challengeType);

      expect(challenge.deezerId).toBeNull();
    });

    it('should return null for invalid challenge type', () => {
      const challenge = selectRandomChallenge('invalid-type');
      expect(challenge).toBeNull();
    });
  });

  describe('selectEligiblePlayers', () => {
    it('should filter players who are connected and have valid cards', () => {
      const players = [
        {
          _id: '1',
          name: 'Player 1',
          isConnected: true,
          cardNumber: 1
        },
        {
          _id: '2',
          name: 'Player 2',
          isConnected: false,
          cardNumber: 2
        },
        {
          _id: '3',
          name: 'Player 3',
          isConnected: true,
          cardNumber: undefined
        },
        {
          _id: '4',
          name: 'Player 4',
          isConnected: true,
          cardNumber: 4
        }
      ];

      const eligible = selectEligiblePlayers(players);

      expect(eligible).toHaveLength(2);
      expect(eligible[0]._id).toBe('1');
      expect(eligible[1]._id).toBe('4');
    });

    it('should prefer players who have not participated recently', () => {
      const players = [
        { _id: '1', isConnected: true, cardNumber: 1 },
        { _id: '2', isConnected: true, cardNumber: 2 },
        { _id: '3', isConnected: true, cardNumber: 3 }
      ];
      const recentPlayers = ['1'];

      const eligible = selectEligiblePlayers(players, recentPlayers);

      expect(eligible).toHaveLength(2);
      expect(eligible.some(p => p._id === '1')).toBe(false);
    });

    it('should return all eligible if all have participated recently', () => {
      const players = [
        { _id: '1', isConnected: true, cardNumber: 1 },
        { _id: '2', isConnected: true, cardNumber: 2 }
      ];
      const recentPlayers = ['1', '2'];

      const eligible = selectEligiblePlayers(players, recentPlayers);

      expect(eligible).toHaveLength(2);
    });

    it('should return empty array if no eligible players', () => {
      const players = [
        { _id: '1', isConnected: false, cardNumber: 1 },
        { _id: '2', isConnected: true, cardNumber: null }
      ];

      const eligible = selectEligiblePlayers(players);

      expect(eligible).toHaveLength(0);
    });
  });

  describe('selectRandomPlayer', () => {
    it('should select a player from eligible list', () => {
      const eligiblePlayers = [
        { _id: '1', name: 'Player 1' },
        { _id: '2', name: 'Player 2' },
        { _id: '3', name: 'Player 3' }
      ];

      const selected = selectRandomPlayer(eligiblePlayers);

      expect(selected).toBeDefined();
      expect(eligiblePlayers).toContain(selected);
    });

    it('should return null for empty array', () => {
      const selected = selectRandomPlayer([]);
      expect(selected).toBeNull();
    });

    it('should return null for null input', () => {
      const selected = selectRandomPlayer(null);
      expect(selected).toBeNull();
    });
  });

  describe('shouldTriggerChallenge', () => {
    it('should return true when frequency is reached', () => {
      expect(shouldTriggerChallenge(3, 3)).toBe(true);
    });

    it('should return false when frequency is not reached', () => {
      expect(shouldTriggerChallenge(2, 3)).toBe(false);
    });

    it('should use default frequency if not provided', () => {
      expect(shouldTriggerChallenge(3)).toBe(true);
    });
  });

  describe('createChallengeData', () => {
    it('should create correct challenge data structure', () => {
      const challengeType = 'dance';
      const selectedPlayer = {
        _id: 'player-123',
        name: 'Test Player'
      };
      const challenge = {
        text: 'Baila Thriller',
        deezerId: '555639'
      };

      const data = createChallengeData(challengeType, selectedPlayer, challenge);

      expect(data).toEqual({
        type: 'dance',
        player: {
          id: 'player-123',
          name: 'Test Player'
        },
        text: 'Baila Thriller',
        deezerId: '555639',
        duration: GAME_CONSTANTS.CHALLENGE_DURATION
      });
    });

    it('should handle trivia challenges with null deezerId', () => {
      const challengeType = 'trivia';
      const selectedPlayer = {
        _id: 'player-456',
        name: 'Quiz Master'
      };
      const challenge = {
        text: '¿Cuántas letras tiene BINGO?',
        deezerId: null
      };

      const data = createChallengeData(challengeType, selectedPlayer, challenge);

      expect(data.deezerId).toBeNull();
      expect(data.text).toBe('¿Cuántas letras tiene BINGO?');
    });
  });
});
