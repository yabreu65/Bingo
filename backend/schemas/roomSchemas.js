const { z } = require('zod');
const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'El ID debe ser un ObjectId válido');

/**
 * Schema para crear una sala
 */
const createRoomSchema = z.object({
  body: z.object({
    hostName: z.string()
      .min(1, 'El nombre del host es requerido')
      .max(50, 'El nombre del host no puede exceder 50 caracteres')
      .regex(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras, números y espacios'),

    config: z.object({
      timeBetweenNumbers: z.number()
        .int('El tiempo debe ser un número entero')
        .min(5, 'El tiempo mínimo entre números es 5 segundos')
        .max(120, 'El tiempo máximo entre números es 120 segundos')
        .optional()
        .default(30),

      challengeFrequency: z.number()
        .int('La frecuencia debe ser un número entero')
        .min(1, 'La frecuencia mínima de challenges es 1')
        .max(10, 'La frecuencia máxima de challenges es 10')
        .optional()
        .default(3),

      gameMode: z.enum(['line', 'fourCorners', 'centralCross', 'full']).optional(),

      tieBreakEnabled: z.boolean().optional().default(false),
      eventName: z.string().max(160).optional(),
      resultVisibility: z.enum(['public', 'organizer']).optional(),
      activePlaylist: objectIdSchema.nullable().optional(),
      managedContentEnabled: z.boolean().optional()
    }).optional()
  })
});

/**
 * Schema para unirse a una sala
 */
const joinRoomSchema = z.object({
  body: z.object({
    playerName: z.string()
      .min(1, 'El nombre del jugador es requerido')
      .max(50, 'El nombre del jugador no puede exceder 50 caracteres')
      .regex(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/, 'El nombre solo puede contener letras, números y espacios'),

    roomCode: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
  }),

  params: z.object({
    code: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
      .optional()
  }).optional()
});

/**
 * Schema para obtener información de una sala
 */
const getRoomSchema = z.object({
  params: z.object({
    code: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
  })
});

/**
 * Schema para seleccionar cartón
 */
const selectCardSchema = z.object({
  params: z.object({
    code: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
  }),

  body: z.object({
    playerId: objectIdSchema,

    cardNumber: z.number()
      .int('El número de cartón debe ser un entero')
      .min(1, 'El número de cartón mínimo es 1')
      .max(200, 'El número de cartón máximo es 200')
  })
});

/**
 * Schema para actualizar configuración de sala
 */
const updateConfigSchema = z.object({
  params: z.object({
    code: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
  }),

  body: z.object({
    config: z.object({
      timeBetweenNumbers: z.number()
        .int('El tiempo debe ser un número entero')
        .min(5, 'El tiempo mínimo entre números es 5 segundos')
        .max(120, 'El tiempo máximo entre números es 120 segundos')
        .optional(),

      challengeFrequency: z.number()
        .int('La frecuencia debe ser un número entero')
        .min(1, 'La frecuencia mínima de challenges es 1')
        .max(10, 'La frecuencia máxima de challenges es 10')
        .optional(),

      gameMode: z.enum(['line', 'fourCorners', 'centralCross', 'full']).optional(),

      tieBreakEnabled: z.boolean().optional(),
      eventName: z.string().max(160).optional(),
      resultVisibility: z.enum(['public', 'organizer']).optional(),
      activePlaylist: objectIdSchema.nullable().optional(),
      managedContentEnabled: z.boolean().optional()
    })
  })
});

/**
 * Schema para reconectar a una sala
 */
const reconnectSchema = z.object({
  params: z.object({
    code: z.string()
      .length(6, 'El código de sala debe tener exactamente 6 caracteres')
      .regex(/^[A-Z0-9]+$/, 'El código de sala solo puede contener mayúsculas y números')
  }),

  body: z.object({
    playerId: objectIdSchema
  })
});

module.exports = {
  createRoomSchema,
  joinRoomSchema,
  getRoomSchema,
  selectCardSchema,
  updateConfigSchema,
  reconnectSchema
};
