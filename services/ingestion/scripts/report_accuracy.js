#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseFile } = require('../src');

const GOLDEN_DIR = path.join(__dirname, '..', 'tests', 'golden');

function listGoldenSamples() {
  return fs
    .readdirSync(GOLDEN_DIR)
    .filter((name) => !name.startsWith('.'))
    .map((name) => path.join(GOLDEN_DIR, name))
    .filter((entry) => fs.statSync(entry).isDirectory());
}

function loadExpectation(dir) {
  const files = fs.readdirSync(dir);
  const dataFile = files.find((file) => /(\.pdf|\.xlsx|\.csv|\.docx)$/i.test(file));
  if (!dataFile) {
    throw new Error(`No data file found in ${dir}`);
  }
  const expectedPath = path.join(dir, 'expected.json');
  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Missing expected.json in ${dir}`);
  }
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  const buffer = fs.readFileSync(path.join(dir, dataFile));
  const ext = path.extname(dataFile).replace('.', '').toLowerCase();
  return { expected, buffer, fileType: ext, name: path.basename(dir) };
}

function compareDocs(expected, actual) {
  const result = {
    header: {},
    lines: [],
    checksums: {},
    meta: {}
  };

  for (const key of Object.keys(expected.header)) {
    result.header[key] = expected.header[key] === actual.header[key];
  }

  expected.lines.forEach((line, idx) => {
    const actualLine = actual.lines[idx];
    if (!actualLine) {
      result.lines[idx] = false;
      return;
    }
    const lineResult = {};
    for (const field of Object.keys(line)) {
      lineResult[field] = line[field] === actualLine[field];
    }
    result.lines[idx] = lineResult;
  });

  for (const key of Object.keys(expected.checksums)) {
    const expectedValue = Number(expected.checksums[key]);
    const actualValue = Number(actual.checksums[key]);
    const equal = Math.abs(expectedValue - actualValue) < 1e-6;
    result.checksums[key] = equal;
  }

  return result;
}

async function main() {
  const goldenDirs = listGoldenSamples();
  const summary = [];
  for (const dir of goldenDirs) {
    const sample = loadExpectation(dir);
    const actual = await parseFile(sample.buffer, sample.fileType);
    const comparison = compareDocs(sample.expected, actual);
    summary.push({ name: sample.name, comparison });
  }

  console.log('Accuracy report');
  console.log('================');
  summary.forEach(({ name, comparison }) => {
    console.log(`\nSample: ${name}`);
    console.log('Header fields:');
    for (const [key, value] of Object.entries(comparison.header)) {
      console.log(`  ${key}: ${value ? '✓' : '✗'}`);
    }
    console.log('Checksums:');
    for (const [key, value] of Object.entries(comparison.checksums)) {
      console.log(`  ${key}: ${value ? '✓' : '✗'}`);
    }
    console.log('Lines:');
    comparison.lines.forEach((lineResult, idx) => {
      if (lineResult === false) {
        console.log(`  Line ${idx + 1}: ✗ (missing)`);
        return;
      }
      const allGood = Object.values(lineResult).every(Boolean);
      console.log(`  Line ${idx + 1}: ${allGood ? '✓' : '✗'}`);
      if (!allGood) {
        for (const [field, ok] of Object.entries(lineResult)) {
          if (!ok) {
            console.log(`    - ${field}`);
          }
        }
      }
    });
  });
}

main().catch((error) => {
  console.error('Failed to generate accuracy report');
  console.error(error);
  process.exitCode = 1;
});
