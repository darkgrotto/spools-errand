const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const { initSchema, insertRoll, logIngestion } = require('../src/db');
const { parseIammpMetadata } = require('./parsers/iammp-meta');

const SOURCES_DIR = path.resolve(__dirname, '..', 'data', 'sources');

function findIammpZips() {
  if (!fs.existsSync(SOURCES_DIR)) return [];
  return fs.readdirSync(SOURCES_DIR)
    .filter(f => f.startsWith('midi-files_') && f.endsWith('.zip'))
    .map(f => path.join(SOURCES_DIR, f));
}

function readTxtFilesFromZip(zipPath) {
  return new Promise((resolve, reject) => {
    const txtContents = [];
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (/\.txt$/i.test(entry.fileName)) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            let data = '';
            readStream.on('data', chunk => data += chunk.toString('utf8'));
            readStream.on('end', () => {
              txtContents.push({ filename: entry.fileName, content: data });
              zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => resolve(txtContents));
      zipfile.on('error', reject);
    });
  });
}

async function run() {
  initSchema();
  const zips = findIammpZips();
  if (zips.length === 0) {
    console.log('No IAMMP midi-files_*.zip files found in data/sources/');
    console.log('Download from: https://archive.org/details/pianorollmusic.com-midifiles');
    return;
  }

  let totalAdded = 0;
  let totalSkipped = 0;

  for (const zipPath of zips) {
    console.log(`  Processing ${path.basename(zipPath)}...`);
    try {
      const txtFiles = await readTxtFilesFromZip(zipPath);
      console.log(`    Found ${txtFiles.length} metadata files`);

      for (const { filename, content } of txtFiles) {
        const rolls = parseIammpMetadata(filename, content);
        for (const roll of rolls) {
          const added = insertRoll({
            ...roll,
            source: 'IAMMP',
            sourceRef: filename
          });
          if (added) totalAdded++; else totalSkipped++;
        }
      }
    } catch (err) {
      console.error(`    Error processing ${zipPath}: ${err.message}`);
    }
  }

  logIngestion('IAMMP', totalAdded, totalSkipped,
    `Processed ${zips.length} zip files`);
  console.log(`  Added: ${totalAdded}, Skipped (duplicates): ${totalSkipped}`);
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
