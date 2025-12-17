const XLSX = require('xlsx-js-style');
const { normalizeDocument } = require('../utils');

function parseHeaderSheet(sheet) {
  const header = {
    shipper: '',
    consignee: '',
    incoterm: '',
    currency: '',
    reference: undefined
  };
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const fieldCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const valueCell = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    if (!fieldCell || !valueCell) continue;
    const key = String(fieldCell.v || '').toLowerCase();
    const value = valueCell.v;
    if (key && header.hasOwnProperty(key)) {
      header[key] = value;
    } else if (key === 'reference') {
      header.reference = value;
    }
  }
  return header;
}

function parseLineSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((row) => ({
    partNumber: row.PartNumber || row.partNumber || '',
    description: row.Description || row.description || '',
    quantity: row.Quantity || row.quantity || '',
    netWeightKg: row.NetWeightKg || row.netWeightKg || '',
    valueUsd: row.ValueUsd || row.valueUsd || row.ValueUSD || '',
    htsCode: row.HTS || row.htsCode || '',
    countryOfOrigin: row.COO || row.countryOfOrigin || row.CountryOfOrigin || ''
  }));
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const headerSheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('header')) || workbook.SheetNames[0];
  const linesSheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('line')) || workbook.SheetNames[1];
  if (!headerSheetName || !linesSheetName) {
    throw new Error('Workbook must contain header and line sheets');
  }
  const headerSheet = workbook.Sheets[headerSheetName];
  const linesSheet = workbook.Sheets[linesSheetName];

  const rawDoc = {
    header: parseHeaderSheet(headerSheet),
    lines: parseLineSheet(linesSheet),
    meta: {
      sourceType: 'xlsx',
      raw: {
        sheets: workbook.SheetNames
      }
    }
  };

  if (!rawDoc.lines.length) {
    throw new Error('No line items found in workbook');
  }

  return normalizeDocument(rawDoc);
}

module.exports = {
  parseWorkbook
};
