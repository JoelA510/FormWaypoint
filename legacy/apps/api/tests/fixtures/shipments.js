/**
 * Shipment Fixtures
 * 
 * Provides standard test data scenarios:
 * 1. Domestic Standard
 * 2. International (needs EEI)
 * 3. Dangerous Goods
 * 4. Invalid (for error testing)
 */

const parties = {
    usShipper: {
        name: 'Acme US Logistics',
        addressLine1: '123 Warehouse Rd',
        city: 'Dallas',
        stateOrProvince: 'TX',
        postalCode: '75001',
        countryCode: 'US',
        contactName: 'Shipping Manager',
        email: 'shipping@acme.us',
        isAddressBookEntry: true
    },
    usConsignee: {
        name: 'US Retailer Inc',
        addressLine1: '456 Market St',
        city: 'Chicago',
        stateOrProvince: 'IL',
        postalCode: '60601',
        countryCode: 'US',
        isAddressBookEntry: true
    },
    deConsignee: {
        name: 'Berlin Handel GmbH',
        addressLine1: 'Hauptstr 10',
        city: 'Berlin',
        postalCode: '10115',
        countryCode: 'DE',
        taxIdOrEori: 'DE123456789',
        isAddressBookEntry: true
    },
    caConsignee: {
        name: 'Maple Imports Ltd',
        addressLine1: '789 Queen St',
        city: 'Toronto',
        stateOrProvince: 'ON',
        postalCode: 'M5V 2A2',
        countryCode: 'CA',
        isAddressBookEntry: true
    }
};

const items = {
    widget: {
        description: 'Standard Widget',
        quantity: 100,
        uom: 'PCS',
        unitValue: 10.00,
        extendedValue: 1000.00,
        netWeightKg: 50,
        grossWeightKg: 55,
        htsCode: '8501.10.0000',
        countryOfOrigin: 'US'
    },
    highValueMachine: {
        description: 'Precision Cutter',
        quantity: 1,
        uom: 'SET',
        unitValue: 5000.00,
        extendedValue: 5000.00,
        netWeightKg: 200,
        grossWeightKg: 220,
        htsCode: '8466.10.0000',
        countryOfOrigin: 'US',
        eccn: 'EAR99'
    },
    chemical: {
        description: 'Cleaning Solvent (Flammable)',
        quantity: 50,
        uom: 'L',
        unitValue: 20.00,
        extendedValue: 1000.00,
        netWeightKg: 45,
        grossWeightKg: 50,
        htsCode: '3814.00.0000',
        countryOfOrigin: 'US',
        isDangerousGoods: true,
        dgUnNumber: 'UN1263',
        dgHazardClass: '3',
        dgPackingGroup: 'II'
    }
};

const shipments = {
    domestic: {
        shipper: parties.usShipper,
        consignee: parties.usConsignee,
        incoterm: 'DDP',
        currency: 'USD',
        totalCustomsValue: 1000.00,
        totalWeightKg: 55,
        numPackages: 10,
        originCountry: 'US',
        destinationCountry: 'US',
        lineItems: [items.widget]
    },
    internationalEEI: {
        shipper: parties.usShipper,
        consignee: parties.deConsignee,
        incoterm: 'CIP',
        currency: 'USD',
        totalCustomsValue: 5000.00,
        totalWeightKg: 220,
        numPackages: 1,
        originCountry: 'US',
        destinationCountry: 'DE',
        lineItems: [items.highValueMachine],
        aesRequired: true,
        // Intentionally missing AesITN to test validation warnings if needed, 
        // or add it to verify valid state.
        aesItn: null
    },
    dangerousGoods: {
        shipper: parties.usShipper,
        consignee: parties.caConsignee,
        incoterm: 'FCA',
        currency: 'USD',
        totalCustomsValue: 1000.00,
        totalWeightKg: 50,
        numPackages: 5,
        originCountry: 'US',
        destinationCountry: 'CA',
        lineItems: [items.chemical],
        hasDangerousGoods: true
    },
    invalid: {
        shipper: parties.usShipper,
        consignee: parties.deConsignee,
        incoterm: 'INVALID_TERM', // Error
        currency: 'USD',
        totalCustomsValue: 0, // Warning
        totalWeightKg: 100,
        numPackages: 1,
        originCountry: 'US',
        destinationCountry: 'DE',
        lineItems: [{
            description: 'Mystery Item',
            quantity: 10,
            uom: 'PCS',
            unitValue: 0,
            extendedValue: 0,
            netWeightKg: 0,
            htsCode: '0000.00.0000', // Likely not found
            countryOfOrigin: 'XX'
        }]
    }
};

module.exports = {
    parties,
    items,
    shipments
};
