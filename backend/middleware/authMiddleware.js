const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware para verificar autenticación
 * Verifica el JWT token en el header Authorization
 */
const requireAuth = async (req, res, next) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'No se proporcionó token de autenticación'
        }
      });
    }

    const token = authHeader.substring(7); // Remover 'Bearer '

    try {
      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verificar que no sea un refresh token
      if (decoded.type === 'refresh') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'El refresh token no es válido para esta operación'
          }
        });
      }

      // Verificar que el usuario existe y está activo
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token inválido o usuario inactivo'
          }
        });
      }

      // Agregar información del usuario al request
      req.user = {
        userId: user._id,
        email: user.email,
        role: user.role
      };

      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'El token ha expirado'
          }
        });
      }

      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token inválido'
          }
        });
      }

      throw jwtError;
    }
  } catch (error) {
    console.error('Error en autenticación:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Error al verificar autenticación'
      }
    });
  }
};

/**
 * Middleware para verificar rol de host
 * Debe usarse después de requireAuth
 */
const requireHost = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_AUTH',
          message: 'Debes estar autenticado para esta acción'
        }
      });
    }

    if (req.user.role !== 'host' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Solo los hosts pueden realizar esta acción'
        }
      });
    }

    next();
  } catch (error) {
    console.error('Error en verificación de host:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Error al verificar permisos'
      }
    });
  }
};

/**
 * Middleware para verificar rol de admin
 * Debe usarse después de requireAuth
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_AUTH',
          message: 'Debes estar autenticado para esta acción'
        }
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Solo los administradores pueden realizar esta acción'
        }
      });
    }

    next();
  } catch (error) {
    console.error('Error en verificación de admin:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Error al verificar permisos'
      }
    });
  }
};

/**
 * Middleware opcional de autenticación
 * Añade información del usuario si el token es válido, pero no falla si no hay token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continuar sin autenticación
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'refresh') {
        const user = await User.findById(decoded.userId);

        if (user && user.isActive) {
          req.user = {
            userId: user._id,
            email: user.email,
            role: user.role
          };
        }
      }
    } catch (jwtError) {
      // Silenciosamente ignorar errores de token en auth opcional
    }

    next();
  } catch (error) {
    console.error('Error en autenticación opcional:', error);
    next(); // Continuar aunque haya error
  }
};

module.exports = {
  requireAuth,
  requireHost,
  requireAdmin,
  optionalAuth
};
