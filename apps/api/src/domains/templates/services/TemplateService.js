const BaseService = require('../../../shared/core/BaseService');
const prisma = require('../../../db');
const { CreateTemplateSchema } = require('../dtos/templateDto');

class TemplateService extends BaseService {

    async createTemplate(data, userId) {
        return this.execute('createTemplate', async () => {
            const validated = CreateTemplateSchema.parse(data);

            const template = await prisma.shipmentTemplate.create({
                data: {
                    ...validated,
                    userId
                }
            });
            return template;
        });
    }

    async getTemplate(id) {
        return this.execute('getTemplate', async () => {
            const template = await prisma.shipmentTemplate.findUnique({ where: { id } });
            if (!template) throw new Error('Template not found');
            return template;
        });
    }

    async listTemplates(userId) {
        return this.execute('listTemplates', async () => {
            return prisma.shipmentTemplate.findMany({
                where: { userId },
                orderBy: { name: 'asc' }
            });
        });
    }
}

module.exports = new TemplateService();
