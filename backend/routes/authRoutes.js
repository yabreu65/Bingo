const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/validateRequest');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  generalApiLimiter,
  createRoomLimiter
} = require('../config/rateLimiters');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  updateProfileSchema
} = require('../schemas/authSchemas');

/**
 * Rutas públicas (sin autenticación)
 */

// Registro de usuarios
router.post(
  '/register',
  createRoomLimiter, // Mismo límite que crear sala (5 por hora)
  validateRequest(registerSchema),
  authController.register
);

// Login
router.post(
  '/login',
  generalApiLimiter,
  validateRequest(loginSchema),
  authController.login
);

// Refresh token
router.post(
  '/refresh',
  generalApiLimiter,
  validateRequest(refreshTokenSchema),
  authController.refreshToken
);

/**
 * Rutas protegidas (requieren autenticación)
 */

// Obtener usuario actual
router.get(
  '/me',
  requireAuth,
  authController.getMe
);

// Logout
router.post(
  '/logout',
  requireAuth,
  authController.logout
);

// Actualizar perfil
router.patch(
  '/profile',
  requireAuth,
  validateRequest(updateProfileSchema),
  authController.updateProfile
);

// Cambiar contraseña
router.post(
  '/change-password',
  requireAuth,
  validateRequest(changePasswordSchema),
  authController.changePassword
);

module.exports = router;
