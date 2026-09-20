// No dependencies. Bind only to this computer and serve only project files.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const files = new Set(['index.html', 'styles.css', 'app.mjs', 'signal.mjs', 'icon.svg', 'README.md', 'validation.html', 'validation.mjs']);
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.md': 'text/plain' };
const port = Number(process.env.PORT || 8765);
const server = http.createServer(async (req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!['GET', 'HEAD'].includes(req.method) || !files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(join(root, file));
    res.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', e => { console.error(`Cannot start FacePulse: ${e.message}. Set PORT to use a different port.`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`FacePulse is ready at http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
