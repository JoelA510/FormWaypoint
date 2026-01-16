const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../../utils/logger');

class KittingService {
    /**
     * Assembles a parent item from its bill of materials.
     * Deducts child inventory, increases parent inventory.
     * @param {string} parentItemId - The ID of the item to assemble.
     * @param {number} quantity - How many units to assemble.
     * @param {string} warehouseId - Where the assembly takes place.
     */
    async assemble(parentItemId, quantity, warehouseId) {
        return await prisma.$transaction(async (tx) => {
            // 1. Get BOM
            const bom = await tx.billOfMaterials.findMany({
                where: { parentItemId },
                include: { childItem: true }
            });

            if (bom.length === 0) {
                throw new Error(`No BOM defined for item ${parentItemId}`);
            }

            // 2. Check and Deduct Child Inventory
            for (const entry of bom) {
                const requiredQty = entry.quantity * quantity;

                // This assumes a simple 'quantityOnHand' on the Item model for now, 
                // as per Phase 5 changes. In a real WMS this would be checking specific bins logic.
                const child = await tx.item.findUnique({ where: { id: entry.childItemId } });

                if (child.quantityOnHand < requiredQty) {
                    throw new Error(`Insufficient inventory for child item ${child.sku}. Required: ${requiredQty}, Available: ${child.quantityOnHand}`);
                }

                await tx.item.update({
                    where: { id: entry.childItemId },
                    data: { quantityOnHand: { decrement: requiredQty } }
                });
            }

            // 3. Increment Parent Inventory
            const result = await tx.item.update({
                where: { id: parentItemId },
                data: { quantityOnHand: { increment: quantity } }
            });

            logger.info(`Assembled ${quantity} units of ${parentItemId} at warehouse ${warehouseId}`);
            return result;
        });
    }
}

module.exports = KittingService;
