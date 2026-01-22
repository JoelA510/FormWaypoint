
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/generated/zod/index.ts');

if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace invalid z.uuid() with z.string().uuid()
    // We use a regex global replacement
    const newContent = content.replace(/z\.uuid\(\)/g, 'z.string().uuid()');

    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Successfully patched z.uuid() to z.string().uuid() in generated Zod file.');
    } else {
        console.log('No z.uuid() found to patch.');
    }
} else {
    console.error('Generated Zod file not found:', filePath);
    process.exit(1);
}
