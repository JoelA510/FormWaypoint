
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';

export const hashPassword = async (password: string) => {
    return bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, hash: string) => {
    return bcrypt.compare(password, hash);
};

export const generateToken = (user: { id: string; username: string; role: string }) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            jti: uuidv4(),
        },
        SECRET,
        { expiresIn: '24h' }
    );
};

export const verifyToken = (token: string) => {
    try {
        return jwt.verify(token, SECRET) as any;
    } catch (e) {
        throw new Error('Invalid token');
    }
};
