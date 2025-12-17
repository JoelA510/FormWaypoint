#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx-js-style');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } = require('docx');

const GOLDEN_DIR = path.join(__dirname);

const canonical = {
  header: {
    shipper: 'Acme Exports',
    consignee: 'Global Imports',
    incoterm: 'FOB',
    currency: 'USD',
    reference: 'PO-12345'
  },
  lines: [
    {
      partNumber: 'W123',
      description: 'Widget Assembly',
      quantity: 10,
      netWeightKg: 125.5,
      valueUsd: 1500,
      htsCode: '847150',
      countryOfOrigin: 'US'
    },
    {
      partNumber: 'G456',
      description: 'Gadget Kit',
      quantity: 5,
      netWeightKg: 25,
      valueUsd: 750,
      htsCode: '902710',
      countryOfOrigin: 'CN'
    }
  ],
  checksums: {
    quantity: 15,
    netWeightKg: 150.5,
    valueUsd: 2250
  },
  meta: {
    sourceType: 'expected',
    raw: {},
    normalization: {}
  }
};

function ensureDir(name) {
  const dir = path.join(GOLDEN_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeExpected(dir) {
  fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(canonical, null, 2));
}

function createPdfSample(dir) {
  const lines = [
    'Header:',
    'Shipper: Acme Exports',
    'Consignee: Global Imports',
    'Incoterm: FOB',
    'Currency: usd',
    'Reference: PO-12345',
    '',
    'Lines:',
    'W123 | Widget Assembly | 10 | 125.5 kg | 1500 USD | 847150 | US',
    'G456 | Gadget Kit | 5 | 25 kg | 750 USD | 902710 | CN'
  ];
  fs.writeFileSync(path.join(dir, 'sample.pdf'), lines.join('\n') + '\n');
}

function createXlsxSample(dir) {
  const headerSheet = [
    ['Shipper', 'Acme Exports'],
    ['Consignee', 'Global Imports'],
    ['Incoterm', 'FOB'],
    ['Currency', 'usd'],
    ['Reference', 'PO-12345']
  ];
  const linesSheet = [
    ['PartNumber', 'Description', 'Quantity', 'NetWeightKg', 'ValueUsd', 'HTS', 'COO'],
    ['W123', 'Widget Assembly', 10, '125.5 kg', '$1500', '847150', 'US'],
    ['G456', 'Gadget Kit', 5, '25kg', 'USD 750', '902710', 'cn']
  ];
  const wb = XLSX.utils.book_new();
  const headerWs = XLSX.utils.aoa_to_sheet(headerSheet);
  const linesWs = XLSX.utils.aoa_to_sheet(linesSheet);
  XLSX.utils.book_append_sheet(wb, headerWs, 'Header');
  XLSX.utils.book_append_sheet(wb, linesWs, 'Lines');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(path.join(dir, 'sample.xlsx'), buffer);
}

function createCsvSample(dir) {
  const header = ['# Shipper: Acme Exports', '# Consignee: Global Imports', '# Incoterm: FOB', '# Currency: usd', '# Reference: PO-12345'];
  const lines = [
    'partNumber,description,quantity,netWeightKg,valueUsd,htsCode,countryOfOrigin',
    'W123,Widget Assembly,10,125.5 kg,1500 USD,847150,us',
    'G456,Gadget Kit,5,25 kg,USD 750,902710,CN'
  ];
  const content = header.concat([''], lines).join('\n');
  fs.writeFileSync(path.join(dir, 'sample.csv'), content);
}

async function createDocxSample(dir) {
  const headerParagraphs = [
    new Paragraph({ text: 'Shipper: Acme Exports' }),
    new Paragraph({ text: 'Consignee: Global Imports' }),
    new Paragraph({ text: 'Incoterm: FOB' }),
    new Paragraph({ text: 'Currency: usd' }),
    new Paragraph({ text: 'Reference: PO-12345' })
  ];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ['PartNumber', 'Description', 'Quantity', 'NetWeightKg', 'ValueUsd', 'HTS', 'COO'].map(
          (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] })
        )
      }),
      new TableRow({
        children: ['W123', 'Widget Assembly', '10', '125.5 kg', '1500 USD', '847150', 'us'].map(
          (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] })
        )
      }),
      new TableRow({
        children: ['G456', 'Gadget Kit', '5', '25 kg', 'USD 750', '902710', 'CN'].map(
          (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] })
        )
      })
    ]
  });

  const doc = new Document({
    sections: [
      {
        children: [...headerParagraphs, table]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(dir, 'sample.docx'), buffer);
}

async function main() {
  const pdfDir = ensureDir('pdf');
  writeExpected(pdfDir);
  createPdfSample(pdfDir);

  const xlsxDir = ensureDir('xlsx');
  writeExpected(xlsxDir);
  createXlsxSample(xlsxDir);

  const csvDir = ensureDir('csv');
  writeExpected(csvDir);
  createCsvSample(csvDir);

  const docxDir = ensureDir('docx');
  writeExpected(docxDir);
  await createDocxSample(docxDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
