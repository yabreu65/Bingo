const MAX_IMPORT_ITEMS = 100;
const MAX_TEXT = 1000;
const CONTENT_KINDS = new Set(['trivia', 'riddle', 'dance', 'sing', 'group', 'karaoke', 'track']);

const text = (value, max = MAX_TEXT) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

function normalizeContent(kind, input = {}) {
  if (!CONTENT_KINDS.has(kind)) throw new Error('Tipo de contenido no permitido');
  const statement = text(input.statement || input.prompt || input.instructions || input.text || input.title);
  if (!statement) throw new Error('El contenido requiere texto');
  const result = {
    kind,
    title: text(input.title, 200), statement,
    explanation: text(input.explanation), category: text(input.category, 80),
    difficulty: ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : 'medium',
    points: Number.isInteger(input.points) && input.points >= 0 && input.points <= 1000 ? input.points : 50,
    timeLimit: Number.isInteger(input.timeLimit) && input.timeLimit >= 5 && input.timeLimit <= 600 ? input.timeLimit : 30,
    minParticipants: Number.isInteger(input.minParticipants) && input.minParticipants >= 1 && input.minParticipants <= 200 ? input.minParticipants : 1,
    maxParticipants: Number.isInteger(input.maxParticipants) && input.maxParticipants >= 1 && input.maxParticipants <= 200 ? input.maxParticipants : 200,
    evaluationMethod: ['automatic', 'host', 'vote'].includes(input.evaluationMethod) ? input.evaluationMethod : 'host',
    artist: text(input.artist, 160), genre: text(input.genre, 80), resourceId: text(input.resourceId, 200),
    sourceType: ['deezer', 'local', 'synthetic', 'external'].includes(input.sourceType) ? input.sourceType : 'synthetic',
    enabled: input.enabled !== false
  };
  if (kind === 'trivia') {
    if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 8) throw new Error('Trivia debe tener entre 2 y 8 opciones');
    const options = input.options.map(option => text(option, 200));
    if (options.some(option => !option)) throw new Error('Las opciones de trivia no son válidas');
    const correctAnswer = Number(input.correctAnswer ?? input.correct);
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) throw new Error('La respuesta correcta de trivia no es válida');
    result.options = options; result.correctAnswer = correctAnswer;
  }
  if (kind === 'riddle') {
    const answers = Array.isArray(input.acceptedAnswers) ? input.acceptedAnswers : [];
    result.acceptedAnswers = answers.map(answer => text(answer, 200)).filter(Boolean).slice(0, 20);
    if (result.acceptedAnswers.length === 0) throw new Error('La adivinanza requiere al menos una respuesta aceptada');
  }
  if (result.minParticipants > result.maxParticipants) throw new Error('El mínimo de participantes supera al máximo');
  return result;
}

function parseCsv(csv) {
  if (typeof csv !== 'string' || csv.length > 100000) throw new Error('CSV inválido o demasiado grande');
  const rows = csv.split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const parseLine = line => line.split(',').map(value => value.trim().replace(/^"|"$/g, ''));
  const headers = parseLine(rows[0]);
  if (!headers.includes('kind') || !headers.includes('statement')) throw new Error('CSV requiere las columnas kind y statement');
  return rows.slice(1, MAX_IMPORT_ITEMS + 1).map(row => headers.reduce((item, header, index) => ({ ...item, [header]: parseLine(row)[index] }), {}));
}

function parseImport(format, payload) {
  const items = format === 'csv' ? parseCsv(payload) : payload;
  if (!Array.isArray(items) || items.length > MAX_IMPORT_ITEMS) throw new Error(`La importación admite hasta ${MAX_IMPORT_ITEMS} filas`);
  return items;
}

function contentToChallenge(content) {
  const base = content.toObject ? content.toObject() : content;
  const points = Number.isInteger(base.points) ? base.points : undefined;
  const duration = Number.isInteger(base.timeLimit) ? base.timeLimit : undefined;
  if (base.kind === 'trivia') return { question: base.statement, options: base.options, correct: base.correctAnswer, points, duration };
  if (base.kind === 'riddle') return { prompt: base.statement, answers: base.acceptedAnswers, id: base._id?.toString(), points, duration };
  if (base.kind === 'karaoke') return { text: base.statement, title: base.title || base.statement, artist: base.artist, localFile: base.resourceId, karaokeId: base._id?.toString(), points, duration };
  return { text: base.statement, deezerId: base.resourceId, points, duration };
}

module.exports = { CONTENT_KINDS, MAX_IMPORT_ITEMS, normalizeContent, parseImport, contentToChallenge };
