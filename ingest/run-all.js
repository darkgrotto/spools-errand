const path = require('path');
const fs = require('fs');

console.log("=== Spool's Errand Ingestion ===\n");

const sourcesDir = path.resolve(__dirname, '..', 'data', 'sources');
if (!fs.existsSync(sourcesDir)) {
  console.error(`Source directory not found: ${sourcesDir}`);
  console.error('Create it and place the IAMMP ZIPs and RPRF PDFs there. See README.md.');
  process.exit(1);
}

const steps = [
  ['IAMMP metadata', './ingest-iammp'],
  ['RPRF PDFs',      './ingest-rprf'],
  ['QRS catalog PDF', './ingest-qrs'],
];

(async () => {
  for (let i = 0; i < steps.length; i++) {
    const [label, mod] = steps[i];
    console.log(`Step ${i + 1}: Ingesting ${label}...`);
    try {
      await require(mod).run();
    } catch (err) {
      console.error(`  ${label} ingestion failed: ${err.message}`);
    }
    console.log();
  }
  console.log('=== Ingestion complete ===');
  console.log('Run `npm run stats` to see catalog statistics.');
})();
