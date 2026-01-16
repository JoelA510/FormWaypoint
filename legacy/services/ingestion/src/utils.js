const Ajv = require('ajv');

const canonicalSchema = {
  type: 'object',
  required: ['header', 'lines', 'checksums', 'meta'],
  properties: {
    header: {
      type: 'object',
      required: ['shipper', 'consignee', 'incoterm', 'currency'],
      additionalProperties: true,
      properties: {
        shipper: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            address2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            country: { type: 'string' }
          }
        },
        consignee: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            address2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            country: { type: 'string' }
          }
        },
        incoterm: { type: 'string' },
        currency: { type: 'string' }
      }
    },
    lines: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: [
          'partNumber',
          'description',
          'quantity',
          'netWeightKg',
          'valueUsd',
          'htsCode',
          'countryOfOrigin'
        ],
        properties: {
          partNumber: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'number' },
          netWeightKg: { type: 'number' },
          valueUsd: { type: 'number' },
          htsCode: { type: 'string' },
          countryOfOrigin: { type: 'string' },
          purchaseOrderNumber: { type: 'string' }
        }
      }
    },
    checksums: {
      type: 'object',
      required: ['quantity', 'netWeightKg', 'valueUsd'],
      properties: {
        quantity: { type: 'number' },
        netWeightKg: { type: 'number' },
        valueUsd: { type: 'number' }
      }
    },
    meta: {
      type: 'object',
      required: ['sourceType', 'raw', 'normalization'],
      properties: {
        sourceType: { type: 'string' },
        raw: { type: 'object' },
        normalization: { type: 'object' },
        validation: { type: 'array' }
      }
    }
  }
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateCanonical = ajv.compile(canonicalSchema);

function ensureNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (value === null || value === undefined) {
    return NaN;
  }
  const clean = String(value)
    .replace(/[^0-9.,-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(clean);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function toKg(value) {
  if (typeof value === 'number') {
    return value;
  }
  const str = String(value).toLowerCase();
  const numeric = ensureNumber(str);
  if (str.includes('lb')) {
    return Number.isNaN(numeric) ? NaN : Number(numeric * 0.45359237);
  }
  return numeric;
}

function toUsd(value) {
  return ensureNumber(value);
}

function normalizeString(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function uppercase(value) {
  return normalizeString(value).toUpperCase();
}

function computeChecksums(lines) {
  return {
    quantity: Number(lines.reduce((acc, line) => acc + (line.quantity || 0), 0)),
    netWeightKg: Number(lines.reduce((acc, line) => acc + (line.netWeightKg || 0), 0)),
    valueUsd: Number(lines.reduce((acc, line) => acc + (line.valueUsd || 0), 0))
  };
}

function normalizeDocument(rawDoc) {
  const { parseAddress } = require('./pdf/addressParser');
  const normalizationNotes = {};
  const header = {
    shipper: parseAddress(rawDoc.header.shipper),
    consignee: parseAddress(rawDoc.header.consignee),
    incoterm: uppercase(rawDoc.header.incoterm),
    currency: uppercase(rawDoc.header.currency),
    reference: rawDoc.header.reference ? normalizeString(rawDoc.header.reference) : undefined
  };

  if (header.currency && header.currency.length !== 3) {
    normalizationNotes.currency = `Currency normalized to ISO-like format: ${header.currency}`;
  }

  const lines = rawDoc.lines.map((line, index) => {
    const quantity = ensureNumber(line.quantity);
    const netWeightKg = toKg(line.netWeightKg);
    const valueUsd = toUsd(line.valueUsd);
    const normalized = {
      partNumber: uppercase(line.partNumber),
      description: normalizeString(line.description),
      quantity: Number.isNaN(quantity) ? 0 : quantity,
      netWeightKg: Number.isNaN(netWeightKg) ? 0 : Number(netWeightKg),
      valueUsd: Number.isNaN(valueUsd) ? 0 : Number(valueUsd),
      htsCode: uppercase(line.htsCode),
      countryOfOrigin: uppercase(line.countryOfOrigin),
      purchaseOrderNumber: normalizeString(line.purchaseOrderNumber)
    };

    if (Number.isNaN(quantity) || Number.isNaN(netWeightKg) || Number.isNaN(valueUsd)) {
      normalizationNotes[`line-${index}`] = 'One or more numeric fields could not be parsed and were defaulted to 0.';
    }

    return normalized;
  });

  const checksums = computeChecksums(lines);
  const { validateCompliance } = require('./validation/validators');
  const validationErrors = validateCompliance({ lines });

  const canonicalDoc = {
    header,
    lines,
    checksums,
    references: rawDoc.references || [], // Preserve references array
    meta: {
      sourceType: rawDoc.meta.sourceType,
      raw: rawDoc.meta.raw,
      normalization: normalizationNotes,
      validation: validationErrors
    }
  };

  const valid = validateCanonical(canonicalDoc);
  if (!valid) {
    const error = new Error('Canonical document failed validation');
    error.details = validateCanonical.errors;
    throw error;
  }
  return canonicalDoc;
}

module.exports = {
  normalizeDocument,
  computeChecksums,
  ensureNumber,
  toKg,
  toUsd,
  uppercase,
  normalizeString
};
