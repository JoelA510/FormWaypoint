"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const api_1 = require("./modules/ingestion/api");
const api_2 = require("./modules/classification/api");
const app = new hono_1.Hono();
app.use('/*', (0, cors_1.cors)());
app.get('/', (c) => {
    return c.text('FormWaypoint API v1');
});
const routes = app
    .route('/ingest', api_1.ingestionRouter)
    .route('/classification', api_2.classificationRouter);
const port = 3000;
(0, node_server_1.serve)({
    fetch: app.fetch,
    port
});
