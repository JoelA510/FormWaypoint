const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { normalizeDocument } = require('../utils');

async function parseDocx(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);
  const header = {
    shipper: '',
    consignee: '',
    incoterm: '',
    currency: '',
    reference: undefined
  };

  $('p').each((_, elem) => {
    const text = $(elem).text().trim();
    if (!text.includes(':')) return;
    const [key, ...rest] = text.split(':');
    if (!key || rest.length === 0) return;
    const normalizedKey = key.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (header.hasOwnProperty(normalizedKey)) {
      header[normalizedKey] = value;
    } else if (normalizedKey === 'reference') {
      header.reference = value;
    }
  });

  /* 
     Heuristic: matching typical line item headers.
     We look for a row containing 'Part Number' or 'Description' + 'Quantity'.
  */
  const REQUIRED_HEADERS = ['part', 'description', 'quantity', 'weight'];

  let targetTable = null;
  let headerRowIndex = -1;

  $('table').each((i, table) => {
    if (targetTable) return; // found already

    $(table).find('tr').each((ri, row) => {
      const text = $(row).text().toLowerCase();
      // Check if this row has enough distinct cell values matching our expected headers
      let matchCount = 0;
      if (text.includes('part')) matchCount++;
      if (text.includes('description') || text.includes('desc')) matchCount++;
      if (text.includes('quantity') || text.includes('qty')) matchCount++;

      if (matchCount >= 2) {
        targetTable = $(table);
        headerRowIndex = ri;
        return false; // break row loop
      }
    });
  });

  // Fallback: use first table if no matching header found, assuming typical structure
  if (!targetTable) {
    targetTable = $('table').first();
    headerRowIndex = 0;
  }

  const lines = [];
  if (targetTable) {
    targetTable.find('tr').each((rowIndex, row) => {
      if (rowIndex <= headerRowIndex) return; // skip header or previous

      const cells = $(row)
        .find('td')
        .map((_, cell) => $(cell).text().trim())
        .get();

      // Looping logic: typical 7 columns, but might be lax
      if (cells.length < 5) return;

      // Unpack with safety
      // Assuming order: Part, Desc, Qty, Weight, Value, HTS, Origin
      // (This assumption remains brittle without mapping specific columns, 
      //  but is an improvement over "always first table")
      const [partNumber, description, quantity, netWeightKg, valueUsd, htsCode, countryOfOrigin] = cells;

      // Coercion
      const qtyNum = parseFloat(String(quantity).replace(/,/g, '')) || 0;
      const weightNum = parseFloat(String(netWeightKg).replace(/,/g, '')) || 0;
      const valNum = parseFloat(String(valueUsd).replace(/[^0-9.]/g, '')) || 0;

      lines.push({
        partNumber: partNumber || '',
        description: description || '',
        quantity: qtyNum,
        netWeightKg: weightNum,
        valueUsd: valNum,
        htsCode: htsCode || '',
        countryOfOrigin: countryOfOrigin || ''
      });
    });
  }

  if (!lines.length) {
    throw new Error('DOCX document did not contain a valid line items table');
  }

  return normalizeDocument({
    header,
    lines,
    meta: {
      sourceType: 'docx',
      raw: {
        // html // Omitted to avoid passing large raw HTML strings 
      }
    }
  });
}

module.exports = {
  parseDocx
};
