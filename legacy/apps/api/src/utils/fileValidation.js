const { fromBuffer } = require('file-type');

/**
 * Validates that the file buffer matches its expected mimetype using magic numbers.
 * @param {Buffer} buffer 
 * @param {string} mimetype - The MIME type reported by the client (multer)
 * @returns {Promise<boolean>}
 */
async function validateFileSignature(buffer, mimetype) {
    // Allowed types map (MIME -> expected extension or check)
    // For high security, we should Allowlist.

    const ALLOWED_TYPES = [
        'application/pdf',
        'application/zip',
        'application/x-zip-compressed',
        'image/jpeg',
        'image/png',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // xlsx
    ];

    if (!ALLOWED_TYPES.includes(mimetype)) {
        throw new Error(`FileType ${mimetype} is not allowed.`);
    }

    const type = await fromBuffer(buffer);

    // Some text files (CSV) do not have magic numbers and return undefined.
    if (!type) {
        if (mimetype === 'text/csv') {
            return true; // Pass CSVs implicitly (could add content sniffing later)
        }
        throw new Error('Could not detect file type from buffer');
    }

    // Verify consistency
    // Note: file-type returns { ext: 'pdf', mime: 'application/pdf' }
    if (mimetype === 'application/x-zip-compressed') {
        // Tolerant check for Windows zips
        if (type.mime !== 'application/zip') {
            throw new Error(`File signature mismatch. Expected zip, got ${type.mime}`);
        }
    } else if (type.mime !== mimetype) {
        throw new Error(`File signature mismatch. Expected ${mimetype}, got ${type.mime}`);
    }

    return true;
}

module.exports = {
    validateFileSignature
};
