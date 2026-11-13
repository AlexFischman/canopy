/* Canopy UI, part B: panel, search, menus, dialogs, files and input handling. */

const ICON = {
  chev: '<path d="m4 6 4 4 4-4"/>',
  open: '<path d="M2 12.5V4a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/>',
  paste: '<rect x="3.5" y="3" width="9" height="11" rx="1.5"/><path d="M6 3V2h4v1M6 7.5h4M6 10.5h4"/>',
  sample: '<path d="M2.5 8h3M5.5 8V4.5h3M5.5 8v3.5h3M5.5 8h3"/><circle cx="11" cy="4.5" r="1.6"/><circle cx="11" cy="8" r="1.6"/><circle cx="11" cy="11.5" r="1.6"/>',
  sliders: '<path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6"/><circle cx="9.5" cy="4.5" r="1.6"/><circle cx="6.5" cy="11.5" r="1.6"/>',
  download: '<path d="M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  moon: '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/>',
  help: '<circle cx="8" cy="8" r="6"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.7-.8 1.3M8 11.6v.1"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  fit: '<path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  panel: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m2.5 11 3.5-3.5 3 3 2-2 2.5 2.5"/><circle cx="10.5" cy="6" r="1"/>',
  text: '<path d="M3 4h10M3 8h7M3 12h9"/>'
};
function icon(name) {
  const s = document.createElement('span');
  s.style.cssText = 'display:inline-flex;line-height:0';
  s.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  return s.firstChild;
}
function h(tag, props) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (let i = 2; i < arguments.length; i++) append(e, arguments[i]);
  return e;
}
function append(e, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { for (let i = 0; i < c.length; i++) append(e, c[i]); return; }
  e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
}
function plural(n, one, many) { return nf.format(n) + ' ' + (n === 1 ? one : many); }

/* ---------- theme ---------- */

function applyTheme(name) {
  S.theme = name; TH = THEMES[name];
  const r = document.documentElement, T = TH;
  r.setAttribute('data-theme', name);
  const vars = { bg: T.bg, surface: T.surface, surface2: T.surface2, ink: T.ink, ink2: T.ink2, ink3: T.ink3, line: T.line, line2: T.line2, accent: T.accent,
    'on-accent': T.onAccent, rel: T.rel, 'rel-bg': T.relBg, restr: T.restr, 'restr-bg': T.restrBg, 'match-bg': T.matchBg, veil: T.veil, shadow: T.shadow, 'shadow-s': T.shadowS };
  for (const k in vars) r.style.setProperty('--' + k, vars[k]);
  const b = $('themeBtn'); b.textContent = ''; b.appendChild(icon(name === 'dark' ? 'sun' : 'moon'));
  try { localStorage.setItem('canopy-theme', name); } catch (e) { /* storage may be unavailable */ }
  miniDirty = true;
  if (M) { renderPanel(); draw(); }
}

/* ---------- model ---------- */

let domProps = [], rngProps = [], sIdx = [], propUse = [];

function setModel(model, label, sample) {
  M = model; fileLabel = label; isSample = !!sample;
  const C = M.classes, P = M.props;
  const langs = Object.keys(M.langs).filter((l) => l).map((l) => l.toLowerCase());
  const nav = (navigator.language || 'en').toLowerCase().split('-')[0];
  if (langs.indexOf(S.lang) < 0) {
    const tally = {};
    Object.keys(M.langs).forEach((l) => { if (l) { const b = l.toLowerCase(); tally[b] = (tally[b] || 0) + M.langs[l]; } });
    const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || '';
    S.lang = langs.indexOf('en') >= 0 ? 'en' : langs.indexOf(nav) >= 0 ? nav : top;
  }
  const pf = Object.assign({ owl: 'http://www.w3.org/2002/07/owl#', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    xsd: 'http://www.w3.org/2001/XMLSchema#', skos: 'http://www.w3.org/2004/02/skos/core#', dcterms: 'http://purl.org/dc/terms/', dc: 'http://purl.org/dc/elements/1.1/',
    oboInOwl: 'http://www.geneontology.org/formats/oboInOwl#', obo: 'http://purl.obolibrary.org/obo/' }, {});
  const seenNs = {};
  nsList = [];
  const addNs = (p, ns) => { if (p && ns && !seenNs[ns]) { seenNs[ns] = 1; nsList.push([ns, p]); } };
  for (const p in M.prefixes) addNs(p, M.prefixes[p]);
  for (const p in pf) addNs(p, pf[p]);
  nsList.sort((a, b) => b[0].length - a[0].length);
  relOut = C.map(() => []); relIn = C.map(() => []); propRels = P.map(() => []); subProps = P.map(() => []);
  domProps = C.map(() => []); rngProps = C.map(() => []);
  M.rels.forEach((r) => { relOut[r.s].push(r); relIn[r.o].push(r); propRels[r.p].push(r); });
  obsOut = C.map(() => []); obsIn = C.map(() => []); obsByProp = P.map(() => []);
  M.obs.forEach((r) => { obsOut[r.s].push(r); obsIn[r.o].push(r); obsByProp[r.p].push(r); });
  indIn = M.inds.map(() => []); propUse = P.map(() => []);
  M.inds.forEach((ind, i) => {
    for (let q = 0; q < ind.out.length; q += 2) {
      indIn[ind.out[q + 1]].push(ind.out[q], i);
      const u = propUse[ind.out[q]];
      if (u.length < 400) u.push(i, ind.out[q + 1]);
    }
  });
  P.forEach((p, i) => { p.sup.forEach((s) => subProps[s].push(i)); p.dom.forEach((c) => domProps[c].push(i)); p.rng.forEach((c) => rngProps[c].push(i)); });
  S.sel = null; S.hover = null; S.query = ''; matches = null; F = null; S.cap = 40; S.hops = 1; S.tab = 'details'; S.allLinks = null; radReady = false;
  S.f.dep = false; S.f.ext = true;
  $('search').value = ''; $('results').hidden = true;
  nodes = [];
  if (S.view !== 'tree') setView('tree', true);
  rebuild(false);
  updateBar();
  renderPanel();
  showHint();
}

function rebuild(keepOpen) {
  computeNames();
  buildTree(keepOpen);
  buildSearchIndex();
  if (S.sel && S.sel.t === 'c' && !nodes[S.sel.i]) S.sel = null;
  arcKey = '';
  if (S.query) runSearch(S.query, true);
  relayout({});
  if (!keepOpen) { const c = fitCam(true); cam.x = c.x; cam.y = c.y; cam.k = c.k; radReady = false; }
  $('empty').hidden = true;
  if (!M.classes.length) showEmpty();
  if (S.view === 'focus') { if (S.sel && S.sel.t === 'c') buildFocus(S.sel.i); else if (S.sel && S.sel.t === 'i') buildFocus(S.sel.i, 'i'); else F = null; }
  draw();
}

function updateBar() {
  const fb = $('fileBtn');
  fb.querySelector('.fname').textContent = fileLabel;
  fb.querySelector('.fmeta').textContent = '';
  if (!fb.querySelector('svg')) fb.appendChild(icon('chev'));
  $('tabs').querySelector('.n').textContent = M.props.length ? nf.format(M.props.length) : '';
  document.title = fileLabel + ' – Canopy';
}

function showEmpty() {
  const e = $('empty');
  e.textContent = '';
  e.appendChild(h('div', null,
    h('h2', { text: 'No classes in this file' }),
    h('p', { text: plural(M.stats.triples, 'statement was', 'statements were') + ' read, but none of them declares a class or a concept hierarchy. Canopy shows the schema of an ontology: its classes, how they are arranged and the properties between them.' }),
    h('button', { class: 'btn primary', onclick: pickFile }, 'Open another file')));
  e.hidden = false;
}

function showHint() {
  const el = $('hint');
  el.textContent = '';
  $('stage').classList.toggle('hinted', isSample);
  if (!isSample) { el.hidden = true; return; }
  el.appendChild(h('p', null, h('b', { text: 'This is a sample. ' }), 'Drop your own .owl, .ttl or .rdf file anywhere in this window.'));
  el.appendChild(h('button', { class: 'btn primary', onclick: pickFile }, 'Open file'));
  el.appendChild(h('button', { class: 'btn icon', 'aria-label': 'Dismiss', onclick: () => { el.hidden = true; $('stage').classList.remove('hinted'); } }, icon('close')));
  el.hidden = false;
}

/* ---------- selection ---------- */

function selectClass(i, opts) {
  opts = opts || {};
  if (!nodes[i]) {
    if (M.classes[i].dep && !S.f.dep) { S.f.dep = true; toast('Deprecated classes are now shown'); }
    if (!M.classes[i].declared && !S.f.ext) { S.f.ext = true; toast('Classes from other files are now shown'); }
    rebuild(true);
    if (!nodes[i]) return;
  }
  S.sel = { t: 'c', i: i }; S.tab = 'details'; arcKey = '';
  if (S.view !== 'focus') { if (opts.reveal === false) draw(); else reveal(nodes[i], opts.center); }
  else buildFocus(i);
  renderPanel();
}
function selectInd(i) {
  S.sel = { t: 'i', i: i }; S.tab = 'details'; arcKey = '';
  if (S.view !== 'focus') {
    const ts = M.inds[i].types;
    let tn = null;
    for (let j = 0; j < ts.length && !tn; j++) tn = nodes[ts[j]] || null;
    if (tn) reveal(tn, false); else draw();
  } else buildFocus(i, 'i');
  renderPanel();
}
function selectProp(i) {
  S.sel = { t: 'p', i: i }; S.tab = 'details'; arcKey = '';
  renderPanel(); draw();
  if (S.view !== 'focus') { buildArcs(); if (arcNote) toast(arcNote); }
}
function clearSel() {
  if (!S.sel) return;
  S.sel = null; arcKey = '';
  renderPanel(); draw();
}
let lastTreeView = 'tree';
function setView(v, quiet) {
  S.view = v;
  if (v !== 'focus') lastTreeView = v;
  $('viewSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  $('focusBar').hidden = v !== 'focus';
  $('lvlGroup').hidden = v === 'focus';
  $('allGroup').hidden = v !== 'radial';
  if (v !== 'tree') mini.hidden = true;
  S.hover = null; hideTip();
  if (v === 'focus') {
    if (S.sel && S.sel.t === 'c' && nodes[S.sel.i]) { F = null; buildFocus(S.sel.i); }
    else if (S.sel && S.sel.t === 'i') { F = null; buildFocus(S.sel.i, 'i'); }
    else { F = null; renderFocusBar(); }
  } else {
    anim = null;
    $('empty').hidden = true;
    if (M && !M.classes.length) showEmpty();
    if (v === 'radial') { const was = radReady && radialAtFit(); radialTargets(); if (was) radReady = false; }
    settle();
    if (v === 'radial') {
      if (!radReady) { const c = fitRadial(); rcam.x = c.x; rcam.y = c.y; rcam.k = c.k; radReady = true; }
      updateAllBtn();
    }
    const sn = selNode();
    if (sn && !quiet) reveal(sn, !isVisible(sn));
  }
  if (!quiet) draw();
}
function updateAllBtn() { $('allBtn').setAttribute('aria-pressed', String(allLinksOn())); }

/* ---------- search ---------- */

function buildSearchIndex() {
  sIdx = [];
  const C = M.classes, P = M.props;
  for (let i = 0; i < C.length; i++) if (nodes[i]) sIdx.push({ t: 'c', i: i, l: cname[i].toLowerCase(), id: localName(C[i].iri).toLowerCase(), alt: C[i].alts.length ? C[i].alts.join('\u0001').toLowerCase() : '' });
  for (let i = 0; i < P.length; i++) sIdx.push({ t: 'p', i: i, l: pname[i].toLowerCase(), id: localName(P[i].iri).toLowerCase(), alt: '' });
  for (let i = 0; i < M.inds.length; i++) sIdx.push({ t: 'i', i: i, l: indName(M.inds[i]).toLowerCase(), id: localName(M.inds[i].iri).toLowerCase(), alt: '' });
}
let results = [], resActive = 0, resTotal = 0;
function runSearch(q, quiet) {
  S.query = q;
  const s = q.trim().toLowerCase();
  results = []; resTotal = 0;
  const prev = matches;
  matches = null;
  for (let j = 0; j < bfs.length; j++) bfs[j].mc = 0;
  if (s) {
    const byIri = s.indexOf('/') >= 0 || s.indexOf('#') >= 0;
    const out = [];
    for (let j = 0; j < sIdx.length; j++) {
      const e = sIdx[j], p = e.l.indexOf(s);
      let sc = -1, alt = '';
      if (p === 0) sc = e.l.length === s.length ? 0 : 1;
      else if (p > 0) sc = /[\s_\-:\/.(]/.test(e.l.charAt(p - 1)) ? 2 : 3;
      else if (e.id.indexOf(s) >= 0) sc = 4;
      else if (e.alt && e.alt.indexOf(s) >= 0) { sc = 5; const a = e.alt.split('\u0001'); for (let z = 0; z < a.length; z++) if (a[z].indexOf(s) >= 0) { alt = a[z]; break; } }
      else if (byIri && (e.t === 'c' ? M.classes[e.i].iri : e.t === 'p' ? M.props[e.i].iri : M.inds[e.i].iri).toLowerCase().indexOf(s) >= 0) sc = 6;
      if (sc >= 0) out.push({ e: e, sc: sc, pos: p, alt: alt });
    }
    out.sort((a, b) => a.sc - b.sc || a.e.l.length - b.e.l.length || (a.e.l < b.e.l ? -1 : a.e.l > b.e.l ? 1 : 0));
    resTotal = out.length;
    results = out.slice(0, 60);
    if (s.length >= 2) {
      matches = new Set();
      for (let j = 0; j < out.length; j++) if (out[j].e.t === 'c') {
        matches.add(out[j].e.i);
        for (let a = nodes[out[j].e.i].parent; a; a = a.parent) a.mc++;
      }
    }
  }
  if (!quiet) { resActive = 0; renderResults(s); }
  if (matches || prev) draw();
}
function renderResults(s) {
  const box = $('results');
  box.textContent = '';
  if (!s) { box.hidden = true; return; }
  box.hidden = false;
  if (!results.length) { box.appendChild(h('div', { class: 'res-note', text: 'Nothing matches "' + S.query.trim() + '". Search looks at labels, identifiers and synonyms.' })); return; }
  results.forEach((r, j) => {
    const e = r.e, name = e.t === 'c' ? cname[e.i] : e.t === 'p' ? pname[e.i] : indName(M.inds[e.i]);
    const nm = h('span', { class: 'nm' });
    if (r.pos >= 0) { nm.appendChild(document.createTextNode(name.slice(0, r.pos))); nm.appendChild(h('b', { text: name.slice(r.pos, r.pos + s.length) })); nm.appendChild(document.createTextNode(name.slice(r.pos + s.length))); }
    else nm.textContent = name;
    let pth;
    if (e.t === 'c') {
      const parts = [];
      for (let a = nodes[e.i].parent; a && a !== root && parts.length < 3; a = a.parent) parts.unshift(a.name);
      pth = r.alt ? 'also called ' + r.alt : parts.length ? parts.join(' › ') : compact(M.classes[e.i].iri);
    } else if (e.t === 'i') {
      const ts = M.inds[e.i].types;
      pth = ts.length ? 'Individual of ' + ts.slice(0, 3).map((t) => cname[t]).join(', ') : 'Individual without a class';
    } else pth = propKindName(M.props[e.i]) + propSignature(M.props[e.i]);
    const row = h('div', { class: 'res' + (j === resActive ? ' active' : ''), role: 'option', onmousedown: (ev) => { ev.preventDefault(); goResult(j); }, onmousemove: () => { if (resActive !== j) { resActive = j; markActive(); } } },
      e.t === 'c' ? h('span', { class: 'dot', style: 'background:' + branchColor(nodes[e.i].branch) }) : e.t === 'i' ? h('span', { class: 'iglyph', style: 'border-color:' + branchColor(indBranch(e.i)) }) : h('span', { class: 'pglyph ' + (M.props[e.i].kind === 'data' ? 'data' : M.props[e.i].kind === 'object' ? '' : 'other') }),
      nm, h('span', { class: 'pth', text: pth }));
    box.appendChild(row);
  });
  if (resTotal > results.length) box.appendChild(h('div', { class: 'res-note', text: nf.format(resTotal - results.length) + ' more. Keep typing to narrow the list.' }));
}
function markActive() {
  const rows = $('results').querySelectorAll('.res');
  rows.forEach((r, j) => r.classList.toggle('active', j === resActive));
  if (rows[resActive]) rows[resActive].scrollIntoView({ block: 'nearest' });
}
function goResult(j) {
  const r = results[j];
  if (!r) return;
  $('results').hidden = true;
  $('search').blur();
  if (r.e.t === 'c') selectClass(r.e.i, { center: true }); else if (r.e.t === 'i') selectInd(r.e.i); else selectProp(r.e.i);
}

/* ---------- panel ---------- */

function sec(title, count) {
  const s = h('section', { class: 'sec' }, h('h3', null, title, count != null ? h('span', { class: 'n', text: nf.format(count) }) : null));
  for (let i = 2; i < arguments.length; i++) append(s, arguments[i]);
  return s;
}
function classLink(i) {
  const nd = nodes[i];
  return h('button', { class: 'lnk' + (nd ? '' : ' gone'), title: M.classes[i].iri, onclick: () => selectClass(i, {}) },
    h('span', { class: 'dot', style: 'background:' + (nd ? branchColor(nd.branch) : TH.ink3) }), cname[i]);
}
function propLink(i) {
  const k = M.props[i].kind;
  return h('button', { class: 'lnk ' + (k === 'data' ? 'dp' : 'p'), title: M.props[i].iri, onclick: () => selectProp(i) }, pname[i]);
}
function indLink(i) {
  return h('button', { class: 'lnk', title: M.inds[i].iri, onclick: () => selectInd(i) },
    h('span', { class: 'iglyph', style: 'border-color:' + branchColor(indBranch(i)) }), indName(M.inds[i]));
}
function propKindName(p) { return p.kind === 'object' ? 'Object property' : p.kind === 'data' ? 'Data property' : p.kind === 'annotation' ? 'Annotation property' : 'Property'; }
function dtName(iri) { return compact(iri); }
function propSignature(p) {
  const d = p.dom.map((c) => cname[c]), r = p.rng.map((c) => cname[c]).concat(p.rdt.map(dtName));
  if (!d.length && !r.length) return '';
  return ': ' + (d.length ? trunc(d.join(', '), 40) : 'anything') + ' → ' + (r.length ? trunc(r.join(', '), 40) : 'anything');
}
function capped(items, render, cap) {
  cap = cap || 24;
  const ul = h('ul', { class: 'list' });
  const fill = (n) => { for (let j = ul.children.length; j < Math.min(n, items.length); j++) ul.appendChild(h('li', null, render(items[j]))); };
  fill(cap);
  if (items.length <= cap) return ul;
  const more = h('button', { class: 'more', text: 'Show all ' + nf.format(items.length), onclick: () => { fill(Math.min(items.length, 3000)); more.remove(); if (items.length > 3000) wrap.appendChild(h('p', { class: 'note', text: 'The first 3,000 are listed.' })); } });
  const wrap = h('div', null, ul, more);
  return wrap;
}
function iriLine(iri) {
  return h('div', { class: 'iri' }, h('span', { text: iri }),
    h('button', { class: 'mini-btn', title: 'Copy IRI', 'aria-label': 'Copy IRI', onclick: () => copyText(iri, 'IRI copied') }, icon('copy')));
}
function textBlocks(list) {
  const out = [];
  const seen = new Set();
  const ord = list.slice().sort((a, b) => langRank(b[1]) - langRank(a[1]));
  ord.forEach((c, j) => {
    const t = c[0].trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    if (j > 0 && langRank(c[1]) < 3 && out.length) return;
    const p = h('p', { class: 'desc' });
    if (t.length > 700) {
      p.textContent = t.slice(0, 520).trimEnd() + '… ';
      p.appendChild(h('button', { class: 'more', text: 'Read all', onclick: () => { p.textContent = t; } }));
    } else p.textContent = t;
    out.push(p);
  });
  return out;
}
function langRank(l) { l = (l || '').toLowerCase(); return l === S.lang ? 5 : (S.lang && l.split('-')[0] === S.lang.split('-')[0]) ? 4 : l === '' ? 3 : l.slice(0, 2) === 'en' ? 2 : 1; }

const FACET = { minInclusive: '≥', maxInclusive: '≤', minExclusive: '>', maxExclusive: '<' };
function exprNode(e) {
  const kw = (t) => h('span', { class: 'kw', text: t });
  const group = (x) => (x.t === 'and' || x.t === 'or' || x.t === 'r' || x.t === 'not') ? ['(', exprNode(x), ')'] : exprNode(x);
  const join = (xs, word) => { const out = []; xs.forEach((x, j) => { if (j) out.push(' ', kw(word), ' '); out.push(group(x)); }); return out; };
  switch (e.t) {
    case 'c': return classLink(e.c);
    case 'top': return 'owl:Thing';
    case 'bot': return 'owl:Nothing';
    case 'dt': return compact(e.iri) + (e.facets && e.facets.length ? '[' + e.facets.map((f) => { const n = localName(f[0]); return (FACET[n] || n) + ' ' + f[1]; }).join(', ') + ']' : '');
    case 'lit': return '"' + trunc(e.v, 60) + '"';
    case 'ind': return h('span', { title: e.iri, text: localName(e.iri) });
    case 'and': return join(e.xs, 'and');
    case 'or': return join(e.xs, 'or');
    case 'not': return [kw('not'), ' ', group(e.x)];
    case 'one': return ['{', e.xs.map((x, j) => [j ? ', ' : '', exprNode(x)]), '}'];
    case 'r': {
      const out = [];
      if (e.inv) out.push(kw('inverse'), ' ');
      out.push(e.p >= 0 ? propLink(e.p) : 'unknown property', ' ');
      if (e.k === 'self') out.push(kw('Self'));
      else if (e.k === 'related') out.push(e.x ? group(e.x) : '');
      else {
        out.push(kw(e.k === '?' ? 'restricted' : e.k), ' ');
        if (e.n !== undefined) out.push(String(e.n), ' ');
        if (e.x) out.push(group(e.x)); else if (e.n !== undefined) out.push(h('span', { class: 'mut', text: 'values' }));
      }
      return out;
    }
    default: return h('span', { class: 'mut', text: '(expression not shown)' });
  }
}

function annotations(ann) {
  if (!ann.length) return null;
  const dl = h('dl', { class: 'kv' });
  const rows = ann.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : langRank(b[2]) - langRank(a[2])));
  rows.forEach((a) => {
    const key = compact(a[0]);
    dl.appendChild(h('dt', { title: a[0], text: key.indexOf('://') >= 0 ? localName(a[0]) : key }));
    const dd = h('dd');
    if (a[3] && /^https?:\/\//.test(a[1])) dd.appendChild(h('a', { href: a[1], target: '_blank', rel: 'noopener noreferrer', text: compact(a[1]) }));
    else if (/^https?:\/\/\S+$/.test(a[1])) dd.appendChild(h('a', { href: a[1], target: '_blank', rel: 'noopener noreferrer', text: a[1] }));
    else dd.textContent = trunc(a[1], 600) + (a[2] ? ' ' : '');
    if (a[2]) dd.appendChild(h('span', { class: 'tag', text: a[2] }));
    dl.appendChild(dd);
  });
  return sec('Annotations', ann.length, dl);
}

function renderPanel() {
  const pb = $('pbody');
  pb.textContent = '';
  $('tabs').querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
  if (!M) return;
  if (S.tab === 'props') renderPropList(pb);
  else if (S.sel && S.sel.t === 'c') renderClass(pb, S.sel.i);
  else if (S.sel && S.sel.t === 'p') renderProp(pb, S.sel.i);
  else if (S.sel && S.sel.t === 'i') renderInd(pb, S.sel.i);
  else renderOverview(pb);
  pb.scrollTop = 0;
}

function renderClass(pb, i) {
  const C = M.classes, c = C[i], nd = nodes[i], N = nouns();
  const kind = h('div', { class: 'kind' }, M.mode === 'skos' ? 'Concept' : 'Class');
  if (c.eq.some((e) => e.t !== 'c')) kind.appendChild(h('span', { class: 'tag', text: 'defined by an equivalence' }));
  if (c.dep) kind.appendChild(h('span', { class: 'tag warn', text: 'deprecated' }));
  if (!c.declared) kind.appendChild(h('span', { class: 'tag', title: 'This class is used here but declared in another ontology.', text: 'not declared in this file' }));
  pb.appendChild(kind);
  pb.appendChild(h('h1', { class: 'title', text: cname[i] }));
  pb.appendChild(iriLine(c.iri));
  if (nd && nd.parent && nd.parent !== root) {
    const cr = h('div', { class: 'crumbs' }), chain = [];
    for (let a = nd.parent; a && a !== root; a = a.parent) chain.unshift(a);
    chain.forEach((a, j) => { if (j) cr.appendChild(h('span', { class: 'sep', text: '›' })); cr.appendChild(a.i < 0 ? h('span', { text: a.name }) : h('button', { class: 'lnk', onclick: () => selectClass(a.i, {}) }, a.name)); });
    pb.appendChild(cr);
  }
  append(pb, textBlocks(c.comments));
  if (c.alts.length) pb.appendChild(h('p', { class: 'desc', style: 'color:var(--ink2)' }, 'Also called ' + Array.from(new Set(c.alts)).slice(0, 12).join(', ') + (c.alts.length > 12 ? ' and more' : '') + '.'));
  const acts = h('div', { class: 'acts' });
  if (S.view !== 'focus') acts.appendChild(h('button', { class: 'btn line', onclick: () => setView('focus') }, 'Focus on this'));
  else acts.appendChild(h('button', { class: 'btn line', onclick: () => setView(lastTreeView) }, 'Show in tree'));
  if (nd && nd.kids.length && S.view !== 'focus') acts.appendChild(h('button', { class: 'btn line', title: 'Open every level below this ' + N[0], onclick: () => { if (nd.open) { nd.open = false; } toggle(nd, true); } }, 'Expand branch'));
  pb.appendChild(acts);

  const ps = c.sup.concat(c.def.filter((p) => c.sup.indexOf(p) < 0));
  if (ps.length) pb.appendChild(sec(M.mode === 'skos' ? 'Broader concepts' : 'Superclasses', ps.length, capped(ps, (p) => [classLink(p),
    c.sup.indexOf(p) < 0 ? h('span', { class: 'tag', title: 'Named in the equivalent-class definition', text: 'from definition' }) : null,
    ps.length > 1 && nd && nd.parent && nd.parent.i === p ? h('span', { class: 'tag', title: 'The tree shows each class once, under this parent', text: 'tree position' }) : null])));
  const ks = (kidsAll[i] || []).slice().sort((a, b) => collator.compare(cname[a], cname[b]));
  if (ks.length) pb.appendChild(sec(M.mode === 'skos' ? 'Narrower concepts' : 'Subclasses', ks.length,
    nd && nd.desc > ks.length ? h('p', { class: 'note', text: nf.format(nd.desc) + ' in the whole branch' }) : null, capped(ks, classLink)));

  const dps = domProps[i], obj = dps.filter((p) => M.props[p].kind !== 'data' && M.props[p].kind !== 'annotation'), dat = dps.filter((p) => M.props[p].kind === 'data' || M.props[p].kind === 'annotation');
  if (obj.length) pb.appendChild(sec('Properties from this ' + N[0], obj.length, capped(obj, (p) => {
    const pr = M.props[p], out = [propLink(p), h('span', { class: 'arrow', text: '→' })];
    if (pr.rng.length) pr.rng.forEach((r, j) => { if (j) out.push(', '); out.push(classLink(r)); });
    else if (pr.rdt.length) out.push(pr.rdt.map(dtName).join(', '));
    else out.push(h('span', { class: 'expr mut', text: pr.rngx.length ? 'a class expression' : 'anything' }));
    return out;
  })));
  if (dat.length) pb.appendChild(sec('Data properties', dat.length, capped(dat, (p) => {
    const pr = M.props[p];
    return [propLink(p), pr.rdt.length ? [h('span', { class: 'arrow', text: ':' }), pr.rdt.map(dtName).join(', ')] : null];
  })));
  const rps = rngProps[i];
  if (rps.length) pb.appendChild(sec('Properties pointing here', rps.length, capped(rps, (p) => {
    const pr = M.props[p], out = [];
    if (pr.dom.length) pr.dom.forEach((d, j) => { if (j) out.push(', '); out.push(classLink(d)); }); else out.push(h('span', { class: 'expr mut', text: 'anything' }));
    out.push(h('span', { class: 'arrow', text: '→' }), propLink(p));
    return out;
  })));

  if (c.eq.length) pb.appendChild(sec('Equivalent to', null, h('ul', { class: 'list expr' }, c.eq.map((e) => h('li', null, exprNode(e))))));
  if (c.supx.length) pb.appendChild(sec(M.mode === 'skos' ? 'Related concepts' : 'Restrictions', c.supx.length,
    M.mode === 'skos' ? null : h('p', { class: 'note', text: 'Every member of this class also satisfies:' }), capped(c.supx, (e) => h('span', { class: 'expr' }, exprNode(e)), 30)));
  const used = relIn[i].filter((r) => r.k !== 'prop' && r.k !== 'related');
  if (used.length) pb.appendChild(sec('Used in restrictions of', used.length, capped(used, (r) => [classLink(r.s), h('span', { class: 'arrow' }), h('span', { class: 'expr' }, propLink(r.p), ' ', h('span', { class: 'kw', text: r.k + (r.n !== undefined ? ' ' + r.n : '') }))])));

  /* inherited properties */
  const anc = [], seen = new Set([i]);
  let fr = [i];
  while (fr.length && anc.length < 400) {
    const nx = [];
    fr.forEach((x) => C[x].sup.concat(C[x].def).forEach((p) => { if (!seen.has(p)) { seen.add(p); anc.push(p); nx.push(p); } }));
    fr = nx;
  }
  const inh = anc.filter((a) => domProps[a].length);
  if (inh.length) {
    const total = inh.reduce((s, a) => s + domProps[a].length, 0);
    const box = sec('Inherited properties', total);
    inh.forEach((a) => {
      box.appendChild(h('details', null, h('summary', null, 'From ' + cname[a] + ' ', h('span', { class: 'n', style: 'color:var(--ink3)', text: '(' + domProps[a].length + ')' })),
        capped(domProps[a], (p) => { const pr = M.props[p]; return [propLink(p), h('span', { class: 'arrow', text: pr.kind === 'data' ? ':' : '→' }), pr.rng.length ? pr.rng.map((r, j) => [j ? ', ' : '', classLink(r)]) : pr.rdt.length ? pr.rdt.map(dtName).join(', ') : h('span', { class: 'expr mut', text: 'anything' })]; }, 40)));
    });
    pb.appendChild(box);
  }

  if (c.dj.length) {
    const dj = new Set();
    c.dj.forEach((gi) => M.groups[gi].forEach((x) => { if (x !== i) dj.add(x); }));
    const arr = Array.from(dj).sort((a, b) => collator.compare(cname[a], cname[b]));
    if (arr.length) pb.appendChild(sec('Disjoint with', arr.length, capped(arr, classLink, 12)));
  }
  if (c.ind.length) pb.appendChild(sec('Individuals', c.ind.length, capped(c.ind, indLink, 20)));
  if (obsOut[i].length || obsIn[i].length) {
    const rows = obsOut[i].map((r) => [1, r]).concat(obsIn[i].filter((r) => r.s !== i).map((r) => [0, r])).sort((a, b) => b[1].n - a[1].n);
    pb.appendChild(sec('Statements between individuals', null,
      h('p', { class: 'note', text: 'Counted from the data, per property and class of the other individual.' }),
      capped(rows, (r) => r[0] ? [propLink(r[1].p), h('span', { class: 'arrow', text: '\u2192' }), classLink(r[1].o), h('span', { class: 'tag', text: nf.format(r[1].n) })]
        : [classLink(r[1].s), h('span', { class: 'arrow', text: '\u2192' }), propLink(r[1].p), h('span', { class: 'tag', text: nf.format(r[1].n) })], 20)));
  }
  append(pb, annotations(c.ann));
}

function renderProp(pb, i) {
  const p = M.props[i];
  const kind = h('div', { class: 'kind' }, propKindName(p));
  p.chars.forEach((ch) => kind.appendChild(h('span', { class: 'tag', text: ch.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() })));
  if (p.dep) kind.appendChild(h('span', { class: 'tag warn', text: 'deprecated' }));
  if (!p.declared) kind.appendChild(h('span', { class: 'tag', text: 'not declared in this file' }));
  pb.appendChild(kind);
  pb.appendChild(h('h1', { class: 'title', text: pname[i] }));
  pb.appendChild(iriLine(p.iri));
  append(pb, textBlocks(p.comments));
  const n = propRels[i].length;
  if (n && S.view !== 'focus') pb.appendChild(h('div', { class: 'callout', text: 'The picture shows where this property is used: ' + plural(n, 'link', 'links') + '. Dashed links end inside a collapsed branch.' }));
  const anyList = (cl, dt, ex) => {
    const ul = h('ul', { class: 'list' });
    cl.forEach((c) => ul.appendChild(h('li', null, classLink(c))));
    dt.forEach((d) => ul.appendChild(h('li', { title: d, text: dtName(d) })));
    ex.forEach((e) => ul.appendChild(h('li', { class: 'expr' }, exprNode(e))));
    return ul;
  };
  if (p.dom.length + p.domx.length) pb.appendChild(sec('Domain', null, anyList(p.dom, [], p.domx)));
  if (p.rng.length + p.rdt.length + p.rngx.length) pb.appendChild(sec('Range', null, anyList(p.rng, p.rdt, p.rngx)));
  if (p.sup.length) pb.appendChild(sec('Sub-property of', null, capped(p.sup, propLink)));
  if (subProps[i].length) pb.appendChild(sec('Sub-properties', subProps[i].length, capped(subProps[i], propLink)));
  if (p.inv.length) pb.appendChild(sec('Inverse of', null, capped(p.inv, propLink)));
  const rs = propRels[i].filter((r) => r.k !== 'prop' && r.k !== 'related');
  if (rs.length) pb.appendChild(sec('Used in restrictions', rs.length, capped(rs, (r) => [classLink(r.s), ' ', h('span', { class: 'kw', text: r.k + (r.n !== undefined ? ' ' + r.n : '') }), ' ', classLink(r.o)])));
  if (p.uses) {
    const u = propUse[i], pairs = [];
    for (let q = 0; q < u.length; q += 2) pairs.push([u[q], u[q + 1]]);
    pb.appendChild(sec('Used in the data', p.uses, pairs.length
      ? [pairs.length < p.uses && p.kind === 'object' && pairs.length >= 200 ? h('p', { class: 'note', text: 'The first ' + pairs.length + ' statements between individuals:' }) : null,
        capped(pairs, (x) => [indLink(x[0]), h('span', { class: 'arrow', text: '\u2192' }), indLink(x[1])], 20)]
      : h('p', { class: 'note', text: plural(p.uses, 'value', 'values') + ' on individuals. Open an individual to see them.' })));
  }
  append(pb, annotations(p.ann));
}

function renderInd(pb, i) {
  const ind = M.inds[i];
  const kind = h('div', { class: 'kind' }, 'Individual');
  if (!ind.types.length) kind.appendChild(h('span', { class: 'tag', text: 'no class' }));
  if (!ind.explicit) kind.appendChild(h('span', { class: 'tag', title: 'It has no type; it counts as an individual because of the statements it takes part in.', text: 'not typed in this file' }));
  pb.appendChild(kind);
  pb.appendChild(h('h1', { class: 'title', text: indName(ind) }));
  pb.appendChild(iriLine(ind.iri));
  const acts = h('div', { class: 'acts' });
  if (S.view !== 'focus') acts.appendChild(h('button', { class: 'btn line', onclick: () => setView('focus') }, 'Focus on this'));
  else acts.appendChild(h('button', { class: 'btn line', onclick: () => setView(lastTreeView) }, 'Show in tree'));
  pb.appendChild(acts);
  if (ind.types.length) pb.appendChild(sec('Instance of', ind.types.length > 1 ? ind.types.length : null, capped(ind.types, classLink)));
  const out = [], inn = [], dv = [], ov = [];
  for (let q = 0; q < ind.out.length; q += 2) out.push([ind.out[q], ind.out[q + 1]]);
  for (let q = 0; q < indIn[i].length; q += 2) inn.push([indIn[i][q], indIn[i][q + 1]]);
  for (let q = 0; q < ind.dv.length; q += 4) dv.push([ind.dv[q], ind.dv[q + 1], ind.dv[q + 2], ind.dv[q + 3]]);
  for (let q = 0; q < ind.ov.length; q += 2) ov.push([ind.ov[q], ind.ov[q + 1]]);
  if (out.length) pb.appendChild(sec('Statements', out.length, capped(out, (x) => [propLink(x[0]), h('span', { class: 'arrow', text: '\u2192' }), indLink(x[1])], 30)));
  if (inn.length) pb.appendChild(sec('Referenced by', inn.length, capped(inn, (x) => [indLink(x[1]), h('span', { class: 'arrow', text: '\u2192' }), propLink(x[0])], 30)));
  if (dv.length) pb.appendChild(sec('Data values', dv.length, capped(dv, (x) => {
    const tag = x[2] || (x[3] && x[3] !== 'http://www.w3.org/2001/XMLSchema#string' ? compact(x[3]) : '');
    return [propLink(x[0]), h('span', { class: 'arrow', text: ':' }), /^https?:\/\/\S+$/.test(x[1]) ? h('a', { href: x[1], target: '_blank', rel: 'noopener noreferrer', text: x[1] }) : trunc(x[1], 400), tag ? h('span', { class: 'tag', text: tag }) : null];
  }, 30)));
  if (ov.length) pb.appendChild(sec('Other links', ov.length, h('p', { class: 'note', text: 'Targets that are not individuals in this file.' }), capped(ov, (x) => [propLink(x[0]), h('span', { class: 'arrow', text: '\u2192' }),
    /^https?:\/\//.test(x[1]) ? h('a', { href: x[1], target: '_blank', rel: 'noopener noreferrer', text: compact(x[1]) }) : compact(x[1])], 30)));
  if (!out.length && !inn.length && !dv.length && !ov.length) pb.appendChild(h('div', { class: 'callout', text: 'The file says nothing about this individual beyond its name and class.' }));
}

function renderOverview(pb) {
  const st = M.stats, o = M.ontology, N = nouns();
  pb.appendChild(h('div', { class: 'kind' }, M.mode === 'skos' ? 'Concept scheme' : 'Ontology', (M.formats || []).filter((f, j, a) => a.indexOf(f) === j).map((f) => h('span', { class: 'tag', text: f === 'rdfxml' ? 'RDF/XML' : 'Turtle' }))));
  pb.appendChild(h('h1', { class: 'title', text: (o && o.title) || fileLabel }));
  if (o) pb.appendChild(iriLine(o.iri));
  if (o && o.description) append(pb, textBlocks([[o.description, '']]));
  const cells = [[st.classes, N[1]], [st.objectProps + st.otherProps, 'object and other properties'], [st.dataProps, 'data properties'], [st.individuals, 'individuals'], [st.restrictions, 'restrictions'], [maxDepth, 'levels deep']];
  const grid = h('div', { class: 'stats' });
  cells.forEach((c) => grid.appendChild(h('div', null, h('b', { text: nf.format(c[0]) }), h('span', { text: c[1] }))));
  pb.appendChild(h('section', { class: 'sec' }, grid));
  const dl = h('dl', { class: 'kv' });
  const kv = (k, v) => { if (v) { dl.appendChild(h('dt', { text: k })); dl.appendChild(h('dd', { text: v })); } };
  kv('Version', o && (o.version || o.versionIri));
  kv('License', o && o.license);
  kv('Statements', nf.format(st.triples));
  kv('Annotation properties', st.annotationProps ? nf.format(st.annotationProps) : '');
  kv('Statements between individuals', st.assertions ? nf.format(st.assertions) : '');
  kv('Data values on individuals', st.dataValues ? nf.format(st.dataValues) : '');
  if (loadInfo && !isSample) kv('Read in', (loadInfo.ms < 1000 ? Math.round(loadInfo.ms) + ' ms' : (loadInfo.ms / 1000).toFixed(1) + ' s') + (loadInfo.bytes ? ' (' + (loadInfo.bytes / 1048576 < 0.1 ? Math.max(1, Math.round(loadInfo.bytes / 1024)) + ' KB' : (loadInfo.bytes / 1048576).toFixed(1) + ' MB') + ')' : ''));
  pb.appendChild(h('section', { class: 'sec' }, dl));
  const notes = [];
  if (st.deprecated && !S.f.dep) notes.push([plural(st.deprecated, 'deprecated ' + N[0] + ' is hidden. ', 'deprecated ' + N[1] + ' are hidden. '), 'Show them', () => { S.f.dep = true; rebuild(true); renderPanel(); }]);
  const ext = st.classes - st.declared;
  if (ext) notes.push([plural(ext, N[0] + ' is', N[1] + ' are') + ' used here but declared elsewhere' + (o && o.imports.length ? ', probably in an import.' : '.') + (extGroup ? ' Those without a place in the hierarchy are grouped at the bottom of the tree.' : ''), null, null]);
  if (st.gci) notes.push([plural(st.gci, 'general class axiom is', 'general class axioms are') + ' not shown; they have no named class on the left side.', null, null]);
  notes.forEach((nt) => pb.appendChild(h('div', { class: 'callout' }, nt[0], nt[1] ? h('button', { class: 'more', text: nt[1], onclick: nt[2] }) : null)));
  if (root && branchKids().length) {
    const b = branchParent();
    const tops = branchKids().sort((x, y) => y.desc - x.desc), mx = Math.max(1, tops[0] ? tops[0].desc + 1 : 1);
    const ul = h('ul', { class: 'list branches' });
    const row = (k) => h('li', null, h('span', { class: 'dot', style: 'background:' + branchColor(k.branch) }),
      h('button', { class: 'lnk', title: k.name, onclick: () => selectClass(k.i, {}) }, k.name),
      h('span', { class: 'bar' }, h('i', { style: 'width:' + Math.max(2, (k.desc + 1) / mx * 100) + '%;background:' + branchColor(k.branch) })),
      h('span', { class: 'cnt', text: nf.format(k.desc + 1) }));
    tops.slice(0, 14).forEach((k) => ul.appendChild(row(k)));
    const s = sec(b === root ? 'Top-level branches' : 'Branches of ' + b.name, tops.length, ul);
    if (tops.length > 14) { const more = h('button', { class: 'more', text: 'Show all ' + nf.format(tops.length), onclick: () => { tops.slice(14, 600).forEach((k) => ul.appendChild(row(k))); more.remove(); } }); s.appendChild(more); }
    pb.appendChild(s);
  }
  const loose = [];
  M.inds.forEach((ind, j) => { if (!ind.types.length) loose.push(j); });
  if (loose.length) pb.appendChild(sec('Individuals without a class', loose.length, h('p', { class: 'note', text: 'They have no place in the tree. Open one to see its statements.' }), capped(loose, indLink, 12)));
  if (o && o.imports.length) pb.appendChild(sec('Imports', o.imports.length, h('p', { class: 'note', text: 'Imports are not fetched. To see them, drop the imported files together with this one.' }),
    h('ul', { class: 'list' }, o.imports.map((x) => h('li', { class: 'iri', text: x })))));
}

let propFilter = '';
function renderPropList(pb) {
  const input = h('input', { id: 'pfilter', type: 'text', placeholder: 'Filter properties', 'aria-label': 'Filter properties', autocomplete: 'off', spellcheck: 'false', value: propFilter });
  const box = h('div');
  const fill = () => {
    box.textContent = '';
    const q = propFilter.trim().toLowerCase();
    const groups = [['object', 'Object properties'], ['data', 'Data properties'], ['rdf', 'Other properties'], ['annotation', 'Annotation properties']];
    let any = false;
    groups.forEach((gr) => {
      const list = [];
      M.props.forEach((p, i) => { if (p.kind === gr[0] && (!q || pname[i].toLowerCase().indexOf(q) >= 0 || localName(p.iri).toLowerCase().indexOf(q) >= 0)) list.push(i); });
      if (!list.length) return;
      any = true;
      list.sort((a, b) => collator.compare(pname[a], pname[b]));
      const wrap = h('div');
      const add = (from, to) => { for (let j = from; j < Math.min(to, list.length); j++) { const i = list[j], p = M.props[i]; const sig = propSignature(p);
        wrap.appendChild(h('button', { class: 'prow', onclick: () => selectProp(i), title: p.iri }, h('span', { class: 'nm' }, h('span', { class: 'pglyph ' + (p.kind === 'data' ? 'data' : p.kind === 'object' ? '' : 'other') }), pname[i]), sig ? h('span', { class: 'dr', text: sig.slice(2) }) : null)); } };
      add(0, 150);
      const s = sec(gr[1], list.length, wrap);
      if (list.length > 150) { const more = h('button', { class: 'more', text: 'Show all ' + nf.format(list.length), onclick: () => { add(150, 5000); more.remove(); } }); s.appendChild(more); }
      box.appendChild(s);
    });
    if (!any) box.appendChild(h('p', { class: 'desc', style: 'color:var(--ink2)', text: M.props.length ? 'No property matches "' + propFilter.trim() + '".' : 'This file declares no properties.' }));
  };
  input.addEventListener('input', () => { propFilter = input.value; fill(); });
  pb.appendChild(input);
  pb.appendChild(box);
  fill();
}

/* ---------- controls on the canvas ---------- */

function buildControls() {
  const ctl = $('ctl');
  const b = (ic, label, fn, key) => h('button', { class: 'btn icon', 'aria-label': label, title: label + (key ? ' (' + key + ')' : ''), onclick: fn }, icon(ic));
  ctl.appendChild(h('div', { class: 'group' }, b('minus', 'Zoom out', () => zoomBy(1 / 1.3), '−'), h('span', { class: 'val', id: 'zoomVal', text: '100%' }), b('plus', 'Zoom in', () => zoomBy(1.3), '+'),
    h('button', { class: 'btn', title: 'Fit everything on screen (F)', onclick: fitView }, 'Fit')));
  ctl.appendChild(h('div', { class: 'group', id: 'lvlGroup' }, h('span', { class: 'lbl', text: 'Levels' }), b('minus', 'Collapse the deepest level', () => stepLevel(-1), '['), h('span', { class: 'val', id: 'lvlVal', style: 'min-width:54px', text: '' }),
    b('plus', 'Open one more level', () => stepLevel(1), ']'), h('button', { class: 'btn', title: 'Open every level (0)', onclick: () => setLevel(maxDepth) }, 'All')));
  ctl.appendChild(h('div', { class: 'group', id: 'allGroup', hidden: true }, h('button', { class: 'btn', id: 'allBtn', 'aria-pressed': 'false',
    title: 'Draw every link between classes at once, bundled along the hierarchy', onclick: () => { S.allLinks = !allLinksOn(); updateAllBtn(); draw(); } }, 'All links')));
  $('panelToggle').appendChild(icon('panel'));
  $('panelHide').appendChild(icon('close'));
  $('optBtn').insertBefore(icon('sliders'), $('optBtn').firstChild);
  $('expBtn').insertBefore(icon('download'), $('expBtn').firstChild);
  $('helpBtn').appendChild(icon('help'));
}
function updateDepthLabel() { const e = $('lvlVal'); if (e) e.textContent = Math.max(0, visibleDepth()) + ' of ' + maxDepth; }
let lastZoom = '';
function updateZoomLabel() { const t = Math.round(activeCam().k * 100) + '%'; if (t !== lastZoom) { lastZoom = t; $('zoomVal').textContent = t; } }
function activeCam() { return S.view === 'tree' ? cam : S.view === 'radial' ? rcam : fcam; }
function zoomAt(sx, sy, f) {
  const c = activeCam(), k1 = Math.max(MINK, Math.min(MAXK, c.k * f));
  c.x = sx - (sx - c.x) * k1 / c.k; c.y = sy - (sy - c.y) * k1 / c.k; c.k = k1;
  anim = null; settle(); draw();
}
function settle() {
  if (S.view !== 'focus') { for (let j = 0; j < vis.length; j++) { const n = vis[j]; n.x = n.nx; n.y = n.ny; n.rr = n.trr; n.th = n.tth; n.a = 1; } ghosts = []; }
  else if (F) F.nodes.forEach((o) => { o.x = o.nx; o.y = o.ny; });
}
function zoomBy(f) { zoomAt(W / 2, H / 2, f); }
function fitView() {
  if (S.view === 'tree') moveCam(fitCam(false));
  else if (S.view === 'radial') moveCam(fitRadial());
  else if (F) {
    const bx = F.box, pad = 40, padT = 64;
    const k = Math.max(0.2, Math.min(1, (W - pad * 2) / (bx[2] - bx[0]), (H - padT - pad - 40) / (bx[3] - bx[1])));
    fcam.k = k; fcam.x = W / 2 - (bx[0] + bx[2]) / 2 * k; fcam.y = padT + (H - padT - pad - 40) / 2 - (bx[1] + bx[3]) / 2 * k;
    draw();
  }
}

function renderFocusBar() {
  const fb = $('focusBar'), e = $('empty');
  fb.textContent = '';
  if (S.view !== 'focus') return;
  if (!F) {
    if (M.classes.length) {
      e.textContent = '';
      e.appendChild(h('div', null, h('h2', { text: 'Pick a ' + nouns()[0] + ' to focus on' }),
        h('p', { text: 'The focus view shows one ' + nouns()[0] + ' or individual with what it is connected to. Search for one above, or select it in the tree first.' }),
        h('button', { class: 'btn primary', onclick: () => setView(lastTreeView) }, 'Back to the tree')));
      e.hidden = false;
    }
    return;
  }
  e.hidden = true;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Distance' });
  [1, 2].forEach((n) => seg.appendChild(h('button', { 'aria-pressed': String(S.hops === n), title: n === 1 ? 'Direct neighbours only' : 'Neighbours of neighbours too', onclick: () => { S.hops = n; buildFocus(F.center, F.kind); } }, n === 1 ? '1 step' : '2 steps')));
  const shown = F.nodes.length - (F.omitted ? 1 : 0);
  fb.appendChild(h('div', { class: 'group' }, h('span', { class: 'muted', text: 'Around' }), h('span', { class: 'ttl', text: F.title }), seg));
  fb.appendChild(h('div', { class: 'group' }, h('span', { class: 'muted', text: F.omitted ? 'Showing ' + shown + ' of ' + nf.format(F.total) : F.kind === 'i' ? plural(shown, 'item', 'items') : plural(shown, nouns()[0], nouns()[1]) }),
    F.omitted ? h('button', { class: 'btn', onclick: moreFocus }, 'Show more') : null,
    h('button', { class: 'btn', onclick: () => setView(lastTreeView) }, 'Show in tree')));
}
function moreFocus() { S.cap = Math.min(400, S.cap + 40); buildFocus(F.center, F.kind); }

/* ---------- popovers ---------- */

let pop = null, popBtn = null;
function closePop() { if (pop) { pop.remove(); pop = null; if (popBtn) popBtn.setAttribute('aria-expanded', 'false'); popBtn = null; } }
function openPop(btn, build) {
  if (popBtn === btn) { closePop(); return; }
  closePop();
  pop = h('div', { class: 'pop', role: 'menu' });
  build(pop);
  $('app').appendChild(pop);
  const r = btn.getBoundingClientRect(), pw = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  popBtn = btn; btn.setAttribute('aria-expanded', 'true');
}
function item(ic, label, fn, hint) {
  return h('button', { class: 'item', role: 'menuitem', onclick: () => { closePop(); fn(); } }, icon(ic), label, hint ? h('span', { class: 'hint', text: hint }) : null);
}
function fileMenu(p) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  p.appendChild(item('open', 'Open file…', pickFile, (mac ? '⌘' : 'Ctrl+') + 'O'));
  p.appendChild(item('paste', 'Paste text…', pasteDialog));
  p.appendChild(item('sample', 'Load the sample', loadSample));
}
function optMenu(p) {
  const chk = (label, val, fn, n) => { const i = h('input', { type: 'checkbox' }); i.checked = val; i.addEventListener('change', () => fn(i.checked)); return h('label', { class: 'chk' }, i, label, n != null ? h('span', { class: 'n', text: nf.format(n) }) : null); };
  const N = nouns();
  p.appendChild(h('h4', { text: 'Names' }));
  const mode = h('select', { 'aria-label': 'Names shown' }, h('option', { value: 'label', text: 'Labels' }), h('option', { value: 'id', text: 'Identifiers' }));
  mode.value = S.labelMode;
  mode.addEventListener('change', () => { S.labelMode = mode.value; rebuild(true); renderPanel(); });
  const row = h('div', { class: 'row' }, mode);
  const langs = Object.keys(M.langs).filter((l) => l).map((l) => l.toLowerCase()).filter((l, j, a) => a.indexOf(l) === j).sort();
  if (langs.length > 1) {
    const ls = h('select', { 'aria-label': 'Label language' }, langs.map((l) => h('option', { value: l, text: l })));
    ls.value = S.lang;
    ls.addEventListener('change', () => { S.lang = ls.value; rebuild(true); renderPanel(); });
    row.appendChild(ls);
  }
  p.appendChild(row);
  p.appendChild(h('h4', { text: 'Order of children' }));
  const so = h('select', { 'aria-label': 'Order of children' }, h('option', { value: 'az', text: 'A to Z' }), h('option', { value: 'size', text: 'Largest branch first' }));
  so.value = S.sort;
  so.addEventListener('change', () => { S.sort = so.value; rebuild(true); });
  p.appendChild(h('div', { class: 'row' }, so));
  p.appendChild(h('hr'));
  p.appendChild(h('h4', { text: 'Show' }));
  if (M.stats.deprecated) p.appendChild(chk('Deprecated ' + N[1], S.f.dep, (v) => { S.f.dep = v; rebuild(true); renderPanel(); }, M.stats.deprecated));
  if (M.stats.classes - M.stats.declared) p.appendChild(chk('Classes declared elsewhere', S.f.ext, (v) => { S.f.ext = v; rebuild(true); renderPanel(); }, M.stats.classes - M.stats.declared));
  p.appendChild(chk('Minimap', S.f.mini, (v) => { S.f.mini = v; draw(); }));
  p.appendChild(h('hr'));
  p.appendChild(h('h4', { text: 'Links drawn for the selected ' + N[0] }));
  p.appendChild(chk('Properties (domain to range)', S.f.relProps, (v) => { S.f.relProps = v; arcKey = ''; draw(); }));
  p.appendChild(chk('Restrictions', S.f.relRestr, (v) => { S.f.relRestr = v; arcKey = ''; draw(); }));
  if (M.stats.assertions) p.appendChild(chk('Statements between individuals', S.f.relObs, (v) => { S.f.relObs = v; arcKey = ''; if (S.view === 'focus' && F) buildFocus(F.center, F.kind); else draw(); }, M.stats.assertions));
  p.appendChild(chk('Additional parents', S.f.secondary, (v) => { S.f.secondary = v; arcKey = ''; draw(); }));
}
function expMenu(p) {
  p.appendChild(item('download', 'Save image (PNG)', () => exportPng(false)));
  p.appendChild(item('image', 'Show image here', () => exportPng(true)));
  p.appendChild(item('text', 'Copy outline as text', copyOutline));
}

/* ---------- dialogs ---------- */

let modalClose = null;
function openModal(title, body, footer, wide) {
  closePop();
  const m = $('modal');
  m.textContent = '';
  const close = () => { m.hidden = true; m.textContent = ''; modalClose = null; };
  const dlg = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? 'width:min(860px,100%)' : null },
    h('header', null, h('h2', { text: title }), h('button', { class: 'btn icon', 'aria-label': 'Close', onclick: close }, icon('close'))),
    h('div', { class: 'body' }, body), footer ? h('footer', null, footer) : h('div', { style: 'height:14px' }));
  m.appendChild(dlg);
  m.hidden = false;
  m.onmousedown = (ev) => { if (ev.target === m) close(); };
  modalClose = close;
  const f = dlg.querySelector('textarea, footer .btn.primary, header .btn');
  if (f) f.focus();
  return close;
}
function pasteDialog() {
  const ta = h('textarea', { placeholder: '@prefix ex: <http://example.org/> .\nex:Dog a owl:Class ; rdfs:subClassOf ex:Animal .', spellcheck: 'false', 'aria-label': 'Ontology text' });
  const go = () => { const t = ta.value; if (!t.trim()) { ta.focus(); return; } close(); loadText(t, 'Pasted text'); };
  const close = openModal('Paste an ontology', [h('p', { text: 'Paste Turtle, N-Triples or RDF/XML. The format is detected from the text.' }), ta],
    [h('button', { class: 'btn line', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, 'Open')]);
  ta.focus();
}
function helpDialog() {
  const keys = [['/', 'Search'], ['← ↑ → ↓', 'Move through the tree; → opens a branch, ← closes it'], ['Space', 'Open or close the selected branch'], ['E', 'Open the whole branch below the selection'],
    ['1 … 9', 'Show the tree down to that level'], ['[  ]', 'One level less, one level more'], ['0', 'Open every level'], ['F', 'Fit everything on screen'], ['C', 'Centre the selection'],
    ['G', 'Next view: tree, circle, focus'], ['+  −', 'Zoom'], ['P', 'Show or hide the details panel'], ['T', 'Light or dark'], ['Esc', 'Clear the search, then the selection']];
  const dl = h('dl', { class: 'keys' });
  keys.forEach((k) => { dl.appendChild(h('dt', null, k[0].split('  ').map((x) => [h('kbd', { text: x }), ' ']))); dl.appendChild(h('dd', { text: k[1] })); });
  const lg = h('div', { class: 'legend' });
  const sw = (svg, text) => { const s = h('span'); s.innerHTML = '<svg viewBox="0 0 64 18" fill="none" stroke-width="1.7" stroke-linecap="round">' + svg + '</svg>'; lg.appendChild(s.firstChild); lg.appendChild(h('span', { text: text })); };
  sw('<path d="M9 9h13M44 3.5H25a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h19" stroke="' + mix(TH.branch[0], TH.bg, 0.3) + '"/><circle cx="6" cy="9" r="3" fill="' + TH.bg + '" stroke="' + TH.branch[0] + '"/><circle cx="48" cy="3.5" r="2.6" fill="' + TH.branch[0] + '"/><circle cx="48" cy="14.5" r="2.6" fill="' + TH.branch[0] + '"/>', 'Hierarchy: a subclass sits to the right of its parent. Colour marks the top-level branch.');
  sw('<path d="M2 14C24 14 38 4 58 4" stroke="' + TH.rel + '"/><path d="M62 4l-7-3.5v7z" fill="' + TH.rel + '"/>', 'Property: from its domain to its range.');
  sw('<path d="M2 14C24 14 38 4 58 4" stroke="' + TH.restr + '"/><path d="M62 4l-7-3.5v7z" fill="' + TH.restr + '"/>', 'Restriction, such as "plays some Violin".');
  sw('<path d="M2 14C24 14 38 4 58 4" stroke="' + TH.ink + '"/><path d="M62 4l-7-3.5v7z" fill="' + TH.ink + '"/>', 'Statements between individuals, counted per pair of classes. A number in brackets is that count.');
  sw('<path d="M2 14C24 14 38 4 58 4" stroke="' + TH.rel + '" stroke-dasharray="6 4"/>', 'Dashed: the other end is inside a collapsed branch.');
  sw('<path d="M2 14C24 14 38 4 58 4" stroke="' + TH.ink2 + '" stroke-dasharray="1.5 4"/>', 'Dotted: an additional parent. The tree shows each class once.');
  openModal('How to read and move around', [
    h('p', { text: 'The tree only shows the hierarchy. Links between classes appear when you select or point at a class, so the picture stays readable however large the ontology is.' }),
    h('h3', { text: 'Lines' }), lg,
    h('p', { text: 'The circle view puts the same tree on a circle: classes at the end of a branch sit on the rim, open branches inside it. Links run through the middle and follow the hierarchy, so those that go the same way share a path. "All links" draws every one of them at once.' }),
    h('p', { text: 'Individuals are listed under their class and found by the search. Selecting one shows what the file states about it, and the focus view draws it with the individuals it is linked to.' }),
    h('h3', { text: 'Mouse and trackpad' }),
    h('p', { text: 'Drag to move. Scroll to pan, and pinch or hold Ctrl (⌘ on a Mac) while scrolling to zoom. Click a name to select it, click its dot to open or close the branch, and Alt-click the dot to open everything below. The numbers along the top edge collapse the tree to that level.' }),
    h('h3', { text: 'Keyboard' }), dl,
    h('p', { text: 'Canopy runs entirely in this page. Files you open are read by your browser and are not sent anywhere.' })]);
}
function showError(e) {
  const body = [];
  if (e && e.file) body.push(h('p', null, h('b', { style: 'color:var(--ink)', text: e.file })));
  if (e && e.name === 'ParseError') {
    body.push(h('p', { style: 'color:var(--ink)', text: 'Line ' + nf.format(e.line) + ', column ' + e.col + ': ' + e.message }));
    if (e.excerpt) body.push(h('pre', { class: 'errbox' }, e.excerpt + '\n', h('span', { class: 'car', text: ' '.repeat(Math.max(0, e.caret)) + '^' })));
    body.push(h('p', { text: 'Nothing was loaded. Fix the file and open it again; the view you had is still there.' }));
  } else if (e && e.name === 'FormatError') {
    body.push(h('p', { style: 'color:var(--ink)', text: e.message }));
    body.push(h('p', { text: 'Canopy reads RDF/XML (.owl, .rdf), Turtle (.ttl) and N-Triples (.nt).' }));
  } else {
    body.push(h('p', { style: 'color:var(--ink)', text: 'The file could not be read: ' + ((e && e.message) || 'unknown error') + '.' }));
    body.push(h('p', { text: 'If the file is very large, the browser may have run out of memory.' }));
  }
  const close = openModal('This file could not be opened', body, [h('button', { class: 'btn line', onclick: () => { close(); pickFile(); } }, 'Open another file'), h('button', { class: 'btn primary', onclick: () => close() }, 'Close')]);
}
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function busy(msg) {
  const b = $('busy');
  if (!msg) { b.hidden = true; return; }
  b.querySelector('b').textContent = msg;
  b.hidden = false;
}
function copyText(text, done) {
  const fallback = () => {
    const ta = h('textarea', { readonly: true, 'aria-label': 'Text to copy' });
    ta.value = text;
    openModal('Copy this text', [h('p', { text: 'The browser did not allow direct access to the clipboard here. Select the text and copy it.' }), ta]);
    ta.focus(); ta.select();
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
    else fallback();
  } catch (e) { fallback(); }
}

/* ---------- export ---------- */

function copyOutline() {
  const lines = [];
  const walk = (n, prefix, last, top) => {
    lines.push((top ? '' : prefix + (last ? '└─ ' : '├─ ')) + n.name + (n.kids.length && !n.open ? '  (+' + n.desc + ')' : ''));
    if (n.open) for (let j = 0; j < n.kids.length && lines.length < 50000; j++) walk(n.kids[j], top ? '' : prefix + (last ? '   ' : '│  '), j === n.kids.length - 1, false);
  };
  walk(root, '', true, true);
  copyText(lines.join('\n'), 'Outline copied, ' + plural(lines.length, 'line', 'lines'));
}
function exportPng(show) {
  if (!M) return;
  anim = null; settle();
  let w, h0, c, s;
  const cvs = document.createElement('canvas');
  if (S.view === 'tree') {
    const pad = 28;
    w = bounds.w + pad * 2; h0 = bounds.h + pad * 2;
    s = Math.min(2, 16000 / w, 16000 / h0, Math.sqrt(90e6 / (w * h0)));
    cvs.width = Math.max(1, Math.round(w * s)); cvs.height = Math.max(1, Math.round(h0 * s));
    c = cvs.getContext('2d');
    renderTree(c, cvs.width, cvs.height, { x: pad * s, y: (pad + ROW / 2) * s, k: s }, true);
  } else if (S.view === 'radial') {
    const D = 2 * (radT.R + radT.label + 30);
    s = Math.min(2, 12000 / D);
    cvs.width = Math.round(D * s); cvs.height = Math.round(D * s);
    c = cvs.getContext('2d');
    renderRadial(c, cvs.width, cvs.height, { x: cvs.width / 2, y: cvs.height / 2, k: s }, true);
    draw();
  } else {
    if (!F) { toast('Select a class first'); return; }
    const pad = 40, bx = F.box;
    w = bx[2] - bx[0] + pad * 2; h0 = bx[3] - bx[1] + pad * 2; s = 2;
    cvs.width = Math.round(w * s); cvs.height = Math.round(h0 * s);
    c = cvs.getContext('2d');
    renderFocus(c, cvs.width, cvs.height, { x: (pad - bx[0]) * s, y: (pad - bx[1]) * s, k: s }, true);
  }
  draw();
  const name = (fileLabel.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'ontology') + (S.view === 'tree' ? '-tree' : S.view === 'radial' ? '-circle' : '-focus') + '.png';
  const small = S.view !== 'focus' && 13 * s < 7;
  const note = small ? 'The tree is too large for a sharp image. Collapse some branches for readable labels.' : '';
  const showIt = (url) => {
    const img = h('img', { src: url, alt: 'Exported image of the current view' });
    openModal('Image of the current view', [h('p', { text: (note ? note + ' ' : '') + 'Right-click the image to save or copy it.' }), img], null, true);
  };
  try {
    if (show) { showIt(cvs.toDataURL('image/png')); return; }
    cvs.toBlob((blob) => {
      if (!blob) { toast('The image is too large to create. Collapse some branches and try again.'); return; }
      const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(note || 'Saved ' + name);
    }, 'image/png');
  } catch (e) { toast('The image could not be created: ' + e.message); }
}

/* ---------- files ---------- */

function pickFile() { const f = $('file'); f.value = ''; f.click(); }
function makeWorker() {
  const src = CanopyCore.toString() + '\nvar C = CanopyCore();\npostMessage({ready:true});\nonmessage = function (e) { try { var docs = e.data.docs.map(function (d) { return { name: d.name, text: d.text != null ? d.text : C.decodeBytes(d.buf) }; }); postMessage({ ok: true, model: C.load(docs) }); } catch (err) { postMessage({ ok: false, error: { message: err.message, name: err.name, line: err.line, col: err.col, excerpt: err.excerpt, caret: err.caret, file: err.file } }); } };';
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  w._url = url;
  return w;
}
function parseDocs(docs) {
  return new Promise((resolve, reject) => {
    const sync = () => setTimeout(() => {
      try { resolve(Core.load(docs.map((d) => ({ name: d.name, text: d.text != null ? d.text : Core.decodeBytes(d.buf) })))); } catch (e) { reject(e); }
    }, 40);
    let w = null, done = false, ready = false;
    try { w = makeWorker(); } catch (e) { w = null; }
    usedWorker = !!w;
    if (!w) { sync(); return; }
    const stop = () => { try { w.terminate(); URL.revokeObjectURL(w._url); } catch (e) { /* already gone */ } };
    const giveUp = () => { if (done) return; done = true; usedWorker = false; stop(); sync(); };
    const timer = setTimeout(() => { if (!ready) giveUp(); }, 2500);
    w.onmessage = (ev) => {
      if (done) return;
      if (ev.data.ready) { ready = true; clearTimeout(timer); return; }
      done = true; stop();
      if (ev.data.ok) resolve(ev.data.model);
      else { const e = new Error(ev.data.error.message); Object.assign(e, ev.data.error); reject(e); }
    };
    w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); clearTimeout(timer); giveUp(); };
    try { w.postMessage({ docs: docs }); } catch (e) { giveUp(); }
  });
}
function readBuf(f) {
  if (f.arrayBuffer) return f.arrayBuffer();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); });
}
let loading = false, usedWorker = null;
function openFiles(list) {
  const files = Array.from(list || []);
  if (!files.length || loading) return;
  loading = true;
  const label = files.length === 1 ? files[0].name : files[0].name + ' + ' + (files.length - 1) + ' more';
  busy('Reading ' + label);
  const t0 = performance.now();
  let bytes = 0;
  Promise.all(files.map(readBuf)).then((bufs) => {
    bufs.forEach((b) => { bytes += b.byteLength; });
    return parseDocs(files.map((f, j) => ({ name: f.name, buf: bufs[j] })));
  }).then((model) => {
    loadInfo = { ms: performance.now() - t0, bytes: bytes };
    setModel(model, label, false);
  }).catch(showError).then(() => { loading = false; busy(null); });
}
function loadText(text, label) {
  if (loading) return;
  loading = true;
  busy('Reading ' + label.toLowerCase());
  const t0 = performance.now();
  parseDocs([{ name: label, text: text }]).then((model) => {
    loadInfo = { ms: performance.now() - t0, bytes: text.length };
    setModel(model, label, false);
  }).catch((e) => { if (e) e.file = null; showError(e); }).then(() => { loading = false; busy(null); });
}
function loadSample() {
  try {
    const m = Core.load([{ name: 'orchestra.ttl', text: $('sample-ttl').textContent }]);
    loadInfo = null;
    setModel(m, 'Orchestra (sample)', true);
  } catch (e) { showError(e); }
}

/* ---------- tooltip ---------- */

let tipTimer = 0;
function hideTip() { clearTimeout(tipTimer); $('tip').hidden = true; }
function scheduleTip(sx, sy) {
  hideTip();
  const hv = S.hover;
  if (!hv) return;
  tipTimer = setTimeout(() => {
    const t = $('tip');
    t.textContent = '';
    if (hv.level) { t.appendChild(h('b', { text: 'Level ' + hv.level })); t.appendChild(h('span', { text: 'Click to show the tree down to this level' })); }
    else {
      const n = hv.n, f = hv.f;
      if (f && f.k === 'i') {
        const ind = M.inds[f.i];
        t.appendChild(h('b', { text: indName(ind) }));
        t.appendChild(h('span', { text: ind.types.length ? 'Individual of ' + ind.types.slice(0, 4).map((x) => cname[x]).join(', ') : 'Individual without a class' }));
        t.appendChild(h('span', { text: plural(ind.out.length / 2 + indIn[f.i].length / 2, 'statement', 'statements') + (ind.dv.length ? ', ' + plural(ind.dv.length / 4, 'data value', 'data values') : '') }));
      } else if (f && f.stub) { t.appendChild(h('b', { text: f.t })); t.appendChild(h('span', { text: 'Click to show more neighbours' })); }
      else {
        const i = n ? n.i : f.i;
        if (i === -3) { t.appendChild(h('b', { text: plural(extGroup.kids.length, nouns()[0], nouns()[1]) + ' declared elsewhere' })); t.appendChild(h('span', { text: 'This file mentions them, for example in restrictions, but does not declare them. They usually come from an imported ontology.' })); }
        else if (i < 0) { t.appendChild(h('b', { text: root.name })); t.appendChild(h('span', { text: 'The root: every ' + nouns()[0] + ' is below it' })); }
        else {
          const c = M.classes[i], nd = nodes[i];
          t.appendChild(h('b', { text: cname[i] }));
          const bits = [];
          if (nd && nd.kids.length) bits.push(plural(nd.kids.length, 'direct sub' + nouns()[0], 'direct sub' + nouns()[1]) + (nd.desc > nd.kids.length ? ', ' + nf.format(nd.desc) + ' in the branch' : ''));
          if (par[i] && par[i].length > 1) bits.push(par[i].length + ' parents');
          if (c.ind.length) bits.push(plural(c.ind.length, 'individual', 'individuals'));
          if (bits.length) t.appendChild(h('span', { text: bits.join('; ') }));
          if (c.comments.length) { const cm = c.comments.slice().sort((a, b) => langRank(b[1]) - langRank(a[1]))[0][0]; t.appendChild(h('span', { style: 'margin-top:3px', text: trunc(cm.replace(/\s+/g, ' '), 150) })); }
        }
      }
    }
    t.hidden = false;
    const tw = t.offsetWidth, th = t.offsetHeight;
    t.style.left = Math.max(6, Math.min(W - tw - 6, sx + 14)) + 'px';
    t.style.top = (sy + 20 + th > H - 6 ? Math.max(6, sy - th - 12) : sy + 20) + 'px';
  }, 520);
}

/* ---------- pointer, wheel, keyboard ---------- */

const ptrs = new Map();
let down = null, pinch = null, dragF = null;
function local(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function setHover(hv, sx, sy) {
  const a = S.hover, same = (!a && !hv) || (a && hv && a.n === hv.n && a.level === hv.level && a.f === hv.f);
  if (same) return;
  S.hover = hv;
  cv.style.cursor = hv ? 'pointer' : '';
  arcKey = '';
  if (hv) scheduleTip(sx, sy); else hideTip();
  draw();
}
cv.addEventListener('pointerdown', (ev) => {
  if (ev.button > 1) return;
  cv.focus({ preventScroll: true });
  closePop(); $('results').hidden = true; hideTip();
  try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ }
  const p = local(ev);
  ptrs.set(ev.pointerId, p);
  if (ptrs.size === 2) {
    const a = Array.from(ptrs.values()), c = activeCam();
    pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, cx: (a[0][0] + a[1][0]) / 2, cy: (a[0][1] + a[1][1]) / 2, k: c.k, x: c.x, y: c.y };
    down = null; return;
  }
  const c = activeCam();
  down = { x: p[0], y: p[1], cx: c.x, cy: c.y, moved: false, id: ev.pointerId };
  dragF = null;
  if (S.view === 'focus') { const o = hitFocus(p[0], p[1]); if (o) dragF = { o: o, x: o.x, y: o.y }; }
});
cv.addEventListener('pointermove', (ev) => {
  const p = local(ev);
  if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, p);
  if (pinch && ptrs.size === 2) {
    const a = Array.from(ptrs.values()), c = activeCam();
    const d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, cx = (a[0][0] + a[1][0]) / 2, cy = (a[0][1] + a[1][1]) / 2;
    const k1 = Math.max(MINK, Math.min(MAXK, pinch.k * d / pinch.d));
    c.x = cx - (pinch.cx - pinch.x) * k1 / pinch.k; c.y = cy - (pinch.cy - pinch.y) * k1 / pinch.k; c.k = k1;
    anim = null; draw(); return;
  }
  if (down && ptrs.has(down.id)) {
    const dx = p[0] - down.x, dy = p[1] - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 4) { down.moved = true; hideTip(); if (anim) { anim = null; settle(); } cv.style.cursor = 'grabbing'; }
    if (down.moved) {
      if (dragF) { const o = dragF.o; o.x = o.nx = dragF.x + dx / fcam.k; o.y = o.ny = dragF.y + dy / fcam.k; }
      else { const c = activeCam(); c.x = down.cx + dx; c.y = down.cy + dy; }
      draw();
    }
    return;
  }
  if (ev.pointerType === 'touch') return;
  if (S.view === 'tree') { const ht = hitTree(p[0], p[1]); setHover(ht ? (ht.level ? { level: ht.level } : { n: ht.n }) : null, p[0], p[1]); }
  else if (S.view === 'radial') { const ht = hitRadial(p[0], p[1]); setHover(ht ? { n: ht.n } : null, p[0], p[1]); }
  else { const o = hitFocus(p[0], p[1]); setHover(o ? { f: o } : null, p[0], p[1]); }
});
function endPointer(ev) {
  const p = ptrs.get(ev.pointerId);
  ptrs.delete(ev.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; down = null; return; }
  if (!down || down.id !== ev.pointerId) return;
  const d = down;
  down = null; cv.style.cursor = S.hover ? 'pointer' : '';
  if (d.moved || ev.type === 'pointercancel' || !p) { dragF = null; return; }
  dragF = null;
  click(d.x, d.y, ev);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', () => { if (!down) setHover(null); });

function click(sx, sy, ev) {
  if (!M) return;
  if (S.view !== 'focus') {
    const ht = S.view === 'tree' ? hitTree(sx, sy) : hitRadial(sx, sy);
    if (!ht) { clearSel(); return; }
    if (ht.level) { setLevel(ht.level); return; }
    const n = ht.n;
    if ((ht.part === 'dot' || ht.part === 'chip') && n.kids.length) { toggle(n, ev.altKey); return; }
    if (n.i < 0) { if (n !== root && n.kids.length) toggle(n); else clearSel(); return; }
    selectClass(n.i, { reveal: false });
  } else {
    const o = hitFocus(sx, sy);
    if (!o) return;
    if (o.stub) { moreFocus(); return; }
    if (o.k === 'i') { if (!(F.kind === 'i' && o.i === F.center)) selectInd(o.i); }
    else if (!(F.kind === 'c' && o.i === F.center)) selectClass(o.i, {});
  }
}
cv.addEventListener('dblclick', (ev) => {
  if (S.view === 'focus' || !M) return;
  const p = local(ev), ht = S.view === 'tree' ? hitTree(p[0], p[1]) : hitRadial(p[0], p[1]);
  if (ht && ht.n && ht.n.i >= 0 && ht.part === 'label' && ht.n.kids.length) toggle(ht.n, ev.altKey);
});
cv.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  if (!M) return;
  const p = local(ev), unit = ev.deltaMode === 1 ? 18 : ev.deltaMode === 2 ? H : 1;
  let dx = ev.deltaX * unit, dy = ev.deltaY * unit;
  if (ev.ctrlKey || ev.metaKey) { zoomAt(p[0], p[1], Math.exp(-Math.max(-60, Math.min(60, dy)) * (ev.deltaMode === 0 && Math.abs(ev.deltaY) < 40 ? 0.012 : 0.0035))); return; }
  if (ev.shiftKey && !dx) { dx = dy; dy = 0; }
  const c = activeCam();
  if (anim) { anim = null; settle(); }
  c.x -= dx; c.y -= dy;
  hideTip();
  draw();
}, { passive: false });

mini.addEventListener('pointerdown', (ev) => { try { mini.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } mini._drag = true; miniTo(ev); });
mini.addEventListener('pointermove', (ev) => { if (mini._drag) miniTo(ev); });
mini.addEventListener('pointerup', () => { mini._drag = false; });
mini.addEventListener('pointercancel', () => { mini._drag = false; });

function navKey(key) {
  let n = selNode();
  if (!n || !isVisible(n)) { n = n ? visOf(n) : root.kids[0]; if (n && n.i >= 0) selectClass(n.i, {}); return; }
  let t = null;
  if (key === 'ArrowRight') { if (n.kids.length && !n.open) { toggle(n); return; } t = n.kids[0]; }
  else if (key === 'ArrowLeft') { if (n.kids.length && n.open) { toggle(n); return; } t = n.parent; }
  else { const cl = cols[n.depth], ix = cl.indexOf(n); t = cl[ix + (key === 'ArrowDown' ? 1 : -1)]; }
  if (t && t.i >= 0) selectClass(t.i, {});
}
window.addEventListener('keydown', (ev) => {
  const tg = ev.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'o' || ev.key === 'O')) { ev.preventDefault(); pickFile(); return; }
  if (ev.key === 'Escape') {
    if (modalClose) { modalClose(); return; }
    if (pop) { closePop(); return; }
    if (tg === $('search')) { if (!$('results').hidden && $('search').value) { $('results').hidden = true; } else { $('search').value = ''; runSearch(''); $('search').blur(); } return; }
    if (typing) { tg.blur(); return; }
    if (S.query) { $('search').value = ''; runSearch(''); return; }
    clearSel(); return;
  }
  if (typing || modalClose || ev.ctrlKey || ev.metaKey || ev.altKey || !M) return;
  const k = ev.key;
  if (k === '/') { ev.preventDefault(); $('search').focus(); $('search').select(); return; }
  if (k === '?') { helpDialog(); return; }
  if (k === 'f' || k === 'F') { fitView(); return; }
  if (k === 'g' || k === 'G') { setView(S.view === 'tree' ? 'radial' : S.view === 'radial' ? 'focus' : 'tree'); renderPanel(); return; }
  if (k === 't' || k === 'T') { applyTheme(S.theme === 'dark' ? 'light' : 'dark'); return; }
  if (k === 'p' || k === 'P') { togglePanel(); return; }
  if (k === '+' || k === '=') { zoomBy(1.3); return; }
  if (k === '-' || k === '_') { zoomBy(1 / 1.3); return; }
  if (S.view === 'focus') return;
  if (tg && tg.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return;
  if (k === 'c' || k === 'C') { const n = selNode(); if (n) reveal(n, true); return; }
  if (k === '0') { setLevel(maxDepth); return; }
  if (k >= '1' && k <= '9') { setLevel(parseInt(k, 10)); return; }
  if (k === '[') { stepLevel(-1); return; }
  if (k === ']') { stepLevel(1); return; }
  if (k === 'e' || k === 'E') { const n = selNode(); if (n && n.kids.length) { n.open = false; toggle(n, true); } return; }
  if (k === ' ' || k === 'Enter') { const n = selNode(); if (n && n.kids.length && isVisible(n)) { ev.preventDefault(); toggle(n); } return; }
  if (k.slice(0, 5) === 'Arrow') { ev.preventDefault(); navKey(k); }
});

function togglePanel() { $('app').classList.toggle('nopanel'); }

/* ---------- wiring ---------- */

function resize() {
  const st = $('stage'), w = st.clientWidth, h1 = st.clientHeight;
  if (!w || !h1) return;
  const d = Math.min(2.5, window.devicePixelRatio || 1);
  if (w === W && h1 === H && d === dpr) return;
  const refit = M && S.view === 'radial' && radReady && W > 0 && radialAtFit();
  W = w; H = h1; dpr = d;
  if (refit) { const f = fitRadial(); rcam.x = f.x; rcam.y = f.y; rcam.k = f.k; }
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  miniDirty = true;
  if (M) { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } frame(); }
}

function init() {
  buildControls();
  let theme = 'light';
  try { theme = localStorage.getItem('canopy-theme') || ''; } catch (e) { theme = ''; }
  if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(theme);
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage'));
  window.addEventListener('resize', resize);

  $('fileBtn').addEventListener('click', () => openPop($('fileBtn'), fileMenu));
  $('optBtn').addEventListener('click', () => openPop($('optBtn'), optMenu));
  $('expBtn').addEventListener('click', () => openPop($('expBtn'), expMenu));
  $('themeBtn').addEventListener('click', () => applyTheme(S.theme === 'dark' ? 'light' : 'dark'));
  $('helpBtn').addEventListener('click', helpDialog);
  $('panelToggle').addEventListener('click', togglePanel);
  $('panelHide').addEventListener('click', togglePanel);
  $('viewSeg').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b && b.dataset.v !== S.view) { setView(b.dataset.v); renderPanel(); } });
  $('tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) { S.tab = b.dataset.tab; renderPanel(); } });
  $('file').addEventListener('change', (ev) => openFiles(ev.target.files));
  document.addEventListener('mousedown', (ev) => {
    if (pop && !pop.contains(ev.target) && !(popBtn && popBtn.contains(ev.target))) closePop();
    if (!$('searchWrap').contains(ev.target)) $('results').hidden = true;
  });

  const si = $('search');
  si.addEventListener('input', () => runSearch(si.value));
  si.addEventListener('focus', () => { if (si.value.trim()) { renderResults(si.value.trim().toLowerCase()); } });
  si.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if ($('results').hidden) { renderResults(si.value.trim().toLowerCase()); return; }
      if (!results.length) return;
      resActive = (resActive + (ev.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
      markActive();
    } else if (ev.key === 'Enter') { ev.preventDefault(); if (results.length) goResult(resActive); }
  });

  let dragDepth = 0;
  const hasFiles = (ev) => ev.dataTransfer && Array.from(ev.dataTransfer.types || []).indexOf('Files') >= 0;
  window.addEventListener('dragenter', (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); dragDepth++; $('drop').hidden = false; });
  window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', (ev) => { if (!hasFiles(ev)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop').hidden = true; });
  window.addEventListener('drop', (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); dragDepth = 0; $('drop').hidden = true; if (modalClose) modalClose(); openFiles(ev.dataTransfer.files); });

  loadSample();
}

/* Test hook, only present when the page is opened with #debug. */
if (/[#?&]debug\b/.test(location.hash + location.search)) {
  window.canopyDebug = {
    info: () => ({ classes: M.classes.length, visible: vis.length, drawn: dn.length, zoom: cam.k, view: S.view, worker: usedWorker, sel: S.sel, depth: visibleDepth(), bounds: bounds, arcs: arcList.length }),
    frame: () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } anim = null; settle(); const t = performance.now(); frame(); return performance.now() - t; },
    overlaps: () => {
      const r = vis.map((n) => [n.nx - 7, n.ny - 8, n.nx + PADL + n.w + (n.kids.length && !n.open ? chipW(n) : 0), n.ny + 8]).sort((a, b) => a[1] - b[1]);
      let c = 0;
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length && r[j][1] < r[i][3]; j++) if (r[j][0] < r[i][2] && r[j][2] > r[i][0]) c++;
      return c;
    },
    names: () => vis.slice(0, 60).map((n) => n.name),
    /* circle view: names on the rim must be at least a text height apart along the rim */
    overlapsRadial: () => {
      const r = vis.filter((n) => n !== root && !isInner(n)).map((n) => n.tth).sort((a, b) => a - b);
      let c = 0;
      for (let i = 1; i < r.length; i++) if ((r[i] - r[i - 1]) * radT.R < 13) c++;
      if (r.length > 1 && (r[0] + TAU - r[r.length - 1]) * radT.R < 13) c++;
      return c;
    },
    /* where on the page a name, its dot or its count is in the circle view */
    radialAt: (name, part) => {
      const n = vis.find((v) => v.name === name), b = cv.getBoundingClientRect();
      if (!n) return null;
      let x = n.trr * Math.cos(n.tth), y = n.trr * Math.sin(n.tth);
      if (part !== 'dot') {
        const q = innerHits.find((r) => r[4] === n);
        if (q) { x = (q[0] + q[2]) / 2; y = (q[1] + q[3]) / 2; }
        else if (isInner(n)) return null;
        else { const d = n.trr + (part === 'chip' ? PADL + n.w + 12 : PADL + n.w / 2); x = d * Math.cos(n.tth); y = d * Math.sin(n.tth); }
      }
      return [b.left + x * rcam.k + rcam.x, b.top + y * rcam.k + rcam.y];
    },
    radial: () => ({ rim: Math.round(radT.R), zoom: rcam.k, allLinks: allLinksOn(), all: allList.length, innerNames: innerHits.length })
  };
}
init();
