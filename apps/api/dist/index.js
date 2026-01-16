"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const api_1 = require("./modules/ingestion/api");
const app = new hono_1.Hono();
app.get('/', (c) => {
    return c.text('FormWaypoint API v1');
});
const routes = app.route('/ingest', api_1.ingestionRouter);
const port = 3000;
console.log(`Server is running on port ${port}`);
(0, node_server_1.serve)({
    fetch: app.fetch,
    port
});
