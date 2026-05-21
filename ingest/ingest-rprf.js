const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { initSchema, insertRoll, logIngestion } = require('../src/db');
const { parseRprfPdf } = require('./parsers/rprf-pdf');

const SOURCES_DIR = path.resolve(__dirname, '..', 'data', 'sources');

const RPRF_PDFS = [
  { file: 'ampico_catalog.pdf', manufacturer: 'Ampico', rollType: 'Ampico' },
  { file: 'duoart_catalog.pdf', manufacturer: 'Duo-Art', rollType: 'Duo-Art' },
  { file: 'welte_catalog.pdf', manufacturer: 'Welte-Mignon', rollType: 'Welte-Mignon' }
];

async function run() {
  initSchema();
  let totalAdded = 0;
  let totalSkipped = 0;

  for (const { file, manufacturer, rollType } of RPRF_PDFS) {
    const pdfPath = path.join(SOURCES_DIR, file);
    if (!fs.existsSync(pdfPath)) {
      console.log(`  Skipping ${file} (not found)`);
      continue;
    }

    console.log(`  Processing ${file}...`);
    try {
      const buffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(buffer);
      const rolls = parseRprfPdf(pdfData.text, manufacturer, rollType);
      console.log(`    Parsed ${rolls.length} rolls`);

      for (const roll of rolls) {
        const added = insertRoll({ ...roll, source: 'RPRF', sourceRef: file });
        if (added) totalAdded++; else totalSkipped++;
      }
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  logIngestion('RPRF', totalAdded, totalSkipped, '');
  console.log(`  Added: ${totalAdded}, Skipped (duplicates): ${totalSkipped}`);
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
