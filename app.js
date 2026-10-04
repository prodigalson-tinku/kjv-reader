(function () {
'use strict';

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('kjv.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('kjv.' + k, JSON.stringify(v)); } catch (e) {} }
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------- database ---------- */
let db, BOOKS = [], BOOK = {};
function all(sql, params) {
  const st = db.prepare(sql); st.bind(params || []);
  const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows;
}
const one = (sql, p) => { const r = all(sql, p); return r[0] || null; };
function b64ToBytes(b64) {
  const bin = atob(b64), n = bin.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- book names ---------- */
const ABBR = {
  gen:1,ge:1,gn:1, exo:2,ex:2,exod:2, lev:3,le:3,lv:3, num:4,nu:4,nm:4,nb:4, deut:5,dt:5,de:5,
  josh:6,jos:6,jsh:6, judg:7,jdg:7,jg:7, rut:8,rth:8,ru:8,
  '1sam':9,'1sa':9,'1sm':9,'1s':9, '2sam':10,'2sa':10,'2sm':10,'2s':10,
  '1kgs':11,'1ki':11,'1k':11, '2kgs':12,'2ki':12,'2k':12,
  '1chr':13,'1ch':13, '2chr':14,'2ch':14, ezr:15, neh:16,ne:16, esth:17,est:17,es:17, jb:18,
  ps:19,psa:19,psalm:19,pss:19, prov:20,pro:20,prv:20,pr:20, eccl:21,ecc:21,ec:21,qoh:21,
  song:22,sos:22,ss:22,canticles:22,songofsongs:22,
  isa:23,is:23, jer:24,je:24,jr:24, lam:25,la:25, ezek:26,eze:26,ezk:26, dan:27,da:27,dn:27,
  hos:28,ho:28, joe:29,jl:29, am:30, obad:31,ob:31, jon:32,jnh:32, mic:33,mc:33, nah:34,na:34,
  hab:35,hb:35, zeph:36,zep:36,zp:36, hag:37,hg:37, zech:38,zec:38,zc:38, mal:39,ml:39,
  matt:40,mat:40,mt:40, mrk:41,mk:41,mr:41, luk:42,lk:42, joh:43,jhn:43,jn:43, act:44,ac:44,
  rom:45,ro:45,rm:45, '1cor':46,'1co':46, '2cor':47,'2co':47, gal:48,ga:48, eph:49,ephes:49,
  phil:50,php:50,pp:50, col:51, '1thess':52,'1thes':52,'1th':52, '2thess':53,'2thes':53,'2th':53,
  '1tim':54,'1ti':54, '2tim':55,'2ti':55, tit:56, phlm:57,philem:57,phm:57, heb:58,
  jas:59,jam:59,jm:59, '1pet':60,'1pe':60,'1pt':60, '2pet':61,'2pe':61,'2pt':61,
  '1john':62,'1jn':62,'1jo':62,'1joh':62, '2john':63,'2jn':63,'2jo':63, '3john':64,'3jn':64,'3jo':64,
  jud:65, rev:66,re:66,rv:66, revelations:66
};
function normBook(s) {
  s = s.toLowerCase().trim().replace(/\./g, '');
  s = s.replace(/^(iii|3rd|third)\s+/, '3').replace(/^(ii|2nd|second)\s+/, '2').replace(/^(i|1st|first)\s+/, '1');
  return s.replace(/\s+/g, '');
}
let NAMEKEYS = [];
function findBook(name) {
  const n = normBook(name);
  if (!n) return null;
  if (ABBR[n]) return ABBR[n];
  for (const k of NAMEKEYS) if (k.key === n) return k.id;
  const hits = NAMEKEYS.filter(k => k.key.startsWith(n));
  if (n.length >= 3 && hits.length === 1) return hits[0].id;
  if (n.length >= 3 && hits.length > 1) {
    // e.g. "1 jo" style ambiguity: give up rather than guess
    return null;
  }
  return null;
}
/* Returns {book, chapter, verse, verseEnd} or {book} for a bare book name, or null */
function parseRef(q) {
  q = q.trim().toLowerCase().replace(/[–—]/g, '-');
  const m = q.match(/^((?:[123]|iii|ii|i|1st|2nd|3rd|first|second|third)?\s*[a-z][a-z .]*?)\s*(?:(\d+)(?:\s*[:.]\s*(\d+)(?:\s*-\s*(\d+))?)?)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  return { book, chapter: m[2] ? +m[2] : null, verse: m[3] ? +m[3] : null, verseEnd: m[4] ? +m[4] : null };
}

/* ---------- state ---------- */
const S = {
  book: store.get('book', 1), chapter: store.get('chapter', 1),
  selected: new Set(), fromSearch: false,
  lastSearch: null, testament: 'ALL'
};
let curVerses = [];

/* ---------- annotations (kept on this device) ---------- */
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const wordsOf = row => row.text.split(/\s+/).filter(Boolean);
const Ann = {
  map: new Map(), mode: 'memory', idb: null, chapIdx: new Map(),
  async init() {
    let loaded = [];
    try {
      this.idb = await new Promise((res, rej) => {
        const rq = indexedDB.open('kjv-reader', 2);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains('ann')) d.createObjectStore('ann', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('xref')) d.createObjectStore('xref', { keyPath: 'id' });
        };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('blocked'));
      });
      loaded = await new Promise((res, rej) => {
        const r = this.idb.transaction('ann').objectStore('ann').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const links = await new Promise((res, rej) => {
        const r = this.idb.transaction('xref').objectStore('xref').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      Lnk.load(links);
      this.mode = 'indexeddb';
    } catch (e) {
      this.idb = null;
      try { const raw = localStorage.getItem('kjv.ann'); loaded = raw ? JSON.parse(raw) : []; const rl = localStorage.getItem('kjv.xref'); Lnk.load(rl ? JSON.parse(rl) : []); this.mode = 'localstorage'; }
      catch (e2) { loaded = []; this.mode = 'memory'; }
    }
    loaded.forEach(a => this.map.set(a.id, a));
    this.reindex();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  },
  reindex() {
    this.chapIdx = new Map();
    for (const a of this.map.values()) {
      if (a.del) continue;
      const k = a.book * 1000 + a.chapter;
      if (!this.chapIdx.has(k)) this.chapIdx.set(k, []);
      this.chapIdx.get(k).push(a);
    }
  },
  forChapter(b, c) { return (this.chapIdx.get(b * 1000 + c) || []).slice().sort((x, y) => x.updated - y.updated); },
  live() { return [...this.map.values()].filter(a => !a.del); },
  find(b, c, v, s, e) { return (this.chapIdx.get(b * 1000 + c) || []).find(a => a.verse === v && a.start === s && a.end === e && !a.verseEnd); },
  findVerseNote(b, c, v, vEnd) { return (this.chapIdx.get(b * 1000 + c) || []).find(a => a.verse === v && a.start === null && (a.verseEnd || null) === (vEnd || null)); },
  save(a) { a.updated = Date.now(); this.put(a); gdDirty(); },
  put(a) { this.map.set(a.id, a); this.persist(a); this.reindex(); refreshCounts(); },
  remove(a) { a.del = true; a.hl = null; a.ul = false; a.note = ''; a.text = ''; this.save(a); },
  persist(a) {
    if (this.mode === 'indexeddb') {
      try { const tx = this.idb.transaction('ann', 'readwrite'); tx.objectStore('ann').put(a); tx.onerror = () => toast('Could not save that change'); } catch (e) { toast('Could not save that change'); }
    } else if (this.mode === 'localstorage') {
      try { localStorage.setItem('kjv.ann', JSON.stringify([...this.map.values()])); } catch (e) { toast('Could not save that change'); }
    }
  }
};
/* your own cross-reference links */
const Lnk = {
  map: new Map(),
  load(arr) { (arr || []).forEach(a => this.map.set(a.id, a)); },
  live() { return [...this.map.values()].filter(a => !a.del); },
  from(vid) { return this.live().filter(l => l.fromId === vid); },
  to(vid) { return this.live().filter(l => l.toStart <= vid && vid <= l.toEnd); },
  exists(f, s, e) { return this.live().some(l => l.fromId === f && l.toStart === s && l.toEnd === e); },
  save(l) { l.updated = Date.now(); this.put(l); gdDirty(); },
  put(l) { this.map.set(l.id, l); this.persist(l); refreshCounts(); },
  remove(l) { l.del = true; l.note = ''; this.save(l); },
  persist(l) {
    if (Ann.mode === 'indexeddb') {
      try { const tx = Ann.idb.transaction('xref', 'readwrite'); tx.objectStore('xref').put(l); tx.onerror = () => toast('Could not save that link'); } catch (e) { toast('Could not save that link'); }
    } else if (Ann.mode === 'localstorage') {
      try { localStorage.setItem('kjv.xref', JSON.stringify([...this.map.values()])); } catch (e) { toast('Could not save that link'); }
    }
  }
};
function newAnn(b, c, v, s, e, snapshot) {
  const now = Date.now();
  return { id: uid(), book: b, chapter: c, verse: v, verseEnd: null, start: s, end: e, hl: null, ul: false, note: '', text: snapshot || '', created: now, updated: now, del: false };
}
function finalize(a) { if (!a.hl && !a.ul && !a.note) Ann.remove(a); else Ann.save(a); }

/* ---------- reader ---------- */
function refLabel(book, ch, v) { return BOOK[book].name + ' ' + ch + (v ? ':' + v : ''); }

const IT_O = '\ue000', IT_C = '\ue001';
let curTitles = [];
const noteMark = a => '<span class="nmark" data-a="' + a.id + '" title="Note">✎</span>';
/* turn one word (which may contain italic markers) into HTML; st.it carries italic state across words */
function wordInner(tok, st) {
  let out = '';
  tok.split(/([\ue000\ue001])/).forEach(part => {
    if (part === IT_O) st.it = true;
    else if (part === IT_C) st.it = false;
    else if (part) {
      let h = esc(part).replace(/\b(LORD|GOD|JEHOVAH)\b/g, m => '<span class="sc">' + m[0] + m.slice(1).toLowerCase() + '</span>');
      out += st.it ? '<i class="add">' + h + '</i>' : h;
    }
  });
  return out;
}
function verseLines(row) {
  return (row.marked == null ? row.text : row.marked).split('\n').map(l => l.split(/\s+/).filter(Boolean)).filter(l => l.length);
}
/* returns { lines: [html per line], vmarks: html for whole-verse notes } */
function verseHtml(row, anns) {
  const lines = verseLines(row);
  const n = lines.reduce((t, l) => t + l.length, 0);
  const hl = new Array(n).fill(null), ul = new Array(n).fill(false), notes = {}, vnotes = [];
  for (const a of anns) {
    if (a.verse !== row.verse) continue;
    if (a.start === null) { if (a.note) vnotes.push(a); continue; }
    const s = Math.max(0, a.start), e = Math.min(n - 1, a.end);
    for (let i = s; i <= e; i++) { if (a.hl) hl[i] = a.hl; if (a.ul) ul[i] = true; }
    if (a.note) (notes[e] = notes[e] || []).push(a);
  }
  const st = { it: false }; let idx = 0;
  const out = lines.map(toks => {
    let h = '';
    toks.forEach((tok, ti) => {
      const cls = 'w' + (hl[idx] ? ' hl hl-' + hl[idx] : '') + (ul[idx] ? ' ul' : '');
      h += '<span class="' + cls + '" data-w="' + idx + '">' + wordInner(tok, st) + (notes[idx] ? notes[idx].map(noteMark).join('') : '') + (ti < toks.length - 1 ? ' ' : '') + '</span>';
      idx++;
    });
    return h;
  });
  return { lines: out, vmarks: vnotes.map(noteMark).join('') };
}
function renderChapter(highlight, keep) {
  const b = S.book, c = S.chapter;
  const keepTop = keep ? $('#reader').scrollTop : 0;
  curVerses = all('select verse,text,marked,para,poetry from verses where book=? and chapter=? order by verse', [b, c]);
  curTitles = all('select before_verse,text from titles where book=? and chapter=? order by before_verse', [b, c]);
  S.selected.clear(); S.wsel = null; updateSelBar();
  $('#titleBtn').textContent = BOOK[b].name + ' ' + c;
  const layout = store.get('layout', 'flow');
  const anns = Ann.forChapter(b, c);
  const tmap = {}; curTitles.forEach(t => (tmap[t.before_verse] = tmap[t.before_verse] || []).push(t.text));
  let html = '<div class="chapter ' + layout + (store.get('ital', 1) ? '' : ' noital') + '"><h1>' + esc(BOOK[b].name) + ' ' + c + '</h1><div class="body">';
  let open = false;   // is a prose paragraph currently open?
  const close = () => { if (open) { html += '</p>'; open = false; } };
  for (const r of curVerses) {
    if (tmap[r.verse]) {
      close();
      tmap[r.verse].forEach(t => {
        const letter = b === 19 && c === 119 && /^[A-Z]+\.?$/.test(t.trim());
        html += '<div class="' + (letter ? 'pletter' : 'ptitle') + '">' + esc(letter ? t.replace(/\.$/, '') : t) + '</div>';
      });
    }
    const vh = verseHtml(r, anns);
    const sup = '<sup class="vn">' + r.verse + '</sup>' + vh.vmarks;
    if (r.poetry) {
      close();
      html += '<div class="v poem" data-v="' + r.verse + '">' + vh.lines.map((l, i) => '<span class="ln">' + (i === 0 ? sup : '') + l + '</span>').join('') + '</div>';
    } else if (layout === 'line') {
      close();
      html += '<div class="v" data-v="' + r.verse + '">' + sup + vh.lines.join(' ') + '</div>';
    } else {
      if (!open || r.para) { close(); html += '<p class="prose">'; open = true; }
      html += '<span class="v" data-v="' + r.verse + '">' + sup + vh.lines.join(' ') + '</span> ';
    }
  }
  close();
  html += '</div></div>';
  const prev = prevOf(b, c), next = nextOf(b, c);
  html += '<div class="chnav"><button id="pBtn2"' + (prev ? '' : ' disabled') + '>‹ ' + (prev ? esc(refLabel(prev.book, prev.chapter)) : '') + '</button>' +
          '<button id="nBtn2"' + (next ? '' : ' disabled') + '>' + (next ? esc(refLabel(next.book, next.chapter)) : '') + ' ›</button></div>';
  const rd = $('#reader'); rd.innerHTML = html;
  const p2 = $('#pBtn2'), n2 = $('#nBtn2');
  if (prev) p2.onclick = () => { S.fromSearch = false; go(prev.book, prev.chapter); };
  if (next) n2.onclick = () => { S.fromSearch = false; go(next.book, next.chapter); };
  $('#strip').classList.toggle('hidden', !(S.fromSearch && S.lastSearch));
  store.set('book', b); store.set('chapter', c);

  if (keep) rd.scrollTop = keepTop;
  else if (highlight && highlight.length) {
    highlight.forEach(v => { const el = rd.querySelector('.v[data-v="' + v + '"]'); if (el) el.classList.add('flash'); });
    const first = rd.querySelector('.v.flash');
    if (first) first.scrollIntoView({ block: 'center' });
    setTimeout(() => rd.querySelectorAll('.v.flash').forEach(e => e.classList.remove('flash')), 2500);
  } else rd.scrollTop = 0;
  if (!keep) T.focusVerses = highlight && highlight.length ? highlight : null;
  if (keep && P.open) renderPanel(true);
  renderTree();
}
function prevOf(b, c) {
  if (c > 1) return { book: b, chapter: c - 1 };
  if (b > 1) return { book: b - 1, chapter: BOOK[b - 1].chapters };
  return null;
}
function nextOf(b, c) {
  if (c < BOOK[b].chapters) return { book: b, chapter: c + 1 };
  if (b < 66) return { book: b + 1, chapter: 1 };
  return null;
}
function go(book, chapter, verses) {
  S.book = book; S.chapter = chapter;
  revealCurrent();
  showView('read');
  renderChapter(verses);
}
function step(dir) {
  const t = dir < 0 ? prevOf(S.book, S.chapter) : nextOf(S.book, S.chapter);
  if (t) { S.fromSearch = false; go(t.book, t.chapter); }
}

/* ---------- selection & marking ---------- */
S.wsel = null;   // word selection: { verse, a, b, anchor }
const rowOf = v => curVerses.find(r => r.verse === v);
function compactVerses(vs) {
  const parts = []; let i = 0;
  while (i < vs.length) { let j = i; while (j + 1 < vs.length && vs[j + 1] === vs[j] + 1) j++; parts.push(j > i ? vs[i] + '-' + vs[j] : '' + vs[i]); i = j + 1; }
  return parts.join(',');
}
function updateSelBar() {
  if (P.open) updateLinkBtn();
  const nv = S.selected.size, ws = S.wsel, show = nv > 0 || !!ws;
  $('#selBar').classList.toggle('hidden', !show);
  if (!show) return;
  $('#selCount').textContent = ws
    ? refLabel(S.book, S.chapter, ws.verse) + ' · ' + (ws.b - ws.a + 1) + (ws.b === ws.a ? ' word' : ' words')
    : BOOK[S.book].name + ' ' + S.chapter + ':' + compactVerses([...S.selected].sort((x, y) => x - y));
}
function paintSel() {
  document.querySelectorAll('#reader .w.sel, #reader .v.sel').forEach(e => e.classList.remove('sel'));
  if (S.wsel) document.querySelectorAll('#reader .v[data-v="' + S.wsel.verse + '"] .w').forEach(el => {
    const i = +el.dataset.w; if (i >= S.wsel.a && i <= S.wsel.b) el.classList.add('sel');
  });
  S.selected.forEach(v => { const el = document.querySelector('#reader .v[data-v="' + v + '"]'); if (el) el.classList.add('sel'); });
  updateSelBar();
}
function clearSelection() { S.selected.clear(); S.wsel = null; paintSel(); if (GD.renderPending && !NE) { GD.renderPending = false; renderChapter(null, true); } }
function tapWord(v, i) {
  const w = S.wsel; S.selected.clear();
  if (!w || w.verse !== v) S.wsel = { verse: v, a: i, b: i, anchor: i };
  else if (w.a === w.b) S.wsel = (i === w.a) ? null : { verse: v, a: Math.min(w.anchor, i), b: Math.max(w.anchor, i), anchor: w.anchor };
  else S.wsel = { verse: v, a: i, b: i, anchor: i };
  paintSel();
}
function tapVerseNum(v) {
  S.wsel = null;
  if (S.selected.has(v)) S.selected.delete(v); else S.selected.add(v);
  paintSel();
}
/* what the toolbar acts on: a list of {verse, a, b} word ranges */
function selTargets() {
  if (S.wsel) return [{ verse: S.wsel.verse, a: S.wsel.a, b: S.wsel.b }];
  return [...S.selected].sort((x, y) => x - y).map(v => ({ verse: v, a: 0, b: wordsOf(rowOf(v)).length - 1 }));
}
function annFor(t, create) {
  let a = Ann.find(S.book, S.chapter, t.verse, t.a, t.b);
  if (!a && create) a = newAnn(S.book, S.chapter, t.verse, t.a, t.b, wordsOf(rowOf(t.verse)).slice(t.a, t.b + 1).join(' '));
  return a;
}
function afterChange() { clearSelection(); renderChapter(null, true); }
function applyHighlight(color) {
  const ts = selTargets(); if (!ts.length) return;
  const allHave = ts.every(t => { const a = annFor(t, false); return a && a.hl === color; });
  ts.forEach(t => {
    if (allHave) { const a = annFor(t, false); a.hl = null; finalize(a); }
    else { const a = annFor(t, true); a.hl = color; Ann.save(a); }
  });
  afterChange();
}
function toggleUnderline() {
  const ts = selTargets(); if (!ts.length) return;
  const allHave = ts.every(t => { const a = annFor(t, false); return a && a.ul; });
  ts.forEach(t => {
    if (allHave) { const a = annFor(t, false); a.ul = false; finalize(a); }
    else { const a = annFor(t, true); a.ul = true; Ann.save(a); }
  });
  afterChange();
}
/* remove highlight/underline from the chosen words, keeping the parts outside the selection */
function clearMarks() {
  const ts = selTargets(); let n = 0;
  ts.forEach(t => {
    Ann.forChapter(S.book, S.chapter).forEach(a => {
      if (a.verse !== t.verse || a.start === null || !(a.hl || a.ul) || a.end < t.a || a.start > t.b) return;
      const keep = [];
      if (a.start < t.a) keep.push([a.start, t.a - 1]);
      if (a.end > t.b) keep.push([t.b + 1, a.end]);
      const words = wordsOf(rowOf(a.verse));
      keep.forEach(([s, e]) => { const p = newAnn(a.book, a.chapter, a.verse, s, e, words.slice(s, e + 1).join(' ')); p.hl = a.hl; p.ul = a.ul; Ann.save(p); });
      a.hl = null; a.ul = false; finalize(a); n++;
    });
  });
  toast(n ? 'Highlight removed' : 'Nothing to clear there');
  afterChange();
}
function selectionText() {
  if (S.wsel) {
    const w = S.wsel, words = wordsOf(rowOf(w.verse)).slice(w.a, w.b + 1).join(' ');
    return '"' + words + '" — ' + refLabel(S.book, S.chapter, w.verse) + ' (KJV)';
  }
  const vs = [...S.selected].sort((a, b) => a - b);
  const map = {}; curVerses.forEach(r => map[r.verse] = r.text);
  const ref = BOOK[S.book].name + ' ' + S.chapter + ':' + compactVerses(vs);
  if (vs.length === 1) return '"' + map[vs[0]] + '" — ' + ref + ' (KJV)';
  return ref + ' (KJV)\n' + vs.map(v => v + ' ' + map[v]).join('\n');
}
function copyText(text) {
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); toast(ok ? 'Copied' : 'Could not copy');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied'), fallback);
  else fallback();
}
/* mouse drag across words (Mac / desktop) */
function dragSelect() {
  const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const r = sel.getRangeAt(0), rd = $('#reader');
  if (!rd.contains(r.commonAncestorContainer)) return;
  const hit = [...rd.querySelectorAll('.w')].filter(w => {
    if (!r.intersectsNode(w)) return false;
    const ec = r.endContainer, sc = r.startContainer;
    if (ec.nodeType === 3 && r.endOffset === 0 && w.contains(ec) && !w.contains(sc)) return false;
    if (sc.nodeType === 3 && r.startOffset >= sc.length && w.contains(sc) && !w.contains(ec)) return false;
    return true;
  });
  if (!hit.length) return;
  const vs = new Set(hit.map(w => +w.closest('.v').dataset.v));
  sel.removeAllRanges();
  if (vs.size > 1) { toast('Select words within one verse, or tap verse numbers for whole verses'); return; }
  const idx = hit.map(w => +w.dataset.w), v = [...vs][0];
  S.selected.clear(); S.wsel = { verse: v, a: Math.min(...idx), b: Math.max(...idx), anchor: Math.min(...idx) };
  paintSel();
}

/* ---------- note editor ---------- */
let NE = null;   // { ann, isNew }
function openNote(a, isNew) {
  if (!a) return;
  NE = { ann: a, isNew: !!isNew };
  let ref = refLabel(a.book, a.chapter, a.verse);
  if (a.verseEnd && a.verseEnd > a.verse) ref += '–' + a.verseEnd;
  $('#noteRef').textContent = ref;
  const q = a.text || '';
  $('#noteQuote').textContent = q.length > 220 ? q.slice(0, 220) + '…' : q;
  $('#noteQuote').classList.toggle('hidden', !q);
  $('#noteText').value = a.note || '';
  $('#noteDel').classList.toggle('hidden', isNew || !a.note);
  $('#noteSheet').classList.remove('hidden');
  setTimeout(() => { const t = $('#noteText'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 60);
}
function closeNote() { $('#noteSheet').classList.add('hidden'); NE = null; }
function saveNote() {
  if (!NE) return;
  const a = NE.ann, txt = $('#noteText').value.trim();
  if (NE.isNew && !txt) { closeNote(); return; }
  a.note = txt; finalize(a);
  closeNote(); clearSelection(); renderChapter(null, true);
  if (!$('#notesView').classList.contains('hidden')) renderNotes();
  toast(txt ? 'Note saved' : 'Note removed');
}
function deleteNote() {
  if (!NE || !confirm('Delete this note?')) return;
  const a = NE.ann; a.note = ''; finalize(a);
  closeNote(); renderChapter(null, true);
  if (!$('#notesView').classList.contains('hidden')) renderNotes();
  toast('Note deleted');
}
function noteFromSelection() {
  if (S.wsel) {
    const t = { verse: S.wsel.verse, a: S.wsel.a, b: S.wsel.b };
    const ex = annFor(t, false);
    openNote(ex || annFor(t, true), !ex || !ex.note);
    return;
  }
  const vs = [...S.selected].sort((x, y) => x - y); if (!vs.length) return;
  const v = vs[0], vEnd = vs.length > 1 ? vs[vs.length - 1] : null;
  let a = Ann.findVerseNote(S.book, S.chapter, v, vEnd), isNew = false;
  if (!a) {
    a = newAnn(S.book, S.chapter, v, null, null, vs.map(x => rowOf(x).text).join(' '));
    a.verseEnd = vEnd; isNew = true;
  }
  openNote(a, isNew || !a.note);
}

/* ---------- search ---------- */
const RESULT_PAGE = 100;
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parseTerms(q) {
  const terms = []; const re = /"([^"]+)"|(\S+)/g; let m;
  while ((m = re.exec(q))) {
    let t = (m[1] || m[2]).toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    if (t) terms.push(t);
  }
  return terms;
}
function runSearch(q) {
  q = q.trim();
  const box = $('#results');
  if (!q) { box.innerHTML = ''; return; }
  const terms = parseTerms(q);
  if (!terms.length) { box.innerHTML = '<div class="summary">Type a word or phrase.</div>'; return; }
  const whole = $('#wholeWord').checked;
  const like = terms.map(() => "(lower(text) like ? escape '\\' or replace(lower(text),'-','') like ? escape '\\')").join(' and ');
  const params = []; terms.forEach(t => { const p = '%' + t.replace(/[\\%_]/g, '\\$&') + '%'; params.push(p, p); });
  let sql = 'select id,book,chapter,verse,text from verses where ' + like;
  if (S.testament === 'OT') sql += ' and book<=39'; else if (S.testament === 'NT') sql += ' and book>=40';
  sql += ' order by id';
  let rows = all(sql, params);
  const tests = terms.map(t => new RegExp(whole ? '\\b' + escRe(t) + '\\b' : escRe(t), 'i'));
  rows = rows.filter(r => { const nh = r.text.replace(/-/g, ''); return tests.every(re => re.test(r.text) || re.test(nh)); });
  const hl = new RegExp('(' + terms.map(t => whole ? '\\b' + escRe(t) + '\\b' : escRe(t)).join('|') + ')', 'gi');
  S.lastSearch = { q, terms, rows, shown: 0, hl };
  let html = '';
  const bk = parseRef(q);
  if (bk && !q.match(/\d/)) html += '<button class="bookchip" data-open="' + bk.book + '">Open ' + esc(BOOK[bk.book].name) + ' →</button>';
  html += '<div class="summary">' + rows.length.toLocaleString() + (rows.length === 1 ? ' verse' : ' verses') + ' found' +
          (terms.length > 1 ? ' containing all of: ' + terms.map(esc).join(', ') : '') + '</div><div id="resList"></div><div id="moreWrap"></div>';
  box.innerHTML = html;
  box.scrollTop = 0;
  const chip = box.querySelector('.bookchip');
  if (chip) chip.onclick = () => { S.fromSearch = false; go(+chip.dataset.open, 1); };
  showMore();
}
function showMore() {
  const L = S.lastSearch; if (!L) return;
  const list = $('#resList'); const end = Math.min(L.rows.length, L.shown + RESULT_PAGE);
  let html = '';
  for (let i = L.shown; i < end; i++) {
    const r = L.rows[i];
    html += '<div class="result" data-i="' + i + '"><div class="ref">' + esc(refLabel(r.book, r.chapter, r.verse)) + '</div><div class="txt">' +
            esc(r.text).replace(L.hl, '<mark>$1</mark>') + '</div></div>';
  }
  list.insertAdjacentHTML('beforeend', html);
  L.shown = end;
  const wrap = $('#moreWrap');
  wrap.innerHTML = end < L.rows.length ? '<button class="more">Show ' + Math.min(RESULT_PAGE, L.rows.length - end) + ' more</button>' : '';
  const mb = wrap.querySelector('.more'); if (mb) mb.onclick = showMore;
}
function submitQuery() {
  const q = $('#q').value.trim(); if (!q) return;
  const ref = parseRef(q);
  if (ref && ref.chapter) {
    const bk = BOOK[ref.book];
    if (ref.chapter < 1 || ref.chapter > bk.chapters) { toast(bk.name + ' has ' + bk.chapters + ' chapters'); return; }
    S.fromSearch = false; S.lastSearch = null;
    let vs = null;
    if (ref.verse) { vs = []; const end = ref.verseEnd && ref.verseEnd >= ref.verse ? ref.verseEnd : ref.verse; for (let v = ref.verse; v <= end; v++) vs.push(v); }
    go(ref.book, ref.chapter, vs);
    return;
  }
  if (ref && !ref.chapter && normBook(q).length >= 3) {   // bare book name, e.g. "Jude" -> open chapter 1
    S.fromSearch = false; S.lastSearch = null; go(ref.book, 1); return;
  }
  runSearch(q);
  $('#q').blur();
}

/* ---------- cross-references & verse panel ---------- */
const vidOf = (b, c, v) => b * 1000000 + c * 1000 + v;
const idBook = id => Math.floor(id / 1000000), idCh = id => Math.floor(id / 1000) % 1000, idV = id => id % 1000;
const idLabel = id => refLabel(idBook(id), idCh(id), idV(id));
function rangeLabel(s, e) {
  if (s === e) return idLabel(s);
  if (idBook(s) !== idBook(e)) return idLabel(s) + ' – ' + idLabel(e);
  const bk = BOOK[idBook(s)].name;
  if (idCh(s) === idCh(e)) return bk + ' ' + idCh(s) + ':' + idV(s) + '–' + idV(e);
  return bk + ' ' + idCh(s) + ':' + idV(s) + '–' + idCh(e) + ':' + idV(e);
}
const Xr = {
  F: null, S: null, E: null, V: null,
  load() {
    if (this.F) return;
    const F = [], S = [], E = [], V = [];
    const st = db.prepare('select from_id,data from xref');
    while (st.step()) {
      const row = st.get(), f = row[0], blob = row[1]; let i = 0, prev = 0;
      const rv = () => { let x = 0, m = 1, b; do { b = blob[i++]; x += (b & 127) * m; m *= 128; } while (b & 128); return x; };
      while (i < blob.length) { const d = rv(), sp = rv(), v = rv(); prev += d; F.push(f); S.push(prev); E.push(prev + sp); V.push(v); }
    }
    st.free();
    this.F = Int32Array.from(F); this.S = Int32Array.from(S); this.E = Int32Array.from(E); this.V = Int32Array.from(V);
  },
  out(vid) { this.load(); const r = []; for (let i = 0; i < this.F.length; i++) if (this.F[i] === vid) r.push({ s: this.S[i], e: this.E[i], v: this.V[i], f: vid }); return r.sort((a, b) => b.v - a.v || a.s - b.s); },
  into(vid) { this.load(); const r = []; for (let i = 0; i < this.F.length; i++) if (this.S[i] <= vid && vid <= this.E[i]) r.push({ s: this.F[i], e: this.F[i], v: this.V[i], f: this.F[i] }); return r.sort((a, b) => b.v - a.v || a.s - b.s); }
};
const relDots = v => v >= 60 ? '●●●' : v >= 20 ? '●●○' : '●○○';
function previewHtml(s, e) {
  const rows = all('select id,verse,text from verses where id between ? and ? order by id limit 4', [s, e]);
  if (!rows.length) return '';
  let t = (s === e || rows.length === 1) ? rows[0].text : rows.slice(0, 3).map(r => r.verse + ' ' + r.text).join(' ');
  const more = (idBook(s) === idBook(e) && idCh(s) === idCh(e)) ? (e - s + 1) > 3 : rows.length > 3;
  if (t.length > 300) t = t.slice(0, 300).replace(/\s+\S*$/, '') + '…'; else if (more) t += ' …';
  return esc(t);
}
const P = { open: false, min: false, subject: null, tab: 'see', stack: [], shown: 30, data: null };
function subjId() { return vidOf(P.subject.book, P.subject.chapter, P.subject.verse); }
function panelData() {
  const id = subjId();
  const my = Lnk.from(id).map(l => ({ l, dir: 'out', s: l.toStart, e: l.toEnd })).concat(Lnk.to(id).filter(l => l.fromId !== id).map(l => ({ l, dir: 'in', s: l.fromId, e: l.fromId })));
  const notes = Ann.forChapter(P.subject.book, P.subject.chapter).filter(a => a.note && (a.verse === P.subject.verse || (a.verseEnd && a.verse <= P.subject.verse && P.subject.verse <= a.verseEnd)));
  return { see: Xr.out(id), cited: Xr.into(id), my, notes };
}
function setPanelVars() {
  const el = $('#panel');
  document.body.classList.toggle('panel-open', P.open);
  document.documentElement.style.setProperty('--panel-h', P.open && !isWide() ? el.offsetHeight + 'px' : '0px');
}
function openPanel(subject, keepStack) {
  P.subject = subject; if (!keepStack) P.stack = [];
  P.open = true; P.min = false; P.shown = 30;
  P.data = panelData();
  P.tab = P.data.see.length ? 'see' : P.data.cited.length ? 'cited' : P.data.my.length ? 'mine' : 'see';
  renderPanel();
}
function closePanel() { P.open = false; P.stack = []; $('#panel').classList.add('hidden'); setPanelVars(); }
function renderPanel(preserve) {
  if (!P.open || !P.subject) return;
  const el = $('#panel'), body = $('#pBody'), keepTop = preserve ? body.scrollTop : 0;
  el.classList.remove('hidden'); el.classList.toggle('min', P.min);
  P.data = panelData();
  const D = P.data, sj = P.subject, id = subjId();
  $('#pTitle').textContent = refLabel(sj.book, sj.chapter, sj.verse);
  $('#pMin').textContent = P.min ? '▴' : '▾';
  $('#pBack').classList.toggle('hidden', !P.stack.length);
  $('#pBack').textContent = '← Back' + (P.stack.length > 1 ? ' (' + P.stack.length + ')' : '');
  const vrow = one('select text from verses where id=?', [id]);
  $('#pVerse').textContent = vrow ? vrow.text : '';
  const tabs = [['see', 'See also', D.see.length], ['cited', 'Cited by', D.cited.length], ['mine', 'My links', D.my.length], ['notes', 'Notes', D.notes.length]];
  $('#pTabs').innerHTML = tabs.map(t => '<button class="chip' + (P.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[2] ? ' ' + t[2] : '') + '</button>').join('');
  let html = '';
  if (P.tab === 'see' || P.tab === 'cited') {
    const list = P.tab === 'see' ? D.see : D.cited, n = Math.min(list.length, P.shown);
    if (!list.length) html = '<div class="empty">' + (P.tab === 'see' ? 'No cross-references from this verse.' : 'No other verse points here.') + '</div>';
    else {
      html += '<div class="phint"><span>' + list.length + (P.tab === 'see' ? ' passages this verse points to' : ' verses that point here') + ', best first</span><button id="pCopy" class="linkbtn">Copy list</button></div>';
      for (let i = 0; i < n; i++) {
        const x = list[i];
        html += '<div class="xi" data-s="' + x.s + '" data-e="' + x.e + '"><div class="xr"><span>' + esc(rangeLabel(x.s, x.e)) + '</span><span class="rel" title="Community relevance">' + relDots(x.v) + '</span></div><div class="xt">' + previewHtml(x.s, x.e) + '</div></div>';
      }
      if (n < list.length) html += '<button class="more" data-more="1">Show ' + Math.min(30, list.length - n) + ' more</button>';
    }
  } else if (P.tab === 'mine') {
    if (!D.my.length) html += '<div class="empty small">You have not linked anything to this verse yet.</div>';
    D.my.forEach(m => {
      html += '<div class="xi mine" data-s="' + m.s + '" data-e="' + m.e + '"><div class="xr"><span>' + (m.dir === 'out' ? '→ ' : '← linked from ') + esc(rangeLabel(m.s, m.e)) +
        '</span><button class="linkbtn" data-dellink="' + m.l.id + '">Remove</button></div><div class="xt">' + previewHtml(m.s, m.e) + '</div>' +
        (m.l.note ? '<div class="xn">' + esc(m.l.note) + '</div>' : '') + '</div>';
    });
    html += '<div class="padd"><div class="ptitle3">Link ' + esc(refLabel(sj.book, sj.chapter, sj.verse)) + ' to another passage</div>' +
      '<input id="pRef" type="text" placeholder="Type a reference, e.g. Rom 5:8 or Isa 53:4-6" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<input id="pLabel" type="text" placeholder="Why? (optional note)" autocomplete="off">' +
      '<div class="prow"><button id="pAddBtn" class="pill primary">Add link</button><button id="pLinkSel" class="pill" disabled>Link to selected verses</button></div>' +
      '<div class="phint2">Tip: you can also browse anywhere in the text, tap verse numbers, and press "Link to selected verses".</div></div>';
  } else {
    if (!D.notes.length) html += '<div class="empty small">No notes on this verse yet.</div>';
    D.notes.forEach(a => {
      html += '<div class="ncard" data-editann="' + a.id + '"><div class="nref">' + esc(annLabel(a)) + (a.hl ? ' <span class="dot hl-' + a.hl + '"></span>' : '') + '</div>' + (a.text && a.start !== null ? '<div class="nq">' + esc(a.text) + '</div>' : '') +
        '<div class="nt">' + esc(a.note) + '</div><div class="nact"><button>Edit note</button></div></div>';
    });
    html += '<div class="padd"><button id="pAddNote" class="pill primary">＋ Add a note on ' + esc(refLabel(sj.book, sj.chapter, sj.verse)) + '</button></div>';
  }
  $('#pList').innerHTML = html;
  body.scrollTop = keepTop;
  updateLinkBtn(); setPanelVars();
  if (!preserve && !isWide()) {   // keep the chosen verse visible above the panel
    const sv = document.querySelector('#reader .v[data-v="' + sj.verse + '"]');
    if (sv) { const rd = $('#reader'); rd.scrollTop += sv.getBoundingClientRect().top - rd.getBoundingClientRect().top - 12; }
  }
}
function updateLinkBtn() {
  const b = $('#pLinkSel'); if (!b || !P.open) return;
  const sel = selectedTargets();
  b.disabled = !sel.length;
  b.textContent = sel.length ? 'Link to ' + sel.map(t => rangeLabel(t.s, t.e)).join('; ') : 'Link to selected verses';
}
/* verses currently selected in the text, grouped into contiguous passages */
function selectedTargets() {
  let vs = S.wsel ? [S.wsel.verse] : [...S.selected].sort((a, b) => a - b);
  const out = []; let i = 0;
  while (i < vs.length) { let j = i; while (j + 1 < vs.length && vs[j + 1] === vs[j] + 1) j++; out.push({ s: vidOf(S.book, S.chapter, vs[i]), e: vidOf(S.book, S.chapter, vs[j]) }); i = j + 1; }
  return out;
}
function panelGo(s, e) {
  P.stack.push(P.subject);
  const b = idBook(s), c = idCh(s), v = idV(s), vs = [];
  if (idBook(e) === b && idCh(e) === c) for (let x = v; x <= idV(e); x++) vs.push(x); else vs.push(v);
  S.fromSearch = false; go(b, c, vs);
  openPanel({ book: b, chapter: c, verse: v }, true);
}
function panelBack() {
  const prev = P.stack.pop(); if (!prev) return;
  S.fromSearch = false; go(prev.book, prev.chapter, [prev.verse]);
  openPanel(prev, true);
}
function parseTarget(str) {
  const r = parseRef(str);
  if (!r || !r.chapter) return { err: 'Type a reference such as Rom 5:8, Isa 53:4-6 or Ps 23' };
  const bk = BOOK[r.book];
  if (r.chapter < 1 || r.chapter > bk.chapters) return { err: bk.name + ' has only ' + bk.chapters + ' chapters' };
  const maxV = one('select max(verse) m from verses where book=? and chapter=?', [r.book, r.chapter]).m;
  let vs = r.verse || 1, ve = r.verse ? (r.verseEnd || r.verse) : maxV;
  if (vs > maxV) return { err: bk.name + ' ' + r.chapter + ' has only ' + maxV + ' verses' };
  if (ve > maxV) ve = maxV; if (ve < vs) ve = vs;
  return { s: vidOf(r.book, r.chapter, vs), e: vidOf(r.book, r.chapter, ve) };
}
function addLink(s, e, note) {
  const f = subjId();
  if (s <= f && f <= e) { toast('That passage includes the verse itself'); return false; }
  if (Lnk.exists(f, s, e)) { toast('You already linked that'); return false; }
  const now = Date.now();
  Lnk.save({ id: uid(), fromId: f, toStart: s, toEnd: e, note: (note || '').trim().slice(0, 2000), created: now, updated: now, del: false });
  return true;
}
function panelClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]'); if (tab) { P.tab = tab.dataset.tab; P.shown = 30; renderPanel(); return; }
  if (t.closest('#pCopy')) {
    const list = (P.tab === 'see' ? P.data.see : P.data.cited).slice(0, 40).map(x => rangeLabel(x.s, x.e));
    copyText(refLabel(P.subject.book, P.subject.chapter, P.subject.verse) + (P.tab === 'see' ? ' — see also: ' : ' — cited by: ') + list.join('; ')); return;
  }
  if (t.closest('[data-more]')) { P.shown += 30; renderPanel(true); return; }
  const dl = t.closest('[data-dellink]');
  if (dl) { if (confirm('Remove this link?')) { const l = Lnk.map.get(dl.dataset.dellink); if (l) Lnk.remove(l); renderPanel(true); } return; }
  if (t.closest('#pAddBtn')) {
    const r = parseTarget($('#pRef').value); if (r.err) { toast(r.err); return; }
    if (addLink(r.s, r.e, $('#pLabel').value)) { toast('Link added'); renderPanel(true); }
    return;
  }
  if (t.closest('#pLinkSel')) {
    const ts = selectedTargets(); let n = 0;
    ts.forEach(x => { if (addLink(x.s, x.e, $('#pLabel').value)) n++; });
    if (n) { toast(n === 1 ? 'Link added' : n + ' links added'); clearSelection(); renderPanel(true); }
    return;
  }
  if (t.closest('#pAddNote')) {
    const sj = P.subject, a = newAnn(sj.book, sj.chapter, sj.verse, null, null, (one('select text from verses where id=?', [subjId()]) || {}).text);
    openNote(a, true); return;
  }
  const ea = t.closest('[data-editann]'); if (ea) { openNote(Ann.map.get(ea.dataset.editann), false); return; }
  const xi = t.closest('.xi'); if (xi) panelGo(+xi.dataset.s, +xi.dataset.e);
}
function wirePanel() {
  $('#panel').addEventListener('click', panelClick);
  $('#panel').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'pRef' || e.target.id === 'pLabel')) { e.preventDefault(); $('#pAddBtn').click(); } });
  $('#pClose').onclick = closePanel;
  $('#pBack').onclick = panelBack;
  $('#pMin').onclick = () => { P.min = !P.min; renderPanel(true); };
  $('#refsBtn').onclick = () => {
    const sj = S.wsel ? S.wsel.verse : [...S.selected].sort((a, b) => a - b)[0];
    if (!sj) return;
    clearSelection(); openPanel({ book: S.book, chapter: S.chapter, verse: sj }, false);
  };
}

/* ---------- my notes & highlights ---------- */
const NV = { filter: 'all', q: '', shown: 0, rows: [] };
function refCount() { return Ann.live().length + Lnk.live().length; }
function refreshCounts() {
  const n = refCount(), el = $('#notesCount'); if (el) el.textContent = n ? '(' + n + ')' : '';
}
function annLabel(a) {
  let ref = refLabel(a.book, a.chapter, a.verse);
  if (a.verseEnd && a.verseEnd > a.verse) ref += '–' + a.verseEnd;
  return ref;
}
function daysAgo(ts) { return Math.floor((Date.now() - ts) / 86400000); }
function noteRows() {
  const rows = [];
  Ann.live().forEach(a => rows.push({ k: 'a', o: a, key: [a.book, a.chapter, a.verse, a.start === null ? -1 : a.start] }));
  Lnk.live().forEach(l => rows.push({ k: 'l', o: l, key: [idBook(l.fromId), idCh(l.fromId), idV(l.fromId), 9999] }));
  return rows.sort((x, y) => { for (let i = 0; i < 4; i++) if (x.key[i] !== y.key[i]) return x.key[i] - y.key[i]; return 0; });
}
function renderNotes() {
  const all_ = noteRows(), q = NV.q.trim().toLowerCase();
  NV.rows = all_.filter(r => {
    const a = r.o;
    const okf = NV.filter === 'all' || (NV.filter === 'notes' && r.k === 'a' && a.note) || (NV.filter === 'hl' && r.k === 'a' && (a.hl || a.ul)) || (NV.filter === 'links' && r.k === 'l');
    if (!okf) return false;
    if (!q) return true;
    const hay = r.k === 'a' ? a.note + ' ' + a.text + ' ' + annLabel(a) : a.note + ' ' + idLabel(a.fromId) + ' ' + rangeLabel(a.toStart, a.toEnd);
    return hay.toLowerCase().indexOf(q) >= 0;
  });
  NV.shown = 0;
  $('#nList').innerHTML = ''; showMoreNotes();
  document.querySelectorAll('#nFilters .chip').forEach(c => c.classList.toggle('on', c.dataset.f === NV.filter));
  $('#nSummary').textContent = NV.rows.length + (NV.rows.length === 1 ? ' item' : ' items') + (q || NV.filter !== 'all' ? ' shown' : ' saved on this device');
  const last = store.get('lastBackup', 0), n = all_.length;
  const stale = n > 0 && (!last || daysAgo(last) >= 14);
  $('#backupInfo').textContent = !n ? 'Nothing to back up yet.' : !last ? 'You have not made a backup yet.' : 'Last backup: ' + (daysAgo(last) === 0 ? 'today' : daysAgo(last) + ' day(s) ago') + '.';
  $('#backupInfo').classList.toggle('warn', stale);
}
function showMoreNotes() {
  const end = Math.min(NV.rows.length, NV.shown + 100); let html = '';
  for (let i = NV.shown; i < end; i++) {
    const r = NV.rows[i], a = r.o;
    if (r.k === 'l') {
      html += '<div class="ncard" data-k="l" data-id="' + a.id + '"><div class="nref">' + esc(idLabel(a.fromId)) + ' → ' + esc(rangeLabel(a.toStart, a.toEnd)) + ' <span class="badge">link</span></div>' +
        '<div class="nq">' + previewHtml(a.toStart, a.toEnd) + '</div>' + (a.note ? '<div class="nt">' + esc(a.note) + '</div>' : '') + '</div>';
      continue;
    }
    const dots = (a.hl ? '<span class="dot hl-' + a.hl + '"></span>' : '') + (a.ul ? '<span class="ulmark">U</span>' : '');
    const q = a.text ? (a.text.length > 160 ? a.text.slice(0, 160) + '…' : a.text) : '';
    html += '<div class="ncard" data-k="a" data-id="' + a.id + '"><div class="nref">' + esc(annLabel(a)) + ' ' + dots + '</div>' +
      (q ? '<div class="nq' + (a.hl ? ' hl-' + a.hl : '') + '">' + esc(q) + '</div>' : '') +
      (a.note ? '<div class="nt">' + esc(a.note) + '</div>' : '') +
      '<div class="nact"><button data-edit="1">' + (a.note ? 'Edit note' : 'Add note') + '</button></div></div>';
  }
  $('#nList').insertAdjacentHTML('beforeend', html); NV.shown = end;
  $('#nMore').innerHTML = end < NV.rows.length ? '<button class="more">Show more</button>' : '';
  const mb = $('#nMore .more'); if (mb) mb.onclick = showMoreNotes;
  if (!NV.rows.length) $('#nList').innerHTML = '<div class="empty">Nothing here yet.<br>Tap a word in the text, or a verse number, then choose a colour, Note or Refs.</div>';
}
function openNotes() { renderNotes(); showView('notes'); if (!isWide()) closeTree(); }

function cleanAnn(a) {
  if (!a || typeof a.id !== 'string' || !a.id || !(a.book >= 1 && a.book <= 66) || !(a.chapter >= 1) || !(a.verse >= 1)) return null;
  const numOrNull = x => (typeof x === 'number' && isFinite(x) ? x : null);
  return {
    id: a.id.slice(0, 64), book: a.book | 0, chapter: a.chapter | 0, verse: a.verse | 0,
    verseEnd: numOrNull(a.verseEnd), start: numOrNull(a.start), end: numOrNull(a.end),
    hl: HL_COLORS.indexOf(a.hl) >= 0 ? a.hl : null, ul: !!a.ul,
    note: typeof a.note === 'string' ? a.note.slice(0, 20000) : '', text: typeof a.text === 'string' ? a.text.slice(0, 2000) : '',
    created: numOrNull(a.created) || Date.now(), updated: numOrNull(a.updated) || 0, del: !!a.del
  };
}
function cleanLink(a) {
  const ok = id => typeof id === 'number' && id >= 1001001 && id <= 66022021 && one('select 1 x from verses where id=?', [id]);
  if (!a || typeof a.id !== 'string' || !a.id || !ok(a.fromId) || !ok(a.toStart) || !ok(a.toEnd) || a.toEnd < a.toStart) return null;
  return { id: a.id.slice(0, 64), fromId: a.fromId, toStart: a.toStart, toEnd: a.toEnd, note: typeof a.note === 'string' ? a.note.slice(0, 2000) : '',
    created: typeof a.created === 'number' ? a.created : Date.now(), updated: typeof a.updated === 'number' ? a.updated : 0, del: !!a.del };
}
function payload() {
  return { app: 'kjv-reader', format: 1, text: 'KJV 1769 (eBible.org)', exported: new Date().toISOString(), annotations: [...Ann.map.values()], crossrefs: [...Lnk.map.values()] };
}
/* Merge a backup / cloud file into this device: newest change wins, deletions travel as tombstones. */
function mergeData(data) {
  const arr = Array.isArray(data) ? data : (data && data.annotations);
  const larr = (data && !Array.isArray(data) && Array.isArray(data.crossrefs)) ? data.crossrefs : [];
  if (!Array.isArray(arr)) return null;
  const r = { added: 0, updated: 0, same: 0, bad: 0, needsUpload: false, changed: false };
  const remoteA = new Map(), remoteL = new Map();
  arr.forEach(raw => {
    const a = cleanAnn(raw); if (!a) { r.bad++; return; }
    remoteA.set(a.id, a.updated);
    const cur = Ann.map.get(a.id);
    if (!cur) { Ann.put(a); r.changed = true; if (!a.del) r.added++; }
    else if (a.updated > (cur.updated || 0)) { Ann.put(a); r.changed = true; if (!a.del) r.updated++; }
    else if (!a.del) r.same++;
  });
  larr.forEach(raw => {
    const l = cleanLink(raw); if (!l) { r.bad++; return; }
    remoteL.set(l.id, l.updated);
    const cur = Lnk.map.get(l.id);
    if (!cur) { Lnk.put(l); r.changed = true; if (!l.del) r.added++; }
    else if (l.updated > (cur.updated || 0)) { Lnk.put(l); r.changed = true; if (!l.del) r.updated++; }
    else if (!l.del) r.same++;
  });
  for (const a of Ann.map.values()) { const ru = remoteA.get(a.id); if (ru === undefined || a.updated > ru) { r.needsUpload = true; break; } }
  if (!r.needsUpload) for (const l of Lnk.map.values()) { const ru = remoteL.get(l.id); if (ru === undefined || l.updated > ru) { r.needsUpload = true; break; } }
  return r;
}
async function exportNotes() {
  const data = payload();
  const name = 'kjv-notes-' + new Date().toISOString().slice(0, 10) + '.json';
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  try {
    if (window.matchMedia('(pointer:coarse)').matches && navigator.canShare) {
      const f = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'KJV notes backup' }); store.set('lastBackup', Date.now()); renderNotes(); return; }
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  store.set('lastBackup', Date.now()); renderNotes(); toast('Backup saved as ' + name);
}
async function importNotes(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('That file is not a valid backup'); return; }
  const r = mergeData(data);
  if (!r) { toast('No notes found in that file'); return; }
  renderChapter(null, true); renderNotes();
  toast('Imported: ' + r.added + ' new, ' + r.updated + ' updated, ' + r.same + ' already here' + (r.bad ? ', ' + r.bad + ' skipped' : ''));
  gdDirty();
}

/* ---------- views ---------- */
function showView(v) {
  $('#readView').classList.toggle('hidden', v !== 'read');
  $('#searchView').classList.toggle('hidden', v !== 'search');
  $('#notesView').classList.toggle('hidden', v !== 'notes');
}
function openSearch() { showView('search'); const q = $('#q'); q.focus(); q.select(); }

/* ---------- contents tree ---------- */
const DIVISIONS = [
  { t: 'OT', name: 'Old Testament', groups: [
    ['The Law', 1, 5], ['History', 6, 17], ['Poetry & Wisdom', 18, 22], ['Major Prophets', 23, 27], ['Minor Prophets', 28, 39]] },
  { t: 'NT', name: 'New Testament', groups: [
    ['Gospels', 40, 43], ['History', 44, 44], ["Paul's Epistles", 45, 58], ['General Epistles', 59, 65], ['Prophecy', 66, 66]] }
];
const T = { open: new Set(), focusVerses: null, filter: '' };
const isWide = () => window.matchMedia('(min-width: 900px)').matches;
function revealCurrent() {
  const b = S.book;
  [...T.open].forEach(k => { if (k[0] === 'b') T.open.delete(k); });   // keep only the current book expanded
  DIVISIONS.forEach(d => d.groups.forEach(g => { if (b >= g[1] && b <= g[2]) { T.open.add(d.t); T.open.add(d.t + ':' + g[0]); } }));
  T.open.add('b' + b);
}
function treeVisible() { return isWide() ? !document.body.classList.contains('tree-hidden') : $('#tree').classList.contains('open'); }
function renderTree() {
  const body = $('#treeBody'); if (!body || !db || !treeVisible()) return;
  const keep = body.scrollTop, f = T.filter.trim().toLowerCase();
  let html = '';
  DIVISIONS.forEach(d => {
    let inner = '';
    d.groups.forEach(g => {
      let books = '';
      for (let i = g[1]; i <= g[2]; i++) {
        if (f && BOOK[i].name.toLowerCase().indexOf(f) < 0) continue;
        const isOpen = f ? false : T.open.has('b' + i), cur = i === S.book;
        books += '<div class="tnode book' + (cur ? ' cur' : '') + '"><button class="trow" data-tog="b' + i + '" data-book="' + i + '"><span class="car">' +
                 (isOpen ? '▾' : '▸') + '</span>' + esc(BOOK[i].name) + '</button>';
        if (isOpen) {
          books += '<div class="chgrid">';
          for (let c = 1; c <= BOOK[i].chapters; c++) books += '<button data-ch="' + c + '" data-book="' + i + '" class="' + (cur && c === S.chapter ? 'on' : '') + '">' + c + '</button>';
          books += '</div>';
          if (cur) {
            const n = curVerses.length;
            books += '<div class="vlabel">Verses in ' + esc(BOOK[i].name) + ' ' + S.chapter + '</div><div class="chgrid vgrid">';
            for (let v = 1; v <= n; v++) books += '<button data-vs="' + v + '" class="' + (T.focusVerses && T.focusVerses.indexOf(v) >= 0 ? 'on' : '') + '">' + v + '</button>';
            books += '</div>';
          }
        }
        books += '</div>';
      }
      if (!books) return;
      const gk = d.t + ':' + g[0], gopen = f ? true : T.open.has(gk);
      inner += '<div class="tnode group"><button class="trow" data-tog="' + gk + '"><span class="car">' + (gopen ? '▾' : '▸') + '</span>' + esc(g[0]) + '</button>' + (gopen ? '<div class="tkids">' + books + '</div>' : '') + '</div>';
    });
    if (!inner) return;
    const dopen = f ? true : T.open.has(d.t);
    html += '<div class="tnode test"><button class="trow" data-tog="' + d.t + '"><span class="car">' + (dopen ? '▾' : '▸') + '</span>' + d.name + '</button>' + (dopen ? '<div class="tkids">' + inner + '</div>' : '') + '</div>';
  });
  body.innerHTML = html || '<div class="summary">No book matches.</div>';
  body.scrollTop = keep;
}
function openTree() {
  revealCurrent();
  if (isWide()) { document.body.classList.remove('tree-hidden'); store.set('treeWide', true); }
  else { $('#tree').classList.add('open'); $('#treeScrim').classList.remove('hidden'); }
  renderTree();
  const cur = $('#treeBody .book.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
}
function closeTree() {
  if (isWide()) { document.body.classList.add('tree-hidden'); store.set('treeWide', false); }
  else { $('#tree').classList.remove('open'); $('#treeScrim').classList.add('hidden'); }
}
function toggleTree() { treeVisible() ? closeTree() : openTree(); }
function wireTree() {
  $('#treeBtn').onclick = toggleTree;
  $('#titleBtn').onclick = openTree;
  $('#treeClose').onclick = closeTree;
  $('#treeScrim').onclick = closeTree;
  $('#treeFilter').oninput = e => { T.filter = e.target.value; renderTree(); };
  $('#treeBody').addEventListener('click', e => {
    const chb = e.target.closest('[data-ch]');
    if (chb) { S.fromSearch = false; T.filter = ''; $('#treeFilter').value = ''; go(+chb.dataset.book, +chb.dataset.ch); return; }
    const vb = e.target.closest('[data-vs]');
    if (vb) { S.fromSearch = false; go(S.book, S.chapter, [+vb.dataset.vs]); if (!isWide()) closeTree(); return; }
    const row = e.target.closest('[data-tog]');
    if (row) {
      const k = row.dataset.tog;
      if (T.filter) { const bk = +row.dataset.book; if (bk) { T.filter = ''; $('#treeFilter').value = ''; T.open.add('b' + bk); [['OT', 1, 39], ['NT', 40, 66]].forEach(x => { if (bk >= x[1] && bk <= x[2]) T.open.add(x[0]); }); DIVISIONS.forEach(d => d.groups.forEach(g => { if (bk >= g[1] && bk <= g[2]) T.open.add(d.t + ':' + g[0]); })); renderTree(); const el = $('#treeBody [data-tog="b' + bk + '"]'); if (el) el.scrollIntoView({ block: 'start' }); } return; }
      T.open.has(k) ? T.open.delete(k) : T.open.add(k);
      renderTree();
    }
  });
}

/* ---------- display settings ---------- */
function applyDisplay() {
  document.documentElement.style.setProperty('--fs', store.get('fs', 20) + 'px');
  document.documentElement.dataset.theme = store.get('theme', 'auto');
  const meta = document.querySelector('meta[name=theme-color]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim(); if (meta && bg) meta.content = bg;
  $('#fontSize').value = store.get('fs', 20);
  $('#themeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.th === store.get('theme', 'auto')));
  $('#layoutSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.ly === store.get('layout', 'flow')));
  $('#italSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.it === store.get('ital', 1)));
  const ch = document.querySelector('.chapter'); if (ch) ch.classList.toggle('noital', !store.get('ital', 1));
}

/* ---------- wiring ---------- */
function wire() {
  $('#prevBtn').onclick = () => step(-1);
  $('#nextBtn').onclick = () => step(1);
  $('#searchBtn').onclick = openSearch;
  $('#searchClose').onclick = () => showView('read');
  $('#goBtn').onclick = submitQuery;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') submitQuery(); });
  $('#wholeWord').onchange = () => { if (S.lastSearch) runSearch(S.lastSearch.q); };
  document.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); ch.classList.add('on');
    S.testament = ch.dataset.t; if (S.lastSearch) runSearch(S.lastSearch.q);
  });
  $('#results').addEventListener('click', e => {
    const r = e.target.closest('.result'); if (!r) return;
    const row = S.lastSearch.rows[+r.dataset.i];
    S.fromSearch = true; go(row.book, row.chapter, [row.verse]);
  });
  $('#backToResults').onclick = () => { showView('search'); };
  $('#settingsBtn').onclick = () => { $('#settings').classList.remove('hidden'); fillAbout(); };
  $('#settingsClose').onclick = () => $('#settings').classList.add('hidden');
  $('#settings').onclick = e => { if (e.target.id === 'settings') $('#settings').classList.add('hidden'); };
  $('#fontSize').oninput = e => { store.set('fs', +e.target.value); applyDisplay(); };
  $('#themeSeg').onclick = e => { const t = e.target.dataset.th; if (t) { store.set('theme', t); applyDisplay(); } };
  $('#layoutSeg').onclick = e => { const t = e.target.dataset.ly; if (t) { store.set('layout', t); applyDisplay(); renderChapter(null, true); } };
  $('#italSeg').onclick = e => { const t = e.target.dataset.it; if (t !== undefined) { store.set('ital', +t); applyDisplay(); } };

  $('#reader').addEventListener('click', e => {
    const nm = e.target.closest('.nmark'); if (nm) { openNote(Ann.map.get(nm.dataset.a), false); return; }
    const vn = e.target.closest('sup.vn'); if (vn) { tapVerseNum(+vn.closest('.v').dataset.v); return; }
    const w = e.target.closest('.w'); if (w) { if (window.getSelection().isCollapsed) tapWord(+w.closest('.v').dataset.v, +w.dataset.w); }
  });
  $('#reader').addEventListener('mouseup', e => { if (e.button === 0 && e.detail < 2) setTimeout(dragSelect, 0); });
  $('#reader').addEventListener('dblclick', () => setTimeout(dragSelect, 0));
  document.querySelectorAll('#selBar .sw').forEach(b => b.onclick = () => applyHighlight(b.dataset.c));
  $('#ulBtn').onclick = toggleUnderline;
  $('#noteBtn').onclick = noteFromSelection;
  $('#unmarkBtn').onclick = clearMarks;
  $('#copyBtn').onclick = () => copyText(selectionText());
  $('#clearBtn').onclick = clearSelection;
  $('#noteClose').onclick = closeNote;
  $('#noteSave').onclick = saveNote;
  $('#noteDel').onclick = deleteNote;
  $('#noteSheet').onclick = e => { if (e.target.id === 'noteSheet') closeNote(); };
  $('#notesBtn').onclick = openNotes;
  $('#notesBack').onclick = () => showView('read');
  $('#nQ').oninput = e => { NV.q = e.target.value; renderNotes(); };
  $('#nFilters').onclick = e => { const f = e.target.dataset.f; if (f) { NV.filter = f; renderNotes(); } };
  $('#nList').addEventListener('click', e => {
    const card = e.target.closest('.ncard'); if (!card) return;
    if (card.dataset.k === 'l') {
      const l = Lnk.map.get(card.dataset.id); if (!l) return;
      S.fromSearch = false; go(idBook(l.fromId), idCh(l.fromId), [idV(l.fromId)]);
      openPanel({ book: idBook(l.fromId), chapter: idCh(l.fromId), verse: idV(l.fromId) }, false); P.tab = 'mine'; renderPanel(); return;
    }
    const a = Ann.map.get(card.dataset.id); if (!a) return;
    if (e.target.closest('[data-edit]')) { openNote(a, !a.note); return; }
    S.fromSearch = false; go(a.book, a.chapter, [a.verse]);
  });
  $('#exportBtn').onclick = exportNotes;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importNotes(f); };

  // swipe between chapters
  let x0 = null, y0 = null;
  const rd = $('#reader');
  rd.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  rd.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 45) step(dx > 0 ? -1 : 1);
  }, { passive: true });
  // keyboard
  document.addEventListener('keydown', e => {
    if (!$('#noteSheet').classList.contains('hidden')) { if (e.key === 'Escape') closeNote(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') { showView('read'); } return; }
    if (!$('#readView').classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === '/') { e.preventDefault(); openSearch(); }
    } else if (e.key === 'Escape') showView('read');
  });
}

function tokenCheck() {
  const rows = all('select id,text,marked from verses'); let bad = 0;
  rows.forEach(r => { const n = verseLines(r).reduce((t, l) => t + l.length, 0); if (n !== wordsOf(r).length) bad++; });
  return { verses: rows.length, mismatched: bad };
}
/* ---------- install, offline & updates ---------- */
const APP_VERSION = 'Stage 5 · build 233a72ca';
const PWA = { reg: null, updating: false, installEvt: null };
const isHttp = /^https?:$/.test(location.protocol);
const isStandalone = () => (window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function showUpdateBar() { $('#updateBar').classList.remove('hidden'); }
function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); PWA.installEvt = e; });
  window.addEventListener('appinstalled', () => { PWA.installEvt = null; toast('Installed'); });
  $('#updateBtn').onclick = () => {
    const w = PWA.reg && PWA.reg.waiting; $('#updateBar').classList.add('hidden');
    if (w) { PWA.updating = true; w.postMessage('SKIP_WAITING'); } else location.reload();
  };
  $('#updateLater').onclick = () => $('#updateBar').classList.add('hidden');
  if (!('serviceWorker' in navigator) || !isHttp) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (PWA.updating && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    PWA.reg = reg;
    const watch = w => w.addEventListener('statechange', () => {
      if (w.state === 'installed') { if (navigator.serviceWorker.controller) showUpdateBar(); else toast('Ready to use offline'); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar();
    if (reg.installing) watch(reg.installing);
    reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg.installing); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}
async function fillAbout() {
  $('#aVersion').textContent = APP_VERSION;
  $('#aOffline').textContent = !isHttp ? 'Not yet. You are running from a file. Host the app online to install it and use it offline.'
    : (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'Ready. Works without internet.' : 'Preparing an offline copy… (keep this open on Wi-Fi)';
  const inst = $('#aInstall');
  if (isStandalone()) inst.textContent = 'Installed';
  else if (PWA.installEvt) { inst.innerHTML = '<button id="aInstallBtn" class="pill">Install app</button>'; $('#aInstallBtn').onclick = async () => { PWA.installEvt.prompt(); try { await PWA.installEvt.userChoice; } catch (e) {} PWA.installEvt = null; fillAbout(); }; }
  else if (!isHttp) inst.textContent = 'Available once hosted online';
  else if (isIOS()) inst.textContent = 'In Safari: Share button, then Add to Home Screen';
  else inst.textContent = 'Use your browser menu: Install app / Add to Dock';
  let st = 'Saved in this browser';
  try { if (navigator.storage && navigator.storage.persisted) st += (await navigator.storage.persisted()) ? ' (protected from automatic clearing)' : ' (not guaranteed: export backups now and then)'; } catch (e) {}
  $('#aStorage').textContent = st;
  $('#aCheck').onclick = async () => {
    const m = $('#aCheckMsg');
    if (!PWA.reg) { m.textContent = isHttp ? 'Offline engine not ready yet.' : 'Only works once hosted online.'; return; }
    m.textContent = 'Checking…';
    try { await PWA.reg.update(); setTimeout(() => { m.textContent = (PWA.reg.waiting || PWA.reg.installing) ? 'A new version is on its way.' : 'You have the latest version.'; }, 1200); } catch (e) { m.textContent = 'Could not check (are you online?)'; }
  };
}

/* ---------- Google Drive sync ---------- */
const CFG = window.KJV_CONFIG || {};
const GD = {
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  FILE: 'KJV Reader notes (sync).json',
  clientId: CFG.googleClientId || store.get('gclient', ''),
  baked: !!CFG.googleClientId,
  enabled: !!store.get('gsync', false),
  token: null, exp: 0, last: store.get('glast', 0),
  state: 'idle', msg: '', busy: false, dirty: false, timer: null, delay: 6000, retryT: null, retryMs: 30000,
  client: null, clientFor: null, pending: null, gisLoading: null, renderPending: false, canAlt: false, nagged: false
};
{ const t = store.get('gtoken', null); if (t && t.t && t.exp > Date.now()) { GD.token = t.t; GD.exp = t.exp; } }
const gdAvailable = () => isHttp && typeof fetch === 'function';
const gdTokenValid = () => !!GD.token && Date.now() < GD.exp;
const validClientId = s => /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test((s || '').trim());
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' day(s) ago';
}
function gdStatusText() {
  if (!gdAvailable()) return 'Available once the app is hosted online.';
  if (!GD.clientId) return 'Not set up.';
  if (!GD.enabled) return 'Not connected.';
  if (GD.state === 'syncing') return 'Syncing…';
  if (GD.state === 'error') return 'Problem: ' + GD.msg;
  if (GD.state === 'offline') return 'Offline. Changes are kept and will sync when you are back online.';
  const last = GD.last ? ' Last synced ' + ago(GD.last) + '.' : '';
  if (!gdTokenValid()) return (GD.dirty ? 'Changes waiting. ' : '') + 'Tap Sync now to sign in with Google.' + last;
  return 'Connected.' + last;
}
function gdPaint() {
  const b = $('#syncBtn'); if (!b) return;
  const on = gdAvailable() && GD.enabled && !!GD.clientId;
  b.classList.toggle('hidden', !on);
  document.querySelector('#readView .bar').classList.toggle('has-sync', on);
  const cls = GD.state === 'syncing' ? 'busy' : GD.state === 'error' ? 'err' : (GD.state === 'offline' || !gdTokenValid()) ? 'warn' : 'ok';
  b.className = 'icon sync ' + cls + (on ? '' : ' hidden');
  b.title = gdStatusText();
  if ($('#gStatus')) $('#gStatus').textContent = gdStatusText();
  if ($('#gNotesStatus')) $('#gNotesStatus').textContent = gdStatusText();
  const setUp = !!(GD.clientId && GD.enabled);
  ['#gSetup'].forEach(id => { if ($(id)) { $(id).classList.toggle('hidden', !gdAvailable()); $(id).textContent = setUp ? 'Settings' : 'Set up'; } });
  if ($('#gNow')) $('#gNow').classList.toggle('hidden', !setUp);
  if ($('#gOff')) $('#gOff').classList.toggle('hidden', !setUp);
  if ($('#gNotesNow')) $('#gNotesNow').textContent = setUp ? 'Sync now' : (gdAvailable() ? 'Set up' : '');
  if ($('#gNotesRow')) $('#gNotesRow').classList.toggle('hidden', !gdAvailable());
  if ($('#gAltRow')) $('#gAltRow').classList.toggle('hidden', !(setUp && GD.canAlt));
  if ($('#gAlt2')) $('#gAlt2').classList.toggle('hidden', !GD.canAlt);
}
function gdSet(state, msg) { GD.state = state; GD.msg = msg || ''; gdPaint(); }

/* --- sign-in --- */
function gdLoadGIS() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (GD.gisLoading) return GD.gisLoading;
  GD.gisLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { GD.gisLoading = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return GD.gisLoading;
}
/* Safari only lets a sign-in window open if it opens instantly on a tap, so Google's script and the token client are prepared in advance. */
async function gdPrepare() {
  if (!gdAvailable() || !GD.clientId || !navigator.onLine) return false;
  try { await gdLoadGIS(); } catch (e) { return false; }
  if (!GD.client || GD.clientFor !== GD.clientId) {
    GD.client = google.accounts.oauth2.initTokenClient({ client_id: GD.clientId, scope: GD.SCOPE, callback: gdOnToken, error_callback: gdOnTokenError });
    GD.clientFor = GD.clientId;
  }
  return true;
}
function gdSetToken(t, secs) { GD.token = t; GD.exp = Date.now() + ((secs || 3600) - 90) * 1000; store.set('gtoken', { t: t, exp: GD.exp }); }
function gdOnToken(r) {
  const p = GD.pending; GD.pending = null;
  if (r && r.access_token) { gdSetToken(r.access_token, r.expires_in); if (p) p.res(r.access_token); }
  else if (p) p.rej({ kind: 'auth', text: (r && (r.error_description || r.error)) || 'Sign-in did not complete' });
}
function gdOnTokenError(e) {
  const p = GD.pending; GD.pending = null;
  const type = e && e.type;
  const text = type === 'popup_failed_to_open' ? 'Your browser blocked the Google sign-in window' : type === 'popup_closed' ? 'The Google sign-in window was closed' : 'Google sign-in did not complete' + (type ? ' (' + type + ')' : '');
  if (p) p.rej({ kind: 'popup', type: type, text: text });
}
/* MUST be called straight from a tap, before any await */
function gdSignIn() {
  return new Promise((res, rej) => {
    if (!GD.client) { rej({ kind: 'notready', text: 'Google sign-in is not ready. Check your connection and try again.' }); return; }
    GD.pending = { res: res, rej: rej };
    try { GD.client.requestAccessToken(); } catch (e) { GD.pending = null; rej({ kind: 'popup', text: 'Could not open the sign-in window' }); }
  });
}
function gdRedirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
function gdRedirectSignIn() {
  if (!GD.clientId) return;
  const st = uid(); store.set('gstate', st);
  const q = { client_id: GD.clientId, redirect_uri: gdRedirectUri(), response_type: 'token', scope: GD.SCOPE, state: st, include_granted_scopes: 'true' };
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&'));
}
function gdConsumeRedirect() {
  if (!/access_token=|error=/.test(location.hash)) return false;
  const h = {}; location.hash.replace(/^#/, '').split('&').forEach(p => { const i = p.indexOf('='); if (i > 0) h[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1)); });
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!h.state || h.state !== store.get('gstate', '')) return false;
  store.set('gstate', '');
  if (h.access_token) { gdSetToken(h.access_token, +h.expires_in || 3600); GD.enabled = true; store.set('gsync', true); return true; }
  GD.canAlt = true; gdSet('error', h.error_description || h.error || 'Google sign-in was cancelled'); return false;
}

/* --- Drive calls --- */
async function gdApi(url, opts) {
  opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + GD.token }, opts.headers || {});
  let r;
  try { r = await fetch(url, opts); } catch (e) { throw { kind: 'net', text: 'No connection to Google' }; }
  if (r.status === 401) { GD.token = null; GD.exp = 0; store.set('gtoken', null); throw { kind: 'auth', text: 'Sign-in expired' }; }
  if (!r.ok) {
    let msg = 'Google Drive error ' + r.status, why = '';
    try { const j = await r.json(); if (j.error) { msg = j.error.message || msg; why = ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || '') + ' ' + (j.error.status || ''); } } catch (e) {}
    const hint = /accessNotConfigured|has not been used|SERVICE_DISABLED/i.test(why + ' ' + msg) ? ' (switch on the Google Drive API in your Google Cloud project: setup step 2)' : '';
    throw { kind: 'api', status: r.status, text: msg + hint };
  }
  return r;
}
const DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
async function gdFindAll() {
  const q = encodeURIComponent("name = '" + GD.FILE + "' and trashed = false");
  const r = await gdApi(DRIVE + '?q=' + q + '&spaces=drive&orderBy=modifiedTime%20desc&pageSize=10&fields=' + encodeURIComponent('files(id,name,modifiedTime,version)'));
  return ((await r.json()).files) || [];
}
async function gdRead(id) {
  const r = await gdApi(DRIVE + '/' + id + '?alt=media'), t = await r.text();
  try { return JSON.parse(t); } catch (e) { throw { kind: 'data', text: 'The copy in Google Drive could not be read. Nothing was changed.' }; }
}
async function gdCreate(json) {
  const b = 'kjv' + uid();
  const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: GD.FILE, mimeType: 'application/json' }) +
    '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + json + '\r\n--' + b + '--';
  const r = await gdApi(UPLOAD + '?uploadType=multipart&fields=id,version,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
  return r.json();
}
async function gdUpdate(id, json) {
  const r = await gdApi(UPLOAD + '/' + id + '?uploadType=media&fields=id,version,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
  return r.json();
}
async function gdMeta(id) { return (await gdApi(DRIVE + '/' + id + '?fields=id,version,modifiedTime,trashed')).json(); }
async function gdTrash(id) { await gdApi(DRIVE + '/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); }

/* --- the sync itself --- */
async function gdRun(manual) {
  if (!GD.enabled || !GD.clientId || !gdAvailable()) return;
  if (GD.busy) return;
  let signIn = null;
  if (!gdTokenValid()) {
    if (!manual) { gdSet(GD.state === 'error' ? 'error' : 'idle', GD.msg); if (GD.dirty && !GD.nagged) { GD.nagged = true; toast('Saved on this device. Tap the cloud to sync with Google Drive.'); } return; }
    signIn = gdSignIn();   // starts the sign-in window right now, inside the tap
  }
  GD.busy = true; GD.canAlt = false; gdSet('syncing');
  let summary = null;
  try {
    if (signIn) await signIn;
    GD.dirty = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const files = await gdFindAll(), target = files[0] || null;
      let need = !target || files.length > 1;
      for (const f of files) { const res = mergeData(await gdRead(f.id)); if (!res) throw { kind: 'data', text: 'The copy in Google Drive is not a notes file. Nothing was changed.' }; if (res.needsUpload) need = true; if (res.changed) GD.renderPending = true; summary = res; }
      if (need) {
        const json = JSON.stringify(payload());
        if (!target) await gdCreate(json);
        else {
          const m = await gdMeta(target.id);
          if (String(m.version) !== String(target.version)) continue;   // someone else saved in between: merge again
          await gdUpdate(target.id, json);
        }
        for (const extra of files.slice(1)) await gdTrash(extra.id);
      }
      break;
    }
    GD.last = Date.now(); store.set('glast', GD.last);
    gdSet('idle');
    if (GD.renderPending && !S.wsel && !S.selected.size && !NE) { GD.renderPending = false; renderChapter(null, true); }
    if (!$('#notesView').classList.contains('hidden')) renderNotes();
    if (manual) toast(summary && (summary.added || summary.updated) ? 'Synced: ' + (summary.added + summary.updated) + ' change(s) brought in' : 'Synced with Google Drive');
  } catch (e) {
    GD.dirty = true;
    if (!e || !e.kind) { gdSet('error', 'Something unexpected went wrong'); }
    else if (e.kind === 'net') { gdSet('offline'); clearTimeout(GD.retryT); GD.retryT = setTimeout(() => gdRun(false), GD.retryMs); }
    else if (e.kind === 'auth') { gdSet('idle'); if (manual) toast('Please sign in again'); }
    else if (e.kind === 'popup' || e.kind === 'notready') { GD.canAlt = e.kind === 'popup'; gdSet('error', e.text); if (manual) toast(e.text); }
    else { gdSet('error', e.text || 'Something went wrong'); if (manual) toast(e.text || 'Sync failed'); }
  } finally {
    GD.busy = false; gdPaint();
    if (GD.dirty && GD.state === 'idle' && gdTokenValid()) gdDirty();   // edits made during the sync
  }
}
function gdDirty() {
  GD.dirty = true;
  if (!GD.enabled || !GD.clientId || !gdAvailable()) return;
  clearTimeout(GD.timer); GD.timer = setTimeout(() => gdRun(false), GD.delay);
  gdPaint();
}
function gdDisconnect() {
  if (!confirm('Stop syncing with Google Drive on this device? Your notes stay here and the file stays in your Drive.')) return;
  const t = GD.token;
  try { if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {}); } catch (e) {}
  GD.token = null; GD.exp = 0; store.set('gtoken', null);
  GD.enabled = false; store.set('gsync', false); clearTimeout(GD.timer); gdSet('idle'); toast('Google Drive sync turned off on this device');
}
function gdCopy(text) { copyText(text); }
function openSyncSheet() {
  $('#gSheet').classList.remove('hidden');
  $('#gIdRow').classList.toggle('hidden', GD.baked);
  $('#gClientId').value = GD.clientId || '';
  $('#gOrigin').textContent = location.origin; $('#gRedirect').textContent = gdRedirectUri();
  $('#gMsg').textContent = ''; gdPaint();
  if (GD.clientId) gdPrepare();
}
function wireSync() {
  $('#syncBtn').onclick = () => gdRun(true);
  $('#gSetup').onclick = () => { $('#settings').classList.add('hidden'); openSyncSheet(); };
  $('#gNow').onclick = () => gdRun(true);
  $('#gOff').onclick = gdDisconnect;
  $('#gAlt').onclick = gdRedirectSignIn; $('#gAlt2').onclick = gdRedirectSignIn;
  $('#gClose').onclick = () => $('#gSheet').classList.add('hidden');
  $('#gSheet').onclick = e => { if (e.target.id === 'gSheet') $('#gSheet').classList.add('hidden'); };
  $('#gCopyO').onclick = () => gdCopy(location.origin); $('#gCopyR').onclick = () => gdCopy(gdRedirectUri());
  $('#gClientId').oninput = e => {
    const v = e.target.value.trim(); $('#gMsg').textContent = '';
    if (validClientId(v)) { GD.clientId = v; store.set('gclient', v); gdPrepare(); }
  };
  $('#gConnect').onclick = () => {
    const v = ($('#gClientId').value || '').trim();
    if (!GD.baked) {
      if (!validClientId(v)) { $('#gMsg').textContent = 'That does not look like a Client ID. It looks like 123456-abc.apps.googleusercontent.com'; return; }
      GD.clientId = v; store.set('gclient', v);
    }
    GD.enabled = true; store.set('gsync', true);
    if (!GD.client || GD.clientFor !== GD.clientId) { gdPrepare().then(ok => { $('#gMsg').textContent = ok ? 'Ready. Tap the button once more to sign in.' : 'Could not reach Google. Check your connection.'; gdPaint(); }); return; }
    $('#gSheet').classList.add('hidden');
    gdRun(true);
  };
  $('#gNotesNow').onclick = () => { if (GD.clientId && GD.enabled) gdRun(true); else openSyncSheet(); };
  window.addEventListener('online', () => { if (GD.enabled) { gdPrepare(); if (gdTokenValid()) gdRun(false); else gdPaint(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && GD.enabled && gdTokenValid() && Date.now() - GD.last > 30000) gdRun(false); });
  setInterval(() => { if (!document.hidden && GD.enabled && gdTokenValid() && !GD.busy) gdRun(false); }, 300000);
}
function startSync() {
  const returned = gdConsumeRedirect();
  wireSync(); gdPaint();
  if (GD.enabled && GD.clientId) { gdPrepare(); if (returned || gdTokenValid()) gdRun(false); }
}

/* ---------- start ---------- */
async function start() {
  const SQL = await initSqlJs({ wasmBinary: b64ToBytes(window.SQLJS_WASM_B64) });
  db = new SQL.Database(b64ToBytes(window.BIBLE_DB_B64));
  window.BIBLE_DB_B64 = null; window.SQLJS_WASM_B64 = null;
  BOOKS = all('select id,name,testament,chapters from books order by id');
  BOOKS.forEach(b => { BOOK[b.id] = b; NAMEKEYS.push({ key: normBook(b.name), id: b.id }); });
  if (!BOOK[S.book] || S.chapter > BOOK[S.book].chapters) { S.book = 1; S.chapter = 1; }
  await Ann.init();
  wire(); wirePanel(); wireTree(); setupPWA(); startSync(); applyDisplay(); refreshCounts();
  if (isWide() && store.get('treeWide', true) === false) document.body.classList.add('tree-hidden');
  revealCurrent();
  renderChapter();
  $('#loading').classList.add('hidden');
  window.__kjv = { go, parseRef, runSearch, S, T, Ann, Lnk, Xr, P, tokenCheck, GD, gdRun };  // handy for testing
}
start().catch(err => {
  $('#loading').innerHTML = '<div style="padding:24px;text-align:center">Something went wrong starting the app.<br><small>' + esc(String(err)) + '</small></div>';
});

})();
