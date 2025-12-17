const config = require('./config'); // Load config first to validate env
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');
const uploadRouter = require('./routes/upload');
const documentsRouter = require('./routes/documents');
const statusRouter = require('./routes/status');
const authRouter = require('./routes/auth');
const metricsRouter = require('./routes/metrics');
const complianceRouter = require('./routes/compliance');
const templatesRouter = require('./routes/templates');
const notificationsRouter = require('./routes/notifications');
const carriersRouter = require('./routes/carriers');
const partiesRouter = require('./routes/parties');
const shipmentsRouter = require('./routes/shipments');
const importRouter = require('./routes/import');
const filesRouter = require('./routes/files');
const forwardersRouter = require('./routes/forwarders');
const erpRouter = require('./routes/erp');
const configRouter = require('./routes/config');

const http = require('http');
const { initSocket } = require('./services/socket');

const port = config.port;
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Security middleware
app.use(helmet());
app.use(cors({
    origin: config.frontendUrl, // Restrict to trusted frontend
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Limit payload size

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Stricter limit for auth endpoints
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true
});

app.use(limiter); // Apply to all routes
app.use('/auth', authLimiter); // Stricter limit for auth

// Public health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/auth', authRouter);
app.use('/config', configRouter);
app.use('/metrics', metricsRouter);
app.use('/webhooks', require('./routes/webhooks'));
app.use('/cx', require('./routes/cx'));

// Protected routes
app.use('/files', requireAuth, filesRouter);
app.use('/upload', requireAuth, uploadRouter);
app.use('/documents', requireAuth, documentsRouter);
app.use('/compliance', requireAuth, complianceRouter);
app.use('/templates', requireAuth, templatesRouter);
app.use('/notifications', requireAuth, notificationsRouter);
app.use('/carriers', requireAuth, carriersRouter);
app.use('/forwarders', requireAuth, require('./domains/freight/routes/freightRoutes'));
app.use('/erp', requireAuth, require('./domains/erp/routes/erpRoutes'));
app.use('/compliance', requireAuth, require('./domains/compliance/routes/complianceRoutes'));
app.use('/reports', requireAuth, require('./domains/reporting/routes/reportingRoutes'));
app.use('/shipment-templates', requireAuth, require('./domains/templates/routes/templateRoutes'));
app.use('/shipments', requireAuth, require('./domains/shipping/routes/shipmentRoutes'));
app.use('/import', requireAuth, importRouter);
app.use('/fleet', requireAuth, require('./routes/fleet'));
app.use('/', requireAuth, statusRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const errorHandler = require('./middleware/errorHandler');

// Centralized error handler
app.use(errorHandler);

if (require.main === module) {
    server.listen(port, () => {
        console.log(`API listening at http://localhost:${port}`);
    });
}

module.exports = app;
