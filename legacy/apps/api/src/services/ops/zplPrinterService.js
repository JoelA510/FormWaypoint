const net = require('net');
const logger = require('../../utils/logger');

/**
 * Service for communicating with ZPL thermal printers via raw TCP integration.
 * Common port is 9100 (JetDirect).
 */
class ZplPrinterService {
    constructor(host, port = 9100) {
        this.host = host;
        this.port = port;
    }

    /**
     * Sends raw ZPL commands to the printer.
     * @param {string} zpl - The ZPL command string.
     * @returns {Promise<void>}
     */
    async print(zpl) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();

            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error(`Printer connection timed out: ${this.host}:${this.port}`));
            }, 5000);

            client.connect(this.port, this.host, () => {
                logger.info(`Connected to printer at ${this.host}:${this.port}`);
                client.write(zpl);
                client.end(); // Close connection after writing
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                logger.error(`Printer error: ${err.message}`);
                reject(err);
            });

            client.on('close', () => {
                clearTimeout(timeout);
                logger.info('Printer connection closed');
                resolve();
            });
        });
    }

    /**
     * wraps a ZPL label content with standard header/footer if needed,
     * or converts common formats.
     * This is a helper for raw ZPL injection.
     */
    static wrapZpl(content) {
        return `^XA\n${content}\n^XZ`;
    }

    /**
     * Generates a test label ZPL.
     */
    static getTestLabel() {
        return `
      ^XA
      ^FO50,50^ADN,36,20^FDFormWaypoint Printer Test^FS
      ^FO50,100^ADN,18,10^FDIf you can read this, direct socket printing is working.^FS
      ^FO50,150^BCN,100,Y,N,N
      ^FD12345678^FS
      ^XZ
    `;
    }
}

module.exports = ZplPrinterService;
