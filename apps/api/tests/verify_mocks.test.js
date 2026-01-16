jest.mock('../src/queue', () => ({
    isMock: true
}));

jest.mock('../src/services/redis', () => ({
    isMock: true
}));

describe('Verify Mocks', () => {
    it('should load mocks instead of real modules', () => {
        const queue = require('../src/queue');
        const redis = require('../src/services/redis');

        console.log('Queue:', queue);
        console.log('Redis:', redis);

        expect(queue.isMock).toBe(true);
        expect(redis.isMock).toBe(true);
    });
});
