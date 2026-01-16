const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const HTS_CODES = [
    { code: '8517.62.0050', description: 'Machines for the reception, conversion and transmission or regeneration of voice, images or other data' },
    { code: '8471.30.0100', description: 'Portable automatic data processing machines, weighing not more than 10 kg, consisting of at least a central processing unit, a keyboard and a display' },
    { code: '8471.41.0150', description: 'Other automatic data processing machines: Comprising in the same housing at least a central processing unit and an input and output unit' },
    { code: '8544.42.0000', description: 'Insulated (including enameled or anodized) wire, cable (including coaxial cable) and other insulated electric conductors, fitted with connectors' },
];

const fixtures = require('../tests/fixtures/shipments');

async function main() {
    console.log('Start seeding ...');

    // 0. Ensure System User Exists
    const systemUser = await prisma.user.upsert({
        where: { username: 'system-seed' },
        update: {},
        create: {
            id: 'system-seed',
            username: 'system-seed',
            password: 'hashed-password-placeholder', // In real app, use bcrypt
            role: 'admin'
        }
    });
    console.log('Ensured System User exists');

    // 1. Seed Reference Data
    for (const hts of HTS_CODES) {
        await prisma.htsCode.upsert({
            where: { code: hts.code },
            update: {},
            create: hts,
        });
    }
    console.log('Seeded HTS Codes');

    // 2. Seed Parties
    const partyMap = {};
    for (const [key, data] of Object.entries(fixtures.parties)) {
        const party = await prisma.party.create({
            data: {
                ...data,
                // Ensure unique tax ID if present to avoid unique constraint if we added one (we didn't yet, but good practice)
                createdByUserId: 'system-seed'
            }
        });
        partyMap[key] = party;
        console.log(`Created Party: ${data.name}`);
    }

    // 3. Seed Shipments
    // Helper to map fixture party keys to real IDs and create snapshots
    const createShipmentFromFixture = async (fixtureData) => {
        // We know fixture has 'shipper', 'consignee', etc. as objects from fixtures.parties
        // We need to map them to the IDs we just created.

        // Reverse lookup or just use the objects if we passed them directly?
        // The fixture file exports actual objects. We need to find the ID corresponding to that object.
        // Let's rely on name matching for simplicity in this seed script or rebuild the fixture usage.

        // Easier approach: The fixture objects are references. 
        // We can find the key in `fixtures.parties` that matches the object in `fixtureData.shipper`
        const findPartyId = (fixtureParty) => {
            const entry = Object.entries(fixtures.parties).find(([k, v]) => v === fixtureParty);
            return entry ? partyMap[entry[0]].id : null;
        };

        const shipperId = findPartyId(fixtureData.shipper);
        const consigneeId = findPartyId(fixtureData.consignee);

        if (!shipperId || !consigneeId) {
            console.warn('Skipping shipment seed due to missing party map');
            return;
        }

        const snapshot = (p) => JSON.stringify(p);

        await prisma.shipment.create({
            data: {
                ...fixtureData,
                shipper: undefined, // remove object
                consignee: undefined, // remove object
                lineItems: {
                    create: fixtureData.lineItems
                },
                shipperId,
                consigneeId,
                createdByUserId: 'system-seed',
                shipperSnapshot: snapshot(fixtureData.shipper),
                consigneeSnapshot: snapshot(fixtureData.consignee)
            }
        });
    };

    await createShipmentFromFixture(fixtures.shipments.domestic);
    console.log('Seeded Domestic Shipment');

    await createShipmentFromFixture(fixtures.shipments.internationalEEI);
    console.log('Seeded Intl EEI Shipment');

    await createShipmentFromFixture(fixtures.shipments.dangerousGoods);
    console.log('Seeded DG Shipment');

    // Invalid one might fail validation if we ran it, but DB insert should be fine (schema is loose)
    await createShipmentFromFixture(fixtures.shipments.invalid);
    console.log('Seeded Invalid Shipment');

    // 4. Seed Forwarder Profile (Epic 15)
    await prisma.forwarderProfile.create({
        data: {
            userId: 'system-seed',
            name: 'Global Freight Logistics',
            emailToJson: JSON.stringify(['bookings@globalfreight.com']),
            emailCcJson: JSON.stringify(['ops@globalfreight.com']),
            emailSubjectTemplate: 'Booking Request: {{shipment.id}} - {{shipper.name}} -> {{consignee.name}}',
            emailBodyTemplate: `Dear Team,

Please find attached the booking request for the following shipment:

Ref: {{shipment.id}}
Ready Date: {{date}}
Pieces: {{summary.lineItemCount}}
Weight: {{summary.totalWeightPkg}} kg
Value: {{summary.totalValueUsd}} USD

Shipper: {{shipper.name}}
Consignee: {{consignee.name}}

Please confirm receipt.

Best regards,
Shipping Team`,
            dataBundleFormat: 'CSV',
            attachmentTypesJson: JSON.stringify(['SLI', 'Commercial Invoice'])
        }
    });
    console.log('Seeded Forwarder Profile');

    // 5. Seed ERP Export Configs (Epic 16)
    await prisma.erpExportConfig.create({
        data: {
            userId: 'system-seed',
            name: 'Daily JDE CSV Export',
            targetType: 'FILE',
            format: 'CSV',
            destination: '/exports/jde/shipments_{{date}}.csv',
            schedule: 'MANUAL'
        }
    });

    await prisma.erpExportConfig.create({
        data: {
            userId: 'system-seed',
            name: 'SAP Webhook Sync',
            targetType: 'HTTP',
            format: 'JSON',
            destination: 'https://api.sap-mock.com/v1/shipments',
            schedule: 'MANUAL',
            httpMethod: 'POST'
        }
    });
    console.log('Seeded ERP Export Configs');

    // 6. Seed DG References (Epic 17)
    await prisma.dgUnReference.createMany({
        data: [
            { unNumber: 'UN3481', properShippingName: 'Lithium ion batteries contained in equipment', hazardClass: '9', packingGroup: 'II' },
            { unNumber: 'UN1263', properShippingName: 'Paint related material', hazardClass: '3', packingGroup: 'II' },
            { unNumber: 'UN1950', properShippingName: 'Aerosols', hazardClass: '2.1', packingGroup: '' },
            { unNumber: 'UN1866', properShippingName: 'Resin solution', hazardClass: '3', packingGroup: 'III' }
        ]
    });
    console.log('Seeded DG References');

    console.log('Seeding finished.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
