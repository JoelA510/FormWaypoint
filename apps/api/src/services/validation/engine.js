const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} ValidationIssue
 * @property {string} code
 * @property {('error'|'warning'|'info')} severity
 * @property {string} message
 * @property {string} [path]
 */

/**
 * @typedef {Object} ValidationSummary
 * @property {string} shipmentId
 * @property {ValidationIssue[]} issues
 * @property {string} createdAt
 */

class ValidationEngine {
    constructor() {
        this.rules = [];
        this.loadRules();
    }

    loadRules() {
        const rulesDir = path.join(__dirname, 'rules');
        if (fs.existsSync(rulesDir)) {
            const files = fs.readdirSync(rulesDir);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const rule = require(path.join(rulesDir, file));
                    if (typeof rule.validate === 'function') {
                        this.rules.push(rule);
                    }
                }
            }
        }
    }

    /**
     * @param {Object} shipment ShipmentV1
     * @param {Object[]} lineItems ShipmentLineItemV1[]
     * @returns {Promise<ValidationSummary>}
     */
    async validate(shipment, lineItems) {
        const issues = [];

        for (const rule of this.rules) {
            try {
                // Support both sync and async rules
                const ruleIssues = await rule.validate(shipment, lineItems);
                if (Array.isArray(ruleIssues)) {
                    issues.push(...ruleIssues);
                }
            } catch (error) {
                console.error(`Error running rule ${rule.name || 'unknown'}:`, error);
                issues.push({
                    code: 'RULE_EXECUTION_ERROR',
                    severity: 'error',
                    message: `Internal error running validation rule: ${error.message}`
                });
            }
        }

        return {
            shipmentId: shipment.id || 'unknown',
            issues,
            createdAt: new Date().toISOString()
        };
    }
}

const engine = new ValidationEngine();

module.exports = {
    validateShipment: (shipment, lineItems) => engine.validate(shipment, lineItems), // Singleton instance usage
    ValidationEngine // Export class for testing if needed
};
