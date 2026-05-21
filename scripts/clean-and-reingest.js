const { db } = require('../src/db');
console.log('Cleaning data from sources we will re-ingest...');
const deleted = db.prepare(`
  DELETE FROM rolls
  WHERE source = 'RPRF'
     OR source_ref LIKE 'NonPDfiles/%'
`).run();
console.log(`  Removed ${deleted.changes} rows`);
console.log('Done. Now run: ./ingest.sh');
