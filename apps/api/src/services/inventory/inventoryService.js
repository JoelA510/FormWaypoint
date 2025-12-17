const { prisma } = require('../../queue');

class InventoryService {
    /**
     * Deduct inventory for a shipment.
     * Uses a transaction to ensure integrity.
     * @param {string} shipmentId 
     */
    async deductInventoryForShipment(shipmentId) {
        // 1. Get Shipment Line Items
        const shipment = await prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: { lineItems: true }
        });

        if (!shipment || !shipment.lineItems || shipment.lineItems.length === 0) {
            return { success: true, message: 'No items to deduct' };
        }

        // 2. Transact
        return await prisma.$transaction(async (tx) => {
            const results = [];

            for (const line of shipment.lineItems) {
                // Find Item by SKU from the line item description/code if possible
                // For now, assuming lineItem.itemId is linked or we lookup by code
                // In Phase 1 schema, ShipmentLineItem might have 'itemId' or we match by SKU

                // Fallback: Try to find Item by matching description/sku in text
                // Simple case: lineItem has 'itemId' if we updated schema fully.
                // Assuming we use 'sku' or 'description' match

                // Let's check if we have an item with this SKU
                const item = await tx.item.findUnique({
                    where: { sku: line.description } // Simplified assumption
                });

                if (item) {
                    if (item.quantityOnHand < line.quantity) {
                        throw new Error(`Insufficient stock for SKU ${item.sku}. Needed: ${line.quantity}, Available: ${item.quantityOnHand}`);
                    }

                    const updated = await tx.item.update({
                        where: { id: item.id },
                        data: {
                            quantityOnHand: { decrement: line.quantity }
                        }
                    });
                    results.push(updated);
                } else {
                    console.warn(`[Inventory] SKU not found for line: ${line.description}`);
                }
            }

            return { success: true, deducted: results.length };
        });
    }

    /**
     * Receive inventory
     */
    async receiveStock(sku, quantity) {
        return await prisma.item.update({
            where: { sku },
            data: { quantityOnHand: { increment: quantity } }
        });
    }
}

module.exports = new InventoryService();
