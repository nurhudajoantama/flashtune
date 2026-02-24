import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { getPlaylistInfo } from '../services/ytdlp.service'

export const playlistRoutes = async (app: FastifyInstance) => {
  app.get('/playlist-info', { preHandler: verifyApiKey }, async (request, reply) => {
    const { url } = request.query as { url?: string }
    if (!url) return reply.status(400).send({ error: 'url is required' })
    try {
      const { title, entries } = await getPlaylistInfo(url)
      return { title, track_count: entries.length, tracks: entries }
    } catch (err: any) {
      return reply.status(422).send({ error: err.message })
    }
  })
}
