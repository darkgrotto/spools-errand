const fs = require('fs');
const path = require('path');

const INDEX_HTML = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
"  <title>Spool's Errand</title>\n" +
'  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>\n' +
'  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>\n' +
'  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n' +
'  <script src="https://cdn.tailwindcss.com"></script>\n' +
'  <style>body { margin: 0; font-family: Georgia, serif; }</style>\n' +
'</head>\n' +
'<body>\n' +
'  <div id="root"></div>\n' +
'  <script type="text/babel" data-presets="react" src="/app.js"></script>\n' +
'</body>\n' +
'</html>\n';

const APP_JS = fs.readFileSync(path.resolve(__dirname, 'app-source.js'), 'utf8');

const publicDir = path.resolve(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), INDEX_HTML);
fs.writeFileSync(path.join(publicDir, 'app.js'), APP_JS);
console.log('Wrote public/index.html (' + INDEX_HTML.length + ' bytes)');
console.log('Wrote public/app.js (' + APP_JS.length + ' bytes)');
console.log('Done. Reload the page in Chrome.');
