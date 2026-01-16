import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { ingestionRouter } from './modules/ingestion/api'

const app = new Hono()

app.get('/', (c) => {
    return c.text('FormWaypoint API v1')
})

app.route('/ingest', ingestionRouter)

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
    fetch: app.fetch,
    port
})
