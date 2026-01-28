
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/generated/zod/index.ts');

if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace invalid z.uuid() with z.string().uuid()
    // We use a regex global replacement
    let newContent = content.replace(/z\.uuid\(\)/g, "z.string().uuid()");

    // Patch: Replace DecimalJsLikeSchema with z.any() to avoid Prisma 7 type mismatches.
    // The generated validation is too strict/incorrect for the new Prisma types.
    // We match the whole block including the declaration.

    // 1. Remove the original definition block
    const decimalRegex = /export const DecimalJsLikeSchema: z\.ZodType<Prisma\.DecimalJsLike> = z\.object\({[\s\S]*?}\)/g;
    newContent = newContent.replace(decimalRegex, "export const DecimalJsLikeSchema = z.any()");

    // 2. Also catch the patched version if it was already modified (safety fallback if re-running)
    const decimalRegexPatched = /export const DecimalJsLikeSchema = z\.object\({[\s\S]*?}\)/g;
    newContent = newContent.replace(decimalRegexPatched, "export const DecimalJsLikeSchema = z.any()");


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
