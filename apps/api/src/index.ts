import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ingestionRouter } from './modules/ingestion/api'
import { classificationRouter } from './modules/classification/api'
import { shipmentRouter } from './modules/shipments/api'
import { partiesRouter } from './modules/parties/api'
import { freightRouter } from './modules/freight/api'
import { importRouter } from './modules/import/api'
import { productsRouter } from './modules/products/api'
import { complianceRouter } from './modules/compliance/api'
import { templatesRouter } from './modules/templates/api'
import { authRouter } from './modules/auth/api'
import { storageRouter } from './modules/storage/api'
import { erpRouter } from './modules/erp/api'
import { reportingRouter } from './modules/reporting/api'

const app = new Hono()

app.use('/*', cors())

app.get('/', (c) => {
    return c.text('FormWaypoint API v1')
})

const routes = app
    .route('/ingest', ingestionRouter)
    .route('/classification', classificationRouter)
    .route('/shipments', shipmentRouter)
    .route('/parties', partiesRouter)
    .route('/freight', freightRouter)
    .route('/import', importRouter)
    .route('/products', productsRouter)
    .route('/compliance', complianceRouter)
    .route('/templates', templatesRouter)
    .route('/auth', authRouter)
    .route('/storage', storageRouter)
    .route('/erp', erpRouter)
    .route('/reporting', reportingRouter)

export type AppType = typeof routes

const port = 3000


serve({
    fetch: app.fetch,
    port
})
