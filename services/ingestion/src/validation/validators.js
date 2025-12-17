const { ErrorCatalog } = require('./catalog');

// Mock HTS list for prototype
const KNOWN_HTS_CODES = new Set(['847150', '902710', '851762', '853650', '731210']);

// Expanded Country list (ISO 3166-1 alpha-2)
const VALID_COUNTRIES = new Set([
    'US', 'CN', 'MX', 'CA', 'DE', 'JP', 'GB', 'FR', 'IT', 'ES',
    'BR', 'IN', 'AU', 'KR', 'TW', 'SG', 'MY', 'TH', 'VN', 'ID'
]);

function validateHts(code) {
    if (!code || code.trim() === '') {
        return ErrorCatalog.HTS_REQUIRED;
    }

    const cleanCode = String(code).replace(/\./g, '').trim();

    if (!/^\d{6,10}$/.test(cleanCode)) {
        return ErrorCatalog.HTS_INVALID_FORMAT;
    }

    if (!KNOWN_HTS_CODES.has(cleanCode.substring(0, 6))) {
        return ErrorCatalog.HTS_UNKNOWN;
    }

    return null;
}

function validateCoo(code) {
    if (!code || code.trim() === '') {
        return ErrorCatalog.COO_REQUIRED;
    }

    const cleanCode = String(code).toUpperCase().trim();

    if (!/^[A-Z]{2}$/.test(cleanCode)) {
        return ErrorCatalog.COO_INVALID_FORMAT;
    }

    if (!VALID_COUNTRIES.has(cleanCode)) {
        return ErrorCatalog.COO_UNKNOWN;
    }

    return null;
}

function validateWeight(weight, unit) {
    if (!weight && weight !== 0) {
        return ErrorCatalog.WEIGHT_REQUIRED;
    }

    const numWeight = parseFloat(weight);
    if (isNaN(numWeight) || numWeight < 0) {
        return ErrorCatalog.WEIGHT_INVALID;
    }

    if (numWeight > 100000) { // Sanity check: > 100,000 lbs seems wrong
        return ErrorCatalog.WEIGHT_UNREASONABLE;
    }

    // Validate unit if provided
    if (unit && !['KG', 'LB', 'LBS', 'G', 'OZ'].includes(unit.toUpperCase())) {
        return ErrorCatalog.WEIGHT_UNIT_INVALID;
    }

    return null;
}

function validateValue(value, currency) {
    if (!value && value !== 0) {
        return ErrorCatalog.VALUE_REQUIRED;
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
        return ErrorCatalog.VALUE_INVALID;
    }

    if (numValue > 10000000) { // Sanity check: > $10M per line seems wrong
        return ErrorCatalog.VALUE_UNREASONABLE;
    }

    // Validate currency if provided
    if (currency && !['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'MXN'].includes(currency.toUpperCase())) {
        return ErrorCatalog.CURRENCY_INVALID;
    }

    return null;
}

function validateDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') {
        return null; // Dates are optional
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return ErrorCatalog.DATE_INVALID;
    }

    // Check if date is reasonable (not too far in past/future)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    if (date < oneYearAgo || date > oneYearLater) {
        return ErrorCatalog.DATE_UNREASONABLE;
    }

    return null;
}

function validateDescription(description) {
    if (!description || description.trim() === '') {
        return ErrorCatalog.DESCRIPTION_REQUIRED;
    }

    if (description.length < 3) {
        return ErrorCatalog.DESCRIPTION_TOO_SHORT;
    }

    return null;
}

function validateCompliance(doc) {
    const validationErrors = [];

    doc.lines.forEach((line, index) => {
        // Validate HTS
        const htsError = validateHts(line.htsCode);
        if (htsError) {
            validationErrors.push({
                ...htsError,
                lineIndex: index,
                field: 'htsCode',
                value: line.htsCode
            });
        }

        // Validate COO
        const cooError = validateCoo(line.countryOfOrigin);
        if (cooError) {
            validationErrors.push({
                ...cooError,
                lineIndex: index,
                field: 'countryOfOrigin',
                value: line.countryOfOrigin
            });
        }

        // Validate Description
        const descError = validateDescription(line.description);
        if (descError) {
            validationErrors.push({
                ...descError,
                lineIndex: index,
                field: 'description',
                value: line.description
            });
        }

        // Validate Weight
        const weightError = validateWeight(line.netWeightKg, 'KG'); // Canonical is always KG
        if (weightError) {
            validationErrors.push({
                ...weightError,
                lineIndex: index,
                field: 'netWeight',
                value: line.netWeightKg
            });
        }

        // Validate Value
        const valueError = validateValue(line.valueUsd, 'USD'); // Canonical is always USD
        if (valueError) {
            validationErrors.push({
                ...valueError,
                lineIndex: index,
                field: 'value',
                value: line.valueUsd
            });
        }
    });

    // Validate shipment-level date if present
    if (doc.shipmentDate) {
        const dateError = validateDate(doc.shipmentDate);
        if (dateError) {
            validationErrors.push({
                ...dateError,
                field: 'shipmentDate',
                value: doc.shipmentDate
            });
        }
    }

    return validationErrors;
}

module.exports = {
    validateHts,
    validateCoo,
    validateWeight,
    validateValue,
    validateDate,
    validateDescription,
    validateCompliance
};
