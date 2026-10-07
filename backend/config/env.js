const { cleanEnv, str, port, url } = require('envalid');

/**
 * Validar y limpiar variables de entorno
 * El servidor no iniciará si falta alguna variable crítica
 */
const validateEnv = () => {
  const env = cleanEnv(process.env, {
    // Variables críticas (requeridas)
    NODE_ENV: str({
      default: 'development',
      choices: ['development', 'production', 'test'],
      desc: 'Entorno de ejecución'
    }),

    PORT: port({
      default: 5001,
      desc: 'Puerto del servidor'
    }),

    MONGODB_URI: str({
      desc: 'URI de conexión a MongoDB',
      example: 'mongodb://localhost:27017/bingo-navidad'
    }),

    JWT_SECRET: str({
      desc: 'Clave secreta para JWT',
      example: 'tu_clave_secreta_muy_segura_aqui'
    }),

    FRONTEND_URL: url({
      desc: 'URL del frontend para CORS',
      example: 'http://localhost:5173'
    }),

    // Variables opcionales (para features futuras)
    SPOTIFY_CLIENT_ID: str({
      default: '',
      desc: 'Cliente ID de Spotify (opcional)'
    }),

    SPOTIFY_CLIENT_SECRET: str({
      default: '',
      desc: 'Cliente Secret de Spotify (opcional)'
    }),

    SPOTIFY_REDIRECT_URI: url({
      default: 'http://localhost:5000/api/spotify/callback',
      desc: 'URI de redirect de Spotify (opcional)'
    }),

    YOUTUBE_API_KEY: str({
      default: '',
      desc: 'API Key de YouTube (opcional)'
    }),

    ANTHROPIC_API_KEY: str({
      default: '',
      desc: 'API Key de Anthropic para trivia AI (opcional)'
    })
  });

  // Validaciones adicionales
  if (env.JWT_SECRET.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET debería tener al menos 32 caracteres para mayor seguridad');
  }

  if (env.JWT_SECRET === 'tu_clave_secreta_muy_segura_aqui_cambiar_en_produccion') {
    console.warn('⚠️  WARNING: JWT_SECRET está usando el valor por defecto. Cámbialo en producción!');
  }

  if (env.NODE_ENV === 'production' && env.FRONTEND_URL.includes('localhost')) {
    console.error('❌ ERROR: FRONTEND_URL no debería apuntar a localhost en producción');
    process.exit(1);
  }

  return env;
};

module.exports = { validateEnv };
