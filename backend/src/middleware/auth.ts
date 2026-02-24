import type { FastifyRequest, FastifyReply } from 'fastify'

export const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const key = request.headers['x-api-key']
  if (!key || key !== process.env.API_KEY) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
