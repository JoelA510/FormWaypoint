const path = require('path');
const test = require('node:test');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFile } = require('../src');

const fs = require('fs');

const FIXTURE_LOG = path.join(__dirname, 'golden', 'fixtures-log.md');
const FIXTURE_BASE = path.posix.join('services', 'ingestion', 'tests', 'golden');
const BINARY_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx']);

let fixtureCache;

function loadFixtures() {
  if (!fixtureCache) {
    const raw = fs.readFileSync(FIXTURE_LOG, 'utf8');
    const sections = {};
    const sectionRegex = /## ([^\n]+)\n```([\s\S]*?)```/g;
    let match;

    while ((match = sectionRegex.exec(raw))) {
      const filePath = match[1].trim().replace(/ \(Base64\)$/, '');
      const content = match[2].trim();
      sections[filePath] = content;
    }

    fixtureCache = sections;
  }

  return fixtureCache;
}

function loadSample(type, ext) {
  const fixtures = loadFixtures();
  const sampleKey = path.posix.join(FIXTURE_BASE, type, `sample.${ext}`);
  const expectedKey = path.posix.join(FIXTURE_BASE, type, 'expected.json');
  const sampleContent = fixtures[sampleKey];
  const expectedContent = fixtures[expectedKey];

  if (!sampleContent || !expectedContent) {
    throw new Error(`Missing fixture entry for ${type}`);
  }

  const buffer = BINARY_EXTENSIONS.has(ext)
    ? Buffer.from(sampleContent.replace(/\s+/g, ''), 'base64')
    : Buffer.from(sampleContent, 'utf8');
  const expected = JSON.parse(expectedContent);

  return { buffer, expected };
}

test('parseFile normalizes PDF documents to canonical JSON', async () => {
  const { buffer, expected } = loadSample('pdf', 'pdf');
  const doc = await parseFile(buffer, 'pdf');
  assert.equal(doc.header.shipper, expected.header.shipper);
  assert.equal(doc.header.currency, expected.header.currency);
  assert.equal(doc.lines.length, expected.lines.length);
  assert.equal(doc.checksums.quantity, expected.checksums.quantity);
});

test('parseFile normalizes XLSX documents to canonical JSON', async () => {
  const { buffer, expected } = loadSample('xlsx', 'xlsx');
  const doc = await parseFile(buffer, 'xlsx');
  assert.equal(doc.header.incoterm, expected.header.incoterm);
  assert.deepEqual(doc.lines.map((line) => line.partNumber), expected.lines.map((line) => line.partNumber));
  assert.equal(doc.checksums.valueUsd, expected.checksums.valueUsd);
});

test('parseFile normalizes CSV documents to canonical JSON', async () => {
  const { buffer, expected } = loadSample('csv', 'csv');
  const doc = await parseFile(buffer, 'csv');
  assert.equal(doc.header.shipper, expected.header.shipper);
  assert.deepEqual(doc.lines.map((line) => line.countryOfOrigin), expected.lines.map((line) => line.countryOfOrigin));
  assert.equal(doc.checksums.netWeightKg, expected.checksums.netWeightKg);
});

test('parseFile normalizes DOCX documents to canonical JSON', async () => {
  const { buffer, expected } = loadSample('docx', 'docx');
  const doc = await parseFile(buffer, 'docx');
  assert.equal(doc.header.consignee, expected.header.consignee);
  assert.deepEqual(doc.lines.map((line) => line.description), expected.lines.map((line) => line.description));
  assert.equal(doc.checksums.quantity, expected.checksums.quantity);
});

test('parseFile rejects oversized buffers', async () => {
  const largeBuffer = Buffer.alloc(101 * 1024 * 1024, 0);
  await assert.rejects(parseFile(largeBuffer, 'pdf'), {
    message: 'File exceeds 100 MB prototype limit'
  });
});

test('parseFile rejects empty buffers', async () => {
  await assert.rejects(parseFile(Buffer.alloc(0), 'pdf'), {
    message: 'Refusing to parse an empty buffer'
  });
});
