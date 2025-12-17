const bwipjs = require('bwip-js');

class BarcodeGenerator {
    /**
     * Generate a barcode image buffer.
     * @param {string} text - The text to encode
     * @param {string} type - Barcode type (code128, qrcode, datamatrix)
     * @returns {Promise<Buffer>}
     */
    async generate(text, type = 'code128') {
        return new Promise((resolve, reject) => {
            bwipjs.toBuffer({
                bcid: type,       // Barcode type
                text: text,       // Text to encode
                scale: 3,         // 3x scaling factor
                height: 10,       // Bar height, in millimeters
                includetext: true, // Show human-readable text
                textxalign: 'center', // Always good to align this
            }, (err, png) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(png);
                }
            });
        });
    }

    /**
     * Generate a data URL (base64) for frontend display
     */
    async generateDataUrl(text, type = 'code128') {
        const buffer = await this.generate(text, type);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    }
}

module.exports = new BarcodeGenerator();
