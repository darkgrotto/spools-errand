const path = require('path');
const fs = require('fs');

console.log("=== Spool's Errand Ingestion ===\n");

const sourcesDir = path.resolve(__dirname, '..', 'data', 'sources');
if (!fs.existsSync(sourcesDir)) {
  console.error(`Source directory not found: ${sourcesDir}`);
  console.error('Create it and place the IAMMP ZIPs and RPRF PDFs there. See README.md.');
  process.exit(1);
}

console.log('Step 1: Ingesting IAMMP metadata...');
try {
  require('./ingest-iammp').run();
} catch (err) {
  console.error('IAMMP ingestion failed:', err.message);
}

console.log('\nStep 2: Ingesting RPRF PDFs...');
try {
  require('./ingest-rprf').run();
} catch (err) {
  console.error('RPRF ingestion failed:', err.message);
}

console.log('\n=== Ingestion complete ===');
console.log('Run `npm run stats` to see catalog statistics.');
