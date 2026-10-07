const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { rateLimitErrorResponse } = require('../utils/errorResponses');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Rate limiter estricto para creación de salas
 * Production: maximum 5 rooms per hour per IP. Development stays permissive
 * so local testing and shared LAN events are not blocked.
 */
const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: isProduction ? 5 : 100,
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
 * Production: maximum 100 joins per hour per IP. This protects the public
 * endpoint while still supporting players behind the same household NAT.
 */
const joinRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: isProduction ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryInSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json(rateLimitErrorResponse(retryInSeconds));
  }
});

/**
 * Rate limiter general para endpoints públicos
 * Production: maximum 300 requests per 15 minutes per IP.
 */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isProduction ? 300 : 10000,
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
 * Production: maximum 120 card changes per minute.
 */
const selectCardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: isProduction ? 120 : 5000,
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
