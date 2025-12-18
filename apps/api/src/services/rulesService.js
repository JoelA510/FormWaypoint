const RuleEngine = require('../shared/rules/RuleEngine');

/**
 * Service to manage routing rules persistence.
 * Currently uses in-memory storage, but would map to a DB in production.
 */
class RulesService {
    constructor() {
        this.rules = [
            {
                id: 'RULE-001',
                name: 'Heavy Weight Ground',
                enabled: true,
                priority: 10,
                condition: {
                    field: 'packages.0.weight.value',
                    op: 'gt',
                    value: 150
                },
                action: {
                    type: 'SET_CARRIER',
                    value: 'FEDEX_FREIGHT'
                }
            },
            {
                id: 'RULE-002',
                name: 'High Value Insurance',
                enabled: true,
                priority: 20,
                condition: {
                    field: 'financials.value',
                    op: 'gt',
                    value: 5000
                },
                action: {
                    type: 'ADD_INSURANCE',
                    value: true
                }
            }
        ];
    }

    async getAllRules() {
        return this.rules.sort((a, b) => b.priority - a.priority);
    }

    async createRule(rule) {
        const newRule = {
            id: `RULE-${Date.now()}`,
            enabled: true,
            createdAt: new Date(),
            ...rule
        };
        this.rules.push(newRule);
        return newRule;
    }

    async updateRule(id, updates) {
        const index = this.rules.findIndex(r => r.id === id);
        if (index === -1) throw new Error('Rule not found');

        this.rules[index] = { ...this.rules[index], ...updates };
        return this.rules[index];
    }

    async deleteRule(id) {
        this.rules = this.rules.filter(r => r.id !== id);
        return true;
    }

    /**
     * Run all enabled rules against a shipment context
     */
    async evaluateShipment(shipment) {
        const activeRules = this.rules.filter(r => r.enabled).sort((a, b) => b.priority - a.priority);
        return RuleEngine.evaluate(activeRules, shipment);
    }
}

module.exports = new RulesService();
