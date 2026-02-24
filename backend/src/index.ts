import Fastify from 'fastify'
import cors from '@fastify/cors'
import { searchRoutes } from './routes/search'
import { downloadRoutes } from './routes/download'
import { playlistRoutes } from './routes/playlist'

const app = Fastify({ logger: true })

app.register(cors)
app.register(searchRoutes)
app.register(downloadRoutes)
app.register(playlistRoutes)

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

const start = async () => {
  try {
    await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
