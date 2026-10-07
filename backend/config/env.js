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
    const message = 'JWT_SECRET must contain at least 32 characters';
    if (env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`⚠️ WARNING: ${message}`);
  }

  const weakSecrets = [
    'tu_clave_secreta_muy_segura_aqui',
    'tu_clave_secreta_muy_segura_aqui_cambiar_en_produccion',
    'your-super-secret-jwt-key-change-this'
  ];
  if (weakSecrets.includes(env.JWT_SECRET)) {
    const message = 'JWT_SECRET is using a documented placeholder value';
    if (env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`⚠️ WARNING: ${message}`);
  }

  if (env.NODE_ENV === 'production' && env.FRONTEND_URL.includes('localhost')) {
    console.error('❌ ERROR: FRONTEND_URL no debería apuntar a localhost en producción');
    process.exit(1);
  }

  return env;
};

module.exports = { validateEnv };
