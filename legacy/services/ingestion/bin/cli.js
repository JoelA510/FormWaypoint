#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parseFile } = require('../src/index');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: ingestion-cli <file-path>');
    process.exit(1);
  }

  const filePath = args[0];
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const validExtensions = ['pdf', 'xlsx', 'csv', 'docx'];

  if (!validExtensions.includes(ext)) {
    console.error(`Unsupported file extension: .${ext}. Supported: ${validExtensions.join(', ')}`);
    process.exit(1);
  }

  try {
    const buffer = fs.readFileSync(absolutePath);
    const result = await parseFile(buffer, ext);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error parsing file:', error.message);
    if (error.details) {
      console.error('Validation details:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}

main();
