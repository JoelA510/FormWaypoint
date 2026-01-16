const RuleEngine = require('../shared/rules/RuleEngine');
const prisma = require('../../db');

/**
 * Service to manage routing rules persistence.
 * Now using Prisma (SQLite/Postgres) instead of in-memory storage.
 */
class RulesService {

    async getAllRules() {
        const rules = await prisma.rule.findMany({
            orderBy: { priority: 'desc' }
        });

        // Parse JSON fields
        return rules.map(this._parseRule);
    }

    async createRule(data) {
        const { condition, action, ...rest } = data;

        const rule = await prisma.rule.create({
            data: {
                ...rest,
                // Ensure defaults
                priority: rest.priority ?? 0,
                enabled: rest.enabled ?? true,
                // Serialize JSON fields
                condition: JSON.stringify(condition),
                action: JSON.stringify(action)
            }
        });

        return this._parseRule(rule);
    }

    async updateRule(id, updates) {
        const { condition, action, ...rest } = updates;

        const data = { ...rest };
        if (condition) data.condition = JSON.stringify(condition);
        if (action) data.action = JSON.stringify(action);

        const rule = await prisma.rule.update({
            where: { id },
            data
        });

        return this._parseRule(rule);
    }

    async deleteRule(id) {
        await prisma.rule.delete({ where: { id } });
        return true;
    }

    /**
     * Run all enabled rules against a shipment context
     */
    async evaluateShipment(shipment) {
        const rawRules = await prisma.rule.findMany({
            where: { enabled: true },
            orderBy: { priority: 'desc' }
        });

        const activeRules = rawRules.map(this._parseRule);
        return RuleEngine.evaluate(activeRules, shipment);
    }

    _parseRule(rule) {
        return {
            ...rule,
            condition: typeof rule.condition === 'string' ? JSON.parse(rule.condition) : rule.condition,
            action: typeof rule.action === 'string' ? JSON.parse(rule.action) : rule.action
        };
    }
}

module.exports = new RulesService();
