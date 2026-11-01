const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const args = process.argv.slice(2);
let host = process.env.HOST || '127.0.0.1';
let port = Number(process.env.PORT || 7100);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--host' && args[index + 1]) host = args[++index];
  else if (arg.startsWith('--host=')) host = arg.slice('--host='.length);
  else if (arg === '--port' && args[index + 1]) port = Number(args[++index]);
  else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Порт должен быть целым числом от 1 до 65535.');
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname.includes('\0')) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
});

server.on('error', error => {
  console.error(`Не удалось запустить сервер: ${error.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Sixth Year Web: http://${host}:${port}/`);
});
