const { describe, it } = require('node:test');
const assert = require('assert');
const { validateHts, validateCoo, validateWeight, validateValue, validateDescription, validateCompliance } = require('../src/validation/validators');
const { ErrorCatalog } = require('../src/validation/catalog');

describe('Compliance Validators', () => {
    describe('HTS Validation', () => {
        it('should pass for valid known HTS codes', () => {
            assert.strictEqual(validateHts('847150'), null);
            assert.strictEqual(validateHts('8471.50'), null); // Should handle dots
        });

        it('should return REQUIRED for empty codes', () => {
            const error = validateHts('');
            assert.strictEqual(error.code, ErrorCatalog.HTS_REQUIRED.code);
        });

        it('should return INVALID_FORMAT for short codes', () => {
            const error = validateHts('123');
            assert.strictEqual(error.code, ErrorCatalog.HTS_INVALID_FORMAT.code);
        });

        it('should return UNKNOWN for unknown codes', () => {
            const error = validateHts('123456');
            assert.strictEqual(error.code, ErrorCatalog.HTS_UNKNOWN.code);
        });
    });

    describe('COO Validation', () => {
        it('should pass for valid ISO codes', () => {
            assert.strictEqual(validateCoo('US'), null);
            assert.strictEqual(validateCoo('cn'), null); // Should handle lowercase
        });

        it('should return REQUIRED for empty codes', () => {
            const error = validateCoo('');
            assert.strictEqual(error.code, ErrorCatalog.COO_REQUIRED.code);
        });

        it('should return INVALID_FORMAT for 3-letter codes', () => {
            const error = validateCoo('USA');
            assert.strictEqual(error.code, ErrorCatalog.COO_INVALID_FORMAT.code);
        });

        it('should return UNKNOWN for unrecognized codes', () => {
            const error = validateCoo('XX');
            assert.strictEqual(error.code, ErrorCatalog.COO_UNKNOWN.code);
        });
    });

    describe('Weight Validation', () => {
        it('should pass for valid weights', () => {
            assert.strictEqual(validateWeight(100, 'KG'), null);
            assert.strictEqual(validateWeight(0, 'LB'), null);
        });

        it('should return REQUIRED for missing weight', () => {
            const error = validateWeight(null);
            assert.strictEqual(error.code, ErrorCatalog.WEIGHT_REQUIRED.code);
        });

        it('should return INVALID for negative weight', () => {
            const error = validateWeight(-5);
            assert.strictEqual(error.code, ErrorCatalog.WEIGHT_INVALID.code);
        });
    });

    describe('Value Validation', () => {
        it('should pass for valid values', () => {
            assert.strictEqual(validateValue(1000, 'USD'), null);
            assert.strictEqual(validateValue(0, 'EUR'), null);
        });

        it('should return REQUIRED for missing value', () => {
            const error = validateValue(null);
            assert.strictEqual(error.code, ErrorCatalog.VALUE_REQUIRED.code);
        });

        it('should return INVALID for negative value', () => {
            const error = validateValue(-100);
            assert.strictEqual(error.code, ErrorCatalog.VALUE_INVALID.code);
        });
    });

    describe('Description Validation', () => {
        it('should pass for valid descriptions', () => {
            assert.strictEqual(validateDescription('Computer parts'), null);
        });

        it('should return REQUIRED for empty description', () => {
            const error = validateDescription('');
            assert.strictEqual(error.code, ErrorCatalog.DESCRIPTION_REQUIRED.code);
        });

        it('should return TOO_SHORT for short descriptions', () => {
            const error = validateDescription('ab');
            assert.strictEqual(error.code, ErrorCatalog.DESCRIPTION_TOO_SHORT.code);
        });
    });

    describe('Full Compliance Validation', () => {
        it('should collect errors from all lines', () => {
            const doc = {
                lines: [
                    {
                        htsCode: '847150',
                        countryOfOrigin: 'US',
                        description: 'Computer parts',
                        netWeight: 100,
                        value: 1000
                    }, // Valid
                    {
                        htsCode: '000000',
                        countryOfOrigin: 'XX',
                        description: 'ab',  // Too short
                        netWeight: -5,  // Invalid
                        value: null  // Required
                    }  // Multiple errors
                ]
            };

            const errors = validateCompliance(doc);

            // Should have HTS, COO, description, weight, and value errors from line 1
            assert.ok(errors.length >= 5, `Expected at least 5 errors, got ${errors.length}`);

            const htsError = errors.find(e => e.field === 'htsCode');
            assert.strictEqual(htsError.lineIndex, 1);
            assert.strictEqual(htsError.code, ErrorCatalog.HTS_UNKNOWN.code);

            const cooError = errors.find(e => e.field === 'countryOfOrigin');
            assert.strictEqual(cooError.lineIndex, 1);
            assert.strictEqual(cooError.code, ErrorCatalog.COO_UNKNOWN.code);
        });
    });
});
