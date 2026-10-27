const { z } = require('zod');

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'El ID debe ser un ObjectId válido');

const startGameSchema = z.object({
  body: z.object({
    roomId: objectIdSchema
  })
});

const getGameSchema = z.object({
  params: z.object({
    id: objectIdSchema
  })
});

module.exports = { startGameSchema, getGameSchema };
