import type { FastifyRequest, FastifyReply } from 'fastify'
import { isApiKeyAuthorized, isAuthConfigLoaded } from '../config/token-auth'

export const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!isAuthConfigLoaded()) {
    return reply.status(500).send({ error: 'Auth config invalid' })
  }

  const keyHeader = request.headers['x-api-key']
  const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader

  if (typeof key !== 'string' || !isApiKeyAuthorized(key)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
