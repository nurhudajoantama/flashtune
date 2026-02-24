import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { streamDownload } from '../services/ytdlp.service'

export const downloadRoutes = async (app: FastifyInstance) => {
  app.post('/download', { preHandler: verifyApiKey }, async (request, reply) => {
    const { url } = request.body as { url?: string }
    if (!url) return reply.status(400).send({ error: 'url is required' })

    const proc = streamDownload(url)
    let hasError = false

    proc.stderr.on('data', (d) => {
      app.log.warn(`yt-dlp: ${d}`)
    })

    proc.on('error', (err) => {
      hasError = true
      reply.status(500).send({ error: err.message })
    })

    request.raw.on('close', () => {
      if (!proc.killed) proc.kill()
    })

    reply.header('Content-Type', 'audio/mpeg')
    return reply.send(proc.stdout)
  })
}
