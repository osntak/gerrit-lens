#!/usr/bin/env node
// Gerrit Lens bridge.
//
// One process, two faces:
//   - MCP server on stdio, so Claude Code / Codex can attach review notes to a
//     Gerrit change (tools: add_review_notes, list_review_notes, ...).
//   - HTTP on 127.0.0.1, so the extension can read the notes and mark them
//     posted/dismissed. Only chrome-extension:// origins are let in.
//
// Notes live in ~/.gerrit-lens/notes/<change>.json. One server serves every
// change; there is nothing per commit to start.
//
//   node bridge/server.js           MCP on stdio + HTTP
//   node bridge/server.js --http    HTTP only (keep it running in a terminal)

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.GERRIT_LENS_PORT) || 7357;
const DIR = process.env.GERRIT_LENS_DIR || path.join(os.homedir(), '.gerrit-lens', 'notes');
const SEVERITIES = ['must', 'should', 'nit', 'info'];
const STATUSES = ['open', 'posted', 'dismissed'];
const log = (...a) => process.stderr.write(`[gerrit-lens] ${a.join(' ')}\n`);

// ---------- storage ----------

function fileOf(change) {
  const n = Number(change);
  if (!Number.isInteger(n) || n <= 0) throw new Error('change must be a positive integer');
  return path.join(DIR, `${n}.json`);
}

function readNotes(change) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(change), 'utf8')).notes || [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function writeNotes(change, notes) {
  fs.mkdirSync(DIR, { recursive: true });
  const file = fileOf(change);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ change: Number(change), notes }, null, 2));
  fs.renameSync(tmp, file);
}

const str = (v, max) => (v == null ? undefined : String(v).slice(0, max));

function cleanNote(raw, change, patchset, source) {
  const ps = Number(raw.patchset ?? patchset);
  if (!Number.isInteger(ps) || ps <= 0) throw new Error('patchset must be a positive integer');
  if (!raw.title) throw new Error('every note needs a title');
  const line = raw.line == null ? null : Number(raw.line);
  return {
    id: crypto.randomUUID().slice(0, 8),
    change: Number(change),
    patchset: ps,
    file: str(raw.file, 1000) || null,
    line: Number.isInteger(line) && line > 0 ? line : null,
    lineText: str(raw.lineText, 2000),
    severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'info',
    title: str(raw.title, 300),
    summary: str(raw.summary, 1000),
    context: str(raw.context, 200),
    body: str(raw.body, 20000) || '',
    refs: Array.isArray(raw.refs) ? raw.refs.slice(0, 20).map((r) => ({
      file: str(r.file, 1000), line: r.line == null ? undefined : Number(r.line), code: str(r.code, 8000), note: str(r.note, 4000),
    })) : [],
    gerritText: str(raw.gerritText, 8000),
    source: str(raw.source ?? source, 40),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

// ---------- MCP tools ----------

const NOTE_SCHEMA = {
  type: 'object',
  required: ['title', 'body'],
  properties: {
    file: { type: 'string', description: 'Path in the repo as Gerrit shows it. Omit for a change-level note. Use /COMMIT_MSG for the commit message.' },
    line: { type: 'integer', description: 'Line on the NEW side of the patchset the note was written for.' },
    lineText: { type: 'string', description: 'Exact text of that line. Lets the extension move the note to the right line on later patchsets.' },
    severity: { type: 'string', enum: SEVERITIES, description: 'must = blocks merge, should = suggestion, nit = minor, info = context only.' },
    title: { type: 'string', description: 'One line, the claim itself.' },
    summary: { type: 'string', description: 'Optional one-sentence status, e.g. why it is still open on this patchset.' },
    context: { type: 'string', description: 'Optional short tag shown next to the title, e.g. "existing bug exposed by this change".' },
    body: { type: 'string', description: 'Explanation for the reviewer. Markdown: paragraphs, `code`, ```fences```, **bold**.' },
    refs: {
      type: 'array',
      description: 'Code the reviewer should look at.',
      items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' }, code: { type: 'string' }, note: { type: 'string' } } },
    },
    gerritText: { type: 'string', description: 'Ready-to-post comment text in the reviewer\'s voice. The extension turns it into a Gerrit draft when the user clicks Post.' },
    patchset: { type: 'integer', description: 'Overrides the call-level patchset for this note.' },
  },
};

const TOOLS = [
  {
    name: 'add_review_notes',
    description: 'Attach review notes to a Gerrit change. They appear inline in the Gerrit Lens extension next to the line, where the user can post them as Gerrit drafts, edit them first, or dismiss them. Nothing is published to Gerrit by this tool.',
    inputSchema: {
      type: 'object',
      required: ['change', 'patchset', 'notes'],
      properties: {
        change: { type: 'integer', description: 'Gerrit change number, e.g. 1042.' },
        patchset: { type: 'integer', description: 'Patchset the line numbers refer to.' },
        replace: { type: 'boolean', description: 'Drop notes from earlier runs that are still open before adding. Posted/dismissed ones are kept.' },
        source: { type: 'string', description: 'Who wrote them, e.g. "claude" or "codex".' },
        notes: { type: 'array', items: NOTE_SCHEMA },
      },
    },
  },
  {
    name: 'list_review_notes',
    description: 'List the notes on a change, including their status: open, posted (the user turned it into a Gerrit draft) or dismissed.',
    inputSchema: { type: 'object', required: ['change'], properties: { change: { type: 'integer' } } },
  },
  {
    name: 'remove_review_notes',
    description: 'Remove notes from a change. Give ids to remove some, or omit ids to remove all of them.',
    inputSchema: {
      type: 'object',
      required: ['change'],
      properties: { change: { type: 'integer' }, ids: { type: 'array', items: { type: 'string' } } },
    },
  },
];

function callTool(name, args) {
  switch (name) {
    case 'add_review_notes': {
      if (!Array.isArray(args.notes) || !args.notes.length) throw new Error('notes must be a non-empty array');
      const added = args.notes.map((n) => cleanNote(n, args.change, args.patchset, args.source));
      const kept = readNotes(args.change).filter((n) => !args.replace || n.status !== 'open');
      writeNotes(args.change, [...kept, ...added]);
      return `Added ${added.length} note(s) to change ${args.change}: ${added.map((n) => n.id).join(', ')}`;
    }
    case 'list_review_notes': {
      const notes = readNotes(args.change);
      return notes.length ? JSON.stringify(notes, null, 2) : `No notes on change ${args.change}.`;
    }
    case 'remove_review_notes': {
      const notes = readNotes(args.change);
      const ids = Array.isArray(args.ids) ? new Set(args.ids) : null;
      const left = ids ? notes.filter((n) => !ids.has(n.id)) : [];
      writeNotes(args.change, left);
      return `Removed ${notes.length - left.length} note(s).`;
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

// ---------- MCP stdio (JSON-RPC 2.0, one message per line) ----------

function startMcp() {
  let buf = '';
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const handle = (msg) => {
    const { id, method, params } = msg;
    if (id === undefined) return; // notification
    try {
      let result;
      if (method === 'initialize') {
        result = {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'gerrit-lens', version: '0.1.0' },
          instructions: 'When you review a Gerrit change (for example from a gerrit.example.com/c/<project>/+/<number> link), send your findings with add_review_notes instead of only writing them in chat. One note per finding, anchored to the new-side line with its exact lineText, and a gerritText written as the comment the user would post. The user sees them inline in the Gerrit Lens extension and decides what to post.',
        };
      } else if (method === 'ping') {
        result = {};
      } else if (method === 'tools/list') {
        result = { tools: TOOLS };
      } else if (method === 'tools/call') {
        try {
          result = { content: [{ type: 'text', text: callTool(params.name, params.arguments || {}) }] };
        } catch (e) {
          result = { content: [{ type: 'text', text: String(e.message) }], isError: true };
        }
      } else {
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
        return;
      }
      send({ jsonrpc: '2.0', id, result });
    } catch (e) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e.message) } });
    }
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

// ---------- HTTP for the extension ----------

function startHttp() {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    if (process.env.GERRIT_LENS_DEBUG) log(req.method, req.url, JSON.stringify(req.headers));
    // The extension's service worker sends no Origin header. Web pages always do
    // on cross-origin requests that could change or read anything, and a DNS
    // rebinding page would show its own name in Host, so: no Origin needs a
    // loopback Host, and any Origin has to be an extension.
    const loopbackHost = new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`).test(req.headers.host || '');
    if (!loopbackHost || (origin && !origin.startsWith('chrome-extension://'))) {
      log(`403 ${req.method} ${req.url} origin=${JSON.stringify(origin)} host=${req.headers.host}`);
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    const m = /^\/annotations\/(\d+)(?:\/([\w-]+))?$/.exec(req.url);
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.end(JSON.stringify({ ok: true, version: '0.1.0' }));
      } else if (req.method === 'GET' && m && !m[2]) {
        res.end(JSON.stringify({ change: Number(m[1]), notes: readNotes(m[1]) }));
      } else if (req.method === 'PATCH' && m && m[2]) {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
        req.on('end', () => {
          try {
            const { status } = JSON.parse(body || '{}');
            if (!STATUSES.includes(status)) throw new Error('bad status');
            const notes = readNotes(m[1]);
            const note = notes.find((n) => n.id === m[2]);
            if (!note) { res.writeHead(404).end('{}'); return; }
            note.status = status;
            note.statusAt = new Date().toISOString();
            writeNotes(m[1], notes);
            res.end(JSON.stringify(note));
          } catch (e) {
            res.writeHead(400).end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        res.writeHead(404).end('{}');
      }
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: e.message }));
    }
  });
  // Several Claude sessions may each start a bridge; the first one owns the port
  // and the rest keep retrying so one of them takes over when it exits.
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') { log(e.message); return; }
    setTimeout(() => server.listen(PORT, '127.0.0.1'), 5000).unref();
  });
  server.listen(PORT, '127.0.0.1', () => log(`http on 127.0.0.1:${PORT}, notes in ${DIR}`));
  return server;
}

if (require.main === module) {
  const httpOnly = process.argv.includes('--http');
  const server = startHttp();
  if (httpOnly) return;
  server.unref();
  startMcp();
}

module.exports = { callTool, readNotes, startHttp };
