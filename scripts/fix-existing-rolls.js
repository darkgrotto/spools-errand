const { db } = require('../src/db');

console.log('Fixing existing manufacturer classifications...');

const w150Fixed = db.prepare(
  "UPDATE rolls SET manufacturer = 'QRS' WHERE manufacturer = 'W150'"
).run();
console.log('  W150 -> QRS: ' + w150Fixed.changes + ' rows');

const eightyEightFixed = db.prepare(
  "UPDATE rolls SET manufacturer = 'Standard 88-note' WHERE manufacturer = 'EightyEightNote'"
).run();
console.log('  EightyEightNote -> Standard 88-note: ' + eightyEightFixed.changes + ' rows');

console.log('Rebuilding FTS index...');
db.prepare("INSERT INTO rolls_fts(rolls_fts) VALUES('rebuild')").run();

console.log('Done.');
