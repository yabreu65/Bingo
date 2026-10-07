const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { rateLimitErrorResponse } = require('../utils/errorResponses');

/**
 * Rate limiter estricto para creación de salas
 * Máximo 100 salas por hora por IP (aumentado para testing y desarrollo)
 */
const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 100, // 100 requests por ventana
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    // Calcular segundos hasta el reset (resetTime es timestamp en ms)
    const retryInSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json(rateLimitErrorResponse(retryInSeconds));
  }
});

/**
 * Rate limiter para unirse a salas
 * Máximo 5000 joins por hora por IP (aumentado para eventos con muchos usuarios)
 */
const joinRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5000, // 5000 requests por ventana (aumentado para múltiples dispositivos en misma red)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryInSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json(rateLimitErrorResponse(retryInSeconds));
  }
});

/**
 * Rate limiter general para endpoints públicos
 * Máximo 10000 requests por 15 minutos (aumentado para juegos con muchos jugadores)
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10000, // 10000 requests por ventana
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryInSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json(rateLimitErrorResponse(retryInSeconds));
  }
});

/**
 * Speed limiter - ralentiza requests después de cierto límite
 * Útil para prevenir abuse sin bloquear completamente
 */
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 50, // Empezar a ralentizar después de 50 requests
  delayMs: (hits) => hits * 100, // Agregar 100ms de delay por cada request adicional
  maxDelayMs: 5000, // Máximo 5 segundos de delay
});

/**
 * Rate limiter para selección de cartones
 * Máximo 5000 cambios de cartón por minuto
 */
const selectCardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5000, // 5000 requests por minuto (aumentado para permitir muchos jugadores simultáneos)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryInSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json(rateLimitErrorResponse(retryInSeconds));
  }
});

/**
 * Whitelist de IPs confiables (localhost, testing)
 * En producción, agregar IPs de servidores confiables aquí
 */
const trustedIPs = ['127.0.0.1', '::1', 'localhost'];

/**
 * Skip rate limiting para IPs confiables
 */
const skipTrustedIPs = (req) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  return trustedIPs.includes(clientIP);
};

module.exports = {
  createRoomLimiter,
  joinRoomLimiter,
  generalApiLimiter,
  speedLimiter,
  selectCardLimiter,
  skipTrustedIPs,
  trustedIPs
};
