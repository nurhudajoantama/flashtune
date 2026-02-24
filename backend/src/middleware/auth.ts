import type { FastifyRequest, FastifyReply } from 'fastify'

export const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const keyHeader = request.headers['x-api-key']
  const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader

  const expected = process.env.API_KEY
  if (!expected || typeof key !== 'string' || key !== expected) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
