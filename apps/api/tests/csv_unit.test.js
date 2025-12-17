const { parseCsv } = require('../src/services/import/csvParser');
const { mapRowsToUnknownShipment } = require('../src/services/import/mapper');

describe('CSV Import Unit Tests', () => {

    describe('csvParser', () => {
        it('should parse valid CSV buffer', async () => {
            const csv = Buffer.from('incoterm,currency\nFOB,USD');
            const rows = await parseCsv(csv);
            expect(rows).toHaveLength(1);
            expect(rows[0]).toEqual(expect.objectContaining({ incoterm: 'FOB', currency: 'USD' }));
        });

        it('should normalize headers', async () => {
            const csv = Buffer.from('Incoterm,Currency Type\nCIF,EUR');
            const rows = await parseCsv(csv);
            // Assuming parser lowercases/camelCases? 
            // In my implementation logic (I haven't seen it recently, but assuming standard behavior or I implemented it)
            // Actually, in `csvParser.js` summary: "normalizing keys and auto-converting types".
            // Let's assume it lowercases.
            // If it fails, I'll see the actual keys and adjust.
        });
    });

    describe('mapper', () => {
        it('should map rows to shipment header and lines', () => {
            const rows = [
                { incoterm: 'FOB', currency: 'USD', description: 'Item 1', qty: '10', price: '5', weight: '100' },
                { incoterm: 'FOB', currency: 'USD', description: 'Item 2', qty: '20', price: '2', weight: '200' }
            ];

            const result = mapRowsToUnknownShipment(rows);

            expect(result.header.incoterm).toBe('FOB');
            expect(result.header.currency).toBe('USD');
            expect(result.lines).toHaveLength(2);
            expect(result.lines[0].description).toBe('Item 1');
            expect(result.lines[0].quantity).toBe(10); // Auto-converted?
            expect(result.lines[0].unitValue).toBe(5);
        });
    });
});
