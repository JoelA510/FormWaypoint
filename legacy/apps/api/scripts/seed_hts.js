// Set DATABASE_URL to dev.db
process.env.DATABASE_URL = 'file:./dev.db';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Sample HTS codes for common electronics and widgets
const htsCodes = [
    { code: '8471.30.0100', description: 'Portable automatic data processing machines, weighing not more than 10 kg', unit: 'Number' },
    { code: '8471.41.0100', description: 'Automatic data processing machines; comprising in the same housing at least a central processing unit, and one input unit and one output unit', unit: 'Number' },
    { code: '8471.50.0100', description: 'Processing units other than those of subheading 8471.41 or 8471.49', unit: 'Number' },
    { code: '8471.60.9050', description: 'Input or output units for automatic data processing machines', unit: 'Number' },
    { code: '8471.70.4000', description: 'Storage units for automatic data processing machines', unit: 'Number' },
    { code: '8517.62.0050', description: 'Machines for the reception, conversion and transmission or regeneration of voice, images or other data', unit: 'Number' },
    { code: '8528.72.6400', description: 'Reception apparatus for television, color, LCD', unit: 'Number' },
    { code: '8536.69.4000', description: 'Electrical plugs and sockets', unit: 'Number' },
    { code: '3926.90.9880', description: 'Other articles of plastics and articles of other materials of headings 3901 to 3914', unit: 'Kilograms' },
    { code: '7326.90.8688', description: 'Other articles of iron or steel', unit: 'Kilograms' },
    { code: '8473.30.5100', description: 'Parts and accessories of the machines of heading 8471', unit: 'Number' },
    { code: '8504.40.9550', description: 'Static converters (power supplies)', unit: 'Number' },
    { code: '9032.89.6085', description: 'Automatic regulating or controlling instruments and apparatus', unit: 'Number' },
    { code: '8529.90.9300', description: 'Parts suitable for use solely or principally with the apparatus of headings 8525 to 8528', unit: 'Number' },
];

async function seed() {
    console.log('Seeding HTS codes...');

    for (const hts of htsCodes) {
        await prisma.htsCode.upsert({
            where: { code: hts.code },
            update: hts,
            create: hts
        });
    }

    console.log(`Seeded ${htsCodes.length} HTS codes`);
}

seed()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
