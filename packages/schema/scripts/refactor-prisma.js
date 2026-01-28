const fs = require('fs');
const path = require('path');

const files = [
    'apps/api/src/modules/templates/service.ts',
    'apps/api/src/modules/templates/generator.ts',
    'apps/api/src/modules/shipments/service.ts',
    'apps/api/src/modules/products/service.ts',
    'apps/api/src/modules/parties/service.ts',
    'apps/api/src/modules/import/service.ts',
    'apps/api/src/modules/freight/service.ts',
    'apps/api/src/modules/compliance/service.ts',
    'apps/api/src/modules/classification/seeder.ts',
    'apps/api/src/modules/classification/search.ts',
];

const rootDir = process.cwd();

files.forEach(relativePath => {
    const filePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 1. Replace new PrismaClient()
    const instantiationRegex = /const\s+prisma\s*=\s*new\s+PrismaClient\(\s*\);?/g;
    if (instantiationRegex.test(content)) {
        content = content.replace(instantiationRegex, '');
        modified = true;
    }

    // Also handle comment lines if any
    const instantiationRegexWithComment = /const\s+prisma\s*=\s*new\s+PrismaClient\(\)\s*;\s*\/\/.*/g;
    if (instantiationRegexWithComment.test(content)) {
        content = content.replace(instantiationRegexWithComment, '');
        modified = true;
    }

    // 2. Update Imports
    // Case A: import { PrismaClient } from '@prisma/client';
    // Case B: import { PrismaClient, Prisma } from '@repo/schema';

    // We want: import { prisma, Prisma } from '@repo/schema'; 
    // AND remove PrismaClient from import, add prisma if not present.

    // Check if @repo/schema is already imported
    if (content.includes("'@repo/schema'")) {
        // Modify existing import
        content = content.replace(/import\s*{([^}]+)}\s*from\s*'@repo\/schema'/, (match, imports) => {
            let parts = imports.split(',').map(s => s.trim());

            // Remove PrismaClient
            parts = parts.filter(p => p !== 'PrismaClient');

            // Add prisma if not present
            if (!parts.includes('prisma')) parts.push('prisma');

            return `import { ${parts.join(', ')} } from '@repo/schema'`;
        });
        modified = true;
    } else if (content.includes("'@prisma/client'")) {
        // Replace @prisma/client import entirely if it only imports PrismaClient
        content = content.replace(/import\s*{\s*PrismaClient\s*}\s*from\s*'@prisma\/client';?/, "import { prisma } from '@repo/schema';");

        // If it imports PrismaClient and others?
        // e.g. import { PrismaClient, Prisma } from ...
        content = content.replace(/import\s*{([^}]+)}\s*from\s*'@prisma\/client'/, (match, imports) => {
            let parts = imports.split(',').map(s => s.trim());
            parts = parts.filter(p => p !== 'PrismaClient');
            if (!parts.includes('prisma')) parts.push('prisma');
            // Add Prisma if missing (usually needed for types)
            if (!parts.includes('Prisma')) parts.push('Prisma');

            return `import { ${parts.join(', ')} } from '@repo/schema'`;
        });
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${relativePath}`);
    } else {
        console.log(`No changes needed for ${relativePath}`);
    }
});
