const { parsePdf } = require('./pdf/parser');
const { parseWorkbook } = require('./xlsx/parser');
const { parseCsv } = require('./csv/parser');
const { parseDocx } = require('./docx/parser');

/**
 * @param {Buffer} buffer
 * @param {'pdf'|'xlsx'|'csv'|'docx'} fileType
 * @returns {Promise<import('./types').CanonicalDoc>}
 */
async function parseFile(buffer, fileType) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Expected buffer to be a Node.js Buffer');
  }
  if (buffer.length === 0) {
    throw new Error('Refusing to parse an empty buffer');
  }
  if (buffer.length > 100 * 1024 * 1024) {
    const error = new Error('File exceeds 100 MB prototype limit');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer);
    case 'xlsx':
      return parseWorkbook(buffer);
    case 'csv':
      return parseCsv(buffer);
    case 'docx':
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

module.exports = {
  parseFile
};
