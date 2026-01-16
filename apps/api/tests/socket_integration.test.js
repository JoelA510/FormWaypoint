const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { initSocket } = require('../src/services/socket');

describe('Socket.io Integration', () => {
    let io, serverServerSocket, clientSocket;
    let httpServer;
    let port;

    beforeAll((done) => {
        httpServer = createServer();
        io = initSocket(httpServer);

        httpServer.listen(() => {
            port = httpServer.address().port;
            done();
        });
    });

    afterAll(() => {
        io.close();
        httpServer.close();
    });

    afterEach(() => {
        if (clientSocket && clientSocket.connected) {
            clientSocket.disconnect();
        }
    });

    test('should reject connection without token', (done) => {
        clientSocket = new Client(`http://localhost:${port}`);
        clientSocket.on('connect_error', (err) => {
            expect(err.message).toBe('Authentication error');
            done();
        });
    });

    test('should connect with valid token', (done) => {
        const token = jwt.sign({ id: 'test-user', role: 'admin' }, config.authSecret);
        clientSocket = new Client(`http://localhost:${port}`, {
            auth: { token }
        });

        clientSocket.on('connect', () => {
            expect(clientSocket.connected).toBe(true);
            done();
        });
    });
});
