// Spawns the bridge on a temp dir and port, drives it over MCP stdio, then
// reads and patches the notes over HTTP the way the extension does.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('MCP add -> HTTP read -> HTTP patch -> MCP list', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-'));
  const port = 17357 + Math.floor(Math.random() * 1000);
  const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, GERRIT_LENS_DIR: dir, GERRIT_LENS_PORT: String(port) } });
  const replies = new Map();
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) { const m = JSON.parse(buf.slice(0, i)); replies.get(m.id)?.(m); }
  });
  let nextId = 1;
  const rpc = (method, params) => new Promise((resolve) => { const id = nextId++; replies.set(id, resolve); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
  const ext = { Origin: 'chrome-extension://abc', 'Content-Type': 'application/json' };
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
    assert.equal(init.result.serverInfo.name, 'gerrit-lens');
    assert.equal((await rpc('tools/list')).result.tools.length, 3);

    const add = await call('add_review_notes', { change: 42, patchset: 2, source: 'claude', notes: [{ file: 'a.ts', line: 7, lineText: 'x()', severity: 'should', title: 'T', body: 'B', gerritText: 'G' }] });
    assert.ok(!add.isError, add.content[0].text);
    assert.equal((await call('add_review_notes', { change: 42, patchset: 2, notes: [{ body: 'no title' }] })).isError, true);

    await new Promise((r) => setTimeout(r, 150));
    const base = `http://127.0.0.1:${port}`;
    // the extension's service worker sends no Origin: allowed on a loopback Host
    assert.equal((await fetch(`${base}/annotations/42`)).status, 200);
    assert.equal((await fetch(`${base}/annotations/42`, { headers: { Origin: 'http://evil.example' } })).status, 403);
    const rebound = await new Promise((resolve) => require('node:http').get({ host: '127.0.0.1', port, path: '/annotations/42', headers: { Host: `evil.example:${port}` } }, (r) => resolve(r.statusCode)));
    assert.equal(rebound, 403);
    const got = await (await fetch(`${base}/annotations/42`, { headers: ext })).json();
    assert.equal(got.notes.length, 1);
    const { id } = got.notes[0];
    assert.equal(got.notes[0].severity, 'should');

    const patched = await fetch(`${base}/annotations/42/${id}`, { method: 'PATCH', headers: ext, body: JSON.stringify({ status: 'posted' }) });
    assert.equal((await patched.json()).status, 'posted');
    assert.equal((await fetch(`${base}/annotations/42/${id}`, { method: 'PATCH', headers: ext, body: '{"status":"evil"}' })).status, 400);

    // replace keeps posted notes, drops open ones
    await call('add_review_notes', { change: 42, patchset: 3, notes: [{ title: 'N', body: 'b' }] });
    await call('add_review_notes', { change: 42, patchset: 3, replace: true, notes: [{ title: 'M', body: 'b' }] });
    const listed = JSON.parse((await call('list_review_notes', { change: 42 })).content[0].text);
    assert.deepEqual(listed.map((n) => n.title), ['T', 'M']);
  } finally {
    p.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
