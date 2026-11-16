// Store screenshot harness. Loads the real Lens scripts against a fake Gerrit
// (a made-up "acme/web-app" project and made-up people), so the store images
// show the actual UI without any real code, names or hosts.
//
//   demo.html?lang=ko|en&theme=light|dark&shot=overview|comments|ai|review
'use strict';

const q = new URLSearchParams(location.search);
const LANG = q.get('lang') === 'en' ? 'en' : 'ko';
const SHOT = q.get('shot') || 'overview';
const KO = LANG === 'ko';
const L = (ko, en) => (KO ? ko : en);

// ---------- people ----------
const acc = (id, ko, en, user) => ({ _account_id: id, name: L(ko, en), display_name: L(ko, en), email: `${user}@example.com`, username: user });
const MINA = acc(1, '박민아', 'Mina Park', 'mina');
const DANIEL = acc(2, '조대현', 'Daniel Cho', 'daniel');
const SORA = acc(3, '임소라', 'Sora Lim', 'sora');
const BOT = acc(4, 'CI 봇', 'CI Bot', 'ci-bot');

// ---------- code ----------
const OLD = {
  'src/cart/pricing.ts': `import { Item } from './types';

const TAX_RATE = 0.1;

/**
 * Total price of the cart, tax included.
 */
export function cartTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return Math.round(total * (1 + TAX_RATE));
}

export function formatPrice(value: number): string {
  return value.toFixed(0) + ' KRW';
}
`,
  'src/cart/types.ts': `export interface Item {
  id: string;
  price: number;
  qty: number;
}
`,
};
const NEW = {
  'src/cart/pricing.ts': `import { Item, Coupon } from './types';

const TAX_RATE = 0.1;
const MAX_DISCOUNT_RATE = 0.5;

/**
 * Total price of the cart, tax included.
 * A coupon is applied before tax and never takes more than half off.
 */
export function cartTotal(items: Item[], coupon?: Coupon): number {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = coupon ? Math.min(coupon.amount, subtotal * MAX_DISCOUNT_RATE) : 0;
  return Math.round((subtotal - discount) * (1 + TAX_RATE));
}

export function formatPrice(value: number, currency = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(value);
}
`,
  'src/cart/types.ts': `export interface Item {
  id: string;
  price: number;
  qty: number;
}

export interface Coupon {
  code: string;
  amount: number;
}
`,
  'src/cart/pricing.test.ts': `import { cartTotal, formatPrice } from './pricing';

const items = [
  { id: 'a', price: 1000, qty: 2 },
  { id: 'b', price: 500, qty: 1 },
];

test('adds tax', () => {
  expect(cartTotal(items)).toBe(2750);
});

test('applies a coupon before tax', () => {
  expect(cartTotal(items, { code: 'WELCOME', amount: 500 })).toBe(2200);
});

test('caps the discount at half', () => {
  expect(cartTotal(items, { code: 'BIG', amount: 99999 })).toBe(1375);
});

test('formats with the currency sign', () => {
  expect(formatPrice(2750)).toBe('₩2,750');
});
`,
};
const SUBJECT = L('장바구니 합계에 쿠폰 할인 적용', 'Apply coupon discounts to the cart total');
const COMMIT_MSG = `Parent:     4f2a91c0 (Show item count on the cart badge)
Author:     ${MINA.name} <mina@example.com>
AuthorDate: 2026-11-10 14:02:11 +0900
Commit:     ${MINA.name} <mina@example.com>
CommitDate: 2026-11-11 09:40:27 +0900

${SUBJECT}

${L('쿠폰은 세금 전에 빼고, 할인은 소계의 절반을 넘지 않는다.\nformatPrice 는 Intl.NumberFormat 으로 통화 기호까지 붙인다.', 'Coupons come off before tax and never exceed half of the subtotal.\nformatPrice now uses Intl.NumberFormat so the currency sign is right.')}

JIRA: SHOP-412
Change-Id: I8e1c0d3a5b7f9e2d4c6a8b0f1e3d5c7a9b2e4f60
`;

// ---------- a small line diff (LCS) that emits Gerrit DiffInfo chunks ----------
function diffContent(a, b) {
  const A = a ? a.replace(/\n$/, '').split('\n') : [];
  const B = b.replace(/\n$/, '').split('\n');
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  const push = (kind, line) => {
    const last = out[out.length - 1];
    if (kind === 'ab') { if (last?.ab) last.ab.push(line); else out.push({ ab: [line] }); return; }
    if (!last || last.ab) out.push({});
    const c = out[out.length - 1];
    (c[kind] ||= []).push(line);
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { push('ab', A[i]); i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { push('b', B[j]); j++; }
    else { push('a', A[i]); i++; }
  }
  // Intraline edits for one-to-one replaced lines: common prefix / suffix.
  for (const c of out) {
    if (!c.a || !c.b) continue;
    const ea = [];
    const eb = [];
    let pa = 0;
    let pb = 0;
    for (let k = 0; k < Math.min(c.a.length, c.b.length); k++) {
      const x = c.a[k];
      const y = c.b[k];
      let p = 0;
      while (p < x.length && p < y.length && x[p] === y[p]) p++;
      let s = 0;
      while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
      // Only lines that are mostly the same get intraline marks, as in Gerrit.
      const similar = (p + s) / Math.max(x.length, y.length) >= 0.5;
      if (similar && x.length - p - s > 0) ea.push([pa + p, x.length - p - s]);
      if (similar && y.length - p - s > 0) eb.push([pb + p, y.length - p - s]);
      pa += x.length + 1;
      pb += y.length + 1;
    }
    // Gerrit's offsets are relative to the previous edit's end.
    const rel = (edits) => { let prev = 0; return edits.map(([at, len]) => { const r = [at - prev, len]; prev = at + len; return r; }); };
    if (ea.length) c.edit_a = rel(ea);
    if (eb.length) c.edit_b = rel(eb);
  }
  return out;
}

// ---------- change ----------
const SHA1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA2 = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432';
const T = (d) => `${d}.000000000`;
const MSGS = [
  { id: 'm1', author: MINA, date: T('2026-11-10 05:02:11'), _revision_number: 1, message: 'Uploaded patch set 1.', tag: 'autogenerated:gerrit:newPatchSet' },
  { id: 'm2', author: DANIEL, date: T('2026-11-10 08:15:40'), _revision_number: 1, message: `Patch Set 1: Code-Review-1\n\n(1 comment)\n\n${L('쿠폰이 소계보다 크면 합계가 음수가 돼요.', 'A coupon bigger than the subtotal makes the total negative.')}` },
  { id: 'm3', author: MINA, date: T('2026-11-11 00:40:27'), _revision_number: 2, message: 'Uploaded patch set 2.', tag: 'autogenerated:gerrit:newPatchSet' },
  { id: 'm4', author: BOT, date: T('2026-11-11 00:52:03'), _revision_number: 2, message: 'Patch Set 2: Verified+1\n\nBuild succeeded: 128 tests passed.', tag: 'autogenerated:ci' },
  { id: 'm5', author: SORA, date: T('2026-11-11 02:10:19'), _revision_number: 2, message: `Patch Set 2: Code-Review+1\n\n(2 comments)\n\n${L('**할인 상한**을 둔 건 좋아요. 음수 쿠폰만 막으면 될 것 같아요. JIRA: SHOP-412', 'The **discount cap** looks good. Just guard against negative coupons. JIRA: SHOP-412')}` },
];
const P = 'src/cart/pricing.ts';
const COMMENTS = {
  [P]: [
    { id: 'c1', author: DANIEL, patch_set: 1, line: 13, message: L('쿠폰이 소계보다 크면 합계가 음수가 돼요. 상한이 필요해 보여요.', 'If the coupon is larger than the subtotal the total goes negative. Needs a cap.'), unresolved: true, updated: T('2026-11-10 08:15:40'), change_message_id: 'm2' },
    { id: 'c2', author: MINA, patch_set: 1, line: 13, in_reply_to: 'c1', message: L('소계의 절반까지만 빼도록 MAX_DISCOUNT_RATE 를 넣었어요.', 'Added MAX_DISCOUNT_RATE so it never takes more than half off.'), unresolved: false, updated: T('2026-11-11 00:41:02'), change_message_id: 'm3' },
    { id: 'c3', author: SORA, patch_set: 2, line: 12, range: { start_line: 12, start_character: 19, end_line: 12, end_character: 84 }, message: L('`coupon.amount` 가 음수면 할인 대신 가격이 올라가요. `Math.max(0, ...)` 로 막아 주세요.', 'A negative `coupon.amount` raises the price instead. Wrap it in `Math.max(0, ...)`.'), unresolved: true, updated: T('2026-11-11 02:09:51'), change_message_id: 'm5' },
    { id: 'c4', author: SORA, patch_set: 2, line: 17, message: L('Intl 로 바꾼 거 좋네요 👍 로케일도 인자로 받으면 다른 시장에서도 쓸 수 있겠어요.', 'Nice move to Intl 👍 Taking the locale as an argument would make it reusable.'), unresolved: false, updated: T('2026-11-11 02:10:05'), change_message_id: 'm5' },
  ],
};
const NOTES = [{
  id: 'n1', change: 1042, patchset: 2, file: P, line: 10, lineText: 'export function cartTotal(items: Item[], coupon?: Coupon): number {',
  severity: 'should', source: 'claude',
  title: L('쿠폰 적용 순서를 테스트로 고정해 두면 좋겠어요', 'Pin the coupon order down with a test'),
  context: L('이번 변경', 'this change'),
  body: L('할인을 **세금 전에** 빼는 게 이번 변경의 핵심인데, 테스트는 결과 금액만 봐서 순서가 바뀌어도 일부 경우는 통과해요.\n\n세금 후에 빼면 결과가 달라지는 금액으로 한 건 더 넣어 두면 순서가 고정돼요.', 'Taking the discount **before tax** is the point of this change, but the tests only check totals, so some cases still pass if the order flips.\n\nOne more case with an amount where before and after tax differ would lock the order in.'),
  refs: [{ file: 'src/cart/pricing.test.ts', line: 13, code: "expect(cartTotal(items, { code: 'WELCOME', amount: 500 })).toBe(2200);", note: L('세금 전/후 결과가 같은 금액이라 순서를 구분하지 못함', 'Same result before and after tax, so it cannot tell the order apart') }],
  gerritText: L('할인을 세금 전에 빼는 순서를 확인하는 테스트가 있으면 좋겠습니다. 지금 금액은 세금 전/후 결과가 같아서 순서가 바뀌어도 통과합니다.', 'Could we add a test that pins the discount before tax? The current amount gives the same total either way.'),
  status: 'open',
}];

const action = (label, method = 'POST', title) => ({ label, method, title: title || label, enabled: true });
const CHANGE = {
  id: 'acme%2Fweb-app~main~I8e1c0d3a5b7f9e2d4c6a8b0f1e3d5c7a9b2e4f60', project: 'acme/web-app', branch: 'main', topic: 'coupons', hashtags: ['checkout'],
  change_id: 'I8e1c0d3a5b7f9e2d4c6a8b0f1e3d5c7a9b2e4f60', subject: SUBJECT, status: 'NEW', created: T('2026-11-10 05:02:11'), updated: T('2026-11-11 02:10:19'),
  submittable: false, _number: 1042, owner: MINA, unresolved_comment_count: 1,
  attention_set: { 1: { account: MINA, reason: '<GERRIT_ACCOUNT_3> replied on the change' } },
  labels: {
    'Code-Review': { all: [{ ...SORA, value: 1 }, { ...DANIEL, value: 0 }], recommended: SORA },
    Verified: { all: [{ ...BOT, value: 1 }], approved: BOT },
  },
  permitted_labels: { 'Code-Review': ['-2', '-1', ' 0', '+1', '+2'], Verified: ['-1', ' 0', '+1'] },
  submit_requirements: [{ name: 'Code-Review', status: 'UNSATISFIED' }, { name: 'Verified', status: 'SATISFIED' }],
  reviewers: { REVIEWER: [DANIEL, SORA], CC: [BOT] },
  messages: MSGS,
  current_revision: SHA2,
  actions: { wip: action('WIP'), abandon: action('Abandon'), topic: action('Edit Topic', 'PUT'), hashtags: action('Edit Hashtags'), private: action('Mark private'), move: action('Move Change'), '/': action('Delete', 'DELETE'), followup: action('Follow-Up') },
  revisions: {
    [SHA1]: { _number: 1, created: T('2026-11-10 05:02:11'), uploader: MINA },
    [SHA2]: {
      _number: 2, created: T('2026-11-11 00:40:27'), uploader: MINA,
      actions: { rebase: action('Rebase'), cherrypick: action('Cherry Pick'), description: action('Edit Description', 'PUT') },
      commit: { message: COMMIT_MSG, parents: [{ commit: '4f2a91c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6', subject: 'Show item count on the cart badge' }], web_links: [{ name: 'browse', url: 'https://example.com/acme/web-app/+/9f8e7d6c' }] },
      fetch: { ssh: { url: 'ssh://mina@gerrit.example.com:29418/acme/web-app', ref: 'refs/changes/42/1042/2', commands: { Checkout: 'git fetch ssh://mina@gerrit.example.com:29418/acme/web-app refs/changes/42/1042/2 && git checkout FETCH_HEAD' } } },
    },
  },
};
const FILES = {
  '/COMMIT_MSG': { status: 'A', lines_inserted: COMMIT_MSG.split('\n').length },
  'src/cart/pricing.test.ts': { status: 'A', lines_inserted: 24 },
  [P]: { lines_inserted: 9, lines_deleted: 7 },
  'src/cart/types.ts': { lines_inserted: 5 },
};

function diffFor(path) {
  const content = path === '/COMMIT_MSG' ? diffContent('', COMMIT_MSG) : diffContent(OLD[path] || '', NEW[path]);
  return { meta_b: { name: path, web_links: [{ name: 'browse', url: `https://example.com/acme/web-app/+/main/${path}` }] }, change_type: OLD[path] ? 'MODIFIED' : 'ADDED', content };
}

// ---------- fake Gerrit REST ----------
const json = (v) => new Response(`)]}'\n${JSON.stringify(v)}`, { status: 200 });
window.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  const p = decodeURIComponent(url.pathname);
  if (p === '/accounts/self/detail') return json(MINA);
  if (p === '/accounts/self/preferences') return json({ download_scheme: 'ssh', diff_view: SHOT === 'overview' ? 'SIDE_BY_SIDE' : 'UNIFIED_DIFF' });
  if (p === '/accounts/self/preferences.diff') return json({ context: 10, syntax_highlighting: true, intraline_difference: true, tab_size: 2, ignore_whitespace: 'IGNORE_NONE' });
  if (p.startsWith('/projects/')) return json({ commentlinks: { JIRA: { match: '(JIRA:\\s*)(.*[0-9A-Z]-[0-9]*)', link: 'https://example.atlassian.net/browse/$2' } } });
  if (p === '/changes/' ) return json([]);
  if (/^\/changes\/1042$/.test(p)) return json(CHANGE);
  if (p === '/changes/1042/comments') return json(COMMENTS);
  if (p === '/changes/1042/drafts') return json({});
  if (/\/files$/.test(p) && url.search.includes('reviewed')) return json(['/COMMIT_MSG', 'src/cart/pricing.test.ts']);
  if (/\/revisions\/\d+\/files$/.test(p)) return json(FILES);
  if (/\/ported_(comments|drafts)$/.test(p)) return json({});
  if (/\/mergeable$/.test(p)) return json({ mergeable: true });
  if (/\/related$/.test(p)) return json({ changes: [
    { _change_number: 1043, _revision_number: 1, status: 'NEW', commit: { subject: L('결제 화면에 쿠폰 입력칸 추가', 'Add a coupon field to checkout') } },
    { _change_number: 1042, _revision_number: 2, status: 'NEW', commit: { subject: SUBJECT } },
    { _change_number: 1031, _revision_number: 3, status: 'MERGED', commit: { subject: L('장바구니 배지에 개수 표시', 'Show item count on the cart badge') } },
  ] });
  if (/\/submitted_together/.test(p)) return json({ changes: [] });
  const m = /\/files\/(.+)\/diff$/.exec(p);
  if (m) return json(diffFor(m[1]));
  return new Response('not found', { status: 404 });
};

// ---------- extension APIs ----------
window.chrome = {
  storage: { local: { get: async (d) => ({ ...d, theme: q.get('theme') || 'light', lang: LANG, treeHidden: false, diffMode: null, whitespace: null }), set: async () => {} }, onChanged: { addListener() {} } },
  runtime: { sendMessage: async (msg) => (msg.type === 'lens:annotations' ? { ok: true, data: { notes: SHOT === 'ai' ? NOTES : [] } } : { ok: true }) },
};
history.replaceState(null, '', '/c/acme/web-app/+/1042');

// ---------- per-shot staging ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stage() {
  const host = await (async () => { for (;;) { const h = document.querySelector('gerrit-lens'); if (h?.shadowRoot.querySelector('.file .t')) return h; await sleep(50); } })();
  await sleep(300);
  const sr = host.shadowRoot;
  const app = sr.querySelector('.app');
  const fileEl = (path) => [...sr.querySelectorAll('.file')].find((f) => f.querySelector('.path')?.textContent.endsWith(path));
  const lineRow = (path, key) => fileEl(path)?.querySelector(`td.code[data-key="${key}"]`)?.closest('tr');
  const scrollTo = (el, offset) => { app.scrollTop += el.getBoundingClientRect().top - offset; };
  if (SHOT === 'overview') {
    app.scrollTop = 0;
  } else if (SHOT === 'comments') {
    sr.querySelector(`td.code[data-key="b:17"] .add-c`)?.click();
    await sleep(100);
    const ta = sr.querySelector('.editor textarea');
    ta.value = L('@조대현 로케일 인자 추가는 다음 change 에서 할게요.\n\n```ts\nformatPrice(value, currency, locale)\n```', '@Daniel Cho I will add the locale argument in a follow-up.\n\n```ts\nformatPrice(value, currency, locale)\n```');
    scrollTo(lineRow(P, 'b:10'), 140);
  } else if (SHOT === 'ai') {
    scrollTo(lineRow(P, 'b:8'), 150);
  } else if (SHOT === 'review') {
    sr.querySelector('[data-act=reply-open]').click();
    await sleep(100);
    sr.querySelector('.reply-msg').value = L('음수 쿠폰만 막으면 머지해도 될 것 같아요. 수고하셨어요 🙌', 'Looks good once negative coupons are guarded. Nice work 🙌');
    sr.querySelector('[data-act=vote][data-label="Code-Review"][data-value="1"]').click();
  }
  document.title = 'ready';
}
stage();
