const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');

class DockSchedulingService {

    /**
     * Retrieves available slots for a specific door and date range.
     */
    async getAvailability(doorId, dateStr) {
        // 1. Get existing appointments
        const startOfDay = new Date(dateStr);
        const endOfDay = new Date(dateStr);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const appointments = await prisma.dockAppointment.findMany({
            where: {
                doorId,
                startTime: {
                    gte: startOfDay,
                    lt: endOfDay
                },
                status: { not: 'CANCELLED' }
            }
        });

        // 2. Generate time slots (e.g., hourly) and check overlap
        // ... Logic omitted for MVP brevity ...

        return {
            doorId,
            date: dateStr,
            appointments // Return raw list for frontend to render visual calendar
        };
    }

    /**
     * Books a slot.
     */
    async bookSlot(doorId, startTime, endTime, carrierName, shipmentId = null) {
        // Check overlaps
        const overlap = await prisma.dockAppointment.findFirst({
            where: {
                doorId,
                status: { not: 'CANCELLED' },
                OR: [
                    { startTime: { lt: endTime, gte: startTime } },
                    { endTime: { gt: startTime, lte: endTime } }
                ]
            }
        });

        if (overlap) {
            throw new Error('Slot overlap detected. Please choose another time.');
        }

        const appointment = await prisma.dockAppointment.create({
            data: {
                doorId,
                startTime,
                endTime,
                carrierName,
                shipmentId,
                status: 'SCHEDULED'
            }
        });

        logger.info(`Dock appointment booked: ${appointment.id} for ${carrierName}`);
        return appointment;
    }
}

module.exports = DockSchedulingService;
