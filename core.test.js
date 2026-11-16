const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./core.js');

test('parseRoute', () => {
  assert.deepEqual(c.parseRoute('/c/web-app/+/1042'), { root: '', project: 'web-app', change: 1042, base: null, ps: null, file: null });
  assert.deepEqual(c.parseRoute('/c/a/b/+/7/2..5/src/x.js'), { root: '', project: 'a/b', change: 7, base: 2, ps: 5, file: 'src/x.js' });
  // Gerrit under a sub-path
  assert.deepEqual(c.parseRoute('/r/c/mediawiki/core/+/1042/3'), { root: '/r', project: 'mediawiki/core', change: 1042, base: null, ps: 3, file: null });
  // a project whose name contains /c/ at the host root
  assert.equal(c.parseRoute('/c/tools/c/lint/+/9').project, 'tools/c/lint');
  assert.equal(c.parseRoute('/dashboard/self'), null);
  assert.equal(c.parseRoute('/r/dashboard/self'), null);
});

test('diffRows folds long context and numbers lines', () => {
  const ab = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const rows = c.diffRows([{ ab }, { a: ['old'], b: ['new', 'new2'] }, { ab: ab.slice(0, 2) }], 3);
  assert.equal(rows[0].type, 'fold');            // leading context: only last 3 shown
  assert.equal(rows[0].hidden.length, 17);
  assert.deepEqual(rows.slice(1, 4).map((r) => r.b), [18, 19, 20]);
  assert.deepEqual(rows.slice(4, 7).map((r) => [r.type, r.a, r.b]), [['del', 21, null], ['add', null, 21], ['add', null, 22]]);
  assert.deepEqual(rows.slice(7).map((r) => [r.a, r.b]), [[22, 23], [23, 24]]);
});

test('splitRows zips deletions with additions', () => {
  const rows = c.diffRows([{ ab: ['x'] }, { a: ['d1', 'd2'], b: ['a1'] }, { ab: ['y'] }, { b: ['a2'] }]);
  const pairs = c.splitRows(rows);
  assert.deepEqual(pairs.map((p) => [p.L?.text ?? null, p.R?.text ?? null]), [['x', 'x'], ['d1', 'a1'], ['d2', null], ['y', 'y'], [null, 'a2']]);
  const folded = c.splitRows([{ type: 'fold', hidden: [] }, ...rows]);
  assert.equal(folded[0].ri, 0);
});

test('parseMessage pulls votes and drops the comment count line', () => {
  assert.deepEqual(c.parseMessage('Patch Set 16: Code-Review+1\n\n(1 comment)'), { votes: [{ label: 'Code-Review', value: 1 }], body: '' });
  assert.deepEqual(c.parseMessage('Patch Set 18: Code-Review-1 -Verified\n\n(2 comments)\n\nfix it'), { votes: [{ label: 'Code-Review', value: -1 }, { label: 'Verified', value: null }], body: 'fix it' });
  assert.deepEqual(c.parseMessage('Patch Set 18:\n\n(1 comment)\n\n[AI] text\nline2'), { votes: [], body: '[AI] text\nline2' });
  // text on the first line is not a vote list
  assert.deepEqual(c.parseMessage('Patch Set 17: Patch Set 16 was rebased\n\nCopied Votes:'), { votes: [], body: 'Patch Set 16 was rebased\n\nCopied Votes:' });
  assert.deepEqual(c.parseMessage('Uploaded patch set 18.'), { votes: [], body: 'Uploaded patch set 18.' });
});

test('commentlinks from the project config become links', () => {
  c.setCommentLinks({ JIRA: { match: '(JIRA:\\s*)(.*[0-9A-Z]-[0-9]*)', link: 'https://example.atlassian.net/browse/$2' }, BAD: { match: 'x', link: 'javascript:alert(1)' } });
  assert.equal(c.md('see JIRA: SHOP-12'), '<p>see <a href="https://example.atlassian.net/browse/SHOP-12" target="_blank" rel="noopener noreferrer">JIRA: SHOP-12</a></p>');
  assert.equal(c.md('box'), '<p>box</p>');
  c.setCommentLinks(null);
});

test('intralineMarks splits chunk edits per line and drops whole-line marks', () => {
  // "abc\n" + "xyz\n": mark "b" (1..2) and "yz" (5..7 -> line 1, 1..3)
  assert.deepEqual(c.intralineMarks(['abc', 'xyz'], [[1, 1], [3, 2]]), [[[1, 2]], [[1, 3]]]);
  // one edit spanning the newline lands on both lines
  assert.deepEqual(c.intralineMarks(['abc', 'xyz'], [[2, 4]]), [[[2, 3]], [[0, 2]]]); // c, newline, x, y
  // whole line marked -> nothing to paint
  assert.deepEqual(c.intralineMarks(['abc'], [[0, 3]]), [[]]);
  assert.deepEqual(c.intralineMarks(['abc'], undefined), [[]]);
  const rows = c.diffRows([{ a: ['let a = 1;'], b: ['let a = 2;'], edit_a: [[8, 1]], edit_b: [[8, 1]] }]);
  assert.deepEqual(rows.map((r) => r.marks), [[[8, 9]], [[8, 9]]]);
});

test('splitHighlighted keeps spans balanced across lines', () => {
  const html = 'a <span class="c">/* x\ny */</span> b\n<span class="k">if</span>';
  assert.deepEqual(c.splitHighlighted(html), ['a <span class="c">/* x</span>', '<span class="c">y */</span> b', '<span class="k">if</span>']);
  assert.deepEqual(c.splitHighlighted('&lt;x&gt;'), ['&lt;x&gt;']);
});

test('buildThreads groups replies and takes last resolved state', () => {
  const m = c.buildThreads([
    { id: 'r', line: 4, unresolved: true, updated: '1' },
    { id: 'x', in_reply_to: 'r', line: 4, unresolved: false, updated: '2' },
    { id: 'p', line: 2, side: 'PARENT', unresolved: true, updated: '1' },
    { id: 'f', unresolved: true, updated: '1' },
  ]);
  assert.equal(m.get('b:4')[0].comments.length, 2);
  assert.equal(m.get('b:4')[0].unresolved, false);
  assert.ok(m.get('a:2') && m.get('file'));
});

test('anchorNote finds the line by its text', () => {
  const lines = [null, 'a', 'return x', 'b', 'return x'];
  // later patchset: nearest matching line
  assert.deepEqual(c.anchorNote({ patchset: 1, line: 5, lineText: ' return x ' }, 2, lines), { line: 4, carried: true });
  // same patchset, number still right
  assert.deepEqual(c.anchorNote({ patchset: 2, line: 2, lineText: 'return x' }, 2, lines), { line: 2, carried: false });
  // same patchset, the model miscounted: text wins over the number
  assert.deepEqual(c.anchorNote({ patchset: 2, line: 3, lineText: 'a' }, 2, lines), { line: 1, carried: false });
  // no lineText: number only on its own patchset
  assert.deepEqual(c.anchorNote({ patchset: 2, line: 3 }, 2, lines), { line: 3, carried: false });
  assert.deepEqual(c.anchorNote({ patchset: 1, line: 3 }, 2, lines), { line: null, carried: true });
  assert.deepEqual(c.anchorNote({ patchset: 1, line: 3, lineText: 'gone' }, 2, lines), { line: null, carried: true });
});

test('md escapes and renders code', () => {
  assert.equal(c.md('<b> `x<y>`'), '<p>&lt;b&gt; <code>x&lt;y&gt;</code></p>');
  assert.match(c.md('a\n```js\n<i>\n```'), /<pre><code>&lt;i&gt;<\/code><\/pre>/);
  assert.equal(c.md('[doc](https://x.io/a_b) `[no](https://y)`'), '<p><a href="https://x.io/a_b" target="_blank" rel="noopener noreferrer">doc</a> <code>[no](https://y)</code></p>');
  assert.equal(c.md('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(c.md('- a\n- `b`'), '<ul><li>a</li><li><code>b</code></li></ul>');
  assert.equal(c.md('> q'), '<blockquote>q</blockquote>');
});
