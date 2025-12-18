const XLSX = require('xlsx-js-style');
const { normalizeDocument } = require('../utils');

const ALLOWED_HEADER_KEYS = ['shipper', 'consignee', 'incoterm', 'currency', 'reference'];

function parseHeaderSheet(sheet) {
  const header = {
    shipper: '',
    consignee: '',
    incoterm: '',
    currency: '',
    reference: undefined
  };

  if (!sheet || !sheet['!ref']) return header;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const fieldCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const valueCell = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    if (!fieldCell || !valueCell) continue;

    const rawKey = String(fieldCell.v || '').trim().toLowerCase();
    const value = valueCell.v;

    if (header.hasOwnProperty(rawKey)) {
      header[rawKey] = value;
    } else if (ALLOWED_HEADER_KEYS.includes(rawKey)) {
      header[rawKey] = value;
    } else {
      // console.warn(`[XLSX Parser] Ignoring unknown header key: ${rawKey}`);
    }
  }
  return header;
}

function parseLineSheet(sheet) {
  // Use sheet_to_json with strict options? defval handles empty cells
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => {
    // Helper to find value case-insensitively
    const findVal = (keys) => {
      for (const k of keys) {
        if (row[k] !== undefined) return row[k];
        // Try lowercase mapping if exact match fails? 
        // sheet_to_json preserves case. We can iterate keys if needed, but simple variants cover most.
      }
      // Fallback: iterate all keys and match lowercased
      const lowerKeys = keys.map(k => k.toLowerCase());
      const foundKey = Object.keys(row).find(k => lowerKeys.includes(k.toLowerCase()));
      return foundKey ? row[foundKey] : '';
    };

    const quantity = findVal(['Quantity', 'quantity', 'Qty', 'qty']);
    const netWeight = findVal(['NetWeightKg', 'netWeightKg', 'Weight', 'weight']);
    const valueUsd = findVal(['ValueUsd', 'valueUsd', 'ValueUSD', 'Value']);

    return {
      partNumber: String(findVal(['PartNumber', 'partNumber', 'Part', 'part', 'SKU']) || ''),
      description: String(findVal(['Description', 'description', 'Desc']) || ''),
      quantity: Number(quantity) || 0,
      netWeightKg: Number(netWeight) || 0,
      valueUsd: Number(valueUsd) || 0,
      htsCode: String(findVal(['HTS', 'htsCode', 'hts']) || ''),
      countryOfOrigin: String(findVal(['COO', 'countryOfOrigin', 'CountryOfOrigin', 'Origin']) || '')
    };
  });
}

function parseWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    throw new Error('Failed to parse Excel file contents');
  }

  // Improved sheet detection
  const headerSheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('header')) || workbook.SheetNames[0];
  const linesSheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('line')) || workbook.SheetNames[1];

  if (!headerSheetName || !linesSheetName) {
    // Fallback if we have at least 2 sheets
    if (workbook.SheetNames.length < 2) {
      throw new Error('Workbook must contain at least two sheets (Header and Lines)');
    }
  }

  // Graceful handling if sheets aren't found by name, default to 0 and 1
  const headerSheet = workbook.Sheets[headerSheetName || workbook.SheetNames[0]];
  const linesSheet = workbook.Sheets[linesSheetName || workbook.SheetNames[1]];

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

  if (!rawDoc.lines || rawDoc.lines.length === 0) {
    // Don't crash, just warn or return empty? 
    // Requirement said "provide explicit error messages".
    // But empty might be valid for a template file. 
    // Let's stick to existing logic but clearer error.
    throw new Error('No line items found in Lines sheet');
  }

  return normalizeDocument(rawDoc);
}

module.exports = {
  parseWorkbook
};
