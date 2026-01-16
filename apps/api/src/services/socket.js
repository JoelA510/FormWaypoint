const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

let io;

exports.initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: config.frontendUrl || '*',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, config.authSecret);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.id}`);

        socket.join(`user:${socket.user.id}`);

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.id}`);
        });

        // Example: subscribe to shipment
        socket.on('subscribe_shipment', (shipmentId) => {
            socket.join(`shipment:${shipmentId}`);
        });
    });

    return io;
};

exports.getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

// Helper to emit events easier
exports.emitToUser = (userId, event, data) => {
    if (io) io.to(`user:${userId}`).emit(event, data);
};

exports.emitToShipment = (shipmentId, event, data) => {
    if (io) io.to(`shipment:${shipmentId}`).emit(event, data);
};
