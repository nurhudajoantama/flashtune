import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { getPlaylistInfo, YtDlpError } from '../services/ytdlp.service'

export const playlistRoutes = async (app: FastifyInstance) => {
  app.get('/playlist-info', { preHandler: verifyApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string }
    if (!url) return reply.status(400).send({ error: 'url is required' })
    try {
      const { title, entries } = await getPlaylistInfo(url)
      return { title, track_count: entries.length, tracks: entries }
    } catch (err: unknown) {
      if (err instanceof YtDlpError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }

      return reply.status(500).send({ error: 'Unexpected playlist failure' })
    }
  })
}
