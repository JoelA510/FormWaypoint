const { parse } = require('csv-parse');
const { Readable } = require('stream');

/**
 * Parse CSV buffer into array of objects
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<Array<Object>>} - Array of row objects with normalized keys
 */
async function parseCsv(buffer) {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(buffer);

        stream
            .pipe(parse({
                columns: true, // Auto-discover columns
                skip_empty_lines: true,
                trim: true,
                cast: true // Auto-convert numbers
            }))
            .on('data', (data) => {
                // Normalize keys to lowercase? Optional.
                // For now, keep as is, mapper will handle lookups.
                results.push(data);
            })
            .on('error', (err) => reject(err))
            .on('end', () => resolve(results));
    });
}

module.exports = { parseCsv };
