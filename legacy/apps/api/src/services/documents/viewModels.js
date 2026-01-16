/**
 * Formats a ShipmentV1 object into a view model suitable for Handlebars templates.
 * 
 * @param {Object} shipment ShipmentV1
 * @param {Object[]} lineItems ShipmentLineItemV1[]
 * @returns {Object} invoiceViewModel
 */
function buildInvoiceViewModel(shipment, lineItems) {
    const formatDate = (date) => date ? new Date(date).toLocaleDateString() : '';

    // Parse snapshots if they exist, otherwise fallback to top-level or null
    const parseParty = (snapshot, id) => {
        if (snapshot) {
            try { return typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot; }
            catch (e) { console.error('Error parsing party snapshot', e); }
        }
        return { id }; // Fallback
    };

    const shipper = parseParty(shipment.shipperSnapshot, shipment.shipperId);
    const consignee = parseParty(shipment.consigneeSnapshot, shipment.consigneeId);
    const forwarder = parseParty(shipment.forwarderSnapshot, shipment.forwarderId);

    // Calculate totals if not present (logic can be shared with validation)
    const subTotal = lineItems.reduce((sum, line) => sum + (line.extendedValue || 0), 0);
    const totalWeight = lineItems.reduce((sum, line) => sum + (line.netWeightKg || 0), 0);
    const totalQty = lineItems.reduce((sum, line) => sum + (line.quantity || 0), 0);

    return {
        metadata: {
            title: 'COMMERCIAL INVOICE',
            dateGenerated: new Date().toLocaleDateString(),
            documentNumber: `INV-${shipment.id.slice(0, 8).toUpperCase()}`
        },
        shipment: {
            id: shipment.id,
            erpOrderId: shipment.erpOrderId || 'N/A',
            incoterm: shipment.incoterm,
            currency: shipment.currency,
            origin: shipment.originCountry,
            destination: shipment.destinationCountry,
            date: formatDate(shipment.createdAt),
            references: [] // TODO: Map references if available
        },
        parties: {
            shipper,
            consignee,
            isForwarderSameAsConsignee: !forwarder, // Logic simplification
            forwarder
        },
        lines: lineItems.map(line => ({
            description: line.description,
            quantity: line.quantity,
            uom: 'EA', // TODO: Make dynamic
            unitValue: (line.unitValue || 0).toFixed(2),
            extendedValue: (line.extendedValue || 0).toFixed(2),
            weight: (line.netWeightKg || 0).toFixed(2),
            hts: line.htsCode || '',
            coo: line.countryOfOrigin || ''
        })),
        totals: {
            subTotal: subTotal.toFixed(2),
            totalWeight: totalWeight.toFixed(2),
            totalPackages: shipment.numPackages || 0,
            quantity: totalQty
        }
    };
}

/**
 * Formats a ShipmentV1 object for Packing List.
 */
function buildPackingListViewModel(shipment, lineItems) {
    const invoiceVM = buildInvoiceViewModel(shipment, lineItems);

    // Override title and potentially remove value columns
    return {
        ...invoiceVM,
        metadata: {
            ...invoiceVM.metadata,
            title: 'PACKING LIST',
            documentNumber: `PL-${shipment.id.slice(0, 8).toUpperCase()}`
        },
        // Packing list specific logic could go here (e.g. grouping by package)
    };
}

/**
 * Formats a ShipmentV1 object for Proforma Invoice.
 * Focused on quoted values, often identical to Commercial Invoice but with different label.
 */
function buildProformaInvoiceViewModel(shipment, lineItems) {
    const invoiceVM = buildInvoiceViewModel(shipment, lineItems);
    return {
        ...invoiceVM,
        metadata: {
            ...invoiceVM.metadata,
            title: 'PROFORMA INVOICE',
            documentNumber: `PRO-${shipment.id.slice(0, 8).toUpperCase()}`
        }
    };
}

/**
 * Formats a ShipmentV1 object for Shipper's Letter of Instruction (SLI).
 * Needs instructions, parties, and EEI/AES info.
 */
function buildSliViewModel(shipment, lineItems) {
    const invoiceVM = buildInvoiceViewModel(shipment, lineItems);

    // SLI specific logic
    const isRouted = 'N'; // logic placeholder
    const partiesToDeclare = 'N'; // logic placeholder for related parties

    return {
        ...invoiceVM,
        metadata: {
            ...invoiceVM.metadata,
            title: "SHIPPER'S LETTER OF INSTRUCTION",
            documentNumber: `SLI-${shipment.id.slice(0, 8).toUpperCase()}`
        },
        sli: {
            instructions: "Please route via best available carrier.",
            isRouted,
            partiesToDeclare,
            eccn: lineItems.some(l => l.eccn) ? "Contains EAR99 items" : "No License Required",
            aes: {
                required: shipment.aesRequired,
                itn: shipment.aesItn || "Pending",
                exemption: shipment.eeiExemptionCode
            }
        }
    };
}

/**
 * Formats for Certificate of Origin.
 * Emphasizes Country of Origin per line.
 */
function buildCooViewModel(shipment, lineItems) {
    const invoiceVM = buildInvoiceViewModel(shipment, lineItems);

    // Group lines by origin? For generic COO, listing all lines is fine.
    // We might want to deduplicate origins for the "main" origin statement.
    const uniqueOrigins = [...new Set(lineItems.map(l => l.countryOfOrigin).filter(Boolean))];

    return {
        ...invoiceVM,
        metadata: {
            ...invoiceVM.metadata,
            title: "CERTIFICATE OF ORIGIN",
            documentNumber: `COO-${shipment.id.slice(0, 8).toUpperCase()}`
        },
        coo: {
            primaryOrigin: uniqueOrigins.join(', ') || 'Unknown',
            exporterStatement: "The undersigned hereby declares that the above details and statements are correct; that all the goods were produced in the country(ies) listed."
        }
    };
}

/**
 * Formats for Dangerous Goods Declaration.
 * ONLY includes DG lines.
 */
function buildDgDeclarationViewModel(shipment, lineItems) {
    const invoiceVM = buildInvoiceViewModel(shipment, lineItems);

    // Filter only DG lines
    const dgLines = lineItems.filter(l => l.isDangerousGoods);

    return {
        ...invoiceVM,
        lines: dgLines.map(line => ({
            ...invoiceVM.lines.find(l => l.description === line.description), // fallback mapping
            unNumber: line.dgUnNumber,
            hazardClass: line.dgHazardClass,
            packingGroup: line.dgPackingGroup,
            properShippingName: line.description // simplistic mapping
        })),
        metadata: {
            ...invoiceVM.metadata,
            title: "DANGEROUS GOODS DECLARATION",
            documentNumber: `DGD-${shipment.id.slice(0, 8).toUpperCase()}`
        },
        dg: {
            emergencyContact: "CHEMTREC 1-800-424-9300", // Placeholder default
            declaration: "I hereby declare that the contents of this consignment are fully and accurately described above by the proper shipping name, and are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport according to applicable international and national governmental regulations."
        }
    };
}

module.exports = {
    buildInvoiceViewModel,
    buildPackingListViewModel,
    buildProformaInvoiceViewModel,
    buildSliViewModel,
    buildCooViewModel,
    buildDgDeclarationViewModel
};
