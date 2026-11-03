const {
  normalizeAnswer,
  evaluateRiddleAnswer,
  getChallengePoints
} = require('../../../utils/challengeRules');

describe('challenge rules', () => {
  test('normalizes accents, case, punctuation and repeated spaces', () => {
    expect(normalizeAnswer('  ¡Árbol!!!  ')).toBe('arbol');
    expect(normalizeAnswer('María   José')).toBe('maria jose');
  });

  test('accepts only an exact normalized riddle answer', () => {
    const accepted = ['árbol', 'el árbol'];

    expect(evaluateRiddleAnswer(' EL ARBOL ', accepted)).toBe(true);
    expect(evaluateRiddleAnswer('árboles', accepted)).toBe(false);
    expect(evaluateRiddleAnswer('la respuesta es árbol', accepted)).toBe(false);
  });

  test('acepta respuestas naturales de adivinanzas con o sin articulo, sin aceptar frases diferentes', () => {
    expect(evaluateRiddleAnswer('el reloj', ['reloj'])).toBe(true);
    expect(evaluateRiddleAnswer('un reloj', ['reloj'])).toBe(true);
    expect(evaluateRiddleAnswer('nube', ['una nube'])).toBe(true);
    expect(evaluateRiddleAnswer('una escalera', ['la escalera'])).toBe(true);
    expect(evaluateRiddleAnswer('una nube negra', ['una nube'])).toBe(false);
    expect(evaluateRiddleAnswer('no es un reloj', ['reloj'])).toBe(false);
  });

  test('returns deterministic points by challenge outcome', () => {
    expect(getChallengePoints('riddle', { success: true })).toBe(30);
    expect(getChallengePoints('karaoke', { success: true })).toBe(75);
    expect(getChallengePoints('dance', { success: false })).toBe(0);
  });
});
