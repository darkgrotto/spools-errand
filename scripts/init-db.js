const { initSchema, db } = require('../src/db');

console.log('Initializing database schema...');
initSchema();
const tables = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
`).all();
console.log('Tables created:');
tables.forEach(t => console.log('  - ' + t.name));
console.log('Done.');
