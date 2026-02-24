import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { streamDownload } from '../services/ytdlp.service'

export const downloadRoutes = async (app: FastifyInstance) => {
  app.post('/download', { preHandler: verifyApiKey }, async (request, reply) => {
    const { url } = request.body as { url?: string }
    const normalizedUrl = url?.trim()
    if (!normalizedUrl) return reply.status(400).send({ error: 'url is required' })

    const proc = streamDownload(normalizedUrl)
    let clientDisconnected = false
    let streamStarted = false
    let stderr = ''

    proc.stdout.once('data', () => {
      streamStarted = true
    })

    proc.stderr.on('data', (d) => {
      stderr += d.toString()
      app.log.warn(`yt-dlp: ${d}`)
    })

    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (clientDisconnected || reply.sent) return

      if (err.code === 'ENOENT') {
        return reply.status(500).send({ error: 'yt-dlp executable not found on server PATH' })
      }

      return reply.status(500).send({ error: err.message })
    })

    proc.once('close', (code) => {
      if (clientDisconnected || code === 0) return

      const reason = stderr.trim() || 'yt-dlp download failed'
      if (!streamStarted && !reply.sent) {
        void reply.status(422).send({ error: reason })
        return
      }

      app.log.warn({ code, reason }, 'yt-dlp exited with non-zero status after streaming started')
    })

    request.raw.on('close', () => {
      clientDisconnected = true
      if (!proc.killed) proc.kill()
    })

    reply.header('Content-Type', 'audio/mpeg')
    return reply.send(proc.stdout)
  })
}
