const { requireAuth, requireRole } = require('../src/middleware/auth');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('../src/services/auth', () => ({
    verifyToken: jest.fn()
}));

const { verifyToken } = require('../src/services/auth');

describe('Auth Middleware', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
        mockReq = {
            headers: {},
            user: null
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('requireAuth', () => {
        it('should return 401 if no authorization header', async () => {
            await requireAuth(mockReq, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: expect.stringMatching(/No authorization header/) });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 if malformed authorization header', async () => {
            mockReq.headers.authorization = 'Bearer'; // Missing token
            await requireAuth(mockReq, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: expect.stringMatching(/Malformed/) });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 if token is invalid', async () => {
            mockReq.headers.authorization = 'Bearer invalid-token';
            verifyToken.mockImplementation(() => { throw new Error('Invalid token'); });

            await requireAuth(mockReq, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: expect.stringMatching(/Invalid or expired/) });
            expect(next).not.toHaveBeenCalled();
        });

        it('should call next() and attach user if token is valid', async () => {
            mockReq.headers.authorization = 'Bearer valid-token';
            const mockUser = { id: 1, role: 'user' };
            verifyToken.mockReturnValue(mockUser);

            await requireAuth(mockReq, mockRes, next);
            expect(verifyToken).toHaveBeenCalledWith('valid-token');
            expect(mockReq.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
        });
    });

    describe('requireRole', () => {
        it('should return 401 if user is not authenticated (req.user missing)', () => {
            const middleware = requireRole('admin');
            middleware(mockReq, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 403 if user has wrong role', () => {
            mockReq.user = { role: 'user' };
            const middleware = requireRole('admin');
            middleware(mockReq, mockRes, next);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should call next() if user has correct role', () => {
            mockReq.user = { role: 'admin' };
            const middleware = requireRole('admin');
            middleware(mockReq, mockRes, next);
            expect(next).toHaveBeenCalled();
        });
    });
});
