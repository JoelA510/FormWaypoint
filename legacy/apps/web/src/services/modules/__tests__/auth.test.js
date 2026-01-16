import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../auth';
import * as core from '../core';

// Mock the core request function
vi.mock('../core', () => ({
    request: vi.fn()
}));

describe('Auth Service Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('login', () => {
        it('should call request with correct args and return data', async () => {
            const mockResponse = { token: 'abc', user: { id: 1 } };
            core.request.mockResolvedValue(mockResponse);

            const result = await authService.login('user', 'pass');

            expect(core.request).toHaveBeenCalledWith('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'user', password: 'pass' })
            });
            expect(result).toEqual(mockResponse);
        });

        it('should throw error if request fails', async () => {
            core.request.mockRejectedValue(new Error('Auth failed'));

            await expect(authService.login('user', 'wrong'))
                .rejects.toThrow('Auth failed');
        });
    });

    describe('register', () => {
        it('should call request with correct args', async () => {
            const mockResponse = { success: true };
            core.request.mockResolvedValue(mockResponse);

            const result = await authService.register('new', 'pass');

            expect(core.request).toHaveBeenCalledWith('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'new', password: 'pass' })
            });
            expect(result).toEqual(mockResponse);
        });
    });
});
