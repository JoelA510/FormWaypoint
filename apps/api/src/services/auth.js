const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../queue'); // Use shared instance
const config = require('../config');

const { connection: redis } = require('./redis');
const { v4: uuidv4 } = require('uuid');

// Helper to generate token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            jti: uuidv4() // Unique ID for revocation
        },
        config.authSecret,
        { expiresIn: '24h' }
    );
};

// Validate password strength
const validatePassword = (password) => {
    if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
    }
    if (!/[A-Za-z]/.test(password)) {
        throw new Error('Password must contain at least one letter');
    }
    if (!/\d/.test(password)) {
        throw new Error('Password must contain at least one number');
    }
};

// Register new user
const register = async (username, password) => {
    validatePassword(password);
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) throw new Error('Username already exists');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { username, password: hashedPassword } });
    const token = generateToken(user);
    return { user: { id: user.id, username: user.username, role: user.role }, token };
};

// Login user
const login = async (username, password) => {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new Error('Invalid credentials');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Invalid credentials');
    const token = generateToken(user);
    return { user: { id: user.id, username: user.username, role: user.role }, token };
};

// Revoke a token
const revokeToken = async (jti, exp) => {
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;

    if (ttl > 0) {
        await redis.setex(`blacklist:${jti}`, ttl, 'revoked');
    }
};

// Check if token is revoked
const checkRevoked = async (jti) => {
    const status = await redis.get(`blacklist:${jti}`);
    return status === 'revoked';
};

// Verify token middleware
const verifyToken = async (token) => {
    try {
        const decoded = jwt.verify(token, config.authSecret);
        if (!decoded || !decoded.jti) {
            return decoded;
        }
        const isRevoked = await checkRevoked(decoded.jti);
        if (isRevoked) {
            throw new Error('Token revoked');
        }
        return decoded;
    } catch (err) {
        if (err.message === 'Token revoked') throw err;
        throw new Error('Invalid or expired token');
    }
};

module.exports = {
    register,
    login,
    verifyToken,
    revokeToken,
    prisma
};
