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

  const lines = [];
  $('table').first().find('tr').each((rowIndex, row) => {
    if (rowIndex === 0) return;
    const cells = $(row)
      .find('td')
      .map((_, cell) => $(cell).text().trim())
      .get();
    if (cells.length < 7) return;
    const [partNumber, description, quantity, netWeightKg, valueUsd, htsCode, countryOfOrigin] = cells;
    lines.push({
      partNumber,
      description,
      quantity,
      netWeightKg,
      valueUsd,
      htsCode,
      countryOfOrigin
    });
  });

  if (!lines.length) {
    throw new Error('DOCX document did not contain a data table with line items');
  }

  return normalizeDocument({
    header,
    lines,
    meta: {
      sourceType: 'docx',
      raw: {
        html
      }
    }
  });
}

module.exports = {
  parseDocx
};
