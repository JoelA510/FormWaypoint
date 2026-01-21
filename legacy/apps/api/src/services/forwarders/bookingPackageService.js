const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // In a real app, reuse the client instance
const fs = require('fs'); // For templates or loading assets later
const { compileSafeTemplate, renderSafeTemplate } = require('../../utils/templateSecurity');

/**
 * Service to generate booking packages for freight forwarders.
 */
class BookingPackageService {

    /**
     * Builds the view model required for templates and data bundles.
     * @param {string} shipmentId 
     */
    async buildViewModel(shipmentId) {
        const shipment = await prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: { lineItems: true } // Add other relations if needed
        });

        if (!shipment) throw new Error(`Shipment not found: ${shipmentId}`);

        // Enrich or format data here
        const totalWeight = shipment.lineItems.reduce((sum, item) => sum + (item.netWeightKg || 0), 0);
        const totalValue = shipment.lineItems.reduce((sum, item) => sum + (item.unitValue || 0) * (item.quantity || 0), 0);

        // Fetch Parties manually if stored as JSON snapshots or separate tables
        // For Phase 2/3, we likely have JSON snapshots in the shipment or relations
        // Assuming JSON snapshots for simplicity based on prior Context
        const shipper = shipment.shipperSnapshot ? JSON.parse(shipment.shipperSnapshot) : {};
        const consignee = shipment.consigneeSnapshot ? JSON.parse(shipment.consigneeSnapshot) : {};

        return {
            shipment,
            shipper,
            consignee,
            lineItems: shipment.lineItems,
            summary: {
                totalWeightPkg: totalWeight.toFixed(2),
                totalValueUsd: totalValue.toFixed(2),
                lineItemCount: shipment.lineItems.length
            },
            date: new Date().toLocaleDateString()
        };
    }

    /**
     * Renders the email subject and body using the profile's templates.
     * @param {object} profile ForwarderProfile
     * @param {object} viewModel Data from buildViewModel
     */
    renderEmail(profile, viewModel) {
        // Simple mustache-style replacement or use Handlebars
        const compile = (template, data) => {
            if (!template) return '';
            const compiled = compileSafeTemplate(template);
            return renderSafeTemplate(compiled, data);
        };

        return {
            subject: compile(profile.emailSubjectTemplate, viewModel),
            body: compile(profile.emailBodyTemplate, viewModel),
            to: JSON.parse(profile.emailToJson || '[]'),
            cc: JSON.parse(profile.emailCcJson || '[]')
        };
    }

    /**
     * Generates a CSV bundle of line items.
     * @param {object} viewModel 
     */
    generateCsvBundle(viewModel) {
        const { lineItems } = viewModel;
        const header = 'Description,Quantity,Weight(kg),Value(USD),HTS Code,Origin\n';
        const rows = lineItems.map(item => {
            return [
                `"${item.description || ''}"`,
                item.quantity || 0,
                item.netWeightKg || 0,
                item.unitValue || 0,
                item.htsCode || '',
                item.countryOfOrigin || ''
            ].join(',');
        });
        return header + rows.join('\n');
    }

    /**
     * Generates a JSON bundle.
     * @param {object} viewModel 
     */
    generateJsonBundle(viewModel) {
        // Return a simplified clean version for B2B ingest
        return JSON.stringify({
            ref: viewModel.shipment.id,
            parties: {
                shipper: viewModel.shipper,
                consignee: viewModel.consignee
            },
            params: viewModel.summary,
            lines: viewModel.lineItems
        }, null, 2);
    }
}

module.exports = new BookingPackageService();
