const {
    buildInvoiceViewModel,
    buildSliViewModel,
    buildCooViewModel,
    buildDgDeclarationViewModel
} = require('../src/services/documents/viewModels');
const fixtures = require('./fixtures/shipments');

describe('Document View Model Builders', () => {

    // We need to mock the inputs slightly because fixtures are "creation DTOs" 
    // but the builder expects "ShipmentV1" with ID and timestamps.
    const mockShipment = (fixture) => ({
        ...fixture,
        id: 'SHIP-12345678',
        createdAt: new Date().toISOString(),
        clipperSnapshot: JSON.stringify(fixture.shipper),
        consigneeSnapshot: JSON.stringify(fixture.consignee),
        shipperId: 'party-1',
        consigneeId: 'party-2'
    });

    test('buildInvoiceViewModel creates correct metadata and lines', () => {
        const shipment = mockShipment(fixtures.shipments.domestic);
        const vm = buildInvoiceViewModel(shipment, shipment.lineItems);

        expect(vm.metadata.title).toBe('COMMERCIAL INVOICE');
        expect(vm.metadata.documentNumber).toContain('INV-SHIP-123');
        expect(vm.lines).toHaveLength(1);
        expect(vm.lines[0].extendedValue).toBe('1000.00');
        expect(vm.totals.subTotal).toBe('1000.00');
    });

    test('buildSliViewModel includes AES info', () => {
        const shipment = mockShipment(fixtures.shipments.internationalEEI);
        // Force these fields on the mock object since fixture creates them differently
        shipment.aesRequired = true;
        shipment.aesItn = 'X20231234567890'; // Valid ITN format sample

        const vm = buildSliViewModel(shipment, shipment.lineItems);

        expect(vm.metadata.title).toBe("SHIPPER'S LETTER OF INSTRUCTION");
        expect(vm.sli.aes.required).toBe(true);
        expect(vm.sli.aes.itn).toBe('X20231234567890');
        expect(vm.sli.instructions).toBeDefined();
    });

    test('buildCooViewModel aggregates country of origin', () => {
        const shipment = mockShipment(fixtures.shipments.domestic); // US to US
        const vm = buildCooViewModel(shipment, shipment.lineItems);

        expect(vm.metadata.title).toBe("CERTIFICATE OF ORIGIN");
        expect(vm.coo.primaryOrigin).toBe('US');
        expect(vm.coo.exporterStatement).toBeDefined();
    });

    test('buildDgDeclarationViewModel filters only DG items', () => {
        const shipment = mockShipment(fixtures.shipments.dangerousGoods);
        // Add a non-DG item to verify filtering
        const mixedLines = [
            ...shipment.lineItems,
            { ...fixtures.items.widget, isDangerousGoods: false }
        ];

        const vm = buildDgDeclarationViewModel(shipment, mixedLines);

        expect(vm.metadata.title).toBe("DANGEROUS GOODS DECLARATION");
        expect(vm.lines).toHaveLength(1); // Only the chemical, not the widget
        expect(vm.lines[0].unNumber).toBe('UN1263');
        expect(vm.dg.emergencyContact).toBeDefined();
    });
});
