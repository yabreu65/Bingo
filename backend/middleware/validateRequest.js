const { ZodError } = require('zod');

/**
 * Middleware para validar requests usando schemas de Zod
 * @param {ZodSchema} schema - Schema de Zod para validar
 * @returns {Function} Middleware de Express
 */
const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      // Validar todo el objeto request (body, params, query)
      const validatedData = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query
      });

      // Reemplazar con datos validados y parseados
      req.body = validatedData.body || req.body;
      req.params = validatedData.params || req.params;
      req.query = validatedData.query || req.query;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Formatear errores de Zod para respuesta user-friendly
        const formattedErrors = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos enviados no son válidos',
            details: formattedErrors
          }
        });
      }

      // Error inesperado
      console.error('Error de validación inesperado:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error interno del servidor'
        }
      });
    }
  };
};

module.exports = { validateRequest };
