import type { FastifyInstance } from 'fastify'
import { verifyApiKey } from '../middleware/auth'
import { streamDownload } from '../services/ytdlp.service'

export const downloadRoutes = async (app: FastifyInstance) => {
  app.post('/download', { preHandler: verifyApiKey }, async (request, reply) => {
    const { url } = request.body as { url?: string }
    const normalizedUrl = url?.trim()
    if (!normalizedUrl) return reply.status(400).send({ error: 'url is required' })

    const { ytdlp, ffmpeg } = streamDownload(normalizedUrl)
    let clientDisconnected = false
    let streamStarted = false
    let ytdlpStderr = ''

    ffmpeg.stdout!.once('data', () => {
      streamStarted = true
    })

    ytdlp.stderr!.on('data', (d) => {
      ytdlpStderr += d.toString()
      app.log.warn(`yt-dlp: ${d}`)
    })

    ffmpeg.stderr!.on('data', (d) => {
      app.log.warn(`ffmpeg: ${d}`)
    })

    ytdlp.once('error', (err: NodeJS.ErrnoException) => {
      if (clientDisconnected || reply.sent) return
      if (err.code === 'ENOENT') {
        return reply.status(500).send({ error: 'yt-dlp executable not found on server PATH' })
      }
      return reply.status(500).send({ error: err.message })
    })

    ffmpeg.once('error', (err: NodeJS.ErrnoException) => {
      if (clientDisconnected || reply.sent) return
      if (err.code === 'ENOENT') {
        return reply.status(500).send({ error: 'ffmpeg executable not found on server PATH' })
      }
      if (!streamStarted) {
        return reply.status(500).send({ error: err.message })
      }
      app.log.error({ err }, 'ffmpeg error after stream started')
    })

    ffmpeg.once('close', (code) => {
      if (clientDisconnected || code === 0) return
      const reason = ytdlpStderr.trim() || 'download or audio conversion failed'
      if (!streamStarted && !reply.sent) {
        void reply.status(422).send({ error: reason })
        return
      }
      app.log.warn({ code, reason }, 'ffmpeg exited with non-zero status after streaming started')
    })

    request.raw.on('close', () => {
      clientDisconnected = true
      if (!ytdlp.killed) ytdlp.kill()
      if (!ffmpeg.killed) ffmpeg.kill()
    })

    reply.header('Content-Type', 'audio/mpeg')
    return reply.send(ffmpeg.stdout!)
  })
}
