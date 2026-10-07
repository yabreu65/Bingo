const {
  selectRandomNumber,
  updateGameAfterNumberCall,
  hasAvailableNumbers,
  createNumberCalledData,
  shouldTriggerChallenge,
  generateInitialNumbers,
  isValidNumber,
  getGameStats,
  isGameFinished
} = require('../../../socket/utils/numberCaller');

describe('numberCaller utils', () => {
  describe('selectRandomNumber', () => {
    it('should select a random number from available numbers', () => {
      const availableNumbers = [1, 2, 3, 4, 5];
      const result = selectRandomNumber(availableNumbers);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('number');
      expect(result).toHaveProperty('index');
      expect(availableNumbers).toContain(result.number);
      expect(result.index).toBeGreaterThanOrEqual(0);
      expect(result.index).toBeLessThan(availableNumbers.length);
    });

    it('should return null if no numbers available', () => {
      const result = selectRandomNumber([]);
      expect(result).toBeNull();
    });

    it('should return null if availableNumbers is null', () => {
      const result = selectRandomNumber(null);
      expect(result).toBeNull();
    });
  });

  describe('updateGameAfterNumberCall', () => {
    it('should update game state correctly after number call', () => {
      const game = {
        availableNumbers: [1, 2, 3, 4, 5],
        calledNumbers: [],
        currentNumber: null,
        numbersSinceChallenge: 0
      };

      const updatedGame = updateGameAfterNumberCall(game, 3, 2);

      expect(updatedGame.calledNumbers).toContain(3);
      expect(updatedGame.currentNumber).toBe(3);
      expect(updatedGame.availableNumbers).not.toContain(3);
      expect(updatedGame.availableNumbers).toHaveLength(4);
      expect(updatedGame.numbersSinceChallenge).toBe(1);
    });

    it('should increment numbersSinceChallenge counter', () => {
      const game = {
        availableNumbers: [1, 2, 3],
        calledNumbers: [4, 5],
        currentNumber: 5,
        numbersSinceChallenge: 2
      };

      const updatedGame = updateGameAfterNumberCall(game, 2, 1);

      expect(updatedGame.numbersSinceChallenge).toBe(3);
    });
  });

  describe('hasAvailableNumbers', () => {
    it('should return true when there are available numbers', () => {
      const game = {
        availableNumbers: [1, 2, 3]
      };

      expect(hasAvailableNumbers(game)).toBe(true);
    });

    it('should return false when availableNumbers is empty', () => {
      const game = {
        availableNumbers: []
      };

      expect(hasAvailableNumbers(game)).toBe(false);
    });

    it('should return false when game is null', () => {
      expect(hasAvailableNumbers(null)).toBe(false);
    });

    it('should return false when availableNumbers is not an array', () => {
      const game = {
        availableNumbers: null
      };

      expect(hasAvailableNumbers(game)).toBe(false);
    });
  });

  describe('createNumberCalledData', () => {
    it('should create correct data structure', () => {
      const number = 42;
      const calledNumbers = [1, 15, 30, 42];

      const data = createNumberCalledData(number, calledNumbers);

      expect(data).toEqual({
        number: 42,
        calledNumbers: [1, 15, 30, 42]
      });
    });
  });

  describe('shouldTriggerChallenge', () => {
    it('should return true when frequency is reached', () => {
      expect(shouldTriggerChallenge(3, 3)).toBe(true);
    });

    it('should return true when frequency is exceeded', () => {
      expect(shouldTriggerChallenge(5, 3)).toBe(true);
    });

    it('should return false when frequency is not reached', () => {
      expect(shouldTriggerChallenge(2, 3)).toBe(false);
    });

    it('should use default frequency if not provided', () => {
      expect(shouldTriggerChallenge(3, undefined)).toBe(true);
    });
  });

  describe('generateInitialNumbers', () => {
    it('should generate array from 1 to 75', () => {
      const numbers = generateInitialNumbers();

      expect(numbers).toHaveLength(75);
      expect(numbers[0]).toBe(1);
      expect(numbers[74]).toBe(75);
    });

    it('should generate sequential numbers', () => {
      const numbers = generateInitialNumbers();

      for (let i = 0; i < numbers.length; i++) {
        expect(numbers[i]).toBe(i + 1);
      }
    });
  });

  describe('isValidNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isValidNumber(1)).toBe(true);
      expect(isValidNumber(42)).toBe(true);
      expect(isValidNumber(75)).toBe(true);
    });

    it('should return false for numbers out of range', () => {
      expect(isValidNumber(0)).toBe(false);
      expect(isValidNumber(76)).toBe(false);
      expect(isValidNumber(-1)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isValidNumber('42')).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
    });
  });

  describe('getGameStats', () => {
    it('should return correct game statistics', () => {
      const game = {
        calledNumbers: [1, 15, 30],
        availableNumbers: Array.from({ length: 72 }, (_, i) => i + 4),
        currentNumber: 30,
        numbersSinceChallenge: 2
      };

      const stats = getGameStats(game);

      expect(stats).toEqual({
        totalNumbers: 75,
        calledCount: 3,
        remainingCount: 72,
        currentNumber: 30,
        numbersSinceChallenge: 2
      });
    });

    it('should handle game with no called numbers', () => {
      const game = {
        calledNumbers: [],
        availableNumbers: Array.from({ length: 75 }, (_, i) => i + 1),
        currentNumber: null,
        numbersSinceChallenge: 0
      };

      const stats = getGameStats(game);

      expect(stats.calledCount).toBe(0);
      expect(stats.remainingCount).toBe(75);
    });
  });

  describe('isGameFinished', () => {
    it('should return true when no numbers available', () => {
      const game = {
        availableNumbers: []
      };

      expect(isGameFinished(game)).toBe(true);
    });

    it('should return false when numbers are available', () => {
      const game = {
        availableNumbers: [1, 2, 3]
      };

      expect(isGameFinished(game)).toBe(false);
    });
  });
});
