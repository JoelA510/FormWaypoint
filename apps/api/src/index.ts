import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ingestionRouter } from './modules/ingestion/api'
import { classificationRouter } from './modules/classification/api'

const app = new Hono()

app.use('/*', cors())

app.get('/', (c) => {
    return c.text('FormWaypoint API v1')
})

const routes = app
    .route('/ingest', ingestionRouter)
    .route('/classification', classificationRouter)

export type AppType = typeof routes

const port = 3000


serve({
    fetch: app.fetch,
    port
})
