const { createRoomSchema, updateConfigSchema } = require('../schemas/roomSchemas');
const Room = require('../models/Room');
const Game = require('../models/Game');
const { normalizeNewRoomConfig } = require('../utils/roomConfiguration');

const validate = modes => updateConfigSchema.safeParse({
  params: { code: 'ABC123' },
  body: { config: { gameModes: modes } }
});

describe('Selección de modalidades de victoria', () => {
  test.each([
    [['full']], [['line']], [['fourCorners']], [['centralCross']],
    [['line', 'fourCorners']], [['line', 'centralCross']],
    [['fourCorners', 'centralCross']],
    [['line', 'fourCorners', 'centralCross']]
  ])('acepta combinación válida %j', modes => {
    expect(validate(modes).success).toBe(true);
  });

  test.each([
    [[]], [['full', 'line']], [['full', 'fourCorners']],
    [['full', 'centralCross']], [['line', 'line']], [['line', 'fourCorners', 'centralCross', 'full']]
  ])('rechaza combinación inválida %j', modes => {
    expect(validate(modes).success).toBe(false);
  });

  test('una sala nueva selecciona por defecto linea, cuatro esquinas y cruz central', () => {
    const config = normalizeNewRoomConfig();
    expect(config.gameModes).toEqual(['line', 'fourCorners', 'centralCross']);
    expect(config.gameMode).toBe('line');
    const room = new Room({ code: 'DEF123', name: 'Nueva', host: '507f1f77bcf86cd799439011', config });
    expect(room.config.gameModes).toEqual(['line', 'fourCorners', 'centralCross']);
    expect(room.config.gameMode).toBe('line');
    expect(room.config.gameModes).not.toContain('full');
    expect(validate(room.config.gameModes).success).toBe(true);
  });

  test('no reemplaza elecciones explicitas ni altera una sala antigua', () => {
    const oldConfig = { gameMode: 'full' };
    expect(normalizeNewRoomConfig(oldConfig).gameModes).toBeUndefined();
    expect(oldConfig).toEqual({ gameMode: 'full' });
    const configured = { gameMode: 'fourCorners', gameModes: ['fourCorners', 'centralCross'] };
    const normalized = normalizeNewRoomConfig(configured);
    expect(normalized.gameModes).toEqual(['fourCorners', 'centralCross']);
    expect(normalized.gameMode).toBe('fourCorners');
    expect(configured.gameModes).toEqual(['fourCorners', 'centralCross']);
  });

  test('salas antiguas siguen usando gameMode singular', () => {
    const room = new Room({ code: 'ABC123', name: 'Prueba', host: '507f1f77bcf86cd799439011', config: { gameMode: 'line' } });
    expect(room.config.gameMode).toBe('line');
    expect(room.config.gameModes).toEqual([]);
    const game = new Game({ room: room._id, gameMode: 'line', gameModes: ['line', 'centralCross'] });
    expect(game.gameModes).toEqual(['line', 'centralCross']);
  });

  test('la creación de sala acepta las mismas modalidades', () => {
    expect(createRoomSchema.safeParse({
      body: { hostName: 'Organizador', config: { gameModes: ['line', 'centralCross'] } }
    }).success).toBe(true);
  });
});
