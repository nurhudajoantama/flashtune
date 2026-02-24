import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { search } from '../services/ytdlp.service'

export const searchRoutes = async (app: FastifyInstance) => {
  app.get('/search', { preHandler: verifyApiKey }, async (request, reply) => {
    const { query } = request.query as { query?: string }
    if (!query) return reply.status(400).send({ error: 'query is required' })
    try {
      const results = await search(query)
      return results
    } catch (err: any) {
      return reply.status(422).send({ error: err.message })
    }
  })
}
