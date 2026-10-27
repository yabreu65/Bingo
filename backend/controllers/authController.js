const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

/**
 * Generar JWT token
 */
const generateToken = (userId, authVersion = 0, expiresIn = '7d') => {
  return jwt.sign(
    { userId, authVersion },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * Generar refresh token
 */
const generateRefreshToken = (userId, authVersion = 0) => {
  return jwt.sign(
    { userId, authVersion, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const issueTokens = async (user) => {
  const authVersion = user.authVersion || 0;
  const token = generateToken(user._id, authVersion);
  const refreshToken = generateRefreshToken(user._id, authVersion);
  user.refreshTokenHash = hashRefreshToken(refreshToken);
  await user.save();
  return { token, refreshToken };
};

/**
 * Registro de nuevos usuarios
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'Ya existe un usuario con este email'
        }
      });
    }

    // Crear nuevo usuario
    const user = new User({
      email,
      password,
      name,
      role: role || 'player'
    });

    await user.save();

    // Generar tokens
    // Actualizar último login
    user.lastLogin = new Date();
    const { token, refreshToken } = await issueTokens(user);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: 'Error al registrar usuario'
      }
    });
  }
};

/**
 * Login de usuarios
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuario con password incluido
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email o contraseña incorrectos'
        }
      });
    }

    // Verificar password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email o contraseña incorrectos'
        }
      });
    }

    // Verificar si el usuario está activo
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'USER_INACTIVE',
          message: 'Tu cuenta ha sido desactivada'
        }
      });
    }

    // Generar tokens
    // Actualizar último login
    user.lastLogin = new Date();
    const { token, refreshToken } = await issueTokens(user);

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          stats: user.stats
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Error al iniciar sesión'
      }
    });
  }
};

/**
 * Obtener usuario actual
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          stats: user.stats,
          settings: user.settings,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_ERROR',
        message: 'Error al obtener información del usuario'
      }
    });
  }
};

/**
 * Refresh token
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verificar refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token inválido'
        }
      });
    }

    // Verificar que el usuario existe
    const user = await User.findById(decoded.userId).select('+refreshTokenHash');

    if (!user || !user.isActive || decoded.authVersion !== (user.authVersion || 0) ||
        !user.refreshTokenHash || user.refreshTokenHash !== hashRefreshToken(refreshToken)) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token inválido'
        }
      });
    }

    // Generar nuevos tokens
    const { token: newToken, refreshToken: newRefreshToken } = await issueTokens(user);

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Error al refrescar token:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'REFRESH_TOKEN_ERROR',
        message: 'Error al refrescar token'
      }
    });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('+refreshTokenHash');
    if (!user) return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    user.authVersion = (user.authVersion || 0) + 1;
    user.refreshTokenHash = null;
    await user.save();

    res.json({
      success: true,
      message: 'Logout exitoso'
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: 'Error al cerrar sesión'
      }
    });
  }
};

/**
 * Actualizar perfil
 * PATCH /api/auth/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, avatar, settings } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      });
    }

    // Actualizar campos
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
    if (settings) {
      user.settings = { ...user.settings, ...settings };
    }

    await user.save();

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          settings: user.settings
        }
      }
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_PROFILE_ERROR',
        message: 'Error al actualizar perfil'
      }
    });
  }
};

/**
 * Cambiar contraseña
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      });
    }

    // Verificar contraseña actual
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'La contraseña actual es incorrecta'
        }
      });
    }

    // Actualizar contraseña
    user.password = newPassword;
    user.authVersion = (user.authVersion || 0) + 1;
    user.refreshTokenHash = null;
    await user.save();

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHANGE_PASSWORD_ERROR',
        message: 'Error al cambiar contraseña'
      }
    });
  }
};
