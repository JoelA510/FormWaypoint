const authService = require('../src/services/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock dependencies
jest.mock('uuid', () => ({ v4: () => 'test-jti' }));

jest.mock('../src/services/redis', () => ({
    connection: {
        setex: jest.fn(),
        get: jest.fn()
    }
}));

const { connection: redis } = require('../src/services/redis');

jest.mock('../src/queue/index', () => ({
    prisma: {
        user: {
            findUnique: jest.fn(),
            create: jest.fn()
        }
    }
}));

jest.mock('../src/config', () => ({
    authSecret: 'test-secret',
    nodeEnv: 'test'
}));

const { prisma } = require('../src/queue/index');

describe('Auth Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('login', () => {
        it('should return token for valid credentials', async () => {
            const mockUser = {
                id: '1',
                username: 'test',
                password: await bcrypt.hash('Password123', 10),
                role: 'user'
            };

            prisma.user.findUnique.mockResolvedValue(mockUser);

            const result = await authService.login('test', 'Password123');

            expect(result).toHaveProperty('token');
            expect(result.user).toEqual({
                id: '1',
                username: 'test',
                role: 'user'
            });

            const decoded = jwt.verify(result.token, 'test-secret');
            expect(decoded.id).toBe('1');
            expect(decoded.jti).toBe('test-jti');
        });

        it('should throw error for invalid password', async () => {
            const mockUser = {
                id: '1',
                username: 'test',
                password: await bcrypt.hash('Password123', 10)
            };

            prisma.user.findUnique.mockResolvedValue(mockUser);

            await expect(authService.login('test', 'wrong')).rejects.toThrow('Invalid credentials');
        });

        it('should throw error for non-existent user', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(authService.login('test', 'password')).rejects.toThrow('Invalid credentials');
        });
    });

    describe('register', () => {
        it('should throw error for short password', async () => {
            await expect(authService.register('newuser', 'short')).rejects.toThrow('Password must be at least 8 characters long');
        });

        it('should throw error for password without letters', async () => {
            await expect(authService.register('newuser', '12345678')).rejects.toThrow('Password must contain at least one letter');
        });

        it('should throw error for password without numbers', async () => {
            await expect(authService.register('newuser', 'password')).rejects.toThrow('Password must contain at least one number');
        });

        it('should register user with valid strong password', async () => {
            const mockUser = {
                id: '2',
                username: 'newuser',
                password: 'hashedpassword',
                role: 'user'
            };

            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue(mockUser);

            const result = await authService.register('newuser', 'StrongPass123');

            expect(result).toHaveProperty('token');
            expect(result.user.username).toBe('newuser');
        });
    });

    describe('revocation', () => {
        it('should revoke token by adding to redis', async () => {
            const now = Math.floor(Date.now() / 1000);
            await authService.revokeToken('test-jti', now + 3600);

            expect(redis.setex).toHaveBeenCalledWith('blacklist:test-jti', expect.any(Number), 'revoked');
        });

        it('should verify token asynchronously and check blacklist', async () => {
            const token = jwt.sign({ id: '1', jti: 'test-jti' }, 'test-secret');

            redis.get.mockResolvedValue(null); // Not revoked

            const decoded = await authService.verifyToken(token);
            expect(decoded.id).toBe('1');
        });

        it('should throw if token is in blacklist', async () => {
            const token = jwt.sign({ id: '1', jti: 'test-jti' }, 'test-secret');

            redis.get.mockResolvedValue('revoked');

            await expect(authService.verifyToken(token)).rejects.toThrow('Token revoked');
        });
    });
});
