import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { search, YtDlpError } from '../services/ytdlp.service'

export const searchRoutes = async (app: FastifyInstance) => {
  app.get('/search', { preHandler: verifyApiKey }, async (request, reply) => {
    const { query } = request.query as { query?: string }
    if (!query) return reply.status(400).send({ error: 'query is required' })
    try {
      const results = await search(query)
      return results
    } catch (err: unknown) {
      if (err instanceof YtDlpError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }

      return reply.status(500).send({ error: 'Unexpected search failure' })
    }
  })
}
