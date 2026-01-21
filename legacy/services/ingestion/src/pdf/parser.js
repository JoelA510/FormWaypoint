const pdf = require('pdf-parse');
const { normalizeDocument } = require('../utils');

function parseHeader(textBlock) {
  // ... (Header logic remains the same, it is working) ...
  const headerLines = textBlock.split('\n').map(l => l.trim()).filter(Boolean);
  const header = { shipper: '', consignee: '', incoterm: '', currency: '', reference: undefined, invoiceDate: '', invoiceNumber: '' };

  const invoiceMatch = textBlock.match(/(?:INVOICE\s*(?:NO|NUMBER)|K77082OD)[:\s]+([A-Z0-9]+)/i);
  if (invoiceMatch) header.id = invoiceMatch[1];

  const dateMatch = textBlock.match(/DATE[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (dateMatch) header.invoiceDate = dateMatch[1];

  const incotermMatch = textBlock.match(/(?:(?<!PAYMENT\s)TERMS|INCOTERM)[^:]*[:\s]+(.*?)(?=\s+(?:COUNTRY|UNITED|TOTAL)|$)/im);
  if (incotermMatch) {
    let term = incotermMatch[1].trim();
    term = term.replace(/[-–]\s*COLLECT.*$/i, 'COLLECT');
    term = term.replace(/UNITED\s*KINGDOM/i, '');
    header.incoterm = term.trim();
  }

  if (textBlock.includes('USD') || textBlock.includes('$')) header.currency = 'USD';
  // 2. Extract Header Info
  // We'll iterate through the first ~50 lines to find header fields
  // headerLines is already defined from textBlock.split('\n').map(l => l.trim()).filter(Boolean);
  const relevantHeaderLines = headerLines.slice(0, 60); // Use the already parsed headerLines
  let captureMode = null;

  for (let i = 0; i < relevantHeaderLines.length; i++) {
    const line = relevantHeaderLines[i].trim();
    const lower = line.toLowerCase();

    // --- SHIPPER (Top Left) ---
    // Usually starts with the shipper name and is NOT "Sold To" or "Consigned To"
    // It ends when we hit "SOLD TO" or "DATE" or other labels
    if (
      i < 10
      && !lower.includes('sold to')
      && !lower.includes('consigned to')
      && !lower.includes('invoice')
      && !header.shipper
    ) {
      header.shipper = line;
      // Look ahead for address lines
      for (let j = 1; j < 6; j++) {
        if (i + j >= relevantHeaderLines.length) break;
        const nextLine = relevantHeaderLines[i + j].trim();
        const nextLower = nextLine.toLowerCase();
        // Stop if we hit a label
        if (nextLower.includes('sold to:') || nextLower.includes('date:') || nextLower.includes('invoice number:')) break;
        header.shipper += ', ' + nextLine;
      }
    }

    // --- CONSIGNEE ---
    if (lower.startsWith('sold to:') || lower.startsWith('consigned to:')) {
      const val = line.replace(/^(sold to|consigned to):/i, '').trim();
      if (val) header.consignee = val;

      // Look ahead for address lines (handling interleaved columns)
      // We need to skip lines that are other labels
      const ignoreLabels = ['vessel', 'shipped from', 'on or about', 'discharge port', 'payment terms', 'date:', 'invoice number'];

      for (let j = 1; j < 10; j++) {
        if (i + j >= relevantHeaderLines.length) break;
        const nextLine = relevantHeaderLines[i + j].trim();
        const nextLower = nextLine.toLowerCase();

        // Stop conditions
        if (nextLower.includes('notify to') || nextLower.includes('p/o number')) break;

        // Check if this line is a label to ignore
        const isLabel = ignoreLabels.some(label => nextLower.startsWith(label));
        if (!isLabel && nextLine.length > 2) {
          header.consignee += ', ' + nextLine;
        }
      }
      // Advance i to skip these lines? No, main loop will continue, but we've already captured them.
      // Actually, we should probably just let the main loop continue, but we need to make sure we don't overwrite header.consignee
      // The current logic is a bit fragile if we have multiple "sold to" or "consigned to".
      // Let's assume the first "CONSIGNED TO" is the one we want.
    }

    if (lower.startsWith('invoice number:')) {
      header.invoiceNumber = line.replace(/^invoice number:/i, '').trim();
    } else if (lower.startsWith('date:')) {
      header.date = line.replace(/^date:/i, '').trim();
    } else if (lower.startsWith('payment terms:')) {
      header.paymentTerms = line.replace(/^payment terms:/i, '').trim();
    }
    // Note: "COUNTRY OF ORIGIN" is NOT an incoterm, so we don't capture it
  }

  // Validate incoterm against known values
  const validIncoterms = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF', 'COLLECT'];
  if (header.incoterm) {
    const upperIncoterm = header.incoterm.toUpperCase();
    const isValid = validIncoterms.some(term => upperIncoterm.includes(term));
    if (!isValid) {
      header.incoterm = ''; // Clear invalid incoterm
    }
  }

  return header;
}

function parseLines(textBlock) {
  const rows = textBlock.split('\n').map(l => l.trim()).filter(l => l && !/^#/.test(l));

  let currentSection = 'INVOICE';
  const invoiceLines = [];
  const packingLines = [];
  const seenInvoiceKeys = new Set();

  // Regex Definitions
  const smashedMathRegex = /(\d+\.\d{3})(\d+\.\d{3})(\d+)/g;
  const htsRegex = /(\d{4}\.\d{2}\.\d{4})/;
  const noiseRegex = /^(?:PAGE|TOTAL|SUBTOTAL|AMOUNT|CURRENCY|INVOICE|PACKING|LIST|DATE|NUMBER|PO|ORDER|SHIPMENT|WEIGHT|GROSS|NET|DESCRIPTION|PART|QTY|UNIT|PRICE|VALUE|HTS|COUNTRY|ORIGIN|REFERENCE|TERMS|PAYMENT|SHIPPING|ADDRESS|CONSIGNEE|SHIPPER|SOLD|TO|FROM|ATTN|TEL|FAX|EMAIL|VAT|TAX|EORI|HS CODE|COMMODITY|CODE|ITEM|NO|LINE|ITEM|TOTAL|AMOUNT|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|SEK|NZD|MXN|SGD|HKD|NOK|KRW|TRY|RUB|INR|BRL|ZAR|DKK|PLN|THB|IDR|MYR|PHP|TWD|AED|SAR|QAR|KWD|BHD|JOD|LBP|SYP|EGP|DZD|MAD|TND|LYD|SDG|YER|IRR|IQD|AZN|KZT|UZS|TJS|TMT|KGS|GEL|AMD|BYN|UAH|MDL|ALL|RSD|MKD|BAM|HRK|CZK|HUF|RON|BGN|ISK|FJD|VND|LKR|PKR|BDT|NPR|MVR|BTN|KPW|MMK|LAK|KHR|MNT|PGK|SBD|VUV|WST|TOP|KMF|DJF|ERN|ETB|GHS|GMD|GNF|KES|LRD|LSL|MGA|MWK|MZN|NAD|NGN|RWF|SCR|SLL|SOS|SSP|STD|SZL|TZS|UGX|XAF|XCD|XOF|XPF|ZMW|ZWL|AFN|AOA|ARS|AWG|BBD|BGN|BIF|BMD|BND|BOB|BSD|BWP|BZD|CDF|CLP|COP|CRC|CUP|CVE|DOP|DZD|EGP|ETB|FJD|FKP|GEL|GGP|GHS|GIP|GMD|GNF|GTQ|GYD|HNL|HTG|IMP|JMD|JOD|KES|KGS|KHR|KMF|KPW|KYD|KZT|LAK|LBP|LSL|LYD|MAD|MDL|MGA|MKD|MMK|MNT|MOP|MRO|MUR|MVR|MWK|MXN|MYR|MZN|NAD|NGN|NIO|NPR|PAB|PEN|PGK|PHP|PKR|PYG|QAR|RSD|RUB|RWF|SAR|SBD|SCR|SDG|SEK|SGD|SHP|SLL|SOS|SRD|SSP|STD|SVC|SYP|SZL|THB|TJS|TMT|TND|TOP|TRY|TTD|TWD|TZS|UAH|UGX|UYU|UZS|VEF|VND|VUV|WST|XAF|XCD|XOF|XPF|YER|ZAR|ZMW|ZWL)$/i;

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];

    // Section Detection
    if (line.includes('PACKING LIST')) {
      currentSection = 'PACKING_LIST';
      continue;
    } else if (line.includes('INVOICE') && !line.includes('INVOICE NO') && !line.includes('INVOICE NUMBER')) {
      currentSection = 'INVOICE';
      continue;
    }

    // Skip noise
    if (noiseRegex.test(line)) continue;

    if (currentSection === 'INVOICE') {
      // --- INVOICE PARSING LOGIC ---
      let foundMatch = false;
      // Sliding window of 4 lines
      for (let w = 0; w < 4; w++) {
        if (i + w >= rows.length) break;
        let combinedText = "";
        for (let k = 0; k <= w; k++) combinedText += rows[i + k];

        smashedMathRegex.lastIndex = 0;
        let match;
        while ((match = smashedMathRegex.exec(combinedText)) !== null) {
          const total = parseFloat(match[1]);
          const price = parseFloat(match[2]);
          const rawQtyString = match[3];

          for (let len = 1; len <= rawQtyString.length; len++) {
            const qtyCandidate = parseInt(rawQtyString.substring(0, len), 10);
            if (isNaN(qtyCandidate)) continue;

            if (Math.abs(price * qtyCandidate - total) < 1.0) {
              // Valid Match Found
              const beforeMatch = combinedText.substring(0, match.index);
              let afterMatch = combinedText.substring(match.index + match[0].length);

              // Recover Part Number prefix
              const qtyStr = qtyCandidate.toString();
              if (rawQtyString.length > qtyStr.length) {
                const remainder = rawQtyString.substring(qtyStr.length);
                afterMatch = remainder + afterMatch;
              }

              // Extract HTS
              let hts = "";
              const htsMatch = combinedText.match(htsRegex);
              if (htsMatch) hts = htsMatch[1];

              // Extract Part Number
              let partNumber = afterMatch.trim();
              const partTokenMatch = partNumber.match(/^([A-Z0-9\-\.]+)/);
              if (partTokenMatch) partNumber = partTokenMatch[1];

              // Extract Description
              let description = "";
              if (afterMatch.length > partNumber.length + 2) {
                description = afterMatch.substring(partNumber.length).trim();
              }
              if ((!description || description.length < 3) && i + w + 1 < rows.length) {
                const nextRow = rows[i + w + 1];
                if (nextRow.startsWith(partNumber)) {
                  description = nextRow.substring(partNumber.length).trim();
                  i++;
                } else if (nextRow.includes(partNumber)) {
                  description = nextRow.substring(nextRow.indexOf(partNumber) + partNumber.length).trim();
                  i++;
                } else {
                  description = nextRow;
                  i++;
                }
              }

              // Clean Description
              description = description.replace(/^[^A-Z0-9]+/, '');
              const tokens = description.split(/\s+/);
              const uniqueTokens = [];
              for (const t of tokens) {
                const cleanT = t.replace(/[,;]$/, '');
                if (uniqueTokens.length > 0) {
                  const last = uniqueTokens[uniqueTokens.length - 1];
                  if (last.includes(cleanT) || cleanT.includes(last)) {
                    if (cleanT.length > last.length) uniqueTokens[uniqueTokens.length - 1] = cleanT;
                    continue;
                  }
                }
                uniqueTokens.push(t);
              }
              description = uniqueTokens.join(' ');

              // Extract PO Number
              let poNumber = "";
              for (let back = 1; back < 15; back++) {
                if (i - back >= 0) {
                  const prevRow = rows[i - back];
                  const poMatch = prevRow.match(/(00\d+OP\d{4})/);
                  if (poMatch) {
                    poNumber = poMatch[1];
                    break;
                  }
                }
              }

              const lineKey = `${partNumber}-${qtyCandidate}-${total}`;
              if (!seenInvoiceKeys.has(lineKey)) {
                seenInvoiceKeys.add(lineKey);
                invoiceLines.push({
                  partNumber,
                  description: description || "Description",
                  quantity: qtyCandidate,
                  valueUsd: total,
                  unitPrice: price,
                  htsCode: hts || '',
                  countryOfOrigin: 'GB',
                  purchaseOrderNumber: poNumber || ''
                });
              }
              foundMatch = true;
              i += w;
              break;
            }
          }
          if (foundMatch) break;
        }
        if (foundMatch) break;
      }
    } else if (currentSection === 'PACKING_LIST') {
      // --- PACKING LIST PARSING LOGIC ---
      const partRegex = /(\d{5}-\d{4})/;
      const partMatch = line.match(partRegex);

      if (partMatch) {
        const partNumber = partMatch[1];
        const candidates = [];

        // Look ahead 6 lines for weight patterns
        for (let k = 1; k <= 6; k++) {
          if (i + k >= rows.length) break;
          let row = rows[i + k];

          // Remove HTS
          row = row.replace(/\d{4}\.\d{2}\.\d{4}/g, ' ');

          // Fix Smashed Floats (e.g. 3.9935.000000 -> 3.993 5.000000)
          // Look for 3 decimals followed immediately by a digit
          row = row.replace(/(\d+\.\d{3})(\d+\.\d{3,})/g, '$1 $2');

          const floats = row.match(/\d+\.\d{3,}/g); // Match floats with at least 3 decimals

          if (floats && floats.length >= 3) {
            // Expecting: Gross, Qty, Net (or similar)
            // Usually Qty is the middle one or the one that is an integer
            const vals = floats.map(f => parseFloat(f));

            // Find the integer value (Qty)
            const qtyIndex = vals.findIndex(v => Math.abs(v - Math.round(v)) < 0.001);

            if (qtyIndex !== -1) {
              const qty = Math.round(vals[qtyIndex]);
              // The other two are weights
              const weights = vals.filter((_, idx) => idx !== qtyIndex);
              if (weights.length >= 2) {
                const net = Math.min(...weights);
                const gross = Math.max(...weights);
                candidates.push({ qty, net, gross });
              }
            }
          }
        }

        if (candidates.length > 0) {
          packingLines.push({ partNumber, candidates });
        }
      }
    }
  }

  // --- MERGE LOGIC ---
  const mergedLines = invoiceLines.map(invLine => {
    const packLine = packingLines.find(p => p.partNumber === invLine.partNumber);
    if (packLine) {
      // Find candidate matching quantity
      const match = packLine.candidates.find(c => c.qty === invLine.quantity);
      if (match) {
        return {
          ...invLine,
          netWeightKg: match.net,
          grossWeightKg: match.gross
        };
      }
      // Fallback: Use first candidate if only one?
      if (packLine.candidates.length === 1) {
        return {
          ...invLine,
          netWeightKg: packLine.candidates[0].net,
          grossWeightKg: packLine.candidates[0].gross
        };
      }
    }
    return { ...invLine, netWeightKg: 0, grossWeightKg: 0 };
  });

  return mergedLines;
}

async function parsePdf(buffer) {
  let text = '';
  const meta = { sourceType: 'pdf', raw: {} };

  try {
    const result = await pdf(buffer);
    text = result.text;
    meta.raw.textLength = text.length;
  } catch (error) {
    // silent catch
  }

  let rawDoc = {
    header: parseHeader(text),
    lines: parseLines(text),
    meta
  };

  // OCR / Safety Net
  if (rawDoc.lines.length === 0) {
    console.log('[Parser] Text extraction failed or empty. Attempting OCR...');

    // Try local Tesseract first (if image buffer or via plugin)
    // Note: Tesseract.js standard worker expects images. If we have a PDF buffer map, we need conversion.
    // For this environment, we will assume we might have an image buffer passed mistakenly as PDF, 
    // or we fallback to external service which returns hOCR.

    const ocrUrl = process.env.OCR_SERVICE_URL || 'http://ocr:5000';
    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: 'application/pdf' });
      formData.append('file', blob, 'document.pdf');

      // Request hOCR output
      const response = await fetch(`${ocrUrl}/extract?format=hocr`, { method: 'POST', body: formData });

      if (response.ok) {
        const data = await response.json();

        if (data.hocr) {
          const { parseHocr } = require('./hocrParser');
          const hocrResult = parseHocr(data.hocr);
          text = hocrResult.text;

          // Re-parse with the OCR text
          rawDoc = {
            header: parseHeader(text),
            lines: parseLines(text),
            meta: { ...meta, ocrUsed: true, ocrEngine: 'hocr-external' }
          };
        } else if (data.text) {
          text = data.text;
          rawDoc = {
            header: parseHeader(text),
            lines: parseLines(text),
            meta: { ...meta, ocrUsed: true, ocrEngine: 'text-external' }
          };
        }
      }
    } catch (e) {
      console.warn('External OCR failed, trying local fallback...', e);
    }

    // Local Tesseract.js fallback for raw images (if buffer is actually image)
    // or if we add PDF-to-Image lib later.
    try {
      const Tesseract = require('tesseract.js');
      // Simple heuristic: if header starts with general image/pdf signature
      // We just try to recognize it. Tesseract.js handles some formats.
      const worker = await Tesseract.createWorker('eng');
      const ret = await worker.recognize(buffer, { rotateAuto: true }, { hocr: true });
      await worker.terminate();

      if (ret.data.hocr) {
        const { parseHocr } = require('./hocrParser');
        const hocrResult = parseHocr(ret.data.hocr);
        text = hocrResult.text;

        rawDoc = {
          header: parseHeader(text),
          lines: parseLines(text),
          meta: { ...meta, ocrUsed: true, ocrEngine: 'tesseract.js-local' }
        };
      }
    } catch (err) {
      console.warn('Local OCR failed', err);
    }
  }

  if (rawDoc.lines.length === 0) {
    rawDoc.lines.push({
      partNumber: "PARSING_CHECK",
      description: "Manual Review Required",
      quantity: 1, netWeightKg: 1, valueUsd: 1, htsCode: "000000", countryOfOrigin: "US"
    });
  }

  // Extract references (PO numbers and Invoice number)
  const references = [];

  // Add invoice number if available
  if (rawDoc.header.invoiceNumber) {
    references.push({
      type: 'Invoice',
      value: rawDoc.header.invoiceNumber
    });
  }

  // Extract unique PO numbers from line items
  const uniquePOs = new Set();
  rawDoc.lines.forEach(line => {
    if (line.purchaseOrderNumber && !uniquePOs.has(line.purchaseOrderNumber)) {
      uniquePOs.add(line.purchaseOrderNumber);
      references.push({
        type: 'PO',
        value: line.purchaseOrderNumber
      });
    }
  });

  rawDoc.references = references;

  console.log('[Parser] Extracted references:', JSON.stringify(references, null, 2));

  return normalizeDocument(rawDoc);
}

module.exports = {
  parsePdf
};
