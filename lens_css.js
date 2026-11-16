// lens_css.js
// Styles for the shadow root. Kept as a JS string so no web_accessible_resources
// entry is needed (which would let any page probe for the extension).

self.LENS_CSS = `
:host {
  all: initial;
  --bg: #ffffff; --canvas: #f6f8fa; --ink: #1f2328; --sub: #59636e; --line: #d1d9e0; --line-soft: #e5e9ee;
  --accent: #0969da; --accent-soft: #ddf4ff; --fill: #1f883d; --fill-ink: #fff;
  --add-bg: #dafbe1; --add-ln: #ccffd8; --add-ink: #1a7f37; --del-bg: #ffebe9; --del-ln: #ffd7d5; --del-ink: #d1242f;
  --fold-bg: #ddf4ff; --warn: #9a6700; --warn-soft: #fff8c5; --ok: #1a7f37; --ok-soft: #dafbe1; --bad: #cf222e; --bad-soft: #ffebe9;
  --purple: #8250df; --purple-soft: #fbefff; --draft: #bf8700;
  --shadow: 0 8px 24px rgba(140,149,159,.2);
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "D2Coding", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
}
:host([data-theme="dark"]) {
  --bg: #0d1117; --canvas: #010409; --ink: #e6edf3; --sub: #9198a1; --line: #3d444d; --line-soft: #262c36;
  --accent: #4493f8; --accent-soft: #121d2f; --fill: #238636;
  --add-bg: rgba(46,160,67,.15); --add-ln: rgba(63,185,80,.3); --add-ink: #3fb950; --del-bg: rgba(248,81,73,.1); --del-ln: rgba(248,81,73,.3); --del-ink: #f85149;
  --fold-bg: rgba(56,139,253,.1); --warn: #d29922; --warn-soft: rgba(187,128,9,.15); --ok: #3fb950; --ok-soft: rgba(46,160,67,.15); --bad: #f85149; --bad-soft: rgba(248,81,73,.1);
  --purple: #ab7df8; --purple-soft: rgba(171,125,248,.12); --draft: #d29922;
  --shadow: 0 8px 24px rgba(1,4,9,.75);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.app { position: fixed; inset: 0; z-index: 2147483000; overflow: auto; background: var(--canvas); color: var(--ink);
  font: 14px/1.5 var(--sans); color-scheme: light; }
:host([data-theme="dark"]) .app { color-scheme: dark; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
code, pre { font-family: var(--mono); font-size: 12px; }
:not(pre) > code { background: var(--line-soft); padding: .1em .35em; border-radius: 4px; }
pre { background: var(--canvas); border: 1px solid var(--line-soft); border-radius: 6px; padding: 8px 10px; overflow: auto; margin: 6px 0; }
.sub { color: var(--sub); font-size: 12px; }
.grow { flex: 1; }
.err { color: var(--bad); }
.loading { padding: 80px; text-align: center; color: var(--sub); }

.btn { font: 500 13px/20px var(--sans); padding: 4px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--canvas); }
.btn.primary { background: var(--fill); border-color: transparent; color: var(--fill-ink); }
.btn.primary:hover { filter: brightness(1.08); }
.btn.sm { padding: 2px 8px; font-size: 12px; }
.btn:disabled { opacity: .55; cursor: default; }
.btn .count { margin-left: 6px; background: rgba(255,255,255,.25); border-radius: 10px; padding: 0 6px; font-size: 11px; }
.link { font: inherit; font-size: 12px; background: none; border: 0; padding: 0 4px; color: var(--accent); cursor: pointer; }
.link:disabled { color: var(--sub); cursor: default; }
.link.danger { color: var(--bad); }
select { font: 12px var(--sans); padding: 3px 6px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
textarea { width: 100%; font: 13px/1.5 var(--sans); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); resize: vertical; }
textarea:focus, select:focus, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }

.av { display: inline-grid; place-items: center; width: var(--s); height: var(--s); border-radius: 50%; flex: none;
  background: hsl(var(--hue) 55% 88%); color: hsl(var(--hue) 45% 30%); font-size: calc(var(--s) * .5); font-weight: 600; vertical-align: middle; }
:host([data-theme="dark"]) .av { background: hsl(var(--hue) 35% 25%); color: hsl(var(--hue) 60% 82%); }
.chip { display: inline-block; font-size: 11px; line-height: 18px; padding: 0 7px; border-radius: 10px; border: 1px solid var(--line); color: var(--sub); white-space: nowrap; }
.chip.warn { color: var(--warn); border-color: transparent; background: var(--warn-soft); }
.chip.ok { color: var(--ok); border-color: transparent; background: var(--ok-soft); }
.chip.draft { color: var(--draft); border-color: var(--draft); }
.badge { font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 9px; background: var(--line-soft); color: var(--sub); }
.badge.warn { background: var(--warn-soft); color: var(--warn); }
.badge.aib { background: var(--purple-soft); color: var(--purple); }
.pill { display: inline-flex; align-items: center; font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 2em; color: #fff; }
.pill.open { background: #1f883d; } .pill.merged { background: #8250df; } .pill.abandoned { background: #59636e; } .pill.wip { background: #9a6700; }
.pill.ok { background: transparent; color: var(--ok); border: 1px solid var(--ok); }
.pill.conflict { background: #cf222e; }
.pill.private { background: #8250df; }
.top-actions { flex-wrap: wrap; justify-content: flex-end; align-items: center; }
.menu-wrap { position: relative; display: inline-flex; }
.menu { position: absolute; right: 0; top: 34px; z-index: 8; min-width: 200px; display: grid; padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
.menu-item { text-align: left; border: 0; background: none; color: var(--ink); font: 13px var(--sans); padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.menu-item:hover { background: var(--canvas); }
.btn.danger-fill { background: var(--bad); color: #fff; border-color: transparent; }
.dialog { z-index: 11; }
.dlg-field { display: grid; gap: 4px; }
.dlg-field input { font: 13px var(--sans); padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
.dialog .cmd { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; }
.dialog .cmd .tool { font-size: 12px; color: var(--sub); }
.dialog .cmd button { grid-row: 1; grid-column: 2; }
.dialog .cmd code { grid-column: 1 / -1; white-space: pre-wrap; word-break: break-all; }
.person.attn { box-shadow: inset 0 0 0 1px var(--warn); }
.person.attn::after { content: ""; position: absolute; top: 0; right: 0; width: 7px; height: 7px; border-radius: 50%; background: var(--warn); }
.req { display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 3px; }
.req-ic { width: 16px; text-align: center; font-weight: 700; }
.req.ok .req-ic { color: var(--ok); } .req.no .req-ic { color: var(--sub); }
.meta-row { display: flex; gap: 10px; font-size: 13px; margin-top: 8px; }
.meta-row .sub { min-width: 56px; }
.meta-row { align-items: center; }
.pencil { border: 0; background: none; color: var(--sub); cursor: pointer; padding: 0 2px; display: inline-grid; place-items: center; }
.pencil:hover { color: var(--accent); }
.btn.more { color: var(--ink); padding: 4px 6px; }
.status-pills { display: inline-flex; gap: 6px; }

/* header */
.top { background: var(--bg); border-bottom: 1px solid var(--line); padding: 14px 24px 12px; position: sticky; top: 0; z-index: 5; }
.crumbs { display: flex; gap: 6px; font-size: 13px; color: var(--sub); }
.crumbs .branch { font-family: var(--mono); font-size: 12px; background: var(--accent-soft); color: var(--accent); padding: 0 6px; border-radius: 6px; }
.title-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 4px; }
h1 { flex: 1; margin: 0; font-size: 22px; font-weight: 600; line-height: 1.3; }
h1 .num { color: var(--sub); font-weight: 300; }
.top-actions { display: flex; gap: 8px; }
.meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; font-size: 13px; }

/* layout */
.layout { display: grid; grid-template-columns: 296px minmax(0, 1fr); gap: 16px; padding: 16px 24px 80px; }
.layout.no-tree { grid-template-columns: minmax(0, 1fr); }
.layout.no-tree .tree { display: none; }
.icon-btn { display: inline-grid; place-items: center; padding: 3px 6px; color: var(--sub); }
.icon-btn.on { color: var(--accent); }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .tree { position: static !important; max-height: 240px !important; } }
.tree { position: sticky; top: calc(var(--hdr, 80px) + 16px); align-self: start; max-height: calc(100vh - var(--hdr, 80px) - 32px); overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
.tree-h { font-weight: 600; font-size: 13px; padding: 4px 8px 6px; }
.tree-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; color: var(--ink); cursor: pointer; font-size: 13px; }
.tree-item:hover { background: var(--canvas); text-decoration: none; }
.tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.dir { color: var(--sub); }
.fs { font: 600 10px/16px var(--mono); width: 16px; text-align: center; border-radius: 4px; flex: none; }
.fs-A { color: var(--add-ink); background: var(--add-bg); } .fs-D { color: var(--del-ink); background: var(--del-bg); }
.fs-M { color: var(--warn); background: var(--warn-soft); } .fs-R, .fs-C, .fs-W { color: var(--accent); background: var(--accent-soft); }
.delta { font: 11px var(--mono); display: inline-flex; gap: 4px; }
.plus { color: var(--add-ink); } .minus { color: var(--del-ink); }
main { min-width: 0; display: grid; gap: 16px; align-content: start; }
.card { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 12px 16px; }
.sum-h { font-size: 12px; font-weight: 600; color: var(--sub); margin: 0 0 6px; text-transform: uppercase; letter-spacing: .02em; }
.sum-grid { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) minmax(280px, 1.4fr); gap: 24px; }
@media (max-width: 1100px) { .sum-grid { grid-template-columns: 1fr 1fr; } }
.people { align-items: center; }
.person { position: relative; padding: 2px 6px 2px 2px; border-radius: 12px; }
.person:hover { background: var(--canvas); }
.person .x { border: 0; background: none; color: var(--sub); cursor: pointer; padding: 0 2px; font-size: 14px; line-height: 1; visibility: hidden; }
.person:hover .x, .person .x:focus { visibility: visible; }
.person .x:hover { color: var(--bad); }
.add-person { width: 24px; height: 24px; border-radius: 50%; border: 1px dashed var(--line); background: none; color: var(--sub); cursor: pointer; font-size: 15px; line-height: 1; }
.add-person:hover { color: var(--accent); border-color: var(--accent); }
.rv-input { font: 13px var(--sans); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--accent); background: var(--bg); color: var(--ink); width: 180px; outline: none; }
.rel { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 3px; font-size: 13px; }
.rel li { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.rel li a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel li.current a { color: var(--ink); font-weight: 600; pointer-events: none; }
.rel .arrow { width: 14px; flex: none; color: var(--ink); }
.sum-grid .sum-h ~ .sum-h { margin-top: 10px; }
.label-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; font-size: 13px; }
.label-name { min-width: 110px; font-weight: 500; }
.label-name.ok { color: var(--ok); } .label-name.bad { color: var(--bad); }
.vote { display: inline-flex; align-items: center; gap: 3px; font: 600 11px var(--mono); padding: 1px 6px 1px 2px; border-radius: 10px; }
.vote.pos { background: var(--ok-soft); color: var(--ok); } .vote.neg { background: var(--bad-soft); color: var(--bad); }
.people { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; }
.person { display: inline-flex; align-items: center; gap: 5px; }

/* files */
.files { display: grid; gap: 16px; }
.file { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; scroll-margin-top: calc(var(--hdr, 80px) + 12px); }
.file-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--canvas); border-bottom: 1px solid var(--line); border-radius: 6px 6px 0 0; cursor: pointer; position: sticky; top: var(--hdr, 80px); z-index: 2; font-size: 13px; }
.file-head .path { font-family: var(--mono); font-size: 12px; word-break: break-all; }
.chev { color: var(--sub); width: 12px; }
.file.is-collapsed .file-head { border-bottom: 0; border-radius: 6px; }
.file-msg { padding: 16px; color: var(--sub); font-size: 13px; }
.file-level { padding: 8px 12px; border-bottom: 1px solid var(--line-soft); display: grid; gap: 8px; }
.diff-wrap { overflow-x: auto; }
.file-msg.big { display: flex; align-items: center; gap: 10px; }
table.diff { width: 100%; border-collapse: collapse; font: 12px/20px var(--mono); tab-size: var(--tab, 8); }
.diff td { padding: 0; vertical-align: top; }
.diff .ln { width: 1%; min-width: 48px; padding: 0 8px; text-align: right; color: var(--sub); user-select: none; white-space: nowrap; }
.diff .code { position: relative; padding: 0 12px 0 22px; white-space: pre-wrap; word-break: break-all; }
.diff .mk { position: absolute; left: 8px; user-select: none; color: var(--sub); }
.c-add.code { background: var(--add-bg); } .r.add .ln, .ln.c-add { background: var(--add-ln); } .c-add .mk { color: var(--add-ink); }
.c-del.code { background: var(--del-bg); } .r.del .ln, .ln.c-del { background: var(--del-ln); } .c-del .mk { color: var(--del-ink); }
.c-empty { background: var(--canvas); }
::highlight(lens-ia) { background-color: rgba(46, 160, 67, .4); }
::highlight(lens-id) { background-color: rgba(248, 81, 73, .4); }
::highlight(lens-range) { background-color: rgba(255, 213, 0, .3); }
::highlight(lens-pending) { background-color: rgba(84, 174, 255, .4); }
table.split { table-layout: fixed; }
table.split col.col-ln { width: 48px; }
table.split .code { border-right: 1px solid var(--line-soft); }
/* Selection stays inside one column of code; see lockSelectionSide(). */
.add-c, .fold, tr.extra, table.diff[data-sel] .ln { user-select: none; }
tr.extra .md, tr.extra textarea { user-select: text; }
table.split[data-sel="L"] tr.r > td:nth-child(n+3), table.split[data-sel="R"] tr.r > td:nth-child(-n+2) { user-select: none; }
.add-c { position: absolute; left: -10px; top: 1px; width: 20px; height: 18px; line-height: 16px; border-radius: 5px; border: 0; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; opacity: 0; transform: scale(.8); transition: .1s; z-index: 1; }
/* Only the cell under the pointer (its code or its own line number) offers "+". */
td.code:hover .add-c, td.ln:hover + td.code .add-c, .unified td.ln:hover + td.ln + td.code .add-c, .add-c:focus { opacity: 1; transform: none; }
.fold td { background: var(--fold-bg); padding: 2px 12px; }
.fold .link { font-family: var(--mono); font-size: 11px; }
tr.extra > td { padding: 8px 12px; background: var(--bg); border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); font: 14px/1.5 var(--sans); white-space: normal; }
tr.extra > td > * + * { margin-top: 8px; }

.file.plain .c-add.code, .file.plain .r.add .ln, .file.plain .ln.c-add { background: none; }
.file.plain .r.add .mk { visibility: hidden; }
.file.plain table.diff { font-family: var(--sans); font-size: 13px; }

.viewed { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; color: var(--sub); }
.viewed.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.tree-item.is-viewed .tree-name { opacity: .55; }
.tree-h { display: flex; align-items: center; gap: 6px; }
.meta .seg button { font-size: 12px; padding: 1px 10px; }
.btn.danger { color: var(--bad); }
.cm-actions { display: flex; gap: 6px; margin-top: 6px; }
.md ul { margin: 4px 0; padding-left: 20px; }
.md blockquote { margin: 4px 0; padding: 0 10px; border-left: 3px solid var(--line); color: var(--sub); }
.toolbar { display: inline-flex; gap: 2px; margin-right: 4px; }
.icon { display: inline-grid; place-items: center; width: 28px; height: 26px; border: 0; border-radius: 6px; background: none; color: var(--sub); cursor: pointer; }
.icon:hover { background: var(--canvas); color: var(--ink); }
.mention { position: absolute; z-index: 2147483002; min-width: 260px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px; display: grid; }
.mention button { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--ink); font: 13px var(--sans); text-align: left; cursor: pointer; }
.mention button.on, .mention button:hover { background: var(--accent-soft); }
.range-add { position: absolute; z-index: 6; display: grid; place-items: center; width: 30px; height: 26px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; box-shadow: var(--shadow); }
tr.flash td { animation: lens-flash 1.6s ease-out; }
@keyframes lens-flash { 0%, 30% { box-shadow: inset 0 0 0 9999px rgba(255, 213, 0, .35); } 100% { box-shadow: none; } }
::selection { background: rgba(84,174,255,.35); }

/* syntax colours (GitHub-like) */
.t .hljs-keyword, .t .hljs-meta .hljs-keyword, .t .hljs-built_in, .t .hljs-type, .t .hljs-selector-tag { color: #cf222e; }
.t .hljs-string, .t .hljs-regexp, .t .hljs-meta .hljs-string { color: #0a3069; }
.t .hljs-number, .t .hljs-literal, .t .hljs-variable.constant_, .t .hljs-attr, .t .hljs-attribute, .t .hljs-symbol { color: #0550ae; }
.t .hljs-title, .t .hljs-title.function_, .t .hljs-title.class_, .t .hljs-section { color: #8250df; }
.t .hljs-comment, .t .hljs-quote, .t .hljs-meta { color: #6e7781; }
.t .hljs-tag, .t .hljs-name, .t .hljs-selector-class, .t .hljs-selector-id { color: #116329; }
.t .hljs-params, .t .hljs-subst { color: inherit; }
:host([data-theme="dark"]) .t .hljs-keyword, :host([data-theme="dark"]) .t .hljs-built_in, :host([data-theme="dark"]) .t .hljs-type, :host([data-theme="dark"]) .t .hljs-selector-tag, :host([data-theme="dark"]) .t .hljs-meta .hljs-keyword { color: #ff7b72; }
:host([data-theme="dark"]) .t .hljs-string, :host([data-theme="dark"]) .t .hljs-regexp, :host([data-theme="dark"]) .t .hljs-meta .hljs-string { color: #a5d6ff; }
:host([data-theme="dark"]) .t .hljs-number, :host([data-theme="dark"]) .t .hljs-literal, :host([data-theme="dark"]) .t .hljs-variable.constant_, :host([data-theme="dark"]) .t .hljs-attr, :host([data-theme="dark"]) .t .hljs-attribute, :host([data-theme="dark"]) .t .hljs-symbol { color: #79c0ff; }
:host([data-theme="dark"]) .t .hljs-title, :host([data-theme="dark"]) .t .hljs-title.function_, :host([data-theme="dark"]) .t .hljs-title.class_, :host([data-theme="dark"]) .t .hljs-section { color: #d2a8ff; }
:host([data-theme="dark"]) .t .hljs-comment, :host([data-theme="dark"]) .t .hljs-quote, :host([data-theme="dark"]) .t .hljs-meta { color: #8b949e; }
:host([data-theme="dark"]) .t .hljs-tag, :host([data-theme="dark"]) .t .hljs-name, :host([data-theme="dark"]) .t .hljs-selector-class, :host([data-theme="dark"]) .t .hljs-selector-id { color: #7ee787; }

.star { border: 0; background: none; cursor: pointer; font-size: 20px; color: var(--sub); padding: 0 6px 0 0; vertical-align: 1px; }
.star.on { color: #e3b341; }
h1 a.num { color: var(--sub); font-weight: 300; }
h1 a.num:hover { text-decoration: underline; }
.ws select { margin-left: 4px; }
.cm-link { border: 0; background: none; color: var(--sub); cursor: pointer; padding: 0 2px; display: inline-grid; visibility: hidden; }
.cm:hover .cm-link, .cm-link:focus { visibility: visible; }
.browse { color: var(--sub); display: inline-grid; }
.browse:hover { color: var(--accent); }
.mv { min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
.ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.threads-card { width: min(820px, 94vw); max-height: 80vh; }
.thread-list { overflow: auto; display: grid; gap: 6px; max-height: 64vh; }
.thread-item { display: grid; gap: 4px; text-align: left; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); font: 13px var(--sans); cursor: pointer; }
.thread-item:hover, .thread-item:focus { border-color: var(--accent); }
.ti-head { display: flex; align-items: center; gap: 6px; }
.ti-msg { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.keys td { padding: 4px 10px 4px 0; font-size: 13px; }
kbd { font: 12px var(--mono); padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: var(--canvas); }
.scheme { align-self: start; }

/* threads */
.thread { border: 1px solid var(--line); border-radius: 6px; background: var(--bg); max-width: 920px; overflow: hidden; }
.thread.unresolved { border-left: 3px solid var(--warn); }
.cm { padding: 8px 12px; border-bottom: 1px solid var(--line-soft); }
.cm.draft { background: var(--warn-soft); }
.cm-head { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.cm-actions { margin-top: 2px; }
.md { font-size: 13px; word-break: break-word; }
.md p { margin: 4px 0; }
.th-foot { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--canvas); }
.editor, .editor-host { max-width: 920px; }
.editor { background: var(--bg); }
.ed-foot { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.thread .editor { border-top: 1px solid var(--line-soft); padding: 8px 12px; }

/* conversation */
.convo-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.convo-h .sum-h { margin: 0; }
.show-all { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.msg { border-top: 1px solid var(--line-soft); }
.msg-line { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 4px; border: 0; background: none; color: var(--ink); font: 13px var(--sans); text-align: left; cursor: pointer; border-radius: 6px; }
.msg-line:hover { background: var(--canvas); }
.msg-who { flex: none; }
.msg-preview { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--sub); }
.msg-count { display: inline-flex; align-items: center; gap: 3px; color: var(--sub); font-size: 12px; flex: none; }
.msg-time { flex: none; }
.msg-line .chip, .msg-line .vote-chip { flex: none; }
.msg-main { padding: 0 4px 12px 34px; }
.msg-body { font-size: 14px; line-height: 1.6; }
.msg.auto .msg-who { color: var(--sub); }
.vote-chip { font-size: 12px; font-weight: 600; padding: 0 8px; line-height: 20px; border-radius: 10px; border: 1px solid var(--line); }
.vote-chip.pos { color: var(--ok); background: var(--ok-soft); border-color: transparent; }
.vote-chip.neg { color: var(--bad); background: var(--bad-soft); border-color: transparent; }
.vote-chip.removed { text-decoration: line-through; color: var(--sub); }
.msg-comments { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
.msg-comments li { display: flex; align-items: baseline; gap: 8px; padding: 6px 10px; border: 1px solid var(--line-soft); border-radius: 6px; background: var(--canvas); }
.msg-comments .link { font-family: var(--mono); font-size: 12px; white-space: nowrap; padding: 0; }
.msg-comments .md { flex: 1; min-width: 0; }
.msg-comments .md p { margin: 0; }
.msg-main { min-width: 0; flex: 1; }
.msg-head { display: flex; align-items: center; gap: 6px; font-size: 13px; }

/* AI notes */
.ai { border: 1px solid var(--line); border-left: 3px solid var(--purple); border-radius: 6px; background: var(--bg); max-width: 920px; padding: 10px 12px; }
.ai.sev-must { border-left-color: var(--bad); } .ai.sev-should { border-left-color: var(--warn); } .ai.sev-nit { border-left-color: var(--sub); }
.ai.dismissed { display: flex; align-items: center; gap: 8px; padding: 4px 12px; opacity: .6; font-size: 12px; }
.ai-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ai-title { font-size: 14px; }
.sev { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; background: var(--purple-soft); color: var(--purple); }
.sev.must { background: var(--bad-soft); color: var(--bad); } .sev.should { background: var(--ok-soft); color: var(--ok); }
.sev.nit { background: var(--line-soft); color: var(--sub); }
.ai-summary { margin-top: 6px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg button { font: 12px/20px var(--sans); padding: 2px 10px; background: var(--bg); color: var(--ink); border: 0; border-left: 1px solid var(--line); cursor: pointer; }
.seg button:first-child { border-left: 0; }
.seg button:hover { background: var(--canvas); }
.seg button.on { background: var(--accent); color: #fff; }
.seg button.on.pos { background: var(--fill); } .seg button.on.neg { background: var(--bad); }
.tabs { display: flex; gap: 4px; margin: 10px 0 0; border-bottom: 1px solid var(--line-soft); }
.tab { font: 13px var(--sans); background: none; border: 0; border-bottom: 2px solid transparent; padding: 4px 10px; color: var(--sub); cursor: pointer; margin-bottom: -1px; }
.tab.on { color: var(--ink); border-bottom-color: #fd8c73; font-weight: 600; }
.pane { padding: 8px 2px 2px; }
.ai > .pane:first-of-type { padding-top: 6px; }
.ref + .ref { margin-top: 8px; }
.ai-gerrit { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
.ai-gerrit-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.quote { font-size: 13px; background: var(--canvas); border: 1px solid var(--line-soft); border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; }

/* reply panel */
.reply { position: fixed; inset: 0; background: rgba(1,4,9,.4); display: grid; place-items: start center; padding-top: 10vh; z-index: 10; }
.reply-card { width: min(640px, 92vw); background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 16px; display: grid; gap: 10px; }
.reply-h { display: flex; align-items: center; font-size: 15px; }
.reply-h .link { font-size: 22px; color: var(--sub); }
.msg-box { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.msg-box:focus-within { outline: 2px solid var(--accent); outline-offset: -1px; }
.msg-box textarea { border: 0; border-radius: 0; display: block; }
.msg-box textarea:focus { outline: none; }
.msg-tools { display: flex; justify-content: flex-end; padding: 2px 4px; border-top: 1px solid var(--line-soft); background: var(--canvas); }
.emoji-wrap { position: relative; display: inline-flex; }
.emoji-pop { position: absolute; right: 0; bottom: 30px; z-index: 7; display: grid; grid-template-columns: repeat(6, 30px); gap: 2px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
.emoji-pop button { width: 30px; height: 30px; border: 0; border-radius: 6px; background: none; font-size: 17px; cursor: pointer; }
.emoji-pop button:hover { background: var(--canvas); }
.vote-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.draft-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--sub); max-height: 140px; overflow: auto; }

.restore { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; font: 600 12px/1 var(--sans); padding: 9px 14px; border-radius: 20px; border: 0; background: #8250df; color: #fff; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 20px); opacity: 0; z-index: 2147483001; font: 13px var(--sans); padding: 8px 14px; border-radius: 8px; background: #1f2328; color: #fff; pointer-events: none; transition: .2s; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.toast.bad { background: #cf222e; }
`;
