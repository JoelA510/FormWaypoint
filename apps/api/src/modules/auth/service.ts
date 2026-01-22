
import { prisma } from '@repo/schema';
import { hashPassword, comparePassword, generateToken, verifyToken } from './utils';
import { z } from 'zod';

export const RegisterSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(8),
});

export const LoginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

export class AuthService {
    async register(data: z.infer<typeof RegisterSchema>) {
        const existing = await prisma.user.findUnique({
            where: { username: data.username }
        });

        if (existing) {
            throw new Error('Username already exists');
        }

        const hashedPassword = await hashPassword(data.password);

        const user = await prisma.user.create({
            data: {
                username: data.username,
                password: hashedPassword,
                role: 'user',
            }
        });

        const token = generateToken(user);
        return { user: { id: user.id, username: user.username, role: user.role }, token };
    }

    async login(data: z.infer<typeof LoginSchema>) {
        const user = await prisma.user.findUnique({
            where: { username: data.username }
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        const isValid = await comparePassword(data.password, user.password);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = generateToken(user);
        return { user: { id: user.id, username: user.username, role: user.role }, token };
    }

    async verify(token: string) {
        return verifyToken(token);
    }
}

export const authService = new AuthService();
