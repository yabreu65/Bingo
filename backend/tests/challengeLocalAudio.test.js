const { CHALLENGE_POOLS } = require('../constants');
const {
  createChallengeData, selectRandomChallenge, getNextChallengeType
} = require('../socket/utils/challengeSelector');
const { createRoomSchema, updateConfigSchema } = require('../schemas/roomSchemas');
const { contentToChallenge } = require('../utils/adminCatalog');

describe('MP3 local para retos de baile y grupales', () => {
  test('10 canciones y 4 retos grupales tienen MP3 de nombre seguro', () => {
    const dance = CHALLENGE_POOLS.dance;
    const group = CHALLENGE_POOLS.group;
    expect(dance).toHaveLength(10);
    expect(group).toHaveLength(4);
    const targets = new Set(dance.map(item => item.audioFile));
    expect(targets.size).toBe(10);
    for (const entry of [...dance, ...group]) {
      expect(entry.audioFile).toMatch(/^[a-z0-9-]+\.mp3$/);
      expect(targets.has(entry.audioFile)).toBe(true);
    }
  });

  test('el evento de baile y el grupal incluyen su MP3 y el karaoke sigue independiente', () => {
    for (const type of ['dance', 'group']) {
      const { challenge } = selectRandomChallenge(type, { [type]: [...CHALLENGE_POOLS[type]] });
      const output = createChallengeData(type, { _id: 'player1', name: 'Persona' }, challenge);
      expect(output.audioFile).toBe(challenge.audioFile);
    }
    const { challenge } = selectRandomChallenge('karaoke', { karaoke: [...CHALLENGE_POOLS.karaoke] });
    const output = createChallengeData('karaoke', { _id: 'player1', name: 'Persona' }, challenge);
    expect(output.audioFile).toBeUndefined();
    expect(output.localFile).toBeDefined();
  });

  test('canto nunca se selecciona aunque la sala antigua lo mantenga habilitado', () => {
    expect(getNextChallengeType('dance', ['dance', 'sing', 'group', 'karaoke'])).toBe('group');
    expect(getNextChallengeType(null, ['sing', 'dance'])).toBe('dance');
    expect(getNextChallengeType(null, ['sing'])).toBeNull();
  });

  test('el catálogo administrado solo admite MP3 locales con nombre seguro', () => {
    const challenge = contentToChallenge({
      kind: 'dance', statement: 'Baile nuevo', sourceType: 'local',
      resourceId: 'baile-robot.mp3', timeLimit: 30
    });
    expect(challenge.audioFile).toBe('baile-robot.mp3');
    const unsafe = contentToChallenge({
      kind: 'group', statement: 'Baile nuevo', sourceType: 'local',
      resourceId: '../secret.mp3', timeLimit: 30
    });
    expect(unsafe.audioFile).toBeUndefined();
  });

  test('campos del organizador aceptan números limitados y rechazan rangos inseguros', () => {
    const patch = updateConfigSchema.safeParse({
      params: { code: 'ABC123' }, body: {
        config: { challengeMusicStartSeconds: 30, danceDurationSeconds: 40, groupDurationSeconds: 55 }
      }
    });
    expect(patch.success).toBe(true);
    const invalid = updateConfigSchema.safeParse({
      params: { code: 'ABC123' }, body: {
        config: { challengeMusicStartSeconds: -1, danceDurationSeconds: 500 }
      }
    });
    expect(invalid.success).toBe(false);
    const create = createRoomSchema.safeParse({
      body: { hostName: 'Organizador', config: {
        challengeMusicStartSeconds: 20, danceDurationSeconds: 30, groupDurationSeconds: 45
      }}
    });
    expect(create.success).toBe(true);
  });
});
