const { db } = require('../src/db');

const total = db.prepare('SELECT COUNT(*) as count FROM rolls').get().count;
console.log(`Total rolls: ${total}`);

const bySource = db.prepare(`
  SELECT source, COUNT(*) as count FROM rolls GROUP BY source ORDER BY count DESC
`).all();
console.log('\nBy source:');
bySource.forEach(r => console.log(`  ${r.source}: ${r.count}`));

const byMfg = db.prepare(`
  SELECT manufacturer, COUNT(*) as count FROM rolls
  GROUP BY manufacturer ORDER BY count DESC LIMIT 20
`).all();
console.log('\nTop manufacturers:');
byMfg.forEach(r => console.log(`  ${r.manufacturer}: ${r.count}`));

const byType = db.prepare(`
  SELECT roll_type, COUNT(*) as count FROM rolls
  WHERE roll_type IS NOT NULL
  GROUP BY roll_type ORDER BY count DESC
`).all();
console.log('\nBy roll type:');
byType.forEach(r => console.log(`  ${r.roll_type}: ${r.count}`));
