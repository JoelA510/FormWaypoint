const logger = require('../../utils/logger');

/**
 * Service for 3D Bin Packing Optimization.
 * Implements a heuristic approach (First Fit Decreasing) to pack items into containers.
 * Assumes rectangular boxes.
 */
class BinPackingService {
    constructor() { }

    /**
     * Packs items into the available bins.
     * @param {Array<{id: string, width: number, height: number, depth: number, weight: number}>} items 
     * @param {Array<{id: string, width: number, height: number, depth: number, maxWeight: number}>} bins 
     */
    pack(items, bins) {
        // robust sort: Volume desc
        const sortedItems = [...items].sort((a, b) => (b.width * b.height * b.depth) - (a.width * a.height * a.depth));
        const sortedBins = [...bins].sort((a, b) => (a.width * a.height * a.depth) - (b.width * b.height * b.depth));

        const packedBins = [];

        // Initialize bins as empty
        // We clone bins because we might use multiple of the same type in a real scenario, 
        // but here we pack into finite supplied bins.
        let currentBinInstances = sortedBins.map(b => ({
            ...b,
            packedItems: [],
            currentWeight: 0,
            spaces: [{ x: 0, y: 0, z: 0, w: b.width, h: b.height, d: b.depth }]
        }));

        for (const item of sortedItems) {
            let placed = false;

            for (const bin of currentBinInstances) {
                if (bin.currentWeight + item.weight > bin.maxWeight) continue;

                // Try to fit in one of the free spaces
                // We prioritize smaller spaces that fit (Best Fit) or just first found?
                // Let's go with First Fit on spaces.
                for (let i = 0; i < bin.spaces.length; i++) {
                    const space = bin.spaces[i];

                    // Rotation logic could go here (try 6 rotations). 
                    // For MVP, we stick to default orientation.
                    if (item.width <= space.w && item.height <= space.h && item.depth <= space.d) {

                        // Place item
                        bin.packedItems.push({
                            item: item,
                            x: space.x,
                            y: space.y,
                            z: space.z
                        });
                        bin.currentWeight += item.weight;
                        placed = true;

                        // Remove used space and split remaining space into 3 new spaces
                        // We split along width, then height, then depth (or variation)
                        // Space 1: Right of item
                        // Space 2: Above item
                        // Space 3: In front of item

                        // New Spaces based on the placement in the current space
                        const newSpaces = [];

                        // Right space
                        if (space.w - item.width > 0) {
                            newSpaces.push({
                                x: space.x + item.width,
                                y: space.y,
                                z: space.z,
                                w: space.w - item.width,
                                h: space.h,
                                d: space.d
                            });
                        }

                        // Top space (restricted to item width)
                        if (space.h - item.height > 0) {
                            newSpaces.push({
                                x: space.x,
                                y: space.y + item.height,
                                z: space.z,
                                w: item.width,
                                h: space.h - item.height,
                                d: space.d
                            });
                        }

                        // Front space (restricted to item width and height)
                        if (space.d - item.depth > 0) {
                            newSpaces.push({
                                x: space.x,
                                y: space.y,
                                z: space.z + item.depth,
                                w: item.width,
                                h: item.height,
                                d: space.d - item.depth
                            });
                        }

                        // Remove used space and add new ones
                        bin.spaces.splice(i, 1, ...newSpaces);
                        // We need to merge adjacent spaces or sort them for efficiency, but MVP skips complex cleanups
                        break;
                    }
                }
                if (placed) break;
            }

            if (!placed) {
                logger.warn(`Could not fit item ${item.id} into any available bin.`);
            }
        }

        return currentBinInstances.filter(b => b.packedItems.length > 0);
    }
}

module.exports = BinPackingService;
