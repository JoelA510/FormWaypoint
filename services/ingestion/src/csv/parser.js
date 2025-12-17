const { parse } = require('csv-parse/sync');
const { normalizeDocument } = require('../utils');

function parseCsv(buffer) {
  const text = buffer.toString('utf8');
  const [headerSection, linesSection] = text.split(/\n\s*\n/);
  if (!linesSection) {
    throw new Error('CSV payload must contain a blank line separating header metadata and line items');
  }
  const header = {
    shipper: '',
    consignee: '',
    incoterm: '',
    currency: '',
    reference: undefined
  };
  const headerLines = headerSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('#'));
  for (const line of headerLines) {
    const withoutHash = line.replace(/^#+/, '').trim();
    const [key, ...rest] = withoutHash.split(':');
    if (!key || rest.length === 0) continue;
    const normalizedKey = key.trim().toLowerCase();
    if (header.hasOwnProperty(normalizedKey)) {
      header[normalizedKey] = rest.join(':').trim();
    } else if (normalizedKey === 'reference') {
      header.reference = rest.join(':').trim();
    }
  }

  const records = parse(linesSection, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  const lines = records.map((row) => ({
    partNumber: row.partNumber || row.PartNumber || '',
    description: row.description || row.Description || '',
    quantity: row.quantity || row.Quantity || '',
    netWeightKg: row.netWeightKg || row.NetWeightKg || row.weight || '',
    valueUsd: row.valueUsd || row.ValueUsd || row.value || '',
    htsCode: row.htsCode || row.HTS || '',
    countryOfOrigin: row.countryOfOrigin || row.COO || ''
  }));

  if (!lines.length) {
    throw new Error('CSV did not contain any line items');
  }

  return normalizeDocument({
    header,
    lines,
    meta: {
      sourceType: 'csv',
      raw: {
        headerLines,
        columnKeys: Object.keys(records[0] || {})
      }
    }
  });
}

module.exports = {
  parseCsv
};
