const { normalizeContent, parseImport, contentToChallenge } = require('../utils/adminCatalog');
const { initializeChallengePools } = require('../socket/utils/challengeSelector');

describe('admin catalog validation', () => {
  test('normalizes trivia without evaluating imported content', () => {
    const item = normalizeContent('trivia', { statement: '¿Cuánto es 2 + 2?', options: ['3', '4'], correctAnswer: 1, points: 30 });
    expect(item).toEqual(expect.objectContaining({ kind: 'trivia', correctAnswer: 1, points: 30 }));
  });
  test('rejects malformed trivia and riddles', () => {
    expect(() => normalizeContent('trivia', { statement: 'x', options: ['one'], correctAnswer: 0 })).toThrow();
    expect(() => normalizeContent('riddle', { statement: 'x', acceptedAnswers: [] })).toThrow();
  });
  test('parses bounded JSON and CSV imports', () => {
    expect(parseImport('json', [{ kind: 'dance', statement: 'Baila' }])).toHaveLength(1);
    expect(parseImport('csv', 'kind,statement\ndance,Baila')).toEqual([{ kind: 'dance', statement: 'Baila' }]);
    expect(() => parseImport('json', new Array(101).fill({ kind: 'dance', statement: 'Baila' }))).toThrow();
  });
  test('maps catalog snapshots to the legacy challenge contract', () => {
    expect(contentToChallenge({ kind: 'trivia', statement: 'Pregunta', options: ['a', 'b'], correctAnswer: 1 })).toEqual(expect.objectContaining({ question: 'Pregunta', options: ['a', 'b'], correct: 1 }));
  });
  test('keeps managed content in the game snapshot contract', () => {
    const pools = initializeChallengePools({ trivia: [{ question: 'Managed', options: ['A', 'B'], correct: 0 }] });
    expect(pools.trivia).toEqual([{ question: 'Managed', options: ['A', 'B'], correct: 0 }]);
  });
});
