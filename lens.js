// lens.js
// Content script on granted Gerrit origins. On a change page it covers Gerrit's
// own UI with a GitHub-style review screen rendered in a shadow root, fed by
// Gerrit's REST API with the user's own session (same origin, no server).
// AI notes come from the local bridge through the service worker.

'use strict';

(() => {
  if (window.__gerritLens) return;
  window.__gerritLens = true;

  const C = self.LensCore;
  const { t, escapeHtml: h, md } = C;

  // ---------- settings ----------

  // diffMode / whitespace stay null until the user picks one; then Gerrit's own preference is the default.
  let settings = { enabled: true, theme: 'auto', lang: 'auto', diffMode: null, whitespace: null, treeHidden: false };
  const media = matchMedia('(prefers-color-scheme: dark)');
  const resolvedTheme = () => (settings.theme === 'dark' || (settings.theme === 'auto' && media.matches) ? 'dark' : 'light');

  // ---------- Gerrit REST ----------

  function xsrf() {
    const m = /(?:^|;\s*)XSRF_TOKEN=([^;]+)/.exec(document.cookie);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // Gerrit's own page keeps the data it loaded, so after we write anything the
  // classic view is stale until it reloads.
  let wrote = false;
  const CLASSIC_KEY = 'gerritLensClassic';

  async function api(path, method = 'GET', body) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      wrote = true;
      // Gerrit rejects a JSON content type with an empty body (DELETE) as 400.
      if (body) headers['Content-Type'] = 'application/json';
      const token = xsrf();
      if (token) headers['X-Gerrit-Auth'] = token;
    }
    const resp = await fetch(ROOT + path, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`${resp.status} ${text.slice(0, 200)}`);
    return text ? C.parseGerritJson(text) : null;
  }

  const enc = encodeURIComponent;
  // Where Gerrit is served: '' at the host root, '/r' or '/gerrit' under a sub-path.
  // Every REST call and every link we build goes under it.
  let ROOT = '';
  // Everything the classic change page shows: actions the user may take,
  // submit requirements, download commands, plus the usual detail.
  const CHANGE_OPTS = '?o=ALL_REVISIONS&o=DETAILED_LABELS&o=DETAILED_ACCOUNTS&o=MESSAGES&o=SUBMITTABLE'
    + '&o=CURRENT_ACTIONS&o=CHANGE_ACTIONS&o=SUBMIT_REQUIREMENTS&o=DOWNLOAD_COMMANDS&o=CURRENT_COMMIT&o=WEB_LINKS';

  // ---------- state ----------

  let host, shadow, app;
  const DEFAULT_PREFS = { context: 10, syntax_highlighting: true, intraline_difference: true, tab_size: 8, ignore_whitespace: 'IGNORE_NONE', download_scheme: 'ssh' };
  let prefs = null;
  let route = null;          // parsed URL of the change page we show
  let hiddenFor = null;      // change number the user switched back to Gerrit for
  let state = null;          // everything loaded for the current change
  let loadSeq = 0;

  // ---------- small helpers ----------

  function parseTime(s) {
    return new Date(String(s).replace(' ', 'T').replace(/\.\d+$/, '') + 'Z');
  }
  function ago(s) {
    const rtf = new Intl.RelativeTimeFormat(C.getLang(), { numeric: 'auto' });
    const sec = (parseTime(s) - Date.now()) / 1000;
    for (const [unit, n] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(sec) >= n) return rtf.format(Math.round(sec / n), unit);
    }
    return rtf.format(0, 'second');
  }
  const fullTime = (s) => parseTime(s).toLocaleString();

  function avatar(acc, size = 20) {
    const name = acc?.display_name || acc?.name || acc?.username || '?';
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return `<span class="av" style="--s:${size}px;--hue:${hash % 360}" title="${h(name)}">${h([...name][0].toUpperCase())}</span>`;
  }
  const who = (acc) => h(acc?.display_name || acc?.name || acc?.username || '?');

  function toast(msg, bad) {
    const el = shadow.querySelector('.toast');
    el.textContent = msg;
    el.className = `toast show${bad ? ' bad' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 2600);
  }

  function copy(text) {
    // http Gerrit is not a secure context, so navigator.clipboard may be missing.
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    shadow.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  // ---------- mount ----------

  function mount() {
    if (host) return;
    host = document.createElement('gerrit-lens');
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${self.LENS_CSS}</style><div class="app" hidden></div><button class="restore" data-act="restore" hidden></button><div class="toast"></div>`;
    app = shadow.querySelector('.app');
    // Keep Gerrit's global keyboard shortcuts from firing while typing here.
    // Keep Gerrit's own shortcuts from seeing keys typed here; Lens' own
    // shortcuts are handled on window in the capture phase before this.
    for (const type of ['keydown', 'keypress', 'keyup']) host.addEventListener(type, (e) => e.stopPropagation());
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('change', onChange);
    shadow.addEventListener('mouseup', onMouseUp);
    shadow.addEventListener('copy', onCopy);
    for (const type of ['wheel', 'touchmove', 'mousedown']) app.addEventListener(type, () => { pinned = null; }, { passive: true });
    // A new press anywhere else drops the range button at once, like GitHub.
    shadow.addEventListener('mousedown', (e) => {
      if (e.target.closest?.('.range-add')) return;
      lockSelectionSide(e.target);
      downAt = { x: e.clientX, y: e.clientY };
      const btn = app?.querySelector(':scope > .range-add');
      if (btn) btn.hidden = true;
      pendingRange = null;
    });
    shadow.addEventListener('input', onInput);
    shadow.addEventListener('keydown', onKeyDown);
    document.documentElement.appendChild(host);
  }

  function setVisible(show) {
    mount();
    host.dataset.theme = resolvedTheme();
    app.hidden = !show;
    const pill = shadow.querySelector('.restore');
    pill.textContent = t('openLens');
    pill.hidden = show || !route || !!gerritBtn?.isConnected;
    document.documentElement.style.overflow = show ? 'hidden' : '';
  }

  // ---------- entry point on Gerrit's own change page ----------

  let gerritBtn = null;
  let lastBtnScan = 0;

  function openLens() {
    hiddenFor = null;
    setVisible(true);
    // Whatever was done in the classic view meanwhile is not in our state.
    load(route);
  }

  function deepFind(root, sel, depth = 0) {
    const hit = root.querySelector(sel);
    if (hit || depth > 10) return hit;
    for (const el of root.querySelectorAll('*')) {
      if (!el.shadowRoot) continue;
      const found = deepFind(el.shadowRoot, sel, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Puts a "Lens" entry in Gerrit's top header, before the search box, styled
  // like the header's own menu titles (CHANGES, YOUR, ...). Gerrit re-renders
  // the header, so this is re-checked every second while the classic view is
  // showing. Only change pages have a Lens view for now.
  function ensureGerritButton() {
    if (!host || !route || !settings.enabled || !app.hidden) return;
    if (gerritBtn?.isConnected) return;
    if (Date.now() - lastBtnScan < 1000) return;
    lastBtnScan = Date.now();
    const header = deepFind(document, 'gr-main-header')?.shadowRoot;
    const right = header?.querySelector('.rightItems');
    if (!right) { setVisible(false); return; }
    gerritBtn = document.createElement('button');
    gerritBtn.id = 'gerrit-lens-open';
    gerritBtn.title = t('openLens');
    gerritBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg><span>Lens</span>`;
    // Copy the look of the header's menu titles rather than guessing it.
    const cs = getComputedStyle(header.querySelector('.linksTitle') || right);
    gerritBtn.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:4px', 'background:none', 'border:0', 'cursor:pointer',
      'padding:4px 8px', 'margin-right:12px', 'border-radius:4px',
      `font-family:${cs.fontFamily}`, `font-size:${cs.fontSize}`, `font-weight:${cs.fontWeight}`,
      `text-transform:${cs.textTransform}`, `line-height:${cs.lineHeight}`, `color:${cs.color}`,
    ].join(';');
    gerritBtn.addEventListener('mouseenter', () => { gerritBtn.style.background = 'color-mix(in srgb, currentColor 12%, transparent)'; });
    gerritBtn.addEventListener('mouseleave', () => { gerritBtn.style.background = 'none'; });
    gerritBtn.addEventListener('click', openLens);
    right.insertBefore(gerritBtn, right.querySelector('#search') || right.firstChild);
    setVisible(false);
  }

  // Leaving a change page in the classic view: the header button goes too.
  function dropGerritButton() {
    gerritBtn?.remove();
    gerritBtn = null;
  }

  // ---------- routing ----------

  let lastPath = '';
  function tick() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const r = C.parseRoute(location.pathname);
    if (r) ROOT = r.root;
    const sameChange = r && route && r.change === route.change;
    route = r;
    if (!r || !settings.enabled) { dropGerritButton(); if (host) setVisible(false); return; }
    if (hiddenFor === r.change) { setVisible(false); return; }
    setVisible(true);
    if (!sameChange || !state) load(r);
  }

  // ---------- loading ----------

  async function load(r) {
    const seq = ++loadSeq;
    app.innerHTML = `<div class="loading">${t('loading')}</div>`;
    try {
      const change = await api(`/changes/${r.change}${CHANGE_OPTS}`);
      const self_ = await api('/accounts/self/detail').catch(() => null);
      // The user's own Gerrit preferences decide the defaults, as in the classic view.
      if (!prefs) {
        const [gp, dp] = self_ ? await Promise.all([
          api('/accounts/self/preferences').catch(() => ({})),
          api('/accounts/self/preferences.diff').catch(() => ({})),
        ]) : [{}, {}];
        prefs = { ...DEFAULT_PREFS, ...gp, ...dp };
        if (!settings.diffMode) settings.diffMode = prefs.diff_view === 'SIDE_BY_SIDE' ? 'split' : 'unified';
        if (!settings.whitespace) settings.whitespace = prefs.ignore_whitespace || 'IGNORE_NONE';
        host.style.setProperty('--tab', String(prefs.tab_size || 8));
      }
      if (seq !== loadSeq) return;
      const revs = Object.entries(change.revisions).map(([sha, rev]) => ({ sha, ...rev })).sort((a, b) => a._number - b._number);
      state = {
        change, revs, self: self_,
        ps: r.ps || change.revisions[change.current_revision]._number,
        base: r.base || null,
        notes: [], notesJson: '', bridgeOk: false,
        collapsed: new Set(),
        viewed: new Set(),
      };
      api(`/projects/${enc(change.project)}/config`).then((cfg) => {
        C.setCommentLinks(cfg?.commentlinks);
        if (seq === loadSeq) { const el = app.querySelector('.convo'); if (el) el.innerHTML = renderMessages(); }
      }).catch(() => {});
      await loadPatchset(seq);
      loadRelations(seq);
      // Gerrit comment links: /c/<project>/+/<n>/comment/<id>/
      const cid = /^comment\/([^/]+)/.exec(r.file || '')?.[1];
      if (cid) {
        const c = findComment(cid);
        if (c) await jumpToLine(c.path, c.line || null, c.side === 'PARENT' ? 'a' : 'b', c.patch_set);
      }
      pollNotes();
    } catch (e) {
      if (seq === loadSeq) app.innerHTML = `<div class="loading err">${t('loadFail')}: ${h(e.message)}</div>`;
    }
  }

  async function loadPatchset(seq = loadSeq) {
    const n = state.change._number;
    const q = state.base ? `?base=${state.base}` : '';
    const [files, comments, drafts, viewed] = await Promise.all([
      api(`/changes/${n}/revisions/${state.ps}/files${q}`),
      api(`/changes/${n}/comments`),
      state.self ? api(`/changes/${n}/drafts`).catch(() => ({})) : {},
      state.self ? api(`/changes/${n}/revisions/${state.ps}/files?reviewed`).catch(() => []) : [],
    ]);
    if (seq !== loadSeq) return;
    state.viewed = new Set(viewed);
    state.collapsed = new Set(viewed);
    const order = (p) => (p === '/COMMIT_MSG' ? 0 : p === '/MERGE_LIST' ? 1 : 2);
    state.paths = Object.keys(files).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
    state.files = state.paths.map((path) => ({ path, info: files[path], diff: null, rows: null }));
    state.comments = comments;
    state.drafts = drafts;
    await loadPorted();
    await fetchNotes();
    renderAll();
    await loadDiffs(seq);
  }

  // Things Gerrit shows around the change that the change detail itself does
  // not carry: merge conflict (Gerrit's own UI calls the same endpoint),
  // the relation chain and what gets submitted together.
  async function loadRelations(seq = loadSeq) {
    const n = state.change._number;
    const open = state.change.status === 'NEW';
    const topic = state.change.topic;
    const [mergeable, related, together, sameTopic, conflictsWith] = await Promise.all([
      open ? api(`/changes/${n}/revisions/current/mergeable`).catch(() => null) : null,
      api(`/changes/${n}/revisions/current/related`).catch(() => null),
      open ? api(`/changes/${n}/submitted_together?o=NON_VISIBLE_CHANGES`).catch(() => null) : null,
      topic ? api(`/changes/?q=${enc(`status:open topic:"${topic}" -change:${n}`)}&n=20`).catch(() => null) : null,
      open ? api(`/changes/?q=${enc(`status:open conflicts:${n}`)}&n=20`).catch(() => null) : null,
    ]);
    state.sameTopic = sameTopic || [];
    state.conflictsWith = conflictsWith || [];
    if (seq !== loadSeq) return;
    state.conflict = mergeable?.mergeable === false;
    state.related = related?.changes || [];
    state.together = together?.changes || [];
    renderStatus();
    const sum = app.querySelector('.summary');
    if (sum) sum.innerHTML = renderSummary();
  }

  async function reloadChange() {
    state.change = await api(`/changes/${state.change._number}${CHANGE_OPTS}`);
    app.querySelector('.summary').innerHTML = renderSummary();
    renderHeaderCounts();
  }

  // Syntax colours for both sides of a file, highlighted as whole files so
  // multi-line comments and strings come out right, then split per line.
  const EXT_LANG = { snap: 'javascript', mjs: 'javascript', cjs: 'javascript', properties: 'ini', vue: 'xml', svg: 'xml', htm: 'xml', gradle: 'kotlin', kts: 'kotlin' };
  function langOf(path) {
    const ext = (path.match(/\.([^./]+)$/) || [])[1]?.toLowerCase();
    const name = EXT_LANG[ext] || ext;
    return name && self.hljs?.getLanguage(name) ? name : null;
  }

  function highlightFile(f) {
    if (!prefs.syntax_highlighting || !f.diff || f.path.startsWith('/')) return null;
    const language = langOf(f.path);
    if (!language) return null;
    const side = (pick) => {
      const lines = [];
      for (const c of f.diff.content) {
        if (c.ab) lines.push(...c.ab);
        else if (pick(c)) lines.push(...pick(c));
        else if (c.skip) return null; // ponytail: no colours when Gerrit skipped lines, a partial file would mis-highlight
      }
      // ponytail: very large files stay plain, highlighting them blocks the page
      if (lines.length > 20000) return null;
      const out = C.splitHighlighted(self.hljs.highlight(lines.join('\n'), { language, ignoreIllegals: true }).value);
      return out.length === lines.length ? out : null;
    };
    try {
      return { a: side((c) => c.a), b: side((c) => c.b) };
    } catch {
      return null;
    }
  }

  async function reloadDiffs() {
    diffGen++;
    for (const f of state.files) { f.rows = null; f.diff = null; f.loading = null; f.error = null; renderFile(f); }
    await loadDiffs(loadSeq);
  }

  // Diffs load as their file comes near the screen (like GitHub), at most a
  // few at a time, so a 200-file change opens as fast as a 2-file one. A file
  // with a huge diff waits for "Load diff". Collapsed (viewed) files load when
  // opened.
  const BIG_DIFF_LINES = 3000;
  const isBig = (f) => !f.forceLoad && (f.info.lines_inserted || 0) + (f.info.lines_deleted || 0) > BIG_DIFF_LINES;
  let diffObserver = null;
  let diffGen = 0; // bumped when every diff is refetched (whitespace change), so late answers are dropped
  let running = 0;
  const waiting = [];

  function loadDiff(f) {
    if (f.loading || f.rows) return f.loading || Promise.resolve();
    const seq = loadSeq;
    const gen = diffGen;
    const stale = () => seq !== loadSeq || gen !== diffGen;
    f.loading = new Promise((resolve) => waiting.push(resolve)).then(async () => {
      try {
        if (stale()) return;
        if (f.info.binary) { f.rows = []; return; }
        const n = state.change._number;
        const q = state.base ? `&base=${state.base}` : '';
        const intra = prefs.intraline_difference === false ? 'intraline=false' : 'intraline';
        const diff = await api(`/changes/${n}/revisions/${state.ps}/files/${enc(f.path)}/diff?${intra}&whitespace=${settings.whitespace || 'IGNORE_NONE'}${q}`);
        if (stale()) return;
        f.diff = diff;
        f.rows = C.diffRows(diff.content, prefs.context > 0 ? prefs.context : 10);
        f.html = highlightFile(f);
      } catch (e) {
        f.error = e.message;
      } finally {
        running--;
        pump();
        if (!stale()) { f.loading = null; renderFile(f); renderTree(); }
      }
    });
    pump();
    return f.loading;
  }

  function pump() {
    while (running < 4 && waiting.length) { running++; waiting.shift()(); }
  }

  async function loadDiffs() {
    diffObserver?.disconnect();
    diffObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || !state) continue;
        const f = state.files[Number(e.target.dataset.fi)];
        if (f && !f.rows && !state.collapsed.has(f.path) && !isBig(f)) loadDiff(f);
      }
    }, { root: app, rootMargin: '1500px 0px' });
    app.querySelectorAll('.files > .file').forEach((el) => diffObserver.observe(el));
  }

  async function reloadComments() {
    const n = state.change._number;
    const [comments, drafts] = await Promise.all([
      api(`/changes/${n}/comments`),
      state.self ? api(`/changes/${n}/drafts`).catch(() => ({})) : {},
    ]);
    state.comments = comments;
    state.drafts = drafts;
    await loadPorted();
    for (const f of state.files) renderFile(f);
    renderTree();
    renderHeaderCounts();
  }

  // Unresolved threads from earlier patchsets, moved by Gerrit to this
  // patchset's lines (the same API Gerrit's own diff view uses).
  async function loadPorted() {
    state.ported = {};
    if (state.base) return;
    const n = state.change._number;
    const [ported, portedDrafts] = await Promise.all([
      api(`/changes/${n}/revisions/${state.ps}/ported_comments`).catch(() => ({})),
      state.self ? api(`/changes/${n}/revisions/${state.ps}/ported_drafts`).catch(() => ({})) : {},
    ]);
    // The ported copies carry only the new position (line, range, side) and
    // drop fields like `unresolved`, so the rest comes from the original.
    for (const [map, draft] of [[ported, false], [portedDrafts, true]]) {
      for (const [path, list] of Object.entries(map || {})) {
        for (const c of list) {
          if (c.patch_set === state.ps) continue;
          const orig = ((draft ? state.drafts : state.comments)[path] || []).find((x) => x.id === c.id) || c;
          (state.ported[path] ||= []).push({
            ...orig, line: c.line, range: c.range, side: c.side, __ported: true,
            ...(draft ? { __draft: true, author: state.self } : {}),
          });
        }
      }
    }
  }

  // ---------- AI notes (local bridge) ----------

  async function fetchNotes() {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'lens:annotations', change: state.change._number });
      state.bridgeOk = !!r?.ok;
      if (!r?.ok) return false;
      const json = JSON.stringify(r.data.notes || []);
      if (json === state.notesJson) return false;
      state.notesJson = json;
      state.notes = r.data.notes || [];
      return true;
    } catch {
      state.bridgeOk = false;
      return false;
    }
  }

  // ponytail: polls the bridge every 4s while the view is open, switch to SSE if the bridge grows.
  function pollNotes() {
    clearInterval(pollNotes.timer);
    pollNotes.timer = setInterval(async () => {
      if (!state || app.hidden || document.hidden) return;
      if (await fetchNotes()) {
        for (const f of state.files) if (f.rows) renderFile(f);
        renderTree();
        renderLooseNotes();
      }
    }, 4000);
  }

  async function setNoteStatus(note, status) {
    note.status = status;
    state.notesJson = JSON.stringify(state.notes);
    try {
      await chrome.runtime.sendMessage({ type: 'lens:annotation-status', change: state.change._number, id: note.id, status });
    } catch { /* the card still reflects it locally */ }
  }

  function notesFor(f) {
    const lines = f.diff ? C.newSideLines(f.diff.content) : [];
    const byKey = new Map();
    for (const note of state.notes) {
      if (note.file !== f.path) continue;
      const a = C.anchorNote(note, state.ps, lines);
      const key = a.line ? `b:${a.line}` : 'file';
      const item = { note, carried: a.carried, lost: note.line && !a.line };
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
    return byKey;
  }

  // ---------- comments shown for the current patchset view ----------

  function visibleComments(path) {
    const me = state.self;
    const all = [
      ...(state.comments[path] || []),
      ...(state.drafts[path] || []).map((d) => ({ ...d, __draft: true, author: me })),
    ];
    const out = [...(state.ported?.[path] || [])];
    for (const c of all) {
      if (c.patch_set === state.ps) {
        if (!(state.base && c.side === 'PARENT')) out.push(c);
      } else if (state.base && c.patch_set === state.base && c.side !== 'PARENT') {
        out.push({ ...c, side: 'PARENT' });
      }
    }
    return out;
  }

  function findComment(id) {
    for (const map of [state.comments, state.drafts]) {
      for (const [path, list] of Object.entries(map)) {
        const c = list.find((x) => x.id === id);
        if (c) return { ...c, path, __draft: map === state.drafts };
      }
    }
    return null;
  }

  // ---------- rendering ----------

  function statusPill(ch) {
    if (ch.status === 'MERGED') return `<span class="pill merged">${t('merged')}</span>`;
    if (ch.status === 'ABANDONED') return `<span class="pill abandoned">${t('abandoned')}</span>`;
    if (ch.work_in_progress) return `<span class="pill wip">${t('wip')}</span>`;
    return `<span class="pill open">${t('open')}</span>`;
  }

  function statusPills() {
    const ch = state.change;
    // Gerrit shows "Merge Conflict" in place of the plain open state.
    const main = ch.status === 'NEW' && state.conflict ? `<span class="pill conflict">${t('conflict')}</span>` : statusPill(ch);
    const wip = ch.status === 'NEW' && ch.work_in_progress && state.conflict ? `<span class="pill wip">${t('wip')}</span>` : '';
    const priv = ch.is_private ? `<span class="pill private">${t('private')}</span>` : '';
    return `${main}${wip}${priv}${ch.submittable ? `<span class="pill ok">${t('submittable')}</span>` : ''}`;
  }

  function renderStatus() {
    const el = app.querySelector('.status-pills');
    if (el) el.innerHTML = statusPills();
  }

  // ---------- change actions (the ones Gerrit offers this user) ----------
  // Labels come from Gerrit's action list as-is, so they read like the
  // classic page and only what the server allows is offered.
  // Same split and wording as Gerrit's own change page (3.8): these on top,
  // the rest in the overflow menu in Gerrit's order. Topic and hashtags are
  // edited from the summary, like the pencils in Gerrit's Change Info.
  const PRIMARY = ['submit', 'ready', 'rebase', 'restore', 'abandon', 'revert'];
  const OVERFLOW = ['cherrypick', 'download', '/', 'followup', 'wip', 'private', 'move'];
  const LABEL = {
    cherrypick: 'Cherry pick', download: 'Download patch', '/': 'Delete change', followup: 'Follow-up',
    wip: 'Mark as work in progress', move: 'Move change', ready: 'Mark as active',
  };
  const actionLabel = (a) => (a.key === 'private' ? (a.method === 'DELETE' ? 'Unmark private' : 'Mark private') : LABEL[a.key] || a.label);

  function allActions() {
    const ch = state.change;
    const rev = ch.revisions?.[ch.current_revision];
    const out = [];
    for (const [key, a] of Object.entries(ch.actions || {})) if (a.enabled !== false) out.push({ key, scope: 'change', ...a });
    for (const [key, a] of Object.entries(rev?.actions || {})) if (a.enabled !== false) out.push({ key, scope: 'revision', ...a });
    return out;
  }

  function renderActions() {
    if (!state.self) return '';
    const acts = allActions();
    const btn = (a, cls) => `<button class="${cls}${a.key === 'submit' ? ' primary' : ''}" data-act="change-action" data-key="${h(a.key)}" data-scope="${a.scope}" title="${h(a.title || actionLabel(a))}">${h(actionLabel(a))}</button>`;
    const primary = PRIMARY.map((k) => acts.find((a) => a.key === k)).filter(Boolean).map((a) => btn(a, 'btn')).join('');
    const items = OVERFLOW.map((k) => {
      if (k === 'download') return `<button class="menu-item" data-act="download">${LABEL.download}</button>`;
      const a = acts.find((x) => x.key === k);
      return a ? btn(a, 'menu-item') : '';
    }).join('');
    const edit = state.change.status === 'NEW' ? `<button class="btn" data-act="classic-edit" title="${t('editInClassic')}">Edit</button>` : '';
    const dots = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';
    return `${primary}${edit}<span class="menu-wrap"><button class="btn icon-btn more" data-act="menu-open" title="${t('moreActions')}" aria-label="${t('moreActions')}">${dots}</button><span class="menu" hidden>${items}</span></span>`;
  }

  // One small modal for confirmations and the inputs some actions need.
  function dialog({ title, text, fields = [], ok, danger }) {
    return new Promise((resolve) => {
      const el = floating('dialog');
      el.className = 'dialog reply';
      el.innerHTML = `<div class="reply-card">
        <div class="reply-h"><b>${h(title)}</b><span class="grow"></span><button class="link" data-dlg="cancel">&times;</button></div>
        ${text ? `<div class="md">${text}</div>` : ''}
        ${fields.map((f, i) => `<label class="dlg-field"><span class="sub">${h(f.label)}</span>${f.multiline
          ? `<textarea rows="3" data-i="${i}">${h(f.value || '')}</textarea>`
          : `<input data-i="${i}" value="${h(f.value || '')}" placeholder="${h(f.placeholder || '')}">`}</label>`).join('')}
        <div class="ed-foot"><span class="grow"></span><button class="btn" data-dlg="cancel">${t('cancel')}</button><button class="btn ${danger ? 'danger-fill' : 'primary'}" data-dlg="ok">${h(ok)}</button></div>
      </div>`;
      el.hidden = false;
      el.querySelector('input, textarea, [data-dlg=ok]')?.focus();
      const done = (val) => { el.hidden = true; el.innerHTML = ''; resolve(val); };
      el.onclick = (e) => {
        const b = e.target.closest('[data-dlg]');
        if (b?.dataset.dlg === 'cancel' || e.target === el) done(null);
        else if (b?.dataset.dlg === 'ok') done(fields.map((_, i) => el.querySelector(`[data-i="${i}"]`).value.trim()));
      };
      el.onkeydown = (e) => {
        if (e.key === 'Escape') done(null);
        else if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey)) { e.preventDefault(); el.querySelector('[data-dlg=ok]').click(); }
      };
    });
  }

  async function runAction(key, scope) {
    const ch = state.change;
    const n = ch._number;
    const found = allActions().find((x) => x.key === key && x.scope === scope);
    if (!found) return;
    const a = { ...found, label: actionLabel(found) };
    const url = scope === 'revision' ? `/changes/${n}/revisions/current/${key}` : key === '/' ? `/changes/${n}` : `/changes/${n}/${key}`;
    const go = (num) => { location.href = `${ROOT}/c/${ch.project}/+/${num}`; };
    let body;
    switch (key) {
      case 'abandon': {
        const v = await dialog({ title: a.label, fields: [{ label: t('message'), multiline: true }], ok: a.label, danger: true });
        if (!v) return;
        body = { message: v[0] || undefined };
        break;
      }
      case 'revert': {
        const v = await dialog({ title: a.label, fields: [{ label: t('message'), multiline: true, value: `Revert "${ch.subject}"\n\nThis reverts commit ${ch.current_revision}.` }], ok: a.label });
        if (!v) return;
        const res = await api(url, a.method, { message: v[0] });
        return go(res._number);
      }
      case 'cherrypick': {
        const v = await dialog({ title: a.label, fields: [{ label: t('branch'), value: ch.branch }, { label: t('message'), multiline: true, value: ch.revisions[ch.current_revision].commit?.message || ch.subject }], ok: a.label });
        if (!v || !v[0]) return;
        const res = await api(url, a.method, { destination: v[0], message: v[1] });
        return go(res._number);
      }
      case 'move': {
        const v = await dialog({ title: a.label, fields: [{ label: t('branch'), placeholder: ch.branch }], ok: a.label });
        if (!v || !v[0]) return;
        body = { destination_branch: v[0] };
        break;
      }
      case 'topic': {
        const v = await dialog({ title: a.label, fields: [{ label: t('topic'), value: ch.topic || '' }], ok: t('save') });
        if (!v) return;
        body = { topic: v[0] };
        break;
      }
      case 'hashtags': {
        const v = await dialog({ title: a.label, fields: [{ label: t('hashtags'), value: (ch.hashtags || []).join(', '), placeholder: 'a, b' }], ok: t('save') });
        if (!v) return;
        const want = new Set(v[0].split(/[,\s]+/).filter(Boolean));
        const have = new Set(ch.hashtags || []);
        body = { add: [...want].filter((x) => !have.has(x)), remove: [...have].filter((x) => !want.has(x)) };
        break;
      }
      case 'description': {
        const rev = ch.revisions[ch.current_revision];
        const v = await dialog({ title: a.label, fields: [{ label: t('description'), value: rev.description || '' }], ok: t('save') });
        if (!v) return;
        body = { description: v[0] };
        break;
      }
      case 'followup': {
        const v = await dialog({ title: a.label, fields: [{ label: t('subject'), value: '' }], ok: a.label });
        if (!v || !v[0]) return;
        const res = await api('/changes/', 'POST', { project: ch.project, branch: ch.branch, subject: v[0], base_change: ch.id });
        return go(res._number);
      }
      case '/': {
        const v = await dialog({ title: a.label, text: `<p>${h(t('deleteConfirm'))}</p>`, ok: a.label, danger: true });
        if (!v) return;
        await api(url, 'DELETE');
        location.href = `${ROOT}/dashboard/self`;
        return;
      }
      case 'submit':
      case 'rebase': {
        const v = await dialog({ title: a.label, text: `<p>${h(a.title || a.label)}</p>`, ok: a.label });
        if (!v) return;
        body = {};
        break;
      }
      default:
        body = a.method === 'DELETE' ? undefined : {};
    }
    await api(url, a.method || 'POST', body);
    toast(`${a.label}: ${t('sent')}`);
    load(route);
  }

  // Gerrit's Comments tab: every thread on the change, unresolved first.
  function showThreads(onlyOpen = true) {
    const all = allThreads().sort((x, y) => (y.unresolved - x.unresolved) || String(y.comments.at(-1).updated).localeCompare(String(x.comments.at(-1).updated)));
    const list = onlyOpen ? all.filter((th) => th.unresolved) : all;
    const el = floating('dialog');
    el.className = 'dialog reply';
    el.innerHTML = `<div class="reply-card threads-card">
      <div class="reply-h"><b>${t('allComments')}</b><span class="grow"></span>
        <label class="sub"><input type="checkbox" data-dlg="open" ${onlyOpen ? 'checked' : ''}> ${t('onlyUnresolved')}</label>
        <button class="link" data-dlg="cancel">&times;</button></div>
      <div class="thread-list">${list.map((th) => {
        const r = th.root;
        const last = th.comments.at(-1);
        return `<button class="thread-item" data-path="${h(th.path)}" data-line="${r.line || ''}" data-side="${h(r.side || '')}" data-ps="${r.patch_set}">
          <span class="ti-head"><code>${h(fileName(th.path).base)}${r.line ? `:${r.line}` : ''}</code><span class="chip">PS${r.patch_set}</span>
          <span class="chip ${th.unresolved ? 'warn' : 'ok'}">${th.unresolved ? t('unresolved') : t('resolved')}</span>${th.hasDraft ? `<span class="chip draft">${t('draft')}</span>` : ''}
          <span class="grow"></span><span class="sub">${who(last.author)} ${h(ago(last.updated))}</span></span>
          <span class="ti-msg">${h(r.message.replace(/\s+/g, ' ').slice(0, 200))}</span>
          ${th.comments.length > 1 ? `<span class="sub">${t('replies')} ${th.comments.length - 1}</span>` : ''}</button>`;
      }).join('') || `<div class="sub">${t('noThreads')}</div>`}</div>
    </div>`;
    el.hidden = false;
    el.onclick = async (e) => {
      if (e.target.closest('[data-dlg=open]')) { showThreads(e.target.checked); return; }
      const item = e.target.closest('.thread-item');
      if (item) {
        el.hidden = true; el.innerHTML = '';
        await jumpToLine(item.dataset.path, Number(item.dataset.line) || null, item.dataset.side === 'PARENT' ? 'a' : 'b', Number(item.dataset.ps) || null);
        return;
      }
      if (e.target === el || e.target.closest('[data-dlg=cancel]')) { el.hidden = true; el.innerHTML = ''; }
    };
    el.onkeydown = (e) => { if (e.key === 'Escape') { el.hidden = true; el.innerHTML = ''; } };
    el.querySelector('.thread-item, [data-dlg=cancel]')?.focus();
  }

  const SHORTCUTS = [
    ['j / k', 'scNextFile'], ['n / p', 'scNextChunk'], ['Shift+N / Shift+P', 'scNextThread'],
    ['a', 'scReply'], ['Shift+C', 'scThreads'], ['v', 'scViewed'], ['t', 'scTree'], ['s', 'scSplit'], ['?', 'scHelp'], ['Esc', 'scClose'],
  ];
  function showHelp() {
    const el = floating('dialog');
    el.className = 'dialog reply';
    el.innerHTML = `<div class="reply-card"><div class="reply-h"><b>${t('shortcuts')}</b><span class="grow"></span><button class="link" data-dlg="cancel">&times;</button></div>
      <table class="keys">${SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${h(k)}</kbd></td><td>${h(t(d))}</td></tr>`).join('')}</table></div>`;
    el.hidden = false;
    el.onclick = (e) => { if (e.target === el || e.target.closest('[data-dlg=cancel]')) { el.hidden = true; el.innerHTML = ''; } };
  }

  // ---------- keyboard ----------
  // Only while the Lens view is up and focus is not in a text field. Keys
  // that reach Gerrit's own (hidden) page would trigger its shortcuts, so
  // everything is stopped here.
  let curFile = 0;
  function onPageKey(e) {
    if (!app || app.hidden || !state) return;
    const inField = e.composedPath().some((n) => n.tagName === 'TEXTAREA' || n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.isContentEditable);
    if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
    const dlg = app.querySelector(':scope > .dialog:not([hidden])');
    if (dlg && e.key !== 'Escape') return;
    // Shifted keys arrive as "C" / "?" on most layouts, but as "c" / "/" with
    // shiftKey from some input methods; the physical key settles it.
    const key = e.shiftKey ? ({ KeyC: 'C', KeyN: 'N', KeyP: 'P', Slash: '?' }[e.code] || e.key) : e.key;
    const go = {
      j: () => moveFile(1), k: () => moveFile(-1),
      n: () => moveChunk(1), p: () => moveChunk(-1),
      N: () => moveThread(1), P: () => moveThread(-1),
      a: () => app.querySelector('[data-act=reply-open]')?.click(),
      C: () => showThreads(true),
      v: () => app.querySelector(`#f${curFile} [data-act=viewed]`)?.click(),
      t: () => app.querySelector('[data-act=tree-toggle]')?.click(),
      s: () => app.querySelector(`[data-act=diff-mode][data-mode=${settings.diffMode === 'split' ? 'unified' : 'split'}]`)?.click(),
      '?': () => showHelp(),
      Escape: () => { if (dlg) { dlg.hidden = true; dlg.innerHTML = ''; } else app.querySelector('.reply:not(.dialog):not([hidden]) [data-act=reply-close]')?.click(); },
    }[key];
    if (!go) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go();
  }

  const headerBottom = () => app.querySelector('.top').getBoundingClientRect().bottom;
  function moveFile(d) {
    curFile = Math.max(0, Math.min(state.files.length - 1, currentFileIndex() + d));
    scrollPinned(app.querySelector(`#f${curFile}`), 'start');
  }
  function currentFileIndex() {
    const top = headerBottom() + 40;
    let idx = 0;
    app.querySelectorAll('.file').forEach((el, i) => { if (el.getBoundingClientRect().top <= top) idx = i; });
    return idx;
  }
  function stepTo(selector, d) {
    const top = headerBottom() + 60;
    const els = [...app.querySelectorAll(selector)];
    const pos = els.map((el) => el.getBoundingClientRect().top);
    const i = d > 0 ? pos.findIndex((y) => y > top + 2) : pos.map((y, k) => [y, k]).filter(([y]) => y < top - 2).map(([, k]) => k).pop();
    const el = els[i ?? -1];
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    const row = el.closest('tr');
    if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
  }
  // First line of each run of changes.
  function moveChunk(d) {
    stepTo('table.diff tr.r.add:not(tr.r.add + tr.r.add):not(tr.r.del + tr.r.add), table.diff tr.r.del:not(tr.r.del + tr.r.del), table.diff.split tr.r:has(td.c-add, td.c-del):not(tr.r:has(td.c-add, td.c-del) + tr.r)', d);
  }
  function moveThread(d) { stepTo('.thread.unresolved', d); }

  async function showDownload() {
    const ch = state.change;
    const rev = ch.revisions[ch.current_revision];
    const schemes = Object.keys(rev.fetch || {});
    const proto = schemes.includes(state.dlScheme) ? state.dlScheme : schemes.includes(prefs.download_scheme) ? prefs.download_scheme : schemes[0];
    const cmds = Object.entries(rev.fetch?.[proto]?.commands || {});
    const row = (label, val) => `<div class="cmd"><span class="tool">${h(label)}</span><button class="btn sm" data-copy="${h(val)}">${t('copy')}</button><code>${h(val)}</code></div>`;
    const el = floating('dialog');
    el.className = 'dialog reply';
    el.innerHTML = `<div class="reply-card">
      <div class="reply-h"><b>${t('download')}</b> <span class="sub">PS${rev._number}</span><span class="grow"></span><button class="link" data-dlg="cancel">&times;</button></div>
      ${row('Change-Id', ch.change_id)}${row('Commit', ch.current_revision)}
      ${schemes.length > 1 ? `<div class="seg scheme">${schemes.map((p) => `<button class="${p === proto ? 'on' : ''}" data-scheme="${h(p)}">${h(p)}</button>`).join('')}</div>` : ''}
      ${cmds.map(([k, v]) => row(k, v)).join('')}
    </div>`;
    el.hidden = false;
    el.onclick = async (e) => {
      const sc = e.target.closest('[data-scheme]');
      if (sc) { state.dlScheme = sc.dataset.scheme; showDownload(); return; }
      const c = e.target.closest('[data-copy]');
      if (c) { await copy(c.dataset.copy); c.textContent = t('copied'); return; }
      if (e.target === el || e.target.closest('[data-dlg=cancel]')) { el.hidden = true; el.innerHTML = ''; }
    };
    el.onkeydown = (e) => { if (e.key === 'Escape') { el.hidden = true; el.innerHTML = ''; } };
  }

  function psOptions(selected, withParent) {
    const opts = withParent ? [`<option value="0"${!selected ? ' selected' : ''}>Base</option>`] : [];
    for (const r of state.revs) {
      if (withParent && r._number >= state.ps) continue;
      opts.push(`<option value="${r._number}"${r._number === selected ? ' selected' : ''}>PS${r._number}</option>`);
    }
    return opts.join('');
  }

  function renderAll() {
    const ch = state.change;
    const draftCount = Object.values(state.drafts).reduce((n, l) => n + l.length, 0);
    app.innerHTML = `
      <header class="top">
        <div class="crumbs"><a href="${ROOT}/dashboard/self">Gerrit</a><span>/</span><a href="${ROOT}/q/project:${enc(ch.project)}">${h(ch.project)}</a><span>/</span><span class="branch">${h(ch.branch)}</span></div>
        <div class="title-row">
          <h1>${state.self ? `<button class="star${ch.starred ? ' on' : ''}" data-act="star" title="${t('star')}" aria-label="${t('star')}" aria-pressed="${!!ch.starred}">${ch.starred ? '&#9733;' : '&#9734;'}</button>` : ''}${h(ch.subject)} <a class="num" href="${ROOT}/c/${enc(ch.project)}/+/${ch._number}" data-act="copy-link" title="${t('copyLink')}">#${ch._number}</a></h1>
          <div class="top-actions">
            ${renderActions()}
            <button class="btn" data-act="classic">${t('classic')}</button>
            ${state.self ? `<button class="btn primary" data-act="reply-open">${t('reply')}<span class="count" data-draft-count ${draftCount ? '' : 'hidden'}>${draftCount}</span></button>` : ''}
          </div>
        </div>
        <div class="meta">
          <span class="status-pills">${statusPills()}</span>
          ${avatar(ch.owner)} <b>${who(ch.owner)}</b>
          <span class="sub" title="${h(fullTime(ch.updated))}">${t('updated')} ${h(ago(ch.updated))}</span>
          <span class="sub" data-unresolved></span>
          <span class="grow"></span>
          <button class="btn sm" data-act="threads-open" title="${t('allComments')} (Shift+C)">${svg('comment')} <span data-thread-count></span></button>
          <label class="sub ws">${t('whitespace')} <select data-act="ws">${[['IGNORE_NONE', 'wsNone'], ['IGNORE_TRAILING', 'wsTrailing'], ['IGNORE_LEADING_AND_TRAILING', 'wsLeadTrail'], ['IGNORE_ALL', 'wsAll']].map(([v, k]) => `<option value="${v}"${(settings.whitespace || 'IGNORE_NONE') === v ? ' selected' : ''}>${t(k)}</option>`).join('')}</select></label>
          <button class="btn sm icon-btn" data-act="help" title="${t('shortcuts')} (?)" aria-label="${t('shortcuts')}">?</button>
          <button class="btn sm icon-btn${settings.treeHidden ? '' : ' on'}" data-act="tree-toggle" title="${t('files')}" aria-label="${t('files')}"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/></svg></button>
          <span class="seg" role="group"><button data-act="diff-mode" data-mode="unified" class="${settings.diffMode !== 'split' ? 'on' : ''}">${t('unified')}</button><button data-act="diff-mode" data-mode="split" class="${settings.diffMode === 'split' ? 'on' : ''}">${t('split')}</button></span>
          <label class="sub">${t('base')} <select data-act="base">${psOptions(state.base, true)}</select></label>
          <span class="sub">..</span>
          <label class="sub"><select data-act="ps">${psOptions(state.ps, false)}</select></label>
        </div>
      </header>
      <div class="layout${settings.treeHidden ? ' no-tree' : ''}">
        <aside class="tree"></aside>
        <main>
          <section class="card summary">${renderSummary()}</section>
          <section class="loose-notes"></section>
          <section class="files">${state.files.map((f, i) => `<div class="file" id="f${i}" data-fi="${i}"></div>`).join('') || `<div class="card empty">${t('noFiles')}</div>`}</section>
          <section class="card convo">${renderMessages()}</section>
        </main>
      </div>
      <div class="reply" hidden></div>`;
    for (const f of state.files) renderFile(f);
    renderTree();
    renderLooseNotes();
    renderHeaderCounts();
    // Sticky file headers sit right under the header, whose height depends on the title length.
    requestAnimationFrame(() => app.style.setProperty('--hdr', `${app.querySelector('.top').offsetHeight}px`));
  }

  function allThreads() {
    const out = [];
    for (const [path, list] of Object.entries(state.comments || {})) {
      const drafts = (state.drafts[path] || []).map((d) => ({ ...d, __draft: true, author: state.self }));
      for (const th of [...C.buildThreads([...list, ...drafts]).values()].flat()) out.push({ ...th, path });
    }
    for (const [path, list] of Object.entries(state.drafts || {})) {
      if (state.comments[path]) continue;
      for (const th of [...C.buildThreads(list.map((d) => ({ ...d, __draft: true, author: state.self }))).values()].flat()) out.push({ ...th, path });
    }
    return out;
  }

  function renderHeaderCounts() {
    const tc = app.querySelector('[data-thread-count]');
    if (tc) {
      const all = allThreads();
      const open = all.filter((th) => th.unresolved).length;
      tc.textContent = `${open}/${all.length}`;
      tc.parentElement.title = `${t('allComments')}: ${t('unresolved')} ${open} / ${all.length} (Shift+C)`;
    }
    const n = state.change.unresolved_comment_count || 0;
    const el = app.querySelector('[data-unresolved]');
    if (el) el.textContent = n ? `${n} ${t('unresolvedCount')}` : '';
    const draftCount = Object.values(state.drafts).reduce((acc, l) => acc + l.length, 0);
    const dc = app.querySelector('[data-draft-count]');
    if (dc) { dc.textContent = draftCount; dc.hidden = !draftCount; }
  }

  // Gerrit stores reasons like "<GERRIT_ACCOUNT_1000032> replied on the change".
  function attnReason(a) {
    const accounts = [state.change.owner, ...Object.values(state.change.reviewers || {}).flat()];
    return String(a.reason || '').replace(/<GERRIT_ACCOUNT_(\d+)>/g, (_, id) => {
      const acc = accounts.find((x) => String(x?._account_id) === id);
      return acc ? (acc.display_name || acc.name || acc.username) : id;
    });
  }

  function renderSummary() {
    const ch = state.change;
    const labels = Object.entries(ch.labels || {}).map(([name, l]) => {
      const votes = (l.all || []).filter((v) => v.value);
      const cls = l.approved ? 'ok' : l.rejected ? 'bad' : '';
      const chips = votes.map((v) => `<span class="vote ${v.value > 0 ? 'pos' : 'neg'}" title="${who(v)}">${avatar(v, 16)}${v.value > 0 ? '+' : ''}${v.value}</span>`).join('');
      return `<div class="label-row"><span class="label-name ${cls}">${h(name)}</span>${chips || '<span class="sub">-</span>'}</div>`;
    }).join('');
    const canEdit = !!state.self && ch.status === 'NEW';
    const people = (kind) => {
      const list = (ch.reviewers?.[kind] || []).filter((a) => a._account_id !== ch.owner._account_id);
      const attn = ch.attention_set || {};
      const chips = list.map((a) => `<span class="person${attn[a._account_id] ? ' attn' : ''}" title="${attn[a._account_id] ? h(`${t('attention')}: ${attnReason(attn[a._account_id])}`) : ''}">${avatar(a, 18)}${who(a)}${canEdit ? `<button class="x" data-act="rv-del" data-id="${a._account_id}" title="${t('remove')}" aria-label="${t('remove')} ${who(a)}">&times;</button>` : ''}</span>`).join('');
      const add = canEdit ? `<button class="add-person" data-act="rv-add" data-state="${kind}" title="${t(kind === 'CC' ? 'addCc' : 'addReviewer')}" aria-label="${t(kind === 'CC' ? 'addCc' : 'addReviewer')}">+</button>` : '';
      return `<div class="people">${chips || (canEdit ? '' : '<span class="sub">-</span>')}${add}</div>`;
    };
    const changeLink = (num, subject, status, current) => `<li class="${current ? 'current' : ''}">
      <span class="arrow">${current ? '&#10140;' : ''}</span>
      <a href="${ROOT}/c/${enc(ch.project)}/+/${num}">${h(subject)}</a>
      ${status && status !== 'NEW' ? `<span class="chip">${h(t(status === 'MERGED' ? 'merged' : 'abandoned'))}</span>` : ''}</li>`;
    const related = (state.related || []).length > 1 ? `<div class="sum-h">${t('relationChain')}</div><ul class="rel">${state.related.map((c) => changeLink(c._change_number, c.commit.subject, c.status, c._change_number === ch._number)).join('')}</ul>` : '';
    const listOf = (title, arr) => (arr?.length ? `<div class="sum-h">${title}</div><ul class="rel">${arr.map((c) => changeLink(c._number, c.subject, c.status, false)).join('')}</ul>` : '');
    const sameTopic = listOf(t('sameTopic'), state.sameTopic);
    const conflicts = listOf(t('conflictsWith'), state.conflictsWith);
    const together = (state.together || []).length > 1 ? `<div class="sum-h">${t('submittedTogether')}</div><ul class="rel">${state.together.map((c) => changeLink(c._number, c.subject, c.status, c._number === ch._number)).join('')}</ul>` : '';
    const reqs = (ch.submit_requirements || []).map((r) => {
      const okReq = r.status === 'SATISFIED' || r.status === 'OVERRIDDEN' || r.status === 'NOT_APPLICABLE';
      return `<div class="req ${okReq ? 'ok' : 'no'}" title="${h(r.status)}"><span class="req-ic">${okReq ? '&#10003;' : '&#8856;'}</span>${h(r.name)}</div>`;
    }).join('');
    const pencil = (key) => (allActions().some((a) => a.key === key)
      ? `<button class="pencil" data-act="change-action" data-key="${key}" data-scope="change" title="${t('edit')}" aria-label="${t('edit')}"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg></button>` : '');
    const rev = ch.revisions?.[ch.current_revision];
    const parent = rev?.commit?.parents?.[0];
    const browse = rev?.commit?.web_links?.find((w) => w.name === 'browse' || w.name === 'gitiles')?.url;
    const meta = [
      ...(rev?.uploader && rev.uploader._account_id !== ch.owner._account_id ? [[t('uploader'), `${avatar(rev.uploader, 16)} ${who(rev.uploader)}`, '']] : []),
      [t('created'), `<span title="${h(fullTime(ch.created))}">${h(ago(ch.created))}</span>`, ''],
      ...(parent ? [[t('parent'), `<code title="${h(parent.subject || '')}">${h(parent.commit.slice(0, 8))}</code> <span class="sub ell">${h(parent.subject || '')}</span>`, '']] : []),
      ...(browse ? [[t('commit'), `<a href="${h(browse)}" target="_blank" rel="noopener noreferrer"><code>${h(ch.current_revision.slice(0, 8))}</code></a>`, '']] : []),
      [t('topic'), ch.topic ? `<a href="${ROOT}/q/topic:%22${enc(ch.topic)}%22">${h(ch.topic)}</a>` : '-', 'topic'],
      [t('hashtags'), (ch.hashtags || []).length ? ch.hashtags.map((x) => `<span class="chip">#${h(x)}</span>`).join(' ') : '-', 'hashtags'],
    ].map(([k, v, key]) => `<div class="meta-row"><span class="sub">${k}</span><span class="mv">${v}</span>${key ? pencil(key) : ''}</div>`).join('');
    const ownerAttn = ch.attention_set?.[ch.owner._account_id];
    return `
      <div class="sum-grid">
        <div><div class="sum-h">${t('owner')}</div><div class="people"><span class="person${ownerAttn ? ' attn' : ''}" title="${ownerAttn ? h(`${t('attention')}: ${attnReason(ownerAttn)}`) : ''}">${avatar(ch.owner, 18)}${who(ch.owner)}</span></div>
          <div class="sum-h">${t('reviewers')}</div>${people('REVIEWER')}<div class="sum-h">${t('cc')}</div>${people('CC')}${meta}</div>
        <div><div class="sum-h">${t('submitRequirements')}</div>${reqs || '<span class="sub">-</span>'}<div class="sum-h">${t('labels')}</div>${labels}</div>
        <div>${related}${together}${sameTopic}${conflicts}</div>
      </div>`;
  }

  // Like Gerrit's change log: every message is one line (author, votes, first
  // line of text, comment count, time); clicking it opens the full text and
  // the inline comments it published. Messages tagged autogenerated:* (bots,
  // rebases) stay behind "Show all entries", as in Gerrit.
  function renderMessages() {
    const msgs = state.change.messages || [];
    const isAuto = (m) => String(m.tag || '').startsWith('autogenerated:');
    const hidden = msgs.filter(isAuto).length;
    const byMsg = new Map();
    for (const [path, list] of Object.entries(state.comments || {})) {
      for (const c of list) {
        if (!c.change_message_id) continue;
        if (!byMsg.has(c.change_message_id)) byMsg.set(c.change_message_id, []);
        byMsg.get(c.change_message_id).push({ ...c, path });
      }
    }
    const shown = state.showAll ? msgs : msgs.filter((m) => !isAuto(m));
    // Newest one starts open, the way Gerrit does it.
    if (!state.openMsgs) state.openMsgs = new Set(shown.length ? [shown[shown.length - 1].id] : []);
    const allOpen = shown.length && shown.every((m) => state.openMsgs.has(m.id));
    const toggle = hidden ? `<label class="show-all sub"><input type="checkbox" data-act="show-all" ${state.showAll ? 'checked' : ''}> ${t('showAll')} (${t('hiddenN').replace('{n}', hidden)})</label>` : '';
    return `<div class="convo-h"><span class="sum-h">${t('conversation')}</span><span class="grow"></span>${toggle}
        <button class="link" data-act="msg-all" data-open="${allOpen ? '0' : '1'}">${allOpen ? t('collapseAll') : t('expandAll')}</button></div>`
      + shown.map((m) => {
        const { votes, body } = C.parseMessage(m.message);
        const comments = byMsg.get(m.id) || [];
        const open = state.openMsgs.has(m.id);
        const chips = votes.map((v) => (v.value == null
          ? `<span class="vote-chip removed">${h(v.label)}</span>`
          : `<span class="vote-chip ${v.value > 0 ? 'pos' : v.value < 0 ? 'neg' : ''}">${h(v.label)} ${v.value > 0 ? '+' : ''}${v.value}</span>`)).join('');
        const preview = body.replace(/\s+/g, ' ').slice(0, 300);
        const list = comments.length ? `<ul class="msg-comments">${comments.map((c) => `
          <li><button class="link" data-act="jump-comment" data-path="${h(c.path)}" data-line="${c.line || ''}" data-side="${h(c.side || '')}" data-ps="${c.patch_set}">${h(fileName(c.path).base)}${c.line ? `:${c.line}` : ''}</button>
          ${c.patch_set !== state.ps ? `<span class="chip">PS${c.patch_set}</span>` : ''}<span class="md">${md(c.message)}</span></li>`).join('')}</ul>` : '';
        return `<div class="msg${open ? ' open' : ''}${isAuto(m) ? ' auto' : ''}">
          <button class="msg-line" data-act="msg-toggle" data-mid="${h(m.id)}" aria-expanded="${open}">
            ${avatar(m.author || m.real_author, 22)}
            <b class="msg-who">${who(m.author || { name: 'Gerrit' })}</b>
            ${chips}
            <span class="msg-preview">${open ? '' : h(preview)}</span>
            ${comments.length ? `<span class="msg-count" title="${comments.length}">${svg('comment')}${comments.length}</span>` : ''}
            <span class="chip">PS${m._revision_number}</span>
            <span class="sub msg-time" title="${h(fullTime(m.date))}">${h(ago(m.date))}</span>
          </button>
          ${open ? `<div class="msg-main">${body ? `<div class="md msg-body">${md(body)}</div>` : ''}${list}</div>` : ''}
        </div>`;
      }).join('');
  }

  function fileName(path) {
    if (path === '/COMMIT_MSG') return { dir: '', base: t('commitMsg') };
    if (path === '/MERGE_LIST') return { dir: '', base: 'Merge list' };
    const i = path.lastIndexOf('/');
    return { dir: path.slice(0, i + 1), base: path.slice(i + 1) };
  }

  function renderTree() {
    const tree = app.querySelector('.tree');
    if (!tree) return;
    const nViewed = state.files.filter((f) => state.viewed.has(f.path)).length;
    tree.innerHTML = `<div class="tree-h">${t('files')} <span class="sub">${state.files.length}</span><span class="grow"></span>${state.self ? `<span class="sub">${t('viewed')} ${nViewed}/${state.files.length}</span>` : ''}</div>` + state.files.map((f, i) => {
      const { dir, base } = fileName(f.path);
      const threads = visibleComments(f.path);
      const unresolved = [...C.buildThreads(threads).values()].flat().filter((th) => th.unresolved && !th.hasDraft).length;
      const notes = state.notes.filter((n) => n.file === f.path && (n.status || 'open') === 'open').length;
      const st = f.info.status || 'M';
      return `<a class="tree-item${state.viewed.has(f.path) ? ' is-viewed' : ''}" data-act="jump" data-fi="${i}" title="${h(f.path)}">
        <span class="fs fs-${h(st)}">${h(st)}</span>
        <span class="tree-name"><span class="dir">${h(dir)}</span>${h(base)}</span>
        ${unresolved ? `<span class="badge warn">${unresolved}</span>` : ''}
        ${notes ? `<span class="badge aib">AI ${notes}</span>` : ''}
        <span class="delta"><span class="plus">+${f.info.lines_inserted || 0}</span><span class="minus">-${f.info.lines_deleted || 0}</span></span>
      </a>`;
    }).join('');
  }

  function renderLooseNotes() {
    const el = app.querySelector('.loose-notes');
    if (!el) return;
    const known = new Set(state.paths);
    const loose = state.notes.filter((n) => !n.file || !known.has(n.file));
    el.innerHTML = loose.length ? `<div class="card"><div class="sum-h">${t('aiNotes')}</div>${loose.map((n) => aiCard({ note: n, carried: n.patchset !== state.ps })).join('')}</div>` : '';
  }

  function renderFile(f) {
    const i = state.files.indexOf(f);
    const el = app.querySelector(`#f${i}`);
    if (!el) return;
    const { dir, base } = fileName(f.path);
    const collapsed = state.collapsed.has(f.path);
    const threads = C.buildThreads(visibleComments(f.path));
    const notes = notesFor(f);
    const commentCount = [...threads.values()].flat().length;

    let body = '';
    if (collapsed) body = '';
    else if (f.error) body = `<div class="file-msg err">${t('loadFail')}: ${h(f.error)}</div>`;
    else if (f.info.binary) body = `<div class="file-msg">${t('binary')}</div>`;
    else if (!f.rows && isBig(f) && !f.loading) body = `<div class="file-msg big">${t('bigDiff').replace('{n}', (f.info.lines_inserted || 0) + (f.info.lines_deleted || 0))} <button class="btn sm" data-act="load-diff" data-fi="${i}">${t('loadDiff')}</button></div>`;
    else if (!f.rows) body = `<div class="file-msg">${t('loading')}</div>`;
    else body = renderDiff(f, i, threads, notes);

    const fileLevel = [...(threads.get('file') || []).map((th) => renderThread(th)), ...(notes.get('file') || []).map(aiCard)].join('');
    el.classList.toggle('plain', f.path === '/COMMIT_MSG' && !state.base);
    el.classList.toggle('is-collapsed', collapsed);
    el.innerHTML = `
      <div class="file-head" data-act="toggle-file" data-fi="${i}">
        <span class="chev">${collapsed ? '&#9656;' : '&#9662;'}</span>
        <span class="path"><span class="dir">${h(dir)}</span><b>${h(base)}</b></span>
        ${f.diff?.meta_b?.web_links?.[0]?.url && !f.path.startsWith('/') ? `<a class="browse" href="${h(f.diff.meta_b.web_links[0].url)}" target="_blank" rel="noopener noreferrer" title="${t('browse')}" aria-label="${t('browse')}">${svg('external')}</a>` : ''}
        ${f.info.old_path ? `<span class="sub">&larr; ${h(f.info.old_path)}</span>` : ''}
        ${commentCount ? `<span class="badge">${commentCount}</span>` : ''}
        <span class="grow"></span>
        <span class="delta"><span class="plus">+${f.info.lines_inserted || 0}</span><span class="minus">-${f.info.lines_deleted || 0}</span></span>
        ${state.self && !collapsed ? `<button class="btn sm" data-act="add" data-fi="${i}" data-key="file">${t('comment')}</button>` : ''}
        ${state.self ? `<label class="viewed${state.viewed.has(f.path) ? ' on' : ''}"><input type="checkbox" data-act="viewed" data-fi="${i}" ${state.viewed.has(f.path) ? 'checked' : ''}> ${t('viewed')}</label>` : ''}
      </div>
      ${fileLevel && !collapsed ? `<div class="file-level">${fileLevel}</div>` : ''}
      ${body}`;
    paintRanges();
    // Diffs loading above the place we jumped to push it down; put it back.
    if (pinned && Date.now() < pinned.until && pinned.el.isConnected) pinned.el.scrollIntoView({ block: pinned.block });
  }

  // ---------- jumps that stay put while diffs load ----------
  let pinned = null;
  function scrollPinned(el, block) {
    if (!el) return;
    el.scrollIntoView({ block });
    pinned = { el, block, until: Date.now() + 2500 };
  }

  // ---------- range highlights ----------
  // Exact characters, like Gerrit, via the CSS Custom Highlight API: one DOM
  // Range per line so the thread boxes between lines are not painted.
  // 'lens-range' = saved range comments, 'lens-pending' = the selection a new
  // comment is being written for (the real selection is lost once the
  // textarea takes focus).
  // A DOM Range for characters [from, to) of a cell's text, which may be split
  // across highlight.js spans.
  function textRange(el, from, to) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let pos = 0;
    let started = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const len = n.length;
      if (!started && from <= pos + len) { range.setStart(n, Math.max(0, from - pos)); started = true; }
      if (started && to <= pos + len) { range.setEnd(n, Math.max(0, to - pos)); return range; }
      pos += len;
    }
    if (!started) return null;
    range.setEndAfter(el.lastChild || el);
    return range;
  }

  function lineRanges(fileEl, side, r) {
    const out = [];
    for (let l = r.start_line; l <= r.end_line; l++) {
      const el = fileEl.querySelector(`td.code[data-key="${side}:${l}"] .t`);
      if (!el) continue;
      const len = el.textContent.length;
      const range = textRange(el, l === r.start_line ? Math.min(r.start_character, len) : 0, l === r.end_line ? Math.min(r.end_character, len) : len);
      if (range && !range.collapsed) out.push(range);
    }
    return out;
  }

  let paintQueued = false;
  function paintRanges() {
    if (paintQueued || !self.CSS?.highlights) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      const ranges = [];
      state?.files.forEach((f, fi) => {
        const fileEl = app.querySelector(`#f${fi}`);
        if (!fileEl || !f.rows) return;
        for (const [key, list] of C.buildThreads(visibleComments(f.path))) {
          for (const th of list) if (th.root.range && key !== 'file') ranges.push(...lineRanges(fileEl, key[0], th.root.range));
        }
      });
      CSS.highlights.set('lens-range', new Highlight(...ranges));
      // Intraline: the characters that changed inside a changed line.
      const added = [];
      const removed = [];
      state?.files.forEach((f, fi) => {
        const fileEl = app.querySelector(`#f${fi}`);
        if (!fileEl || !f.rows) return;
        for (const row of f.rows) {
          if (!row.marks?.length) continue;
          const key = row.type === 'del' ? `a:${row.a}` : `b:${row.b}`;
          const el = fileEl.querySelector(`td.code[data-key="${key}"] .t`);
          if (!el) continue;
          for (const [from, to] of row.marks) {
            const rg = textRange(el, from, to);
            if (rg) (row.type === 'del' ? removed : added).push(rg);
          }
        }
      });
      CSS.highlights.set('lens-ia', new Highlight(...added));
      CSS.highlights.set('lens-id', new Highlight(...removed));
    });
  }

  function setPending(fi, side, range) {
    if (!self.CSS?.highlights) return;
    const fileEl = range && app.querySelector(`#f${fi}`);
    if (fileEl) CSS.highlights.set('lens-pending', new Highlight(...lineRanges(fileEl, side, range)));
    else CSS.highlights.delete('lens-pending');
  }

  function rowKeys(row) {
    const keys = [];
    if (row.type !== 'add' && row.a) keys.push(`a:${row.a}`);
    if (row.type !== 'del' && row.b) keys.push(`b:${row.b}`);
    return keys;
  }

  let curHtml = null; // highlighted lines of the file being rendered

  function codeCell(row, fi, key, cls) {
    if (!row) return '<td class="ln c-empty"></td><td class="code c-empty"></td>';
    const mark = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
    const btn = state.self ? `<button class="add-c" data-act="add" data-fi="${fi}" data-key="${key}" title="${t('addComment')}">+</button>` : '';
    const html = key[0] === 'a' ? curHtml?.a?.[row.a - 1] : curHtml?.b?.[row.b - 1];
    return `<td class="code c-${cls}" data-key="${key}">${btn}<span class="mk">${mark}</span><span class="t">${html ?? h(row.text)}</span></td>`;
  }

  function renderDiff(f, fi, threads, notes) {
    curHtml = f.html;
    // Unfold any folded block that hides a comment or a note.
    const busy = (row) => rowKeys(row).some((k) => threads.has(k) || notes.has(k));
    f.rows = f.rows.flatMap((row) => (row.type === 'fold' && row.hidden.some(busy) ? row.hidden : [row]));
    const extrasFor = (keys) => keys.flatMap((k) => [...(threads.get(k) || []).map((th) => renderThread(th)), ...(notes.get(k) || []).map(aiCard)]).join('');
    const foldRow = (row, ri, span) => {
      const n = row.hidden.length || row.skipped;
      return `<tr class="fold"><td colspan="${span}"><button class="link" data-act="expand" data-fi="${fi}" data-ri="${ri}" ${row.hidden.length ? '' : 'disabled'}>&#8597; ${t('expand')} (${n} ${t('lines')})</button></td></tr>`;
    };
    const out = [];

    // The commit message has nothing on the left, so it stays one column.
    if (settings.diffMode === 'split' && !(f.path === '/COMMIT_MSG' && !state.base)) {
      for (const p of C.splitRows(f.rows)) {
        if (p.fold) { out.push(foldRow(p.fold, p.ri, 4)); continue; }
        const lk = p.L ? `a:${p.L.a}` : null;
        const rk = p.R ? `b:${p.R.b}` : null;
        out.push(`<tr class="r">
          <td class="ln c-${p.L?.type || 'empty'}">${p.L?.a ?? ''}</td>${p.L ? codeCell(p.L, fi, lk, p.L.type) : '<td class="code c-empty"></td>'}
          <td class="ln c-${p.R?.type || 'empty'}">${p.R?.b ?? ''}</td>${p.R ? codeCell(p.R, fi, rk, p.R.type) : '<td class="code c-empty"></td>'}
        </tr>`);
        const left = lk ? extrasFor([lk]) : '';
        const right = rk ? extrasFor([rk]) : '';
        if (left || right) out.push(`<tr class="extra"><td colspan="2">${left}</td><td colspan="2">${right}</td></tr>`);
      }
      return `<div class="diff-wrap"><table class="diff split"><colgroup><col class="col-ln"><col><col class="col-ln"><col></colgroup>${out.join('')}</table></div>`;
    }

    f.rows.forEach((row, ri) => {
      if (row.type === 'fold') { out.push(foldRow(row, ri, 3)); return; }
      const key = row.type === 'del' ? `a:${row.a}` : `b:${row.b}`;
      out.push(`<tr class="r ${row.type}"><td class="ln">${row.a ?? ''}</td><td class="ln">${row.b ?? ''}</td>${codeCell(row, fi, key, row.type)}</tr>`);
      const extras = extrasFor(rowKeys(row));
      if (extras) out.push(`<tr class="extra"><td colspan="3">${extras}</td></tr>`);
    });
    return `<div class="diff-wrap"><table class="diff unified">${out.join('')}</table></div>`;
  }

  function renderThread(th) {
    const items = th.comments.map((c) => `
      <div class="cm${c.__draft ? ' draft' : ''}">
        <div class="cm-head">${avatar(c.author, 20)} <b>${who(c.author)}</b>${c.__draft ? '' : `<button class="cm-link" data-act="comment-link" data-id="${h(c.id)}" title="${t('copyLink')}" aria-label="${t('copyLink')}">${svg('link')}</button>`}
          <span class="sub" title="${h(fullTime(c.updated))}">${h(ago(c.updated))}</span>
          ${c.__draft ? `<span class="chip draft">${t('draft')}</span>` : ''}
          ${c.patch_set !== state.ps && c === th.comments[0] ? `<span class="chip">PS${c.patch_set}</span>` : ''}
          ${c.range && c === th.comments[0] && c.range.start_line !== c.range.end_line ? `<span class="chip">${t('lineRange')} ${c.range.start_line}-${c.range.end_line}</span>` : ''}
        </div>
        <div class="md">${md(c.message)}</div>
        ${c.__draft ? `<div class="cm-actions"><button class="btn sm" data-act="dr-edit" data-id="${h(c.id)}">${t('edit')}</button><button class="btn sm danger" data-act="dr-del" data-id="${h(c.id)}">${t('discard')}</button></div>` : ''}
      </div>`).join('');
    const canAct = state.self && !th.hasDraft;
    return `<div class="thread${th.unresolved ? ' unresolved' : ''}">
      ${items}
      <div class="th-foot">
        <span class="chip ${th.unresolved ? 'warn' : 'ok'}">${th.unresolved ? t('unresolved') : t('resolved')}</span>
        <span class="grow"></span>
        ${canAct ? `<button class="btn sm" data-act="th-reply" data-id="${h(th.comments[th.comments.length - 1].id)}">${t('replyTo')}</button>
          <button class="btn sm" data-act="quote" data-id="${h(th.comments[th.comments.length - 1].id)}">${t('quote')}</button>
          ${th.unresolved ? `<button class="btn sm" data-act="th-quick" data-msg="Ack" data-id="${h(th.comments[th.comments.length - 1].id)}">${t('ack')}</button>
          <button class="btn sm" data-act="th-quick" data-msg="Done" data-id="${h(th.comments[th.comments.length - 1].id)}">${t('done')}</button>` : ''}` : ''}
      </div>
    </div>`;
  }

  const SEVERITY = {
    must: { key: 'sevMust', cls: 'must' },
    should: { key: 'sevShould', cls: 'should' },
    nit: { key: 'sevNit', cls: 'nit' },
    info: { key: 'sevInfo', cls: 'info' },
  };
  const fromPs = (n) => (C.getLang() === 'ko' ? `PS${n} ${t('aiFrom')}` : `${t('aiFrom')} PS${n}`);

  function aiCard({ note, carried, lost }) {
    const sev = SEVERITY[note.severity] || SEVERITY.info;
    const id = h(note.id);
    if (note.status === 'posted') {
      return `<div class="ai dismissed" data-note="${id}"><span class="sev ${sev.cls}">${t(sev.key)}</span> <span>${h(note.title)}</span> <span class="chip ok">${t('aiPosted')}</span><span class="grow"></span></div>`;
    }
    if (note.status === 'dismissed') {
      return `<div class="ai dismissed" data-note="${id}"><span class="sev ${sev.cls}">${t(sev.key)}</span> <s>${h(note.title)}</s> <span class="grow"></span><button class="link" data-act="ai-status" data-status="open" data-note="${id}">${t('aiRestore')}</button></div>`;
    }
    const refs = note.refs || [];
    return `<div class="ai sev-${sev.cls}" data-note="${id}">
      <div class="ai-head">
        <span class="sev ${sev.cls}">${t(sev.key)}</span>
        <b class="ai-title">${h(note.title)}</b>
        ${carried ? `<span class="chip">${fromPs(note.patchset)}</span>` : ''}
        ${lost ? `<span class="chip warn">${t('aiOutdated')}</span>` : ''}
        ${note.context ? `<span class="sub">${h(note.context)}</span>` : ''}
        ${note.status === 'posted' ? `<span class="chip ok">${t('aiPosted')}</span>` : ''}
        <span class="grow"></span>
        ${state.self && note.status !== 'posted' && state.paths.includes(note.file) ? `<span class="seg">
          <button data-act="ai-post" data-note="${id}">${t('aiPost')}</button>
          <button data-act="ai-edit" data-note="${id}">${t('aiEdit')}</button>
          <button data-act="ai-status" data-status="dismissed" data-note="${id}">${t('aiDismiss')}</button></span>` : ''}
      </div>
      ${note.summary ? `<div class="ai-summary sub">${h(note.summary)}</div>` : ''}
      ${refs.length ? `<div class="tabs"><button class="tab on" data-act="ai-tab" data-tab="detail">${t('aiDetail')}</button><button class="tab" data-act="ai-tab" data-tab="refs">${t('aiRefs')} (${refs.length})</button></div>` : ''}
      <div class="pane md" data-pane="detail">${md(note.body)}</div>
      ${refs.length ? `<div class="pane" data-pane="refs" hidden>${refs.map((r) => `
        <div class="ref"><div class="ref-head"><code>${h(r.file || '')}${r.line ? `:${h(r.line)}` : ''}</code></div>
        ${r.code ? `<pre><code>${h(r.code)}</code></pre>` : ''}${r.note ? `<div class="md">${md(r.note)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${note.gerritText ? `<div class="ai-gerrit"><div class="ai-gerrit-h"><span class="sub">${t('aiSuggested')}</span><button class="btn sm" data-act="ai-copy" data-note="${id}">${t('copy')}</button></div><div class="quote">${h(note.gerritText)}</div></div>` : ''}
    </div>`;
  }

  // ---------- editors ----------

  const ICON = {
    bold: '<path d="M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zm0 5.5h5a2.75 2.75 0 0 1 0 5.5h-5z"/>',
    code: '<path d="M5.5 4 1.5 8l4 4M10.5 4l4 4-4 4"/>',
    block: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="m6.5 6-2 2 2 2m3-4 2 2-2 2"/>',
    link: '<path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2.1-2.1a2.75 2.75 0 0 0-3.9-3.9l-.85.85M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2.1 2.1a2.75 2.75 0 0 0 3.9 3.9l.85-.85"/>',
    list: '<path d="M6 4h8.5M6 8h8.5M6 12h8.5"/><circle cx="2.5" cy="4" r=".6"/><circle cx="2.5" cy="8" r=".6"/><circle cx="2.5" cy="12" r=".6"/>',
    quote: '<path d="M2.5 3v10M6 4.5h8M6 8h8M6 11.5h5"/>',
    comment: '<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5V11H3.5a1 1 0 0 1-1-1z"/>',
    link: '<path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2.1-2.1a2.75 2.75 0 0 0-3.9-3.9l-.85.85M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2.1 2.1a2.75 2.75 0 0 0 3.9 3.9l.85-.85"/>',
    external: '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>',
    emoji: '<circle cx="8" cy="8" r="6.25"/><path d="M5.6 9.6a3 3 0 0 0 4.8 0"/><circle cx="6" cy="6.6" r=".5"/><circle cx="10" cy="6.6" r=".5"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
  const FORMATS = [['bold', 'fmtBold'], ['code', 'fmtCode'], ['block', 'fmtCodeBlock'], ['link', 'fmtLink'], ['list', 'fmtList'], ['quote', 'fmtQuote']];

  // GitHub's reaction set first, then what shows up most in review threads and chat.
  const EMOJI = [
    '👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀',
    '✅', '❌', '🙏', '💡', '⚠️', '🤔', '🔥', '💯',
    '🙌', '👏', '👌', '💪', '✨', '🐛', '🔧', '📝',
    '⏳', '🙇', '😂', '😅', '🥲', '😭',
  ];

  // One message box for every place that takes text: inline comments, replies,
  // draft edits and the review dialog. Toolbar sits inside the box, under the text.
  function composer(text, cls, rows) {
    return `<div class="msg-box">
      <textarea rows="${rows}" class="${cls}" placeholder="${t(cls === 'reply-msg' ? 'message' : 'comment')}">${h(text)}</textarea>
      <div class="msg-tools"><span class="toolbar">
        ${FORMATS.map(([f, k]) => `<button class="icon" data-act="fmt" data-fmt="${f}" title="${t(k)}" aria-label="${t(k)}">${svg(f)}</button>`).join('')}
        <span class="emoji-wrap"><button class="icon" data-act="emoji-open" title="${t('fmtEmoji')}" aria-label="${t('fmtEmoji')}">${svg('emoji')}</button>
          <span class="emoji-pop" hidden>${EMOJI.map((e) => `<button data-act="emoji" data-e="${e}">${e}</button>`).join('')}</span></span>
      </span></div>
    </div>`;
  }

  function editorHtml(text, unresolved, dataset) {
    const attrs = Object.entries(dataset).filter(([, v]) => v != null).map(([k, v]) => `data-${k}="${h(v)}"`).join(' ');
    return `<div class="editor" ${attrs}>
      ${composer(text, 'ed-text', 4)}
      <div class="ed-foot"><label class="sub"><input type="checkbox" class="ed-resolved" ${unresolved ? '' : 'checked'}> ${t('resolved')}</label>
      <span class="grow"></span>
      <button class="btn sm" data-act="ed-cancel">${t('cancel')}</button><button class="btn sm primary" data-act="ed-save" title="${t('saveHint')}">${t('save')}</button></div>
    </div>`;
  }

  function insertAtCursor(ta, text) {
    ta.focus();
    if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  }

  // Markdown buttons insert plain text at the cursor, the way GitHub's do, so
  // the comment is still readable in Gerrit's own UI and in email.
  function applyFormat(ta, kind) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = ta.value;
    const sel = v.slice(s, e);
    let from = s;
    let ins;
    let cs;
    let ce;
    if (kind === 'bold' || kind === 'code') {
      const m = kind === 'bold' ? '**' : '`';
      ins = `${m}${sel}${m}`; cs = s + m.length; ce = cs + sel.length;
    } else if (kind === 'block') {
      const pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
      ins = `${pre}\`\`\`\n${sel}\n\`\`\`\n`; cs = s + pre.length + 4; ce = cs + sel.length;
    } else if (kind === 'link') {
      ins = `[${sel}](url)`;
      if (sel) { cs = s + sel.length + 3; ce = cs + 3; } else { cs = ce = s + 1; }
    } else {
      const mark = kind === 'list' ? '- ' : '> ';
      from = v.lastIndexOf('\n', s - 1) + 1;
      ins = v.slice(from, e).split('\n').map((l) => mark + l).join('\n');
      cs = ce = from + ins.length;
    }
    ta.focus();
    ta.setSelectionRange(from, e);
    // execCommand keeps the browser's undo history; setRangeText is the fallback.
    if (!document.execCommand('insertText', false, ins)) ta.setRangeText(ins, from, e, 'end');
    ta.setSelectionRange(cs, ce);
  }

  // Absolutely positioned inside .app (the scroller), so they stay next to the
  // text they belong to while the page scrolls. renderAll() wipes .app, so
  // they are recreated on demand.
  function floating(cls, tag = 'div') {
    let el = app.querySelector(`:scope > .${cls}`);
    if (!el) {
      el = document.createElement(tag);
      el.className = cls;
      el.hidden = true;
      app.appendChild(el);
    }
    return el;
  }
  const atPoint = (el, x, y) => {
    const r = app.getBoundingClientRect();
    el.style.left = `${x - r.left + app.scrollLeft}px`;
    el.style.top = `${y - r.top + app.scrollTop}px`;
  };

  // ---------- reviewers / CC ----------

  let rvSuggest = null; // { input, kind, items, index }

  function closeRvSuggest() {
    rvSuggest = null;
    floating('suggest').hidden = true;
  }

  function openRvInput(btn) {
    const input = document.createElement('input');
    input.className = 'rv-input';
    input.dataset.state = btn.dataset.state;
    input.placeholder = t(btn.dataset.state === 'CC' ? 'addCc' : 'addReviewer');
    btn.replaceWith(input);
    input.focus();
    input.addEventListener('blur', () => setTimeout(() => {
      if (rvSuggest?.input === input || !input.isConnected) return;
      app.querySelector('.summary').innerHTML = renderSummary();
    }, 150));
  }

  let rvTimer = 0;
  function onRvInput(input) {
    clearTimeout(rvTimer);
    const q = input.value.trim();
    if (!q) { closeRvSuggest(); return; }
    rvTimer = setTimeout(async () => {
      const kind = input.dataset.state;
      const items = await api(`/changes/${state.change._number}/suggest_reviewers?q=${enc(q)}&n=8&reviewer-state=${kind}`).catch(() => []);
      if (input.value.trim() !== q) return;
      if (!items?.length) { closeRvSuggest(); return; }
      rvSuggest = { input, kind, items, index: 0 };
      renderRvSuggest();
    }, 150);
  }

  function renderRvSuggest() {
    const box = floating('suggest');
    box.className = 'suggest mention';
    box.innerHTML = rvSuggest.items.map((it, i) => {
      const a = it.account;
      const label = a ? `${avatar(a, 18)}<b>${who(a)}</b><span class="sub">${h(a.email || a.username || '')}</span>` : `<b>${h(it.group?.name || '')}</b><span class="sub">${t('group')}</span>`;
      return `<button class="${i === rvSuggest.index ? 'on' : ''}" data-act="rv-pick" data-i="${i}">${label}</button>`;
    }).join('');
    const r = rvSuggest.input.getBoundingClientRect();
    atPoint(box, r.left, r.bottom + 4);
    box.hidden = false;
  }

  async function pickReviewer(i) {
    const it = rvSuggest.items[i];
    const kind = rvSuggest.kind;
    closeRvSuggest();
    const reviewer = it.account ? String(it.account._account_id) : it.group.id;
    const res = await api(`/changes/${state.change._number}/reviewers`, 'POST', { reviewer, state: kind });
    if (res?.error) throw new Error(res.error);
    await reloadChange();
  }

  // ---------- @mentions ----------

  let mention = null; // { ta, start, items, index }
  let mentionTimer = 0;

  function closeMention() {
    mention = null;
    floating('mention').hidden = true;
  }

  function onInput(e) {
    const ta = e.target;
    if (ta.classList?.contains('rv-input')) { onRvInput(ta); return; }
    if (ta.tagName !== 'TEXTAREA') return;
    const before = ta.value.slice(0, ta.selectionStart);
    const m = /(?:^|\s)@([^\s@]{1,40})$/.exec(before);
    if (!m) { closeMention(); return; }
    clearTimeout(mentionTimer);
    mentionTimer = setTimeout(async () => {
      const items = await api(`/accounts/?suggest&q=${enc(m[1])}&n=6`).catch(() => []);
      if (!items?.length || ta.value.slice(0, ta.selectionStart) !== before) { closeMention(); return; }
      mention = { ta, start: before.length - m[1].length - 1, items, index: 0 };
      renderMention();
    }, 150);
  }

  function renderMention() {
    const box = floating('mention');
    box.innerHTML = mention.items.map((a, i) => `<button class="${i === mention.index ? 'on' : ''}" data-act="mention" data-i="${i}">${avatar(a, 18)}<b>${who(a)}</b><span class="sub">${h(a.email || a.username || '')}</span></button>`).join('');
    const r = mention.ta.getBoundingClientRect();
    atPoint(box, r.left + 8, r.bottom + 4);
    box.hidden = false;
  }

  function pickMention(i) {
    const { ta, start, items } = mention;
    const a = items[i];
    // Gerrit resolves @email (and @username) mentions and adds them to the attention set.
    const handle = a.email || a.username;
    const end = ta.selectionStart;
    ta.focus();
    ta.setSelectionRange(start, end);
    const ins = `@${handle} `;
    if (!document.execCommand('insertText', false, ins)) ta.setRangeText(ins, start, end, 'end');
    closeMention();
  }

  function onKeyDown(e) {
    const ta = e.target;
    if (ta.classList?.contains('rv-input')) {
      if (e.key === 'Escape') { closeRvSuggest(); app.querySelector('.summary').innerHTML = renderSummary(); return; }
      if (!rvSuggest) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        rvSuggest.index = (rvSuggest.index + (e.key === 'ArrowDown' ? 1 : -1) + rvSuggest.items.length) % rvSuggest.items.length;
        renderRvSuggest();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pickReviewer(rvSuggest.index).catch((err) => toast(`${t('err')}: ${err.message}`, true));
      }
      return;
    }
    if (ta.tagName !== 'TEXTAREA') return;
    if (mention && mention.ta === ta) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mention.index = (mention.index + (e.key === 'ArrowDown' ? 1 : -1) + mention.items.length) % mention.items.length;
        renderMention();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mention.index); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ta.closest('.editor')?.querySelector('[data-act=ed-save]')?.click();
      ta.closest('.reply-card')?.querySelector('[data-act=reply-send]')?.click();
    } else if (e.key === 'Escape') {
      ta.closest('.editor')?.querySelector('[data-act=ed-cancel]')?.click();
      ta.closest('.reply-card')?.querySelector('[data-act=reply-close]')?.click();
    }
  }

  // ---------- selecting and copying code ----------
  // In the split view a drag would run across both columns, since they share
  // table rows. Pressing in one column makes only that column selectable
  // (GitHub does the same); line numbers, +/- marks and comment boxes never are.
  function lockSelectionSide(target) {
    for (const tb of app?.querySelectorAll('table.diff[data-sel]') || []) delete tb.dataset.sel;
    const cell = target.closest?.('td.code[data-key]');
    if (!cell) return;
    const table = cell.closest('table');
    table.dataset.sel = !table.classList.contains('split') ? 'U' : cell === cell.parentElement.cells[1] ? 'L' : 'R';
  }

  // Copy gives the selected code only, one line per row, without the
  // markers, line numbers or comment text that sit between rows.
  function onCopy(e) {
    const sel = shadow.getSelection ? shadow.getSelection() : getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const table = start?.closest?.('table.diff') || (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest?.('table.diff');
    if (!table) return;
    const side = table.dataset.sel || 'U';
    const cells = [...table.querySelectorAll('td.code[data-key]')].filter((c) => {
      if (side === 'L' && c !== c.parentElement.cells[1]) return false;
      if (side === 'R' && c !== c.parentElement.cells[3]) return false;
      return range.intersectsNode(c);
    });
    if (!cells.length) return;
    const offsetIn = (el, node, off) => {
      const r = document.createRange();
      r.setStart(el, 0);
      r.setEnd(node, off);
      return r.toString().length;
    };
    const lines = cells.map((c) => {
      const t = c.querySelector('.t');
      const full = t.textContent;
      let from = 0;
      let to = full.length;
      if (c.contains(range.startContainer)) from = t.contains(range.startContainer) ? offsetIn(t, range.startContainer, range.startOffset) : 0;
      if (c.contains(range.endContainer)) to = t.contains(range.endContainer) ? offsetIn(t, range.endContainer, range.endOffset) : (t.compareDocumentPosition(range.endContainer) & Node.DOCUMENT_POSITION_PRECEDING ? 0 : full.length);
      return full.slice(from, Math.max(from, to));
    });
    e.clipboardData.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  }

  // ---------- range comments (drag to select) ----------

  let pendingRange = null;
  let downAt = null;

  // A plain click (no drag) never offers a range comment: Chrome only clears
  // the old selection after mouseup, so reading it right away would bring the
  // button back. Shift+click still extends a selection on purpose.
  function onMouseUp(e) {
    if (!app || app.hidden || e.target.closest?.('.range-add')) return;
    const clicked = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4 && !e.shiftKey;
    if (clicked) return;
    setTimeout(() => showRangeButton(e), 0);
  }

  function showRangeButton(e) {
    const btn = floating('range-add', 'button');
    btn.hidden = true;
    pendingRange = null;
    if (!state?.self) return;
    const sel = shadow.getSelection ? shadow.getSelection() : getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const cellOf = (n) => (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('td.code[data-key]');
    const ca = cellOf(sel.anchorNode);
    const cb = cellOf(sel.focusNode);
    if (!ca || !cb || ca.closest('table') !== cb.closest('table')) return;
    const [sa, la] = ca.dataset.key.split(':');
    const [sb, lb] = cb.dataset.key.split(':');
    if (sa !== sb) return;
    const offset = (cell, node, off) => {
      const text = cell.querySelector('.t');
      if (!text.contains(node)) return node.compareDocumentPosition && (text.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) ? text.textContent.length : 0;
      const r = document.createRange();
      r.setStart(text, 0);
      r.setEnd(node, off);
      return r.toString().length;
    };
    let start = { line: Number(la), ch: offset(ca, sel.anchorNode, sel.anchorOffset), cell: ca };
    let end = { line: Number(lb), ch: offset(cb, sel.focusNode, sel.focusOffset), cell: cb };
    if (start.line > end.line || (start.line === end.line && start.ch > end.ch)) [start, end] = [end, start];
    if (start.line === end.line && start.ch === end.ch) return;
    pendingRange = {
      fi: end.cell.closest('.file').dataset.fi,
      key: `${sa}:${end.line}`,
      cell: end.cell,
      range: { start_line: start.line, start_character: start.ch, end_line: end.line, end_character: end.ch },
    };
    btn.dataset.act = 'range-add';
    btn.title = t('addComment');
    btn.setAttribute('aria-label', t('addComment'));
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5V11H3.5a1 1 0 0 1-1-1z"/></svg>';
    atPoint(btn, e.clientX + 6, e.clientY + 6);
    btn.hidden = false;
  }

  function openEditor(anchorEl, html) {
    let target;
    const tr = anchorEl.closest('tr');
    if (tr && !anchorEl.closest('.extra')) {
      const row = document.createElement('tr');
      row.className = 'extra editor-row';
      if (tr.closest('table').classList.contains('split')) {
        const right = anchorEl.closest('td') === tr.lastElementChild;
        row.innerHTML = right ? `<td colspan="2"></td><td colspan="2">${html}</td>` : `<td colspan="2">${html}</td><td colspan="2"></td>`;
      } else {
        row.innerHTML = `<td colspan="3">${html}</td>`;
      }
      const next = tr.nextElementSibling;
      if (next?.classList.contains('extra') && !next.classList.contains('editor-row')) next.after(row);
      else tr.after(row);
      target = row;
    } else {
      const div = document.createElement('div');
      div.className = 'editor-host';
      div.innerHTML = html;
      anchorEl.after(div);
      target = div;
    }
    const ta = target.querySelector('textarea');
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    (target.querySelector('.editor') || target).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Where a new draft at key 'a:12' / 'b:12' / 'file' goes in Gerrit terms.
  function draftTarget(key) {
    if (key === 'file') return { rev: state.ps };
    const [side, line] = key.split(':');
    if (side === 'a') return state.base ? { rev: state.base, line: Number(line) } : { rev: state.ps, line: Number(line), side: 'PARENT' };
    return { rev: state.ps, line: Number(line) };
  }

  async function saveEditor(ed) {
    const ds = ed.dataset;
    const message = ed.querySelector('textarea').value.trim();
    const unresolved = !ed.querySelector('.ed-resolved').checked;
    if (!message) return;
    if (ds.range) setPending(null);
    const n = state.change._number;
    const f = ds.fi != null ? state.files[Number(ds.fi)] : null;
    if (ds.draft) {
      const d = findComment(ds.draft);
      await api(`/changes/${n}/revisions/${d.patch_set}/drafts/${enc(d.id)}`, 'PUT', {
        path: d.path, line: d.line, side: d.side, range: d.range, in_reply_to: d.in_reply_to, message, unresolved,
      });
    } else if (ds.replyTo) {
      const p = findComment(ds.replyTo);
      await api(`/changes/${n}/revisions/${p.patch_set}/drafts`, 'PUT', {
        path: p.path, line: p.line, side: p.side, range: p.range, in_reply_to: p.id, message, unresolved,
      });
    } else {
      const tgt = draftTarget(ds.key);
      const range = ds.range ? JSON.parse(ds.range) : undefined;
      await api(`/changes/${n}/revisions/${tgt.rev}/drafts`, 'PUT', { path: f.path, line: tgt.line, side: tgt.side, range, message, unresolved });
    }
    if (ds.note) {
      const note = state.notes.find((x) => x.id === ds.note);
      if (note) await setNoteStatus(note, 'posted');
    }
    await reloadComments();
  }

  // ---------- reply panel ----------

  function openReply() {
    const ch = state.change;
    const panel = app.querySelector('.reply');
    const mine = (name) => (ch.labels?.[name]?.all || []).find((v) => v._account_id === state.self?._account_id)?.value || 0;
    const labels = Object.entries(ch.permitted_labels || {}).map(([name, values]) => `
      <div class="vote-row"><span class="label-name">${h(name)}</span><span class="seg">${values.map((v) => {
        const num = Number(v.trim());
        return `<button data-act="vote" data-label="${h(name)}" data-value="${num}" class="${num === mine(name) ? 'on' : ''} ${num > 0 ? 'pos' : num < 0 ? 'neg' : ''}">${h(v.trim())}</button>`;
      }).join('')}</span></div>`).join('');
    const drafts = Object.entries(state.drafts).flatMap(([path, list]) => list.map((d) => `<li><code>${h(fileName(path).base)}${d.line ? `:${d.line}` : ''}</code> ${h(d.message.slice(0, 80))}</li>`));
    panel.innerHTML = `<div class="reply-card">
      <div class="reply-h"><b>${t('reply')}</b><span class="grow"></span><button class="link" data-act="reply-close">&times;</button></div>
      ${composer('', 'reply-msg', 5)}
      ${labels}
      ${drafts.length ? `<div class="sub">${t('drafts')} ${drafts.length}</div><ul class="draft-list">${drafts.join('')}</ul>` : ''}
      <div class="ed-foot"><span class="grow"></span><button class="btn" data-act="reply-close">${t('cancel')}</button><button class="btn primary" data-act="reply-send" title="${t('saveHint')}">${t('publish')}</button></div>
    </div>`;
    panel.hidden = false;
    panel.querySelector('textarea').focus();
  }

  async function sendReply() {
    const panel = app.querySelector('.reply');
    const labels = {};
    for (const b of panel.querySelectorAll('[data-act="vote"].on.changed')) labels[b.dataset.label] = Number(b.dataset.value);
    const message = panel.querySelector('.reply-msg').value.trim();
    await api(`/changes/${state.change._number}/revisions/current/review`, 'POST', {
      message: message || undefined,
      labels,
      drafts: 'PUBLISH_ALL_REVISIONS',
    });
    panel.hidden = true;
    toast(t('sent'));
    hiddenFor = null;
    load(route);
  }

  // ---------- events ----------

  async function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (mention && el?.dataset.act !== 'mention' && e.target !== mention.ta) closeMention();
    if (rvSuggest && el?.dataset.act !== 'rv-pick' && e.target !== rvSuggest.input) closeRvSuggest();
    if (!e.target.closest('.emoji-wrap')) for (const p of shadow.querySelectorAll('.emoji-pop:not([hidden])')) p.hidden = true;
    if (!e.target.closest('.menu-wrap')) for (const m of shadow.querySelectorAll('.menu:not([hidden])')) m.hidden = true;
    if (!el || el.tagName === 'SELECT') return;
    const act = el.dataset.act;
    try {
      switch (act) {
        case 'classic':
          if (wrote) {
            sessionStorage.setItem(CLASSIC_KEY, String(route.change));
            location.reload();
            return;
          }
          hiddenFor = route.change;
          setVisible(false);
          return;
        case 'restore':
          openLens();
          return;
        case 'star': {
          const on = !state.change.starred;
          await api(`/accounts/self/starred.changes/${state.change._number}`, on ? 'PUT' : 'DELETE');
          state.change.starred = on;
          el.classList.toggle('on', on);
          el.innerHTML = on ? '&#9733;' : '&#9734;';
          el.setAttribute('aria-pressed', String(on));
          return;
        }
        case 'copy-link':
          e.preventDefault();
          await copy(new URL(el.getAttribute('href'), location.origin).href);
          toast(t('copied'));
          return;
        case 'comment-link': {
          const c = findComment(el.dataset.id);
          await copy(`${location.origin}${ROOT}/c/${state.change.project}/+/${state.change._number}/comment/${c.id}/`);
          toast(t('copied'));
          return;
        }
        case 'threads-open':
          showThreads(true);
          return;
        case 'help':
          showHelp();
          return;
        case 'change-action':
          app.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
          await runAction(el.dataset.key, el.dataset.scope);
          return;
        case 'menu-open': {
          const m = el.parentElement.querySelector('.menu');
          m.hidden = !m.hidden;
          return;
        }
        case 'classic-edit':
          // Gerrit's edit mode lives in the classic view; ",edit" opens it directly.
          sessionStorage.setItem(CLASSIC_KEY, String(route.change));
          location.href = `${ROOT}/c/${state.change.project}/+/${state.change._number},edit`;
          return;
        case 'download':
          el.closest('.menu').hidden = true;
          await showDownload();
          return;
        case 'quote': {
          const c = findComment(el.dataset.id);
          const quoted = `${c.message.split('\n').map((l) => `> ${l}`).join('\n')}\n\n`;
          openEditor(el.closest('.thread'), editorHtml(quoted, !!c.unresolved, { 'reply-to': el.dataset.id }));
          return;
        }
        case 'rv-add':
          openRvInput(el);
          return;
        case 'rv-pick':
          await pickReviewer(Number(el.dataset.i));
          return;
        case 'rv-del':
          await api(`/changes/${state.change._number}/reviewers/${el.dataset.id}`, 'DELETE');
          await reloadChange();
          return;
        case 'tree-toggle':
          settings.treeHidden = !settings.treeHidden;
          chrome.storage.local.set({ treeHidden: settings.treeHidden });
          app.querySelector('.layout').classList.toggle('no-tree', settings.treeHidden);
          el.classList.toggle('on', !settings.treeHidden);
          return;
        case 'diff-mode':
          settings.diffMode = el.dataset.mode;
          chrome.storage.local.set({ diffMode: settings.diffMode });
          for (const b of el.parentElement.children) b.classList.toggle('on', b === el);
          for (const f of state.files) renderFile(f);
          return;
        case 'viewed': {
          const f = state.files[Number(el.dataset.fi)];
          const url = `/changes/${state.change._number}/revisions/${state.ps}/files/${enc(f.path)}/reviewed`;
          if (el.checked) {
            await api(url, 'PUT');
            state.viewed.add(f.path);
            state.collapsed.add(f.path);
          } else {
            await api(url, 'DELETE');
            state.viewed.delete(f.path);
            state.collapsed.delete(f.path);
          }
          renderFile(f);
          if (!el.checked && !isBig(f)) loadDiff(f);
          renderTree();
          return;
        }
        case 'emoji-open': {
          const pop = el.parentElement.querySelector('.emoji-pop');
          pop.hidden = !pop.hidden;
          return;
        }
        case 'emoji': {
          el.closest('.emoji-pop').hidden = true;
          insertAtCursor(el.closest('.msg-box').querySelector('textarea'), el.dataset.e);
          return;
        }
        case 'show-all':
          state.showAll = !state.showAll;
          app.querySelector('.convo').innerHTML = renderMessages();
          return;
        case 'msg-toggle':
          if (state.openMsgs.has(el.dataset.mid)) state.openMsgs.delete(el.dataset.mid); else state.openMsgs.add(el.dataset.mid);
          app.querySelector('.convo').innerHTML = renderMessages();
          return;
        case 'msg-all': {
          const shown = (state.change.messages || []).filter((m) => state.showAll || !String(m.tag || '').startsWith('autogenerated:'));
          state.openMsgs = new Set(el.dataset.open === '1' ? shown.map((m) => m.id) : []);
          app.querySelector('.convo').innerHTML = renderMessages();
          return;
        }
        case 'jump-comment':
          await jumpToLine(el.dataset.path, Number(el.dataset.line) || null, el.dataset.side === 'PARENT' ? 'a' : 'b', Number(el.dataset.ps) || null);
          return;
        case 'fmt':
          applyFormat(el.closest('.msg-box').querySelector('textarea'), el.dataset.fmt);
          return;
        case 'mention':
          pickMention(Number(el.dataset.i));
          return;
        case 'range-add': {
          const r = pendingRange;
          el.hidden = true;
          if (!r) return;
          (shadow.getSelection ? shadow.getSelection() : getSelection())?.removeAllRanges();
          setPending(r.fi, r.key[0], r.range);
          openEditor(r.cell, editorHtml('', true, { fi: r.fi, key: r.key, range: JSON.stringify(r.range) }));
          return;
        }
        case 'jump':
          // Instant, like GitHub: a smooth scroll over a long diff just looks slow.
          scrollPinned(app.querySelector(`#f${el.dataset.fi}`), 'start');
          return;
        case 'toggle-file': {
          if (e.target.closest('button, label')) return;
          const f = state.files[Number(el.dataset.fi)];
          if (state.collapsed.has(f.path)) state.collapsed.delete(f.path); else state.collapsed.add(f.path);
          renderFile(f);
          if (!state.collapsed.has(f.path) && !isBig(f)) loadDiff(f);
          return;
        }
        case 'load-diff': {
          const f = state.files[Number(el.dataset.fi)];
          f.forceLoad = true;
          el.disabled = true;
          await loadDiff(f);
          return;
        }
        case 'expand': {
          const f = state.files[Number(el.dataset.fi)];
          const ri = Number(el.dataset.ri);
          f.rows.splice(ri, 1, ...f.rows[ri].hidden);
          renderFile(f);
          return;
        }
        case 'add': {
          const anchor = el.dataset.key === 'file' ? el.closest('.file').querySelector('.file-head') : el;
          openEditor(anchor, editorHtml('', true, { fi: el.dataset.fi, key: el.dataset.key }));
          return;
        }
        case 'th-reply': {
          const c = findComment(el.dataset.id);
          openEditor(el.closest('.thread'), editorHtml('', !!c?.unresolved, { 'reply-to': el.dataset.id }));
          return;
        }
        case 'th-quick': {
          const p = findComment(el.dataset.id);
          await api(`/changes/${state.change._number}/revisions/${p.patch_set}/drafts`, 'PUT', {
            path: p.path, line: p.line, side: p.side, range: p.range, in_reply_to: p.id, message: el.dataset.msg, unresolved: false,
          });
          await reloadComments();
          return;
        }
        case 'dr-edit': {
          const d = findComment(el.dataset.id);
          const cm = el.closest('.cm');
          cm.hidden = true;
          openEditor(cm, editorHtml(d.message, !!d.unresolved, { draft: d.id }));
          return;
        }
        case 'dr-del': {
          const d = findComment(el.dataset.id);
          await api(`/changes/${state.change._number}/revisions/${d.patch_set}/drafts/${enc(d.id)}`, 'DELETE');
          await reloadComments();
          return;
        }
        case 'ed-cancel': {
          const ed = el.closest('.editor');
          if (ed.dataset.range) setPending(null);
          ed.closest('.editor-row, .editor-host')?.remove();
          ed.closest('.thread')?.querySelectorAll('.cm[hidden]').forEach((x) => { x.hidden = false; });
          return;
        }
        case 'ed-save':
          el.disabled = true;
          await saveEditor(el.closest('.editor')).finally(() => { el.disabled = false; });
          return;
        case 'reply-open':
          openReply();
          return;
        case 'reply-close':
          app.querySelector('.reply').hidden = true;
          return;
        case 'vote':
          for (const b of el.parentElement.children) b.classList.remove('on', 'changed');
          el.classList.add('on', 'changed');
          return;
        case 'reply-send':
          el.disabled = true;
          await sendReply().finally(() => { el.disabled = false; });
          return;
        case 'ai-tab': {
          const card = el.closest('.ai');
          for (const b of card.querySelectorAll('.tab')) b.classList.toggle('on', b === el);
          for (const p of card.querySelectorAll('.pane')) p.hidden = p.dataset.pane !== el.dataset.tab;
          return;
        }
        case 'ai-copy': {
          const note = state.notes.find((x) => x.id === el.dataset.note);
          await copy(note.gerritText);
          toast(t('aiCopied'));
          return;
        }
        case 'ai-status': {
          const note = state.notes.find((x) => x.id === el.dataset.note);
          await setNoteStatus(note, el.dataset.status);
          rerenderNote(note);
          return;
        }
        case 'ai-post':
        case 'ai-edit': {
          const note = state.notes.find((x) => x.id === el.dataset.note);
          const fi = state.paths.indexOf(note.file);
          const f = state.files[fi];
          const key = (f && [...notesFor(f).entries()].find(([, items]) => items.some((it) => it.note === note))?.[0]) || 'file';
          const text = note.gerritText || note.body || note.title;
          if (act === 'ai-edit') {
            openEditor(el.closest('.ai'), editorHtml(text, note.severity !== 'info', { fi, key, note: note.id }));
            return;
          }
          const tgt = draftTarget(key);
          await api(`/changes/${state.change._number}/revisions/${tgt.rev}/drafts`, 'PUT', {
            path: note.file, line: tgt.line, side: tgt.side, message: text, unresolved: note.severity !== 'info',
          });
          await setNoteStatus(note, 'posted');
          await reloadComments();
          toast(t('aiPosted'));
          return;
        }
        default:
      }
    } catch (err) {
      toast(`${t('err')}: ${err.message}`, true);
    }
  }

  // Go to a comment's line. A comment from another patchset switches the view
  // to that patchset first (Base..PSn), the way Gerrit opens it.
  async function jumpToLine(path, line, side, ps) {
    if (ps && ps !== state.ps) await switchPatchset(ps, null);
    const fi = state.paths.indexOf(path);
    if (fi < 0) return;
    const f = state.files[fi];
    if (state.collapsed.has(f.path)) { state.collapsed.delete(f.path); renderFile(f); }
    if (!f.rows) { f.forceLoad = true; await loadDiff(f); }
    const key = `${side}:${line}`;
    if (line && f.rows) {
      const ri = f.rows.findIndex((r) => r.type === 'fold' && r.hidden.some((x) => (side === 'a' ? x.a : x.b) === line));
      if (ri >= 0) { f.rows.splice(ri, 1, ...f.rows[ri].hidden); renderFile(f); }
    }
    const fileEl = app.querySelector(`#f${fi}`);
    // An unchanged line's cell is keyed by its new-side number in the unified view.
    const row = line && f.rows?.find((r) => r.type !== 'fold' && (side === 'a' ? r.a === line && r.type !== 'add' : r.b === line && r.type !== 'del'));
    const cell = row ? fileEl.querySelector(`td.code[data-key="${key}"]`) || fileEl.querySelector(`td.code[data-key="b:${row.b}"]`) : null;
    const target = cell?.closest('tr') || fileEl;
    scrollPinned(target, cell ? 'center' : 'start');
    if (cell) { target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash'); }
  }

  function rerenderNote(note) {
    const f = state.files.find((x) => x.path === note.file);
    if (f) renderFile(f); else renderLooseNotes();
    renderTree();
  }

  async function onChange(e) {
    const act = e.target.dataset?.act;
    if (act === 'ws') {
      settings.whitespace = e.target.value;
      chrome.storage.local.set({ whitespace: settings.whitespace });
      await reloadDiffs();
      return;
    }
    if (act !== 'ps' && act !== 'base') return;
    if (act === 'ps') await switchPatchset(Number(e.target.value), state.base);
    else await switchPatchset(state.ps, Number(e.target.value) || null);
  }

  async function switchPatchset(ps, base) {
    state.ps = ps;
    state.base = base && base < ps ? base : null;
    const ch = state.change;
    const path = `${ROOT}/c/${ch.project}/+/${ch._number}/${state.base ? `${state.base}..` : ''}${state.ps}`;
    // replaceState keeps Gerrit's router out of it; lastPath stops tick() from reloading.
    history.replaceState(history.state, '', path);
    lastPath = location.pathname;
    route = C.parseRoute(lastPath);
    renderAll();
    try { await loadPatchset(); } catch (err) { toast(`${t('err')}: ${err.message}`, true); }
  }

  // ---------- boot ----------

  const classicFor = Number(sessionStorage.getItem(CLASSIC_KEY)) || null;
  sessionStorage.removeItem(CLASSIC_KEY);
  if (classicFor) hiddenFor = classicFor;
  chrome.storage.local.get({ enabled: true, theme: 'auto', lang: 'auto', diffMode: null, whitespace: null, treeHidden: false }).then((s) => {
    settings = s;
    C.setLang(s.lang);
    tick();
    // ponytail: polls the URL because Gerrit navigates with pushState, which an isolated-world script cannot hook.
    setInterval(tick, 300);
    setInterval(ensureGerritButton, 1000);
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const k of ['enabled', 'theme', 'lang', 'diffMode']) if (changes[k]) settings[k] = changes[k].newValue;
    if (changes.lang) { C.setLang(settings.lang); if (state && !app.hidden) renderAll(); }
    if (host) host.dataset.theme = resolvedTheme();
    if (changes.enabled) { lastPath = ''; hiddenFor = null; tick(); }
  });
  media.addEventListener('change', () => { if (host) host.dataset.theme = resolvedTheme(); });
  window.addEventListener('keydown', onPageKey, true);
})();
