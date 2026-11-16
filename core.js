// core.js
// Pure helpers shared by the content script and the popup, and unit-tested in
// Node (core.test.js). No DOM, no chrome.* here.

'use strict';

(function (root) {
  // Terms follow what reviewers already know: Gerrit for review actions
  // (Reply, Send, Ack, Done, Resolved), GitHub for screen parts (Conversation,
  // Viewed, Unified/Split, Outdated, Dismiss), Conventional Comments for kinds.
  const STRINGS = {
    ko: {
      title: 'Gerrit Lens', enabled: '새 화면 사용', theme: '테마', themeLight: '라이트', themeDark: '다크', language: '언어',
      bridge: 'AI 의견 (선택)', bridgeWhat: 'Claude Code 나 Codex 가 리뷰한 의견을 diff 줄 옆에 띄워요. Node 18 이상이 필요해요.', bridgeStep1: '쓰는 도구에 맞는 명령을 터미널에서 한 번 실행', bridgeStep2: '이 확장이 내 컴퓨터의 브리지에 연결하도록 허용', bridgeStep3: '이제 Claude 나 Codex 에 Gerrit 링크를 주고 리뷰를 부탁하면 줄 옆에 의견이 떠요.', copy: '복사', copied: '복사됨', bridgeGrant: '연결 허용', bridgeOn: '연결됨', bridgeOff: '꺼짐', bridgeNoPerm: '연결 허용 필요',
      siteOn: '이 사이트에서 사용 중', siteOff: '이 사이트는 아직 사용하지 않음', siteEnable: '이 사이트에서 사용', siteDisable: '이 사이트에서 끄기', siteNone: 'Gerrit 에서 열어 주세요',
      loading: '불러오는 중...', loadFail: '불러오지 못했어요', classic: '클래식 보기', openLens: 'Lens 로 보기', files: '파일', commitMsg: '커밋 메시지',
      reply: '리뷰', publish: '보내기', cancel: '취소', save: '저장', edit: '수정', discard: '삭제', comment: '코멘트', draft: '초안', drafts: '초안',
      resolved: '해결됨', unresolved: '미해결', done: 'Done', ack: 'Ack', replyTo: '답글',
      expand: '펼치기', lines: '줄', base: '기준', reviewers: '리뷰어', cc: '참조', labels: '라벨', updated: '수정',
      conversation: '대화', noFiles: '변경된 파일이 없어요', binary: '바이너리 파일', addComment: '코멘트 추가', message: '메시지',
      open: '열림', merged: '머지됨', abandoned: '버려짐', wip: '작업 중', submittable: '머지 가능',
      viewed: '확인함', unified: '통합', split: '분할', lineRange: '줄',
      fmtBold: '굵게', fmtCode: '코드 (`한 줄`)', fmtCodeBlock: '코드 블록 (```여러 줄```)', fmtLink: '링크', fmtList: '목록', fmtQuote: '인용', fmtEmoji: '이모지', showAll: '모든 항목 보기', hiddenN: '{n}개 숨김', expandAll: '모두 펼치기', bigDiff: '바뀐 줄이 {n}줄인 큰 diff 라 접어 두었어요.', loadDiff: '불러오기', conflict: '머지 충돌', star: '별표', copyLink: '링크 복사', allComments: '코멘트 스레드', onlyUnresolved: '미해결만', replies: '답글', noThreads: '스레드가 없어요', whitespace: '공백', wsNone: '모두 비교', wsTrailing: '줄 끝 무시', wsLeadTrail: '앞뒤 무시', wsAll: '모두 무시', shortcuts: '단축키', scNextFile: '다음/이전 파일', scNextChunk: '다음/이전 변경', scNextThread: '다음/이전 미해결 스레드', scReply: '리뷰 창 열기', scThreads: '코멘트 스레드 목록', scViewed: '지금 파일 확인함', scTree: '파일 목록 접기', scSplit: '통합/분할 전환', scHelp: '단축키 보기', scClose: '창 닫기', uploader: '업로더', created: '생성', parent: '부모', commit: '커밋', sameTopic: '같은 토픽', conflictsWith: '충돌하는 변경', browse: '저장소에서 보기', private: '비공개', moreActions: '더 보기', download: '다운로드', editInClassic: '클래식에서 편집', branch: '브랜치', topic: '토픽', hashtags: '해시태그', description: '설명', subject: '제목', deleteConfirm: '이 change 를 지울까요? 되돌릴 수 없어요.', quote: '인용', attention: '차례', submitRequirements: '제출 조건', owner: '작성자', relationChain: '관련 변경', submittedTogether: '함께 머지될 변경', addReviewer: '리뷰어 추가', addCc: '참조 추가', remove: '빼기', group: '그룹', collapseAll: '모두 접기', saveHint: 'Ctrl+Enter 로 저장',
      aiPost: '초안으로 추가', aiEdit: '수정 후 추가', aiDismiss: '무시', aiRestore: '되돌리기', aiDetail: '설명', aiRefs: '참고 코드', aiSuggested: '제안 코멘트',
      aiCopied: '복사됨', aiPosted: '초안에 추가됨', aiFrom: '기준', aiOutdated: '오래됨',
      aiNotes: 'AI 의견', unresolvedCount: '미해결', sent: '보냄', err: '실패',
      sevMust: '문제', sevShould: '제안', sevNit: 'nit', sevInfo: '참고',
    },
    en: {
      title: 'Gerrit Lens', enabled: 'Use new view', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', language: 'Language',
      bridge: 'AI notes (optional)', bridgeWhat: 'Shows review notes from Claude Code or Codex next to the diff lines. Needs Node 18+.', bridgeStep1: 'Run the command for your tool once in a terminal', bridgeStep2: 'Let this extension connect to the bridge on your computer', bridgeStep3: 'Now give Claude or Codex a Gerrit link and ask for a review. Notes show up next to the lines.', copy: 'Copy', copied: 'Copied', bridgeGrant: 'Allow connection', bridgeOn: 'Connected', bridgeOff: 'Off', bridgeNoPerm: 'Needs permission',
      siteOn: 'Active on this site', siteOff: 'Not active on this site', siteEnable: 'Use on this site', siteDisable: 'Turn off for this site', siteNone: 'Open this on your Gerrit site',
      loading: 'Loading...', loadFail: 'Could not load', classic: 'Classic view', openLens: 'Open in Lens', files: 'Files', commitMsg: 'Commit message',
      reply: 'Reply', publish: 'Send', cancel: 'Cancel', save: 'Save', edit: 'Edit', discard: 'Delete', comment: 'Comment', draft: 'Draft', drafts: 'Drafts',
      resolved: 'Resolved', unresolved: 'Unresolved', done: 'Done', ack: 'Ack', replyTo: 'Reply',
      expand: 'Expand', lines: 'lines', base: 'Base', reviewers: 'Reviewers', cc: 'CC', labels: 'Labels', updated: 'Updated',
      conversation: 'Conversation', noFiles: 'No changed files', binary: 'Binary file', addComment: 'Add comment', message: 'Message',
      open: 'Open', merged: 'Merged', abandoned: 'Abandoned', wip: 'WIP', submittable: 'Ready to submit',
      viewed: 'Viewed', unified: 'Unified', split: 'Split', lineRange: 'Lines',
      fmtBold: 'Bold', fmtCode: 'Inline code (`code`)', fmtCodeBlock: 'Code block (```)', fmtLink: 'Link', fmtList: 'Bulleted list', fmtQuote: 'Quote', fmtEmoji: 'Emoji', showAll: 'Show all entries', hiddenN: '{n} hidden', expandAll: 'Expand all', bigDiff: 'Large diff ({n} changed lines) is not loaded yet.', loadDiff: 'Load diff', conflict: 'Merge conflict', star: 'Star', copyLink: 'Copy link', allComments: 'Comment threads', onlyUnresolved: 'Unresolved only', replies: 'Replies', noThreads: 'No threads', whitespace: 'Whitespace', wsNone: 'Compare all', wsTrailing: 'Ignore trailing', wsLeadTrail: 'Ignore leading/trailing', wsAll: 'Ignore all', shortcuts: 'Shortcuts', scNextFile: 'Next/previous file', scNextChunk: 'Next/previous change', scNextThread: 'Next/previous unresolved thread', scReply: 'Open review dialog', scThreads: 'Comment threads', scViewed: 'Mark current file viewed', scTree: 'Toggle file list', scSplit: 'Unified/split', scHelp: 'Show shortcuts', scClose: 'Close dialog', uploader: 'Uploader', created: 'Created', parent: 'Parent', commit: 'Commit', sameTopic: 'Same topic', conflictsWith: 'Conflicts with', browse: 'Browse in repository', private: 'Private', moreActions: 'More', download: 'Download', editInClassic: 'Edit in classic view', branch: 'Branch', topic: 'Topic', hashtags: 'Hashtags', description: 'Description', subject: 'Subject', deleteConfirm: 'Delete this change? This cannot be undone.', quote: 'Quote', attention: 'Attention', submitRequirements: 'Submit requirements', owner: 'Owner', relationChain: 'Relation chain', submittedTogether: 'Submitted together', addReviewer: 'Add reviewer', addCc: 'Add CC', remove: 'Remove', group: 'Group', collapseAll: 'Collapse all', saveHint: 'Ctrl+Enter to save',
      aiPost: 'Add as draft', aiEdit: 'Edit, then add', aiDismiss: 'Dismiss', aiRestore: 'Restore', aiDetail: 'Details', aiRefs: 'References', aiSuggested: 'Suggested comment',
      aiCopied: 'Copied', aiPosted: 'Added as draft', aiFrom: 'from', aiOutdated: 'Outdated',
      aiNotes: 'AI notes', unresolvedCount: 'unresolved', sent: 'Sent', err: 'Failed',
      sevMust: 'Issue', sevShould: 'Suggestion', sevNit: 'Nit', sevInfo: 'Note',
    },
  };
  const browserLang = String(root.navigator?.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en';
  let lang = browserLang;
  // 'auto' follows the browser; 'ko' / 'en' come from the popup setting.
  const setLang = (pref) => { lang = pref === 'ko' || pref === 'en' ? pref : browserLang; };
  const getLang = () => lang;
  const t = (k) => STRINGS[lang][k] ?? STRINGS.en[k] ?? k;

  // [<root>]/c/<project>/+/<num>[/<base>..<ps> | /<ps>][/<file...>]
  // <root> is where Gerrit is served, '' at the host root or e.g. '/r' or
  // '/gerrit' under a sub-path. The first "/c/" wins, so a project name that
  // itself contains "/c/" still parses with an empty root.
  function parseRoute(pathname) {
    const m = /^(.*?)\/c\/(.+?)\/\+\/(\d+)(?:\/(?:(\d+|edit)\.\.)?(\d+))?(?:\/(.*))?$/.exec(pathname || '');
    if (!m) return null;
    return {
      root: m[1],
      project: decodeURIComponent(m[2]),
      change: Number(m[3]),
      base: m[4] && m[4] !== 'edit' ? Number(m[4]) : null,
      ps: m[5] ? Number(m[5]) : null,
      file: m[6] ? decodeURIComponent(m[6]) : null,
    };
  }

  // Gerrit prefixes every JSON response with )]}' to block XSSI.
  const parseGerritJson = (text) => JSON.parse(text.replace(/^\)\]\}'\s*/, ''));

  // Gerrit's intraline edits are [skip, mark] pairs over the chunk's lines
  // joined with "\n" (each line counts its newline). Split them per line.
  // A mark that covers a whole line says nothing new, so it is dropped, the
  // way Gerrit's own diff view only paints partial changes.
  function intralineMarks(lines, edits) {
    const out = lines.map(() => []);
    if (!edits) return out;
    const starts = [];
    let off = 0;
    for (const l of lines) { starts.push(off); off += l.length + 1; }
    let pos = 0;
    for (const [skip, len] of edits) {
      pos += skip;
      const from = pos;
      const to = pos + len;
      pos = to;
      for (let i = 0; i < lines.length; i++) {
        const ls = starts[i];
        const le = ls + lines[i].length;
        const a = Math.max(from, ls);
        const b = Math.min(to, le);
        if (b > a) out[i].push([a - ls, b - ls]);
      }
    }
    return out.map((marks, i) => (marks.length === 1 && marks[0][0] === 0 && marks[0][1] >= lines[i].length ? [] : marks));
  }

  // highlight.js output for a whole file -> one balanced HTML string per line,
  // so multi-line comments and strings keep their colour on every line.
  function splitHighlighted(html) {
    const lines = [];
    const open = [];
    let cur = '';
    const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[1]) { open.push(m[1]); cur += m[1]; }
      else if (m[2]) { open.pop(); cur += m[2]; }
      else if (m[3]) { lines.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); }
      else cur += m[4];
    }
    lines.push(cur + '</span>'.repeat(open.length));
    return lines;
  }

  // DiffInfo.content -> flat unified rows. Long unchanged runs fold into one
  // 'fold' row that carries the hidden rows so the UI can expand in place.
  // `context` is how many unchanged lines stay visible around a change
  // (Gerrit's diff preference, 10 by default).
  function diffRows(content, context = 10) {
    const CONTEXT = context;
    const rows = [];
    let a = 1, b = 1;
    const chunks = content || [];
    chunks.forEach((chunk, i) => {
      if (chunk.skip) {
        rows.push({ type: 'fold', hidden: [], skipped: chunk.skip, a, b });
        a += chunk.skip; b += chunk.skip;
        return;
      }
      if (chunk.ab) {
        const ctx = chunk.ab.map((text) => ({ type: 'ctx', a: a++, b: b++, text }));
        const head = i === 0 ? 0 : CONTEXT;
        const tail = i === chunks.length - 1 ? 0 : CONTEXT;
        if (ctx.length > head + tail + 2) {
          rows.push(...ctx.slice(0, head));
          rows.push({ type: 'fold', hidden: ctx.slice(head, ctx.length - tail) });
          rows.push(...ctx.slice(ctx.length - tail));
        } else {
          rows.push(...ctx);
        }
        return;
      }
      const ma = intralineMarks(chunk.a || [], chunk.edit_a);
      const mb = intralineMarks(chunk.b || [], chunk.edit_b);
      (chunk.a || []).forEach((text, k) => rows.push({ type: 'del', a: a++, b: null, text, marks: ma[k] }));
      (chunk.b || []).forEach((text, k) => rows.push({ type: 'add', a: null, b: b++, text, marks: mb[k] }));
    });
    return rows;
  }

  // Unified rows -> side-by-side pairs. A run of deletions followed by a run of
  // additions is zipped line by line; context sits on both sides. `ri` keeps
  // the unified index so expanding a fold can still splice the unified rows.
  function splitRows(rows) {
    const out = [];
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      if (r.type === 'del' || r.type === 'add') {
        const dels = [];
        const adds = [];
        while (i < rows.length && rows[i].type === 'del') dels.push(rows[i++]);
        while (i < rows.length && rows[i].type === 'add') adds.push(rows[i++]);
        for (let k = 0; k < Math.max(dels.length, adds.length); k++) out.push({ L: dels[k] || null, R: adds[k] || null });
      } else {
        out.push(r.type === 'fold' ? { fold: r, ri: i } : { L: r, R: r });
        i++;
      }
    }
    return out;
  }

  // "Patch Set 16: Code-Review+1 -Verified\n\n(1 comment)\n\nbody" ->
  // { votes: [{label:'Code-Review', value:1}, {label:'Verified', value:null}], body }.
  // value null = the vote was removed. The "(N comments)" line is dropped
  // because the comments themselves are shown under the message.
  function parseMessage(text) {
    let body = String(text || '');
    const votes = [];
    const head = /^Patch Set \d+:[ \t]*([^\n]*)\n?/.exec(body);
    if (head) {
      const toks = head[1].trim().split(/\s+/).filter(Boolean);
      const parsed = toks.map((tok) => {
        const set = /^([A-Za-z][\w-]*)([+-]\d+)$/.exec(tok);
        if (set) return { label: set[1], value: Number(set[2]) };
        const removed = /^-([A-Za-z][\w-]*)$/.exec(tok);
        return removed ? { label: removed[1], value: null } : null;
      });
      if (toks.length && parsed.every(Boolean)) {
        votes.push(...parsed);
        body = body.slice(head[0].length);
      } else {
        body = `${head[1]}\n${body.slice(head[0].length)}`;
      }
    }
    body = body.replace(/^\s*\(\d+ comments?\)[ \t]*(\n|$)/, '').trim();
    return { votes, body };
  }

  // Lines of the new (b) side, 1-based, for re-anchoring notes.
  function newSideLines(content) {
    const out = [''];
    for (const c of content || []) {
      if (c.ab) out.push(...c.ab);
      else if (c.b) out.push(...c.b);
      else if (c.skip) for (let i = 0; i < c.skip; i++) out.push(null);
    }
    return out;
  }

  // Group Gerrit comments of one file into threads keyed by where they sit.
  // Returns Map<'b:12' | 'a:7' | 'file', Thread[]>.
  function buildThreads(comments) {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const rootOf = (c) => {
      let cur = c;
      for (let guard = 0; cur.in_reply_to && byId.has(cur.in_reply_to) && guard < 500; guard++) cur = byId.get(cur.in_reply_to);
      return cur;
    };
    const threads = new Map();
    for (const c of comments) {
      const r = rootOf(c);
      if (!threads.has(r.id)) threads.set(r.id, { root: r, comments: [] });
      threads.get(r.id).comments.push(c);
    }
    const out = new Map();
    for (const th of threads.values()) {
      th.comments.sort((x, y) => String(x.updated).localeCompare(String(y.updated)));
      const last = th.comments[th.comments.length - 1];
      th.unresolved = !!last.unresolved;
      th.hasDraft = th.comments.some((c) => c.__draft);
      const key = th.root.line ? `${th.root.side === 'PARENT' ? 'a' : 'b'}:${th.root.line}` : 'file';
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(th);
    }
    return out;
  }

  // Where should an AI note sit on patchset `ps`? If its line still holds
  // lineText, there. Otherwise (a later patchset, or the model miscounted) the
  // line with that text nearest to the old number. No lineText: trust the
  // number on its own patchset only.
  function anchorNote(note, ps, lines) {
    const carried = note.patchset !== ps;
    if (!note.line) return { line: null, carried };
    const want = (note.lineText || '').trim();
    if (!want) return { line: carried ? null : note.line, carried };
    if (lines[note.line] != null && lines[note.line].trim() === want) return { line: note.line, carried };
    let best = null;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] != null && lines[i].trim() === want && (best == null || Math.abs(i - note.line) < Math.abs(best - note.line))) best = i;
    }
    return { line: best, carried };
  }

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Small markdown: fenced code, inline code, bold, links, lists, quotes,
  // paragraphs. Input is escaped first, so nothing from Gerrit or the bridge
  // can inject markup; link targets are limited to http(s).
  // Project commentlinks (Gerrit config), e.g. "JIRA: SHOP-1" -> Jira link.
  let commentLinks = [];
  function setCommentLinks(cfg) {
    commentLinks = Object.values(cfg || {}).flatMap((c) => {
      if (!c.match || !c.link || !/^https?:\/\//.test(c.link)) return [];
      try { return [{ re: new RegExp(c.match, 'g'), link: c.link }]; } catch { return []; }
    });
  }

  function inline(text) {
    let h = escapeHtml(text);
    const keep = [];
    const stash = (html) => `\u0000${keep.push(html) - 1}\u0000`;
    for (const { re, link } of commentLinks) {
      h = h.replace(re, (...m) => {
        const groups = m.slice(0, -2);
        const href = link.replace(/\$(\d)/g, (_, i) => encodeURI(groups[i] || ''));
        return stash(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${m[0]}</a>`);
      });
    }
    h = h.replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${c}</code>`));
    h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, u) => stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    h = h.replace(/\bhttps?:\/\/[^\s<\u0000]+/g, (u) => stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    return h.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
  }

  function md(src) {
    const parts = String(src ?? '').split(/```[^\n]*\n?/);
    return parts.map((part, i) => {
      if (i % 2) return `<pre><code>${escapeHtml(part.replace(/\n$/, ''))}</code></pre>`;
      return part.split(/\n{2,}/).filter((p) => p.trim()).map((p) => {
        const lines = p.trim().split('\n');
        if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
        if (lines.every((l) => /^> ?/.test(l))) return `<blockquote>${lines.map((l) => inline(l.replace(/^> ?/, ''))).join('<br>')}</blockquote>`;
        return `<p>${lines.map(inline).join('<br>')}</p>`;
      }).join('');
    }).join('');
  }

  const api = { t, setLang, getLang, setCommentLinks, parseRoute, parseGerritJson, diffRows, splitRows, parseMessage, intralineMarks, splitHighlighted, newSideLines, buildThreads, anchorNote, escapeHtml, md };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LensCore = api;
})(typeof self !== 'undefined' ? self : globalThis);
