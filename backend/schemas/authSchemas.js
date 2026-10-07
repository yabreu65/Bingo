const { z } = require('zod');

/**
 * Schema para registro de usuarios
 */
const registerSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Ingresa un email válido')
      .min(5, 'El email es demasiado corto')
      .max(100, 'El email es demasiado largo')
      .toLowerCase(),

    password: z.string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña es demasiado larga')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'La contraseña debe contener al menos una mayúscula, una minúscula y un número'),

    name: z.string()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(50, 'El nombre no puede exceder 50 caracteres')
      .regex(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/,
        'El nombre solo puede contener letras, números y espacios'),

    role: z.enum(['player', 'host'])
      .optional()
      .default('player')
  })
});

/**
 * Schema para login de usuarios
 */
const loginSchema = z.object({
  body: z.object({
    email: z.string()
      .email('Ingresa un email válido')
      .toLowerCase(),

    password: z.string()
      .min(1, 'La contraseña es requerida')
  })
});

/**
 * Schema para refresh token
 */
const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string()
      .min(1, 'El refresh token es requerido')
  })
});

/**
 * Schema para cambiar contraseña
 */
const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string()
      .min(1, 'La contraseña actual es requerida'),

    newPassword: z.string()
      .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
      .max(100, 'La contraseña es demasiado larga')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'La contraseña debe contener al menos una mayúscula, una minúscula y un número')
  }).refine(
    (data) => data.currentPassword !== data.newPassword,
    { message: 'La nueva contraseña debe ser diferente a la actual' }
  )
});

/**
 * Schema para actualizar perfil
 */
const updateProfileSchema = z.object({
  body: z.object({
    name: z.string()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(50, 'El nombre no puede exceder 50 caracteres')
      .regex(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/,
        'El nombre solo puede contener letras, números y espacios')
      .optional(),

    avatar: z.string()
      .url('El avatar debe ser una URL válida')
      .optional(),

    settings: z.object({
      notifications: z.boolean().optional(),
      soundEffects: z.boolean().optional(),
      musicVolume: z.number().min(0).max(1).optional()
    }).optional()
  }).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Debe proporcionar al menos un campo para actualizar' }
  )
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  updateProfileSchema
};
