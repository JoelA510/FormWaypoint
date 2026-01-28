
import { Prisma, CarrierAccount, prisma } from '@repo/schema';



// Mock Rate Response Type
interface Rate {
    carrierId: string;
    provider: string;
    description: string;
    amount: number;
    currency: string;
    serviceLevel: string;
    deliveryDays: number;
}

export class FreightService {

    // --- Carrier Accounts ---

    static async listCarrierAccounts(userId: string) {
        return await prisma.carrierAccount.findMany({
            where: { userId, isActive: true }
        });
    }

    static async connectCarrierAccount(data: Prisma.CarrierAccountCreateInput) {
        // In a real app, validate credentials with external API here
        return await prisma.carrierAccount.create({ data });
    }

    // --- Rate Shopping ---

    static async shopRates(shipmentId: string, userId: string): Promise<Rate[]> {
        const shipment = await prisma.shipment.findUniqueOrThrow({
            where: { id: shipmentId },
            include: { shipper: true, consignee: true }
        });

        const accounts = await this.listCarrierAccounts(userId);
        const rates: Rate[] = [];

        for (const account of accounts) {
            // Simplified Strategy Pattern
            if (account.provider === 'mock') {
                rates.push(...this.getMockRates(account, shipment));
            } else if (account.provider === 'fedex') {
                // calls external FedEx API (stubbed)
            }
        }

        // Save rates to Meta
        await prisma.shipmentCarrierMeta.upsert({
            where: { shipmentId },
            create: {
                shipmentId,
                rateQuoteJson: JSON.stringify(rates)
            },
            update: {
                rateQuoteJson: JSON.stringify(rates)
            }
        });

        return rates;
    }

    private static getMockRates(account: CarrierAccount, shipment: any): Rate[] {
        // Simple logic: Base rate + weight * multiplier
        const weight = shipment.totalWeight || 1;

        return [
            {
                carrierId: account.id,
                provider: 'mock',
                description: 'Mock Standard Ground',
                amount: 10 + (weight * 0.5),
                currency: 'USD',
                serviceLevel: 'GND',
                deliveryDays: 5
            },
            {
                carrierId: account.id,
                provider: 'mock',
                description: 'Mock Express Priority',
                amount: 30 + (weight * 1.2),
                currency: 'USD',
                serviceLevel: 'EXP',
                deliveryDays: 1
            }
        ];
    }
}
