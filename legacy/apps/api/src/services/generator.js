const { getBrowser } = require('./browser');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { validateHandlebarsTemplate } = require('../utils/handlebarsSecurity');

const { TEMPLATE_DEFAULTS } = require('../config/templates');

/**
 * Generate PDF from data and template
 * @param {Object} data - Document data
 * @param {string} templateName - Name of the template (e.g., 'sli')
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePDF(data, templateName = 'sli') {
    let page = null;
    try {
        const templatePath = path.join(__dirname, `../templates/${templateName}.hbs`);
        logger.info('Loading template', { templateName, templatePath });
        const templateHtml = fs.readFileSync(templatePath, 'utf8');

        // Register Handlebars helpers
        handlebars.registerHelper('eq', function (a, b) {
            return a === b;
        });

        validateHandlebarsTemplate(templateHtml);
        const template = handlebars.compile(templateHtml, { strict: true });

        // Add current date if not present
        const context = {
            date: new Date().toLocaleDateString(),
            ...data
        };

        // console.log('[Generator] Rendering template with context'); // Reduce noise
        const html = template(context);

        // Get singleton browser
        const browser = await getBrowser();

        page = await browser.newPage();
        // console.log('[Generator] Setting page content'); // Reduce noise
        await page.setContent(html, { waitUntil: 'networkidle0' });
        // console.log('[Generator] Generating PDF'); // Reduce noise

        const defaults = TEMPLATE_DEFAULTS[templateName] || { format: 'A4' };
        const pdfOptions = {
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            },
            ...defaults
        };

        const pdfBuffer = await page.pdf(pdfOptions);
        console.log(`[Generator] PDF generated successfully for template: ${templateName}`);
        return pdfBuffer;

    } catch (error) {
        logger.error('Error generating PDF', { error: error.message, stack: error.stack, templateName });
        throw error;
    } finally {
        if (page) {
            await page.close();
        }
    }
}

module.exports = {
    generatePDF
};
