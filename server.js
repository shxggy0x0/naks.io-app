const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const rootDir = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=UTF-8'
};

function getFilePath(urlPath) {
  const safeSuffix = path.normalize(urlPath).replace(/^\\+|^\/+/, '');
  let filePath = path.join(rootDir, safeSuffix);
  if (urlPath === '/' || fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath === rootDir ? rootDir : filePath, 'index.html');
  }
  return filePath;
}

const server = http.createServer((req, res) => {
  const filePath = getFilePath(req.url.split('?')[0]);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Simple SPA fallback: if direct file not found, try index.html
      if (err.code === 'ENOENT') {
        const fallback = path.join(rootDir, 'index.html');
        fs.readFile(fallback, (fbErr, fbData) => {
          if (fbErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
            res.end(fbData);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});



