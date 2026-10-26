// Zero-dependency static file server for AppJet Forge.
// Serves the editor (index.html + src/ + styles/) and binds 0.0.0.0 so it works
// inside containers. Override the port with the PORT environment variable.
//
// Security model: this process is a dumb static host for a browser-only engine.
// It exposes an explicit allow-surface (the editor shell, its modules and CSS)
// and refuses everything else — dotfiles, VCS data, dependency trees and the
// server's own sources. `.dockerignore` keeps those files out of the image in
// the first place; the checks below are defence in depth for local `npm start`.

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

// The engine runs user-authored node scripts through `new Function`, so
// 'unsafe-eval' is required for script-src. Everything else stays locked to the
// origin: no remote script/style/frame injection, no `javascript:` URLs, no
// base-tag or form hijacking.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), payment=()',
};

// Files that are part of the delivery pipeline rather than the app itself.
const PRIVATE_FILES = new Set([
  'server.js',
  'dockerfile',
  'dockerignore',
  'package.json',
  'package-lock.json',
  'readme.md',
  'npmrc',
  'env',
]);

function isPrivatePath(relPath) {
  const parts = relPath.split('/').filter(Boolean);
  if (parts.some((part) => part.startsWith('.'))) return true; // .git, .env, dotfiles
  if (parts.some((part) => part === 'node_modules' || part === 'tests')) return true;
  const last = parts[parts.length - 1] || '';
  return PRIVATE_FILES.has(last.toLowerCase());
}

/**
 * Resolve a request URL to a file inside ROOT, or null when the request must
 * not be served (traversal, dotfile, private file, malformed encoding).
 */
function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return { error: 400 };
  }
  if (decoded.includes('\0')) return { error: 400 };
  if (!decoded.startsWith('/')) return { error: 400 };

  const candidate = normalize(join(ROOT, decoded === '/' ? 'index.html' : decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return { error: 403 };

  const relPath = candidate.slice(ROOT.length).split(sep).join('/');
  if (isPrivatePath(relPath)) return { error: 404 };

  return { filePath: candidate };
}

function sendPlain(res, status, body) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function createForgeServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendPlain(res, 405, 'Method Not Allowed');
        return;
      }

      const resolvedPath = safePath(req.url || '/');
      if (resolvedPath.error === 400) {
        sendPlain(res, 400, 'Bad Request');
        return;
      }
      if (resolvedPath.error === 403) {
        sendPlain(res, 403, 'Forbidden');
        return;
      }
      if (resolvedPath.error === 404) {
        sendPlain(res, 404, '404 Not Found');
        return;
      }

      let filePath = resolvedPath.filePath;
      let stat = await fs.stat(filePath).catch(() => null);
      if (stat?.isDirectory()) {
        filePath = join(filePath, 'index.html');
        if (isPrivatePath(filePath.slice(ROOT.length).split(sep).join('/'))) {
          sendPlain(res, 404, '404 Not Found');
          return;
        }
        stat = await fs.stat(filePath).catch(() => null);
      }
      if (!stat?.isFile()) {
        sendPlain(res, 404, '404 Not Found');
        return;
      }

      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(filePath).pipe(res);
    } catch (err) {
      // Log details server-side; never reflect internals to the client.
      console.error('Request failed:', err?.message || err);
      if (!res.headersSent) sendPlain(res, 500, 'Internal Server Error');
      else res.end();
    }
  });
}

export function start() {
  const server = createForgeServer();
  server.listen(PORT, HOST, () => {
    console.log(`AppJet Forge running on http://${HOST}:${PORT}`);
  });
  return server;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) start();
