const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { initSchema, insertRoll, logIngestion } = require('../src/db');
const { parseQrsCatalog } = require('./parsers/qrs-pdf');

const SOURCES_DIR = path.resolve(__dirname, '..', 'data', 'sources');
const PDF_FILE = 'qrs_catalog.pdf';

async function run() {
  initSchema();
  const pdfPath = path.join(SOURCES_DIR, PDF_FILE);
  if (!fs.existsSync(pdfPath)) {
    console.log(`  Skipping ${PDF_FILE} (not found)`);
    return;
  }

  console.log(`  Processing ${PDF_FILE}...`);
  let totalAdded = 0;
  let totalSkipped = 0;
  try {
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(buffer);
    const rolls = parseQrsCatalog(pdfData.text);
    console.log(`    Parsed ${rolls.length} rolls`);

    for (const roll of rolls) {
      const added = insertRoll({ ...roll, source: 'QRS', sourceRef: PDF_FILE });
      if (added) totalAdded++; else totalSkipped++;
    }
  } catch (err) {
    console.error(`    Error: ${err.message}`);
  }

  logIngestion('QRS', totalAdded, totalSkipped, '');
  console.log(`  Added: ${totalAdded}, Skipped (duplicates): ${totalSkipped}`);
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
