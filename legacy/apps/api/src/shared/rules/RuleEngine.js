const logger = require('../../utils/logger');

/**
 * Executes rules against a context object.
 * Rules are JSON objects defining conditions and actions.
 */
class RuleEngine {

    /**
     * @param {Array<Rule>} rules - List of rules to evaluate
     * @param {Object} context - Data to evaluate against (e.g. Shipment)
     * @returns {Object} Result summary { matches: [], actions: [] }
     */
    evaluate(rules, context) {
        const results = {
            matches: [],
            actions: []
        };

        for (const rule of rules) {
            if (this.checkCondition(rule.condition, context)) {
                logger.debug(`Rule Matched: ${rule.name}`);
                results.matches.push(rule.name);
                if (rule.action) {
                    results.actions.push(rule.action);
                }
            }
        }

        return results;
    }

    /**
     * Recursively check conditions.
     * Supports: eq, neq, gt, lt, in, contains, and/or
     */
    checkCondition(condition, context) {
        if (!condition) return true;

        // Compound conditions
        if (condition.and) {
            return condition.and.every(c => this.checkCondition(c, context));
        }
        if (condition.or) {
            return condition.or.some(c => this.checkCondition(c, context));
        }

        // Leaf condition
        const value = this.getValue(context, condition.field);

        switch (condition.op) {
            case 'eq': return value === condition.value;
            case 'neq': return value !== condition.value;
            case 'gt': return value > condition.value;
            case 'lt': return value < condition.value;
            case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
            case 'contains': return (value || '').toString().includes(condition.value);
            default: return false;
        }
    }

    getValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }
}

module.exports = new RuleEngine();
