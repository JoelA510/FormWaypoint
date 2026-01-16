/**
 * Error Catalog for Compliance Validation
 */
const ErrorCatalog = {
    // HTS Codes
    HTS_REQUIRED: {
        code: 'HTS_REQUIRED',
        severity: 'error',
        message: 'HTS code is required',
        suggestion: 'Please provide a valid HTS code for this item.'
    },
    HTS_INVALID_FORMAT: {
        code: 'HTS_INVALID_FORMAT',
        severity: 'warning',
        message: 'HTS code must be 6 to 10 digits',
        suggestion: 'Check the HTS code format.'
    },
    HTS_UNKNOWN: {
        code: 'HTS_UNKNOWN',
        severity: 'warning',
        message: 'HTS code not found in standard list',
        suggestion: 'Verify the HTS code against the official schedule.'
    },

    // Country of Origin
    COO_REQUIRED: {
        code: 'COO_REQUIRED',
        severity: 'error',
        message: 'Country of Origin is required',
        suggestion: 'Please specify the country where this item was manufactured.'
    },
    COO_INVALID_FORMAT: {
        code: 'COO_INVALID_FORMAT',
        severity: 'error',
        message: 'Country code must be 2 letters',
        suggestion: 'Use a 2-letter ISO code (e.g., US, CN, MX).'
    },
    COO_UNKNOWN: {
        code: 'COO_UNKNOWN',
        severity: 'warning',
        message: 'Country code not recognized',
        suggestion: 'Verify this is a valid ISO 3166-1 alpha-2 code.'
    },
    COO_INVALID: {
        code: 'COO_INVALID',
        severity: 'error',
        message: 'Country of Origin must be a valid 2-letter ISO code',
        suggestion: 'Use a valid ISO 3166-1 alpha-2 code (e.g., US, CN).'
    },

    // Weight
    WEIGHT_REQUIRED: {
        code: 'WEIGHT_REQUIRED',
        severity: 'error',
        message: 'Net weight is required',
        suggestion: 'Please provide the weight for this item.'
    },
    WEIGHT_INVALID: {
        code: 'WEIGHT_INVALID',
        severity: 'error',
        message: 'Weight must be a positive number',
        suggestion: 'Enter a valid weight value greater than 0.'
    },
    WEIGHT_UNREASONABLE: {
        code: 'WEIGHT_UNREASONABLE',
        severity: 'warning',
        message: 'Weight seems unusually high (> 100,000 lbs)',
        suggestion: 'Please verify the weight value is correct.'
    },
    WEIGHT_UNIT_INVALID: {
        code: 'WEIGHT_UNIT_INVALID',
        severity: 'warning',
        message: 'Weight unit not recognized',
        suggestion: 'Use KG, LB, G, or OZ.'
    },

    // Value
    VALUE_REQUIRED: {
        code: 'VALUE_REQUIRED',
        severity: 'error',
        message: 'Value is required',
        suggestion: 'Please provide the declared value for this item.'
    },
    VALUE_INVALID: {
        code: 'VALUE_INVALID',
        severity: 'error',
        message: 'Value must be a positive number',
        suggestion: 'Enter a valid monetary value greater than 0.'
    },
    VALUE_UNREASONABLE: {
        code: 'VALUE_UNREASONABLE',
        severity: 'warning',
        message: 'Value seems unusually high (> $10M per line)',
        suggestion: 'Please verify the value is correct.'
    },
    CURRENCY_INVALID: {
        code: 'CURRENCY_INVALID',
        severity: 'warning',
        message: 'Currency code not recognized',
        suggestion: 'Use USD, EUR, GBP, CNY, JPY, CAD, or MXN.'
    },

    // Description
    DESCRIPTION_REQUIRED: {
        code: 'DESCRIPTION_REQUIRED',
        severity: 'error',
        message: 'Description is required',
        suggestion: 'Please provide a description of this item.'
    },
    DESCRIPTION_TOO_SHORT: {
        code: 'DESCRIPTION_TOO_SHORT',
        severity: 'warning',
        message: 'Description is too short',
        suggestion: 'Provide a more detailed description (at least 3 characters).'
    },

    // Dates
    DATE_INVALID: {
        code: 'DATE_INVALID',
        severity: 'error',
        message: 'Invalid date format',
        suggestion: 'Use a valid date format (e.g., YYYY-MM-DD).'
    },
    DATE_UNREASONABLE: {
        code: 'DATE_UNREASONABLE',
        severity: 'warning',
        message: 'Date is more than 1 year in the past or future',
        suggestion: 'Verify the shipment date is correct.'
    }
};

module.exports = {
    ErrorCatalog
};
