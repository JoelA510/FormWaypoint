const itemService = require('../src/services/items/itemService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mock Prisma
jest.mock('@prisma/client', () => {
    const mPrisma = {
        item: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        }
    };
    return { PrismaClient: jest.fn(() => mPrisma) };
});

describe('ItemService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('listItems should filters by search term', async () => {
        const mockData = [{ id: '1', sku: 'SKU123' }];
        prisma.item.findMany.mockResolvedValue(mockData);
        prisma.item.count.mockResolvedValue(1);

        const result = await itemService.listItems({ search: 'SKU', limit: 10 });

        expect(prisma.item.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                OR: expect.arrayContaining([
                    { sku: { contains: 'SKU' } }
                ])
            })
        }));
        expect(result.data).toEqual(mockData);
    });

    test('createItem should enforce unique SKU', async () => {
        prisma.item.findUnique.mockResolvedValue({ id: '1', sku: 'EXISTING' });

        await expect(itemService.createItem({ sku: 'EXISTING' }, 'user1'))
            .rejects.toThrow('Item with SKU EXISTING already exists.');
    });

    test('createItem should create if SKU is unique', async () => {
        prisma.item.findUnique.mockResolvedValue(null);
        prisma.item.create.mockResolvedValue({ id: '2', sku: 'NEW' });

        const result = await itemService.createItem({ sku: 'NEW' }, 'user1');

        expect(result).toEqual({ id: '2', sku: 'NEW' });
        expect(prisma.item.create).toHaveBeenCalled();
    });
});
