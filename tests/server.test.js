// Server hardening tests: the static host must expose the editor and nothing
// else. Run with `npm test` (node --test tests/).

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { join } from 'node:path';
import { createForgeServer } from '../server.js';

let server;
// The suite talks to the server over a unix domain socket: nothing is bound to
// an interface, so running tests never opens a port on the developer machine.
const socketPath = join(os.tmpdir(), `forge-test-${process.pid}-${Date.now()}.sock`);

function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path, method },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('static server hardening', async (t) => {
  server = createForgeServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });

  await t.test('serves the editor shell with hardened headers', async () => {
    const res = await request('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /AppJet Forge/);

    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(res.headers['content-security-policy'], /object-src 'none'/);
  });

  await t.test('serves app assets with correct MIME types', async () => {
    const css = await request('/styles/editor.css');
    assert.equal(css.status, 200);
    assert.match(css.headers['content-type'], /text\/css/);

    const js = await request('/src/editor/app.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /text\/javascript/);
  });

  await t.test('never serves VCS data (which can embed credentials)', async () => {
    for (const path of ['/.git/config', '/.git/HEAD', '/.git/refs/heads/appjet']) {
      const res = await request(path);
      assert.equal(res.status, 404, `${path} must not be served`);
      assert.ok(!res.body.includes('[core]'), `${path} must not leak git config`);
    }
  });

  await t.test('never serves dotfiles or env files', async () => {
    for (const path of ['/.env', '/.env.local', '/.dockerignore', '/.gitignore', '/.npmrc']) {
      const res = await request(path);
      assert.equal(res.status, 404, `${path} must not be served`);
    }
  });

  await t.test('never serves server sources, deploy files or dependencies', async () => {
    for (const path of [
      '/server.js',
      '/Dockerfile',
      '/package.json',
      '/package-lock.json',
      '/README.md',
      '/tests/project.test.js',
      '/node_modules/jsdom/package.json',
    ]) {
      const res = await request(path);
      assert.equal(res.status, 404, `${path} must not be served`);
    }
  });

  await t.test('blocks path traversal in every encoding', async () => {
    for (const path of [
      '/../etc/passwd',
      '/../../../../etc/passwd',
      '/..%2f..%2fetc%2fpasswd',
      '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/src/../../etc/passwd',
    ]) {
      const res = await request(path);
      assert.ok([403, 404].includes(res.status), `${path} -> ${res.status}`);
      assert.ok(!res.body.includes('root:'), `${path} must not leak /etc/passwd`);
    }
  });

  await t.test('rejects malformed URLs with 400 and no internals', async () => {
    for (const path of ['/%', '/%E0%A4%A', '/%00']) {
      const res = await request(path);
      assert.equal(res.status, 400, `${path} -> ${res.status}`);
      assert.ok(!/URI malformed|Error:|at Object/.test(res.body), `${path} leaked internals: ${res.body}`);
    }
  });

  await t.test('rejects write methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await request('/', method);
      assert.equal(res.status, 405, `${method} must be rejected`);
    }
  });

  await t.test('unknown paths 404 without leaking the document root', async () => {
    const res = await request('/does-not-exist');
    assert.equal(res.status, 404);
    assert.ok(!res.body.includes('/app'), 'no absolute paths in the response');
  });

  await t.test('security headers are present on error responses too', async () => {
    const res = await request('/.git/config');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  });

  await new Promise((resolve) => server.close(resolve));
  await fs.unlink(socketPath).catch(() => {});
});
