const logger = require('../../utils/logger');

class PiiRedactionService {
    constructor() {
        this.patterns = {
            EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            PHONE: /(\+\d{1,2}\s?)?1?-?\.?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
            SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
            CREDIT_CARD: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
        };
    }

    /**
     * Redacts PII from text content.
     * @param {string} text - The text to sanitize.
     * @returns {string} - Sanitized text.
     */
    redact(text) {
        if (!text) return text;

        let redacted = text;

        // Apply all patterns
        redacted = redacted.replace(this.patterns.EMAIL, '[REDACTED_EMAIL]');
        redacted = redacted.replace(this.patterns.PHONE, '[REDACTED_PHONE]');
        redacted = redacted.replace(this.patterns.SSN, '[REDACTED_SSN]');
        redacted = redacted.replace(this.patterns.CREDIT_CARD, '[REDACTED_CC]');

        if (redacted !== text) {
            logger.info('PII detected and redacted from text.');
        }

        return redacted;
    }

    /**
     * (Placeholder) Redact from image using OCR coordinates.
     * This would integrate with a PDF/Image library to draw black boxes.
     */
    async redactImage(imageBuffer, ocrResults) {
        // Phase 12 MVP: Just return original, log intent
        logger.warn('Image PII redaction not fully implemented in MVP.');
        return imageBuffer;
    }
}

module.exports = PiiRedactionService;
