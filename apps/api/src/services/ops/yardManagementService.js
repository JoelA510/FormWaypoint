const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');

class YardManagementService {

    async checkInTrailer(trailerNumber, carrier) {
        const entry = await prisma.yardEntry.create({
            data: {
                trailerNumber,
                carrier,
                status: 'CHECKED_IN',
                checkInTime: new Date()
            }
        });
        logger.info(`Trailer ${trailerNumber} checked in.`);
        return entry;
    }

    async assignDock(entryId, dockLocation) {
        const entry = await prisma.yardEntry.update({
            where: { id: entryId },
            data: {
                status: 'AT_DOCK',
                dockLocation
            }
        });
        logger.info(`Trailer ${entry.trailerNumber} assigned to dock ${dockLocation}.`);
        return entry;
    }

    async checkOutTrailer(entryId) {
        const entry = await prisma.yardEntry.update({
            where: { id: entryId },
            data: {
                status: 'CHECKED_OUT',
                dockLocation: null,
                checkOutTime: new Date()
            }
        });
        logger.info(`Trailer ${entry.trailerNumber} checked out.`);
        return entry;
    }

    async getOccupiedDocks() {
        return await prisma.yardEntry.findMany({
            where: { status: 'AT_DOCK' }
        });
    }
}

module.exports = YardManagementService;
