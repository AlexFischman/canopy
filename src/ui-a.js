/* Canopy UI, part A: state, tree layout and canvas rendering. */
const Core = CanopyCore();
const $ = (id) => document.getElementById(id);

const THEMES = {
  light: {
    bg: '#F2F4F8', grid: '#D3D9E4', surface: '#FFFFFF', surface2: '#ECEFF5', ink: '#171E36', ink2: '#535E7A', ink3: '#8690A7',
    line: '#DADFE9', line2: '#BFC7D8', accent: '#2747D6', onAccent: '#FFFFFF', rel: '#C2255C', relBg: '#FBE4ED', restr: '#A85800', restrBg: '#FAECD9',
    match: '#FFDF70', matchBg: '#FFE9A0', veil: 'rgba(23,30,54,.32)',
    shadow: '0 12px 36px rgba(23,30,54,.16), 0 2px 6px rgba(23,30,54,.08)', shadowS: '0 2px 8px rgba(23,30,54,.10)',
    branch: ['#2F6FDE', '#12948A', '#7A52D6', '#4C9A2A', '#1D93C4', '#5661C9', '#8A8F1C', '#3D8F6E']
  },
  dark: {
    bg: '#0F1528', grid: '#232D4D', surface: '#171E38', surface2: '#232C4E', ink: '#E7EBF6', ink2: '#A9B2CC', ink3: '#6E7999',
    line: '#2B3558', line2: '#44507C', accent: '#8CA6FF', onAccent: '#0F1528', rel: '#FF7FAE', relBg: '#4A1F38', restr: '#FFB357', restrBg: '#47331A',
    match: '#7A5E00', matchBg: '#6F5600', veil: 'rgba(5,8,20,.55)',
    shadow: '0 14px 40px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.3)', shadowS: '0 2px 8px rgba(0,0,0,.35)',
    branch: ['#6FA0FF', '#3CC9BD', '#A98BFF', '#86CF5F', '#5CC3F2', '#8E97FF', '#C9CE55', '#6FCBA5']
  }
};
let TH = THEMES.light;
const NB = 8;

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round((pa >> 16) * (1 - t) + (pb >> 16) * t), gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bl).toString(16).slice(1);
}

const S = {
  view: 'tree', theme: 'light', sel: null, hover: null, labelMode: 'label', lang: '', sort: 'az',
  f: { dep: false, ext: true, relProps: true, relRestr: true, relObs: true, secondary: true, mini: true },
  tab: 'details', hops: 1, cap: 40, query: '', allLinks: null
};
let M = null, fileLabel = '', isSample = false, loadInfo = null;
let cname = [], pname = [];
let nodes = [], root = null, par = [], kidsAll = [], relOut = [], relIn = [], propRels = [], subProps = [], nsList = [];
let obsOut = [], obsIn = [], obsByProp = [], indIn = [];
let vis = [], cols = [], colX = [], colW = [], bounds = { w: 0, h: 0 }, gen = 0, maxDepth = 0, depthCount = [], leafCount = [], bfs = [];
let matches = null, extGroup = null;
const cam = { x: 0, y: 0, k: 1 };
let W = 0, H = 0, dpr = 1;
let anim = null, ghosts = [];
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ROW = 22, PADL = 10, TR = 18, GAP = 28, GROUPGAP = 5, MAXCH = 42, MINK = 0.002, MAXK = 2.5;
const cv = $('cv'), g = cv.getContext('2d');
const mctx = document.createElement('canvas').getContext('2d');
const FONT = (getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif').trim();
const LABEL_FONT = '13px ' + FONT, CHIP_FONT = '11px ' + FONT;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const nf = new Intl.NumberFormat('en-US');

/* ---------- names ---------- */

function localName(iri) {
  let s = iri.replace(/[#\/]+$/, '');
  const i = Math.max(s.lastIndexOf('#'), s.lastIndexOf('/'));
  s = i >= 0 ? s.slice(i + 1) : s.slice(s.lastIndexOf(':') + 1);
  if (s.indexOf('%') >= 0) { try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ } }
  return s || iri;
}
function pickLabel(labels, iri) {
  if (S.labelMode === 'id' || !labels.length) return localName(iri);
  let best = null, bs = -1;
  for (let j = 0; j < labels.length; j++) {
    const l = labels[j][1].toLowerCase();
    const sc = l === S.lang ? 5 : (S.lang && l.split('-')[0] === S.lang.split('-')[0]) ? 4 : l === '' ? 3 : l.slice(0, 2) === 'en' ? 2 : 1;
    if (sc > bs) { bs = sc; best = labels[j][0]; }
  }
  best = best.replace(/\s+/g, ' ').trim();
  return best || localName(iri);
}
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
function compact(iri) {
  for (let j = 0; j < nsList.length; j++) {
    const ns = nsList[j][0];
    if (iri.length > ns.length && iri.startsWith(ns)) {
      const l = iri.slice(ns.length);
      if (!/[\/#]/.test(l)) return nsList[j][1] + ':' + l;
    }
  }
  return iri;
}
function computeNames() {
  cname = M.classes.map((c) => pickLabel(c.labels, c.iri));
  pname = M.props.map((p) => pickLabel(p.labels, p.iri));
}
function indName(ind) { return pickLabel(ind.labels, ind.iri); }
function nouns() { return M && M.mode === 'skos' ? ['concept', 'concepts'] : ['class', 'classes']; }

/* ---------- tree ---------- */

function mkNode(i) {
  return { i: i, name: '', t: '', w: -1, parent: null, kids: [], depth: 0, desc: 0, open: false, branch: -1,
    x: 0, y: 0, nx: 0, ny: 0, ox: 0, oy: 0, a: 1, top: 0, bot: 0, g: -1, was: false, mc: 0, dep: false, ext: false, k0: 0, k1: 0, to: null,
    rx: 0, ry: 0, th: 0, rr: 0, tth: 0, trr: 0, oth: 0, orr: 0 };
}

function buildTree(keepOpen) {
  const C = M.classes, n = C.length;
  const openSet = keepOpen && nodes.length ? new Set(nodes.filter((x) => x && x.open).map((x) => x.i)) : null;
  const skip = new Uint8Array(n);
  for (let i = 0; i < n; i++) if ((!S.f.dep && C[i].dep) || (!S.f.ext && !C[i].declared)) skip[i] = 1;
  nodes = new Array(n); par = new Array(n); kidsAll = new Array(n);
  root = mkNode(-1);
  root.name = M.mode === 'skos' ? 'All concepts' : 'owl:Thing';
  root.t = M.mode === 'skos' ? 'Concepts' : 'owl:Thing';
  root.open = true;
  for (let i = 0; i < n; i++) {
    if (skip[i]) { nodes[i] = null; continue; }
    const nd = mkNode(i);
    nd.name = cname[i]; nd.t = trunc(cname[i], MAXCH); nd.dep = C[i].dep; nd.ext = !C[i].declared;
    nodes[i] = nd; kidsAll[i] = [];
  }
  for (let i = 0; i < n; i++) {
    if (skip[i]) continue;
    const ps = [], c = C[i];
    for (let j = 0; j < c.sup.length; j++) if (!skip[c.sup[j]]) ps.push(c.sup[j]);
    for (let j = 0; j < c.def.length; j++) if (!skip[c.def[j]] && ps.indexOf(c.def[j]) < 0) ps.push(c.def[j]);
    par[i] = ps;
  }
  for (let i = 0; i < n; i++) if (!skip[i]) for (let j = 0; j < par[i].length; j++) kidsAll[par[i][j]].push(i);
  const q = [root];
  let head = 1;
  const attach = (p, c) => { c.parent = p; c.depth = p.depth + 1; p.kids.push(c); q.push(c); };
  const drain = () => {
    while (head < q.length) {
      const nd = q[head++];
      if (nd.i < 0) continue;
      const ks = kidsAll[nd.i];
      for (let j = 0; j < ks.length; j++) { const cn = nodes[ks[j]]; if (!cn.parent) attach(nd, cn); }
    }
  };
  /* Classes that are only mentioned here (targets of restrictions, declared in another ontology) would flood
     the top level, so they are collected under one node. */
  const loose = [];
  for (let i = 0; i < n; i++) if (nodes[i] && !C[i].declared && par[i].length === 0 && kidsAll[i].length === 0) loose.push(nodes[i]);
  extGroup = null;
  if (loose.length >= 4 && loose.length < n) {
    extGroup = mkNode(-3);
    extGroup.name = 'Declared elsewhere'; extGroup.t = 'Declared elsewhere'; extGroup.ext = true;
  }
  for (let i = 0; i < n; i++) if (nodes[i] && par[i].length === 0 && !(extGroup && !C[i].declared && kidsAll[i].length === 0)) attach(root, nodes[i]);
  drain();
  for (let i = 0; i < n; i++) if (nodes[i] && !nodes[i].parent && !(extGroup && !C[i].declared && par[i].length === 0 && kidsAll[i].length === 0)) { attach(root, nodes[i]); drain(); }
  if (extGroup) { attach(root, extGroup); for (let j = 0; j < loose.length; j++) attach(extGroup, loose[j]); }
  bfs = q;
  for (let j = q.length - 1; j >= 1; j--) q[j].parent.desc += q[j].desc + 1;
  const cmp = S.sort === 'size'
    ? (a, b) => b.desc - a.desc || collator.compare(a.name, b.name)
    : (a, b) => collator.compare(a.name, b.name);
  maxDepth = 0; depthCount = []; leafCount = [];
  for (let j = 0; j < q.length; j++) {
    const nd = q[j];
    if (nd.kids.length > 1) nd.kids.sort(cmp);
    if (nd.depth > maxDepth) maxDepth = nd.depth;
    depthCount[nd.depth] = (depthCount[nd.depth] || 0) + 1;
    if (!nd.kids.length) leafCount[nd.depth] = (leafCount[nd.depth] || 0) + 1;
  }
  if (extGroup) { const ix = root.kids.indexOf(extGroup); root.kids.splice(ix, 1); root.kids.push(extGroup); }
  branchKids().forEach((kid, j) => {
    const st = [kid];
    while (st.length) { const x = st.pop(); x.branch = j % NB; for (let z = 0; z < x.kids.length; z++) st.push(x.kids[z]); }
  });
  if (openSet) { for (let i = 0; i < n; i++) if (nodes[i]) nodes[i].open = openSet.has(i) && nodes[i].kids.length > 0; }
  else initialOpen();
}

/* The node whose children get the branch colours: the first level where the hierarchy really branches.
   A lone top-level class, or one that holds nearly everything, is skipped so that colour stays informative. */
function branchParent() {
  let b = root;
  for (;;) {
    const real = b.kids.filter((k) => k.i >= 0);
    if (!real.length) return b;
    let big = real[0], total = 0;
    for (let j = 0; j < real.length; j++) { total += real[j].desc + 1; if (real[j].desc > big.desc) big = real[j]; }
    if (real.length === 1 ? big.kids.length > 0 : (big.kids.length >= 2 && big.desc + 1 >= 0.85 * total)) b = big; else return b;
  }
}
function branchKids() { return branchParent().kids.filter((k) => k.i >= 0); }

/* First view: open whole levels while they fit on screen at a readable size, then keep opening the largest
   branches that still fit. */
function initialOpen() {
  const budget = (H - 104) / 0.88;
  const cost = (rows, groups) => rows * ROW + groups * GROUPGAP;
  const level = (l) => {
    let r = depthCount[l] || 0, gr = 1;
    for (let d = 1; d < l; d++) { r += leafCount[d] || 0; gr += (depthCount[d] || 0) - (leafCount[d] || 0); }
    if (extGroup && l >= 2) { r -= extGroup.kids.length - 1; gr -= 1; }
    return [r, gr];
  };
  let L = 1;
  for (let l = 2; l <= maxDepth; l++) { const m = level(l); if (cost(m[0], m[1]) <= budget) L = l; else break; }
  setLevelState(L);
  if (extGroup) extGroup.open = false;
  let rows = level(L)[0], groups = level(L)[1];
  const byLevel = [];
  for (let j = 1; j < bfs.length; j++) { const nd = bfs[j]; if (nd.depth >= L && nd.kids.length) (byLevel[nd.depth] || (byLevel[nd.depth] = [])).push(nd); }
  for (let d = L; d < byLevel.length; d++) {
    const cand = (byLevel[d] || []).filter((nd) => nd.i >= 0 && !nd.open && (nd.parent === root || nd.parent.open)).sort((a, b) => b.desc - a.desc);
    let opened = 0;
    for (let j = 0; j < cand.length; j++) {
      const nd = cand[j];
      if (cost(rows + nd.kids.length - 1, groups + 1) <= budget) { nd.open = true; rows += nd.kids.length - 1; groups++; opened++; }
    }
    if (!opened) {
      /* nothing more fits: if the screen is still mostly empty, open the largest branch anyway */
      if (cost(rows, groups) < budget * 0.5 && cand.length && cand[0].kids.length <= 400) cand[0].open = true;
      break;
    }
  }
}
function setLevelState(L) {
  for (let j = 1; j < bfs.length; j++) bfs[j].open = bfs[j].depth < L && bfs[j].kids.length > 0;
  root.open = true;
}
function chipW(n) { return n.kids.length ? 9 + 6.4 * (String(n.desc).length + 1) : 0; }

function layout() {
  gen++;
  const out = [], cw = [], cl = [];
  let y = 0;
  mctx.font = LABEL_FONT;
  const place = (n) => {
    n.was = n.g === gen - 1; n.g = gen;
    if (n.w < 0) n.w = Math.ceil(mctx.measureText(n.t).width);
    const d = n.depth, kids = n.kids;
    const ext = n.w + (kids.length && !n.open ? chipW(n) : 0);
    if (!(cw[d] >= ext)) cw[d] = ext;
    out.push(n);
    (cl[d] || (cl[d] = [])).push(n);
    if (n.open && kids.length) {
      for (let i = 0; i < kids.length; i++) place(kids[i]);
      const a = kids[0], b = kids[kids.length - 1];
      n.ny = (a.ny + b.ny) / 2; n.top = a.top; n.bot = b.bot;
      y += GROUPGAP;
    } else { n.ny = y; n.top = y; n.bot = y; y += ROW; }
  };
  place(root);
  colX = [0];
  for (let d = 0; d < cw.length; d++) colX[d + 1] = colX[d] + PADL + cw[d] + GAP + TR;
  for (let j = 0; j < out.length; j++) out[j].nx = colX[out[j].depth];
  const old = vis;
  vis = out; cols = cl; colW = cw;
  bounds = { w: colX[cw.length - 1] + PADL + cw[cw.length - 1] + 16, h: Math.max(ROW, y - GROUPGAP) };
  radialTargets();
  return old;
}

/* Recompute the layout. opts: {animate, anchor: node kept still on screen, center: node, cam: explicit target} */
function relayout(opts) {
  opts = opts || {};
  const radial = S.view === 'radial', C = radial ? rcam : cam;
  const c0 = { x: C.x, y: C.y, k: C.k };
  const an = opts.anchor || null, atFit = radial && radReady && radialAtFit();
  const ax = an ? an.x : 0, ay = an ? an.y : 0, p0x = an ? an.rr * Math.cos(an.th) : 0, p0y = an ? an.rr * Math.sin(an.th) : 0;
  const old = layout();
  let c1 = null;
  if (opts.cam) c1 = opts.cam;
  else if (opts.center) c1 = centerCamV(opts.center);
  else if (an && an.g === gen) {
    if (radial) c1 = { x: C.x + (p0x - an.trr * Math.cos(an.tth)) * C.k, y: C.y + (p0y - an.trr * Math.sin(an.tth)) * C.k, k: C.k };
    else c1 = { x: C.x + (ax - an.nx) * C.k, y: C.y + (ay - an.ny) * C.k, k: C.k };
  }
  if (radial && (opts.fit || atFit) && !opts.cam) c1 = fitRadial();
  else if (opts.reveal && (opts.forceCenter || offscreenV(opts.reveal, c1 || C))) c1 = centerCamV(opts.reveal);
  const doAnim = opts.animate && !REDUCED && vis.length + old.length < 9000;
  ghosts = [];
  if (doAnim) {
    for (let j = 0; j < vis.length; j++) {
      const n = vis[j];
      if (n.was) { n.ox = n.x; n.oy = n.y; n.orr = n.rr; n.oth = n.th; n.a = 1; }
      else {
        const p = n.parent;
        n.ox = p ? p.ox : n.nx; n.oy = p ? p.oy : n.ny; n.orr = p ? p.orr : n.trr; n.oth = p ? p.oth : n.tth;
        n.x = n.ox; n.y = n.oy; n.rr = n.orr; n.th = n.oth; n.a = 0;
      }
      /* turn the short way round */
      if (n.tth - n.oth > Math.PI) n.oth += TAU; else if (n.oth - n.tth > Math.PI) n.oth -= TAU;
    }
    for (let j = 0; j < old.length; j++) {
      const n = old[j];
      if (n.g === gen) continue;
      let a = n.parent;
      while (a && a.g !== gen) a = a.parent;
      if (!a) continue;
      n.ox = n.x; n.oy = n.y; n.orr = n.rr; n.oth = n.th; n.to = a; ghosts.push(n);
      if (a.tth - n.oth > Math.PI) n.oth += TAU; else if (n.oth - a.tth > Math.PI) n.oth -= TAU;
    }
    anim = { t0: performance.now(), dur: 280, nodes: true, cam: C, c0: c0, c1: c1 };
  } else {
    for (let j = 0; j < vis.length; j++) { const n = vis[j]; n.x = n.nx; n.y = n.ny; n.rr = n.trr; n.th = n.tth; n.a = 1; }
    anim = null;
    if (c1) { C.x = c1.x; C.y = c1.y; C.k = c1.k; }
  }
  miniDirty = true; arcKey = ''; allKey = '';
  updateDepthLabel();
  draw();
}

function centerCam(n, k) {
  k = k || Math.max(cam.k, 0.7);
  return { x: W * 0.4 - (n.nx + n.w / 2) * k, y: H / 2 - n.ny * k, k: k };
}
function moveCam(c1, dur) {
  const C = S.view === 'radial' ? rcam : cam;
  if (REDUCED || dur === 0) { C.x = c1.x; C.y = c1.y; C.k = c1.k; anim = null; draw(); return; }
  anim = { t0: performance.now(), dur: dur || 320, nodes: false, cam: C, c0: { x: C.x, y: C.y, k: C.k }, c1: c1 };
  draw();
}
/* camera helpers that follow the current view */
function centerCamV(n) {
  if (S.view !== 'radial') return centerCam(n);
  const k = Math.max(rcam.k, 0.7);
  return { x: W * 0.46 - n.trr * Math.cos(n.tth) * k, y: H / 2 - n.trr * Math.sin(n.tth) * k, k: k };
}
function offscreenV(n, c) {
  if (S.view !== 'radial') return offscreenAt(n, c);
  const sx = n.trr * Math.cos(n.tth) * c.k + c.x, sy = n.trr * Math.sin(n.tth) * c.k + c.y;
  return sx < 60 || sx > W - 60 || sy < 60 || sy > H - 80 || c.k < 0.45;
}
function fitCam(readable) {
  const padX = 36, padT = 44, padB = 60;
  let k = Math.min((W - padX * 2) / bounds.w, (H - padT - padB) / bounds.h);
  k = Math.max(MINK, Math.min(1, k));
  if (readable && k < 0.62) {
    k = Math.max(k, Math.min(0.85, Math.max(0.62, (W - padX * 2) / bounds.w)));
    return { x: padX, y: bounds.h * k > H - padT - padB ? padT + 6 : (H - bounds.h * k) / 2, k: k };
  }
  return { x: Math.max(padX, (W - bounds.w * k) / 2), y: padT + Math.max(0, (H - padT - padB - bounds.h * k) / 2) + ROW * k / 2, k: k };
}

function visOf(n) {
  let r = n, a = n.parent;
  while (a) { if (!a.open) r = a; a = a.parent; }
  return r;
}
function isVisible(n) { return n.g === gen; }

function toggle(n, deep) {
  if (!n.kids.length) return;
  if (n === root && n.open) return;
  const open = !n.open;
  if (deep && open) {
    const st = [n]; let c = 0;
    while (st.length && c < 4000) { const x = st.pop(); if (x.kids.length) { x.open = true; c++; for (let z = 0; z < x.kids.length; z++) st.push(x.kids[z]); } }
  } else n.open = open;
  relayout({ animate: true, anchor: n });
}
function setLevel(L) {
  L = Math.max(1, Math.min(maxDepth, L));
  setLevelState(L);
  relayout({ animate: true, anchor: root, fit: true });
}
function visibleDepth() { return cols.length - 1; }
function stepLevel(dir) {
  const d = visibleDepth();
  if (dir > 0) {
    let c = 0;
    for (let j = 0; j < vis.length; j++) if (!vis[j].open && vis[j].kids.length) c++;
    if (!c) return;
    const snapshot = vis.slice();
    for (let j = 0; j < snapshot.length; j++) if (!snapshot[j].open && snapshot[j].kids.length) snapshot[j].open = true;
  } else {
    if (d <= 1) return;
    const cl = cols[d - 1];
    for (let j = 0; j < cl.length; j++) cl[j].open = false;
  }
  relayout({ animate: true, anchor: root, fit: true });
}
function offscreenAt(n, c) {
  const sx = n.nx * c.k + c.x, sy = n.ny * c.k + c.y;
  return sx < 30 || sx + (n.w + 20) * c.k > W - 20 || sy < 50 || sy > H - 70 || c.k < 0.45;
}
/* Make a node visible: open its ancestors and bring it into view if it is not already there. */
function reveal(n, center) {
  const anchor = visOf(n);
  let changed = false;
  for (let a = n.parent; a; a = a.parent) if (!a.open) { a.open = true; changed = true; }
  if (changed) relayout({ animate: true, anchor: anchor, reveal: n, forceCenter: center });
  else if (S.view === 'radial' ? (!radialAtFit() && (center || offscreenV(n, rcam))) : (center || offscreenV(n, cam))) moveCam(centerCamV(n));
  else draw();
}

/* ---------- rendering ---------- */

let rafId = 0, miniDirty = true;
const dn = [], dp = [];
function draw() { if (!rafId) rafId = requestAnimationFrame(frame); }

function frame() {
  rafId = 0;
  if (!M) return;
  if (anim) {
    let t = (performance.now() - anim.t0) / anim.dur;
    if (t >= 1) t = 1;
    const e = 1 - Math.pow(1 - t, 3);
    if (anim.c1) { const C = anim.cam || cam; C.x = anim.c0.x + (anim.c1.x - anim.c0.x) * e; C.y = anim.c0.y + (anim.c1.y - anim.c0.y) * e; C.k = anim.c0.k + (anim.c1.k - anim.c0.k) * e; }
    if (anim.nodes) {
      for (let j = 0; j < vis.length; j++) { const n = vis[j]; n.x = n.ox + (n.nx - n.ox) * e; n.y = n.oy + (n.ny - n.oy) * e; n.rr = n.orr + (n.trr - n.orr) * e; n.th = n.oth + (n.tth - n.oth) * e; if (!n.was) n.a = e; }
      for (let j = 0; j < ghosts.length; j++) { const n = ghosts[j]; n.x = n.ox + (n.to.nx - n.ox) * e; n.y = n.oy + (n.to.ny - n.oy) * e; n.rr = n.orr + (n.to.trr - n.orr) * e; n.th = n.oth + (n.to.tth - n.oth) * e; n.a = 1 - e; }
    }
    if (anim.focus) focusTween(e);
    if (t >= 1) {
      if (anim.nodes) { for (let j = 0; j < vis.length; j++) { const n = vis[j]; n.a = 1; n.was = true; n.rr = n.trr; n.th = n.tth; } ghosts = []; }
      anim = null;
    } else draw();
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.view === 'tree') {
    renderTree(g, W, H, cam, false);
    drawMini();
  } else if (S.view === 'radial') renderRadial(g, W, H, rcam, false);
  else renderFocus(g, W, H, fcam, false);
  updateZoomLabel();
}

/* Open nodes whose branch runs off screen slide along its edge, so the ancestors of whatever is in view stay visible. */
let stTop = 0, stBot = 0;
const stuck = [];
function collect(n, vx1, vy0, vy1) {
  if (n.x > vx1) return;
  if (n.open && n.kids.length) {
    const kids = n.kids, len = kids.length;
    if (kids[len - 1].bot < vy0 || kids[0].top > vy1) return;
    if (stTop < stBot) {
      let y = n.ny < stTop ? stTop : n.ny > stBot ? stBot : n.ny;
      if (y < kids[0].ny) y = kids[0].ny; else if (y > kids[len - 1].ny) y = kids[len - 1].ny;
      if (y !== n.ny) { n.y = y; stuck.push(n); }
    }
    if (n.y >= vy0 && n.y <= vy1) dn.push(n);
    let lo = 0, hi = len - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (kids[m].bot < vy0) lo = m + 1; else hi = m; }
    let i = lo;
    for (; i < len && kids[i].top <= vy1; i++) collect(kids[i], vx1, vy0, vy1);
    n.k0 = lo; n.k1 = i;
    dp.push(n);
  } else if (n.y >= vy0 && n.y <= vy1) dn.push(n);
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function selNode() { return S.sel && S.sel.t === 'c' ? nodes[S.sel.i] || null : null; }
function hoverNode() { return S.hover && S.hover.n ? S.hover.n : null; }
function branchColor(b) { return b < 0 ? TH.ink3 : TH.branch[b]; }

function renderTree(c, W, H, cam, ex) {
  const k = cam.k, T = TH, animating = !!(anim && anim.nodes) && !ex;
  c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
  const vx0 = -cam.x / k, vx1 = (W - cam.x) / k, vy0 = -cam.y / k - ROW, vy1 = (H - cam.y) / k + ROW;
  if (!ex && k >= 0.6) {
    const st = 24 * k, ox = ((cam.x % st) + st) % st, oy = ((cam.y % st) + st) % st, sz = k >= 1 ? 1.5 : 1;
    c.fillStyle = T.grid;
    for (let y = oy; y < H; y += st) for (let x = ox; x < W; x += st) c.fillRect(x, y, sz, sz);
  }
  dn.length = 0; dp.length = 0;
  for (let j = 0; j < stuck.length; j++) stuck[j].y = stuck[j].ny;
  stuck.length = 0;
  if (ex) { stTop = 1; stBot = 0; } else { stTop = (40 - cam.y) / k; stBot = (H - 64 - cam.y) / k; }
  if (animating) {
    for (let j = 0; j < vis.length; j++) {
      const n = vis[j];
      if (n.open && n.kids.length) {
        const a = n.kids[0].y, b = n.kids[n.kids.length - 1].y, lo = a < b ? a : b, hi = a < b ? b : a;
        let y = n.y < stTop ? stTop : n.y > stBot ? stBot : n.y;
        n.y = y < lo ? lo : y > hi ? hi : y;
        n.k0 = 0; n.k1 = n.kids.length; dp.push(n);
      }
      if (n.y >= vy0 && n.y <= vy1 && n.x <= vx1) dn.push(n);
    }
  } else collect(root, vx1, vy0, vy1);

  c.save();
  c.translate(cam.x, cam.y); c.scale(k, k);
  c.lineCap = 'round'; c.lineJoin = 'round';

  /* links */
  const LP = [];
  for (let b = 0; b <= NB; b++) LP.push(new Path2D());
  for (let j = 0; j < dp.length; j++) {
    const p = dp[j], kids = p.kids, len = kids.length, first = kids[0], last = kids[len - 1];
    const tx = first.x - TR, pe = Math.min(p.x + PADL + p.w + 5, tx - 1), P = LP[p.branch + 1];
    if (len === 1) { P.moveTo(pe, p.y); P.lineTo(first.x - 6, first.y); continue; }
    const r = Math.min(5, Math.abs(last.y - first.y) / 2);
    P.moveTo(pe, p.y); P.lineTo(tx, p.y);
    P.moveTo(tx + r, first.y); P.quadraticCurveTo(tx, first.y, tx, first.y + r);
    P.lineTo(tx, last.y - r); P.quadraticCurveTo(tx, last.y, tx + r, last.y);
    if (p.y < first.y) { P.moveTo(tx, p.y); P.lineTo(tx, first.y + r); } else if (p.y > last.y) { P.moveTo(tx, last.y - r); P.lineTo(tx, p.y); }
    for (let i = p.k0; i < p.k1; i++) {
      const kid = kids[i], Q = LP[kid.branch + 1];
      Q.moveTo(i === 0 || i === len - 1 ? tx + r : tx, kid.y); Q.lineTo(kid.x - 6, kid.y);
    }
  }
  if (animating) {
    for (let j = 0; j < ghosts.length; j++) {
      const n = ghosts[j], P = LP[n.branch + 1];
      P.moveTo(n.to.x + PADL, n.to.y); P.lineTo(n.x - 6, n.y);
    }
  }
  c.lineWidth = 1.25 / k;
  for (let b = 0; b <= NB; b++) { c.strokeStyle = mix(branchColor(b - 1), T.bg, b === 0 ? 0.35 : 0.42); c.stroke(LP[b]); }

  /* path from the selected class up to the root */
  const sn = selNode(), hn = ex ? null : hoverNode();
  if (sn && isVisible(sn)) {
    c.lineWidth = 2.2 / k;
    for (let n = sn; n.parent; n = n.parent) {
      const p = n.parent, first = p.kids[0], tx = first.x - TR, pe = Math.min(p.x + PADL + p.w + 5, tx - 1);
      c.strokeStyle = branchColor(n.branch);
      c.beginPath(); c.moveTo(pe, p.y);
      if (p.kids.length === 1) c.lineTo(n.x - 6, n.y);
      else { c.lineTo(tx, p.y); c.lineTo(tx, n.y); c.lineTo(n.x - 6, n.y); }
      c.stroke();
    }
  }

  drawArcs(c, k, ex);

  /* dots */
  const all = animating && ghosts.length ? dn.concat(ghosts) : dn;
  const FP = [], RP = [];
  for (let b = 0; b <= NB; b++) { FP.push(new Path2D()); RP.push(new Path2D()); }
  for (let j = 0; j < all.length; j++) {
    const n = all[j];
    if (n.x + 8 < vx0) continue;
    if (!n.kids.length) { FP[n.branch + 1].moveTo(n.x + 2.6, n.y); FP[n.branch + 1].arc(n.x, n.y, 2.6, 0, 6.2832); }
    else if (n.open) { RP[n.branch + 1].moveTo(n.x + 3.6, n.y); RP[n.branch + 1].arc(n.x, n.y, 3.6, 0, 6.2832); }
    else { FP[n.branch + 1].moveTo(n.x + 4.6, n.y); FP[n.branch + 1].arc(n.x, n.y, 4.6, 0, 6.2832); }
  }
  c.lineWidth = 1.7 / Math.max(k, 0.5);
  for (let b = 0; b <= NB; b++) {
    const col = branchColor(b - 1);
    c.fillStyle = col; c.fill(FP[b]);
    c.fillStyle = T.bg; c.fill(RP[b]); c.strokeStyle = col; c.stroke(RP[b]);
  }

  /* labels */
  c.textBaseline = 'middle'; c.textAlign = 'left';
  const fpx = 13 * k, selTypes = S.sel && S.sel.t === 'i' ? M.inds[S.sel.i].types : null;
  if (fpx >= 6.2) {
    c.font = LABEL_FONT;
    for (let j = 0; j < all.length; j++) {
      const n = all[j], tx = n.x + PADL;
      if (tx + n.w + 60 < vx0) continue;
      const isSel = n === sn, isM = matches !== null && n.i >= 0 && matches.has(n.i);
      if (n.a < 1) c.globalAlpha = n.a;
      if (isSel) { c.fillStyle = T.ink; rr(c, tx - 5, n.y - 9.5, n.w + 10, 19, 5); c.fill(); }
      else if (isM) { c.fillStyle = T.match; rr(c, tx - 4, n.y - 9, n.w + 8, 18, 4); c.fill(); }
      else if (selTypes !== null && selTypes.indexOf(n.i) >= 0) { c.fillStyle = T.surface; rr(c, tx - 5, n.y - 9.5, n.w + 10, 19, 5); c.fill(); c.strokeStyle = T.ink; c.lineWidth = 1.5 / k; c.stroke(); }
      else if (n === hn) { c.fillStyle = T.surface; rr(c, tx - 5, n.y - 9.5, n.w + 10, 19, 5); c.fill(); c.strokeStyle = T.line2; c.lineWidth = 1 / k; c.stroke(); }
      c.fillStyle = isSel ? T.bg : n.dep ? T.ink3 : n.ext ? T.ink2 : T.ink;
      c.fillText(n.t, tx, n.y + 0.5);
      if (n.dep) { c.strokeStyle = isSel ? T.bg : T.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(tx, n.y + 0.5); c.lineTo(tx + n.w, n.y + 0.5); c.stroke(); }
      if (n.a < 1) c.globalAlpha = 1;
    }
    c.font = CHIP_FONT;
    for (let j = 0; j < dn.length; j++) {
      const n = dn[j];
      if (!n.kids.length || n.open) continue;
      const cx = n.x + PADL + n.w + 8;
      if (n.a < 1) c.globalAlpha = n.a;
      c.fillStyle = T.ink3;
      c.fillText('+' + n.desc, cx, n.y + 0.5);
      if (matches !== null && n.mc > 0) {
        const bx = cx + chipW(n) - 4, tw = 7 + String(n.mc).length * 6.2;
        c.fillStyle = T.match; rr(c, bx, n.y - 7.5, tw + 6, 15, 7.5); c.fill();
        c.fillStyle = T.ink; c.fillText(String(n.mc), bx + 5, n.y + 0.5);
      }
      if (n.a < 1) c.globalAlpha = 1;
    }
  } else {
    /* zoomed out: label only what has room, at a constant size on screen */
    const fs = 11 / k;
    c.font = '600 ' + fs + 'px ' + FONT;
    const cand = [];
    for (let j = 0; j < dn.length; j++) {
      const n = dn[j];
      const room = (n.open && n.kids.length ? n.bot - n.top + ROW : ROW) * k;
      if (room >= 15 || n === sn || n === hn) cand.push(n);
    }
    cand.sort((a, b) => (b === sn) - (a === sn) || (b === hn) - (a === hn) || a.depth - b.depth || b.desc - a.desc);
    const placed = [];
    c.lineWidth = 3.5 / k; c.strokeStyle = T.bg;
    for (let j = 0; j < cand.length && placed.length < 400; j++) {
      const n = cand[j], tw = n.w * (11 / 13) * 1.06 / k, x0 = n.x + 7 / k, y0 = n.y - 7 / k, y1 = n.y + 7 / k;
      let hit = false;
      for (let z = 0; z < placed.length; z++) { const p = placed[z]; if (x0 < p[2] && x0 + tw > p[0] && y0 < p[3] && y1 > p[1]) { hit = true; break; } }
      if (hit && n !== sn && n !== hn) continue;
      placed.push([x0 - 4 / k, y0, x0 + tw + 4 / k, y1]);
      if (n === sn) { c.fillStyle = T.ink; rr(c, x0 - 4 / k, y0 - 1 / k, tw + 8 / k, 16 / k, 4 / k); c.fill(); c.fillStyle = T.bg; }
      else { c.strokeText(n.t, x0, n.y); c.fillStyle = matches !== null && n.i >= 0 && matches.has(n.i) ? T.restr : T.ink; }
      c.fillText(n.t, x0, n.y);
    }
    if (matches !== null) {
      c.fillStyle = T.match; c.strokeStyle = T.restr; c.lineWidth = 1 / k;
      for (let j = 0; j < dn.length; j++) {
        const n = dn[j];
        if ((n.i >= 0 && matches.has(n.i)) || (!n.open && n.mc > 0)) { c.beginPath(); c.arc(n.x, n.y, 4.5 / Math.max(k, 0.25), 0, 6.2832); c.fill(); c.stroke(); }
      }
    }
  }

  drawArcChips(c, k, fpx < 6.2);
  c.restore();

  if (!ex) {
    /* level markers along the top edge */
    const gr = c.createLinearGradient(0, 0, 0, 30);
    gr.addColorStop(0, T.bg); gr.addColorStop(0.55, T.bg); gr.addColorStop(1, T.bg + '00');
    c.fillStyle = gr; c.fillRect(0, 0, W, 30);
    if (k >= 0.22) {
      c.font = '600 11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      const hl = S.hover && S.hover.level;
      for (let d = 1; d < cols.length; d++) {
        const sx = colX[d] * k + cam.x;
        if (sx < 10 || sx > W - 10) continue;
        c.fillStyle = hl === d ? T.ink : T.ink3;
        c.fillText(String(d), sx, 13);
        if (hl === d) { c.fillRect(sx - 6, 21, 12, 1.5); }
      }
      c.textAlign = 'left';
    }
  }
}

/* ---------- relation arcs on the tree ---------- */

let arcKey = '', arcList = [], arcNote = '';

function relLabel(r) {
  return (r.inv ? 'inverse ' : '') + pname[r.p] + (r.k === 'prop' || r.k === 'related' ? '' : ' ' + r.k + (r.n !== undefined ? ' ' + r.n : ''));
}
function relShown(r) { return r.k === 'prop' || r.k === 'related' ? S.f.relProps : S.f.relRestr; }

function arcFor(map, a, b, cls, faint, tag) {
  const key = a.i + '>' + b.i + (tag || '') + (faint ? 'f' : '');
  let arc = map.get(key);
  if (!arc) { arc = { a: a, b: b, cls: cls, labels: [], n: 0, hidden: false, faint: faint, obs: null, decl: false }; map.set(key, arc); }
  return arc;
}
function collectArcs(rels, faint, map) {
  for (let j = 0; j < rels.length; j++) {
    const r = rels[j];
    if (!relShown(r)) continue;
    const na = nodes[r.s], nb = nodes[r.o];
    if (!na || !nb) continue;
    const a = visOf(na), b = visOf(nb), cls = r.k === 'prop' || r.k === 'related' ? 'rel' : 'restr';
    const arc = arcFor(map, a, b, cls, faint);
    if (!arc.decl) { arc.cls = cls; arc.decl = true; } else if (cls === 'rel') arc.cls = 'rel';
    arc.n++;
    if (a !== na || b !== nb) arc.hidden = true;
    const l = relLabel(r);
    if (arc.labels.indexOf(l) < 0) arc.labels.push(l);
  }
}
/* Statements between individuals, counted per pair of classes. */
function collectObs(list, faint, map) {
  if (!S.f.relObs) return;
  for (let j = 0; j < list.length; j++) {
    const r = list[j], na = nodes[r.s], nb = nodes[r.o];
    if (!na || !nb) continue;
    const a = visOf(na), b = visOf(nb), arc = arcFor(map, a, b, 'obs', faint);
    if (a !== na || b !== nb) arc.hidden = true;
    if (!arc.obs) arc.obs = new Map();
    arc.obs.set(r.p, (arc.obs.get(r.p) || 0) + r.n);
  }
}
/* The statements of one individual, drawn between its classes and the classes of what it is linked to. */
function indArcs(i, map) {
  if (!S.f.relObs) return;
  const ind = M.inds[i];
  const add = (ta, tb, label) => {
    for (let x = 0; x < ta.length; x++) for (let y = 0; y < tb.length; y++) {
      const na = nodes[ta[x]], nb = nodes[tb[y]];
      if (!na || !nb) continue;
      const a = visOf(na), b = visOf(nb), arc = arcFor(map, a, b, 'obs', false, 'i');
      if (a !== na || b !== nb) arc.hidden = true;
      if (arc.labels.indexOf(label) < 0) arc.labels.push(label);
    }
  };
  for (let q = 0; q < ind.out.length; q += 2) add(ind.types, M.inds[ind.out[q + 1]].types, pname[ind.out[q]]);
  const inn = indIn[i];
  for (let q = 0; q < inn.length; q += 2) add(M.inds[inn[q + 1]].types, ind.types, pname[inn[q]]);
}
function secondaryArcs(n, faint, map) {
  if (!S.f.secondary || n.i < 0) return;
  const ps = par[n.i];
  for (let j = 0; j < ps.length; j++) {
    const pn = nodes[ps[j]];
    if (!pn || pn === n.parent) continue;
    const b = visOf(pn), key = n.i + '^' + b.i + (faint ? 'f' : '');
    if (!map.has(key)) map.set(key, { a: n, b: b, cls: 'sec', labels: [], n: 1, hidden: b !== pn, faint: faint, obs: null, decl: true });
  }
}
function buildArcs() {
  const sel = S.sel, hn = hoverNode();
  const key = gen + '|' + (sel ? sel.t + sel.i : '') + '|' + (hn ? hn.i : '') + '|' + S.f.relProps + S.f.relRestr + S.f.secondary + S.f.relObs;
  if (key === arcKey) return;
  arcKey = key; arcNote = '';
  const map = new Map();
  if (sel && sel.t === 'c' && nodes[sel.i] && isVisible(nodes[sel.i])) {
    collectArcs(relOut[sel.i], false, map); collectArcs(relIn[sel.i].filter((r) => r.s !== r.o), false, map);
    collectObs(obsOut[sel.i], false, map); collectObs(obsIn[sel.i].filter((r) => r.s !== r.o), false, map);
    secondaryArcs(nodes[sel.i], false, map);
  } else if (sel && sel.t === 'p') {
    collectArcs(propRels[sel.i], false, map);
    collectObs(obsByProp[sel.i], false, map);
  } else if (sel && sel.t === 'i') {
    indArcs(sel.i, map);
  }
  if (hn && hn.i >= 0 && !(sel && sel.t === 'c' && sel.i === hn.i)) {
    collectArcs(relOut[hn.i], true, map); collectArcs(relIn[hn.i].filter((r) => r.s !== r.o), true, map);
    collectObs(obsOut[hn.i], true, map); collectObs(obsIn[hn.i].filter((r) => r.s !== r.o), true, map);
    secondaryArcs(hn, true, map);
  }
  arcList = Array.from(map.values());
  if (arcList.length > 400) { arcNote = 'Showing 400 of ' + nf.format(arcList.length) + ' links'; arcList.length = 400; }
  for (let j = 0; j < arcList.length; j++) {
    const a = arcList[j], parts = a.labels.slice();
    /* a count in brackets says how many statements between individuals stand behind the link */
    if (a.obs) a.obs.forEach((n, pi) => { const nm = pname[pi], ix = parts.indexOf(nm), t = nm + ' (' + nf.format(n) + ')'; if (ix >= 0) parts[ix] = t; else parts.push(t); });
    a.text = parts.length <= 2 ? parts.join(', ') : parts[0] + ', ' + parts[1] + ' +' + (parts.length - 2);
    if (a.decl && !a.obs && a.n > a.labels.length) a.text += ' \u00d7' + a.n;
  }
}

let arcChips = [];
function arcRight(n) { return n.x + PADL + n.w + (n.kids.length && !n.open ? chipW(n) : 0) + 5; }

/* Pass 1: the curves, drawn below dots and labels so names stay readable. */
function drawArcs(c, k, ex) {
  arcChips = [];
  if (!M) return;
  buildArcs();
  if (!arcList.length) return;
  const T = TH, right = arcRight;
  for (let j = 0; j < arcList.length; j++) {
    const a = arcList[j];
    if (ex && a.faint) continue;
    const A = a.a, B = a.b, col = a.cls === 'rel' ? T.rel : a.cls === 'restr' ? T.restr : a.cls === 'obs' ? T.ink : T.ink2;
    let p0x, p3x, c1x, c2x, dir, side = 0;
    const p0y = A.y, p3y = B.y;
    c.globalAlpha = a.faint ? 0.5 : a.cls === 'obs' && arcList.length > 12 ? 0.6 : 1;
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = (a.cls === 'sec' ? 1.3 : a.cls === 'obs' ? 1.45 : 1.7) / k;
    c.setLineDash(a.cls === 'sec' ? [2 / k, 4 / k] : a.hidden ? [6 / k, 4 / k] : []);
    if (A === B) {
      const x = right(A) + 4 / k, r = 8 / k;
      c.beginPath(); c.arc(x + r, A.y, r, Math.PI * 0.75, Math.PI * 2.6); c.stroke();
      c.setLineDash([]);
      arcChips.push([x + 2 * r + 4 / k, A.y, a, col, true]);
      continue;
    }
    if (B.x > A.x + 1) { p0x = right(A); p3x = B.x - 9; const dx = Math.max(40, p3x - p0x); c1x = p0x + dx * 0.5; c2x = p3x - dx * 0.5; dir = 1; }
    else if (B.x < A.x - 1) { p0x = A.x - 9; p3x = right(B) + 3; const dx = Math.max(40, p0x - p3x); c1x = p0x - dx * 0.5; c2x = p3x + dx * 0.5; dir = -1; }
    else { p0x = right(A); p3x = right(B) + 3; const bulge = Math.min(150, 34 + Math.abs(p3y - p0y) * 0.22); c1x = c2x = Math.max(p0x, p3x) + bulge; dir = -1; side = 1; }
    const hx = p3x - dir * 7 / k;
    c.beginPath(); c.moveTo(p0x, p0y); c.bezierCurveTo(c1x, p0y, c2x, p3y, hx, p3y); c.stroke();
    c.setLineDash([]);
    c.beginPath(); c.moveTo(p3x, p3y); c.lineTo(hx, p3y - 4 / k); c.lineTo(hx, p3y + 4 / k); c.closePath();
    if (a.cls === 'sec') { c.fillStyle = T.bg; c.fill(); c.lineWidth = 1.2 / k; c.stroke(); } else c.fill();
    if (a.cls !== 'sec') {
      const ts = [0.5, 0.38, 0.62, 0.27, 0.73, 0.16, 0.84];
      const pts = ts.map((t) => { const u = 1 - t; return [u * u * u * p0x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * hx, (u * u * u + 3 * u * u * t) * p0y + (3 * u * t * t + t * t * t) * p3y]; });
      arcChips.push([pts, side, a, col, false]);
    }
  }
  c.globalAlpha = 1;
}

/* Pass 2: the labels, at a constant size on screen, placed where they cover neither each other nor a class name. */
function drawArcChips(c, k, smallLabels) {
  const chips = arcChips;
  if (!chips.length) return;
  const placed = [], fs = 11 / k, many = chips.length > 14;
  const names = [];
  if (smallLabels) for (let j = 0; j < chipObst.length; j++) names.push(chipObst[j]);
  else if (dn.length < 5000) for (let j = 0; j < dn.length; j++) { const n = dn[j]; names.push(n.x - 7, n.y - 9, arcRight(n), n.y + 9); }
  const free = (x, y, w, h) => {
    for (let q = 0; q < placed.length; q++) { const p = placed[q]; if (x < p[2] && x + w > p[0] && y < p[3] && y + h > p[1]) return 0; }
    for (let q = 0; q < names.length; q += 4) if (x < names[q + 2] && x + w > names[q] && y < names[q + 3] && y + h > names[q + 1]) return 1;
    return 2;
  };
  c.font = '600 ' + fs + 'px ' + FONT; c.textBaseline = 'middle';
  chips.sort((x, y) => (y[4] ? 1 : 0) - (x[4] ? 1 : 0));
  for (let j = 0; j < chips.length; j++) {
    const ch = chips[j], a = ch[2];
    const text = trunc(a.text, 44), tw = c.measureText(text).width, w = tw + 12 / k, h = 18 / k;
    let x, y;
    if (ch[4]) { x = ch[0]; y = ch[1] - h / 2; }
    else {
      const px = (pt) => (ch[1] ? pt[0] + 5 / k : pt[0] - w / 2);
      let best = -1, bx = 0, by = 0;
      for (let z = 0; z < ch[0].length && best < 2; z++) { const f = free(px(ch[0][z]), ch[0][z][1] - h / 2, w, h); if (f > best) { best = f; bx = px(ch[0][z]); by = ch[0][z][1] - h / 2; } }
      /* still on top of something: move it up or down in steps */
      for (let st = 1; st <= 4 && best < 2 && !many; st++) for (let sg = -1; sg <= 1 && best < 2; sg += 2) {
        const yy = ch[0][0][1] - h / 2 + sg * st * (h + 3 / k), f = free(px(ch[0][0]), yy, w, h);
        if (f > best) { best = f; bx = px(ch[0][0]); by = yy; }
      }
      if (best === 0 && (many || a.faint)) continue;
      x = bx; y = by;
    }
    placed.push([x - 2 / k, y - 1 / k, x + w + 2 / k, y + h + 1 / k]);
    c.globalAlpha = a.faint ? 0.85 : 1;
    c.fillStyle = TH.surface; rr(c, x, y, w, h, 5 / k); c.fill();
    c.strokeStyle = ch[3]; c.lineWidth = 1 / k; c.stroke();
    c.fillStyle = ch[3]; c.fillText(text, x + 6 / k, y + h / 2 + 0.5 / k);
  }
  c.globalAlpha = 1;
}

/* ---------- minimap ---------- */

const mini = $('mini'), mg = mini.getContext('2d');
const MW = 150, MH = 168;
let miniBase = null;
function drawMini() {
  const need = S.f.mini && S.view === 'tree' && (bounds.w * cam.k > W * 1.05 || bounds.h * cam.k > H * 1.05) && window.innerWidth > 860;
  if (mini.hidden === need) { mini.hidden = !need; }
  if (!need) return;
  if (mini.width !== MW * dpr) { mini.width = MW * dpr; mini.height = MH * dpr; mini.style.width = MW + 'px'; mini.style.height = MH + 'px'; miniDirty = true; }
  const sx = (MW - 12) / bounds.w, sy = (MH - 12) / Math.max(bounds.h, 1);
  if (miniDirty || !miniBase) {
    if (!miniBase) miniBase = document.createElement('canvas');
    miniBase.width = MW * dpr; miniBase.height = MH * dpr;
    const b = miniBase.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = TH.surface; b.fillRect(0, 0, MW, MH);
    const step = Math.max(1, Math.floor(vis.length / 12000));
    for (let j = 0; j < vis.length; j += step) {
      const n = vis[j];
      b.fillStyle = branchColor(n.branch);
      b.fillRect(6 + n.nx * sx, 6 + n.ny * sy - 0.5, Math.max(2, Math.min(16, n.w * sx)), 1.4);
    }
    miniDirty = false;
  }
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.drawImage(miniBase, 0, 0);
  mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const x0 = 6 + (-cam.x / cam.k) * sx, y0 = 6 + (-cam.y / cam.k) * sy, w = (W / cam.k) * sx, h = (H / cam.k) * sy;
  const rx = Math.max(1, x0), ry = Math.max(1, y0), rw = Math.min(MW - 1, x0 + w) - rx, rh = Math.min(MH - 1, y0 + h) - ry;
  if (rw > 0 && rh > 0) {
    mg.fillStyle = TH.accent + '22'; mg.fillRect(rx, ry, rw, Math.max(rh, 2));
    mg.strokeStyle = TH.accent; mg.lineWidth = 1.5; mg.strokeRect(rx, ry, rw, Math.max(rh, 2));
  }
}
function miniTo(ev) {
  const r = mini.getBoundingClientRect();
  const sx = (MW - 12) / bounds.w, sy = (MH - 12) / Math.max(bounds.h, 1);
  const wx = (ev.clientX - r.left - 6) / sx, wy = (ev.clientY - r.top - 6) / sy;
  cam.x = W / 2 - wx * cam.k; cam.y = H / 2 - wy * cam.k;
  anim = null; draw();
}

/* ---------- circle view ---------- */

/* The same tree on a circle. Every end node (a leaf or a closed branch) sits on the rim with its name pointing
   outwards; open branches sit on inner rings, one ring per level. The angle of a node is its row in the tree
   view, so order, open and closed branches, selection and links are shared between the two views. Links run
   through the inside and follow the hierarchy, which bundles those that go the same way. */
const TAU = Math.PI * 2, RIMPX = 16, RINGMIN = 46, RMIN = 150;
const rcam = { x: 0, y: 0, k: 1 };
let radT = { R: RMIN, label: 0, span: 1 }, radReady = false, allKey = '', allList = [], innerHits = [], chipObst = [];

function isInner(n) { return n.open && n.kids.length > 0; }
function radialTargets() {
  const span = bounds.h + ROW * 2;
  let D = 0, lab = 0;
  for (let j = 0; j < vis.length; j++) { const n = vis[j]; if (n !== root && isInner(n) && n.depth > D) D = n.depth; }
  for (let j = 0; j < vis.length; j++) { const n = vis[j]; if (!isInner(n)) { const e = PADL + n.w + chipW(n); if (e > lab) lab = e; } }
  /* as large as the names on the rim and the rings need, and no smaller than what fills the window */
  const room = Math.min(340, Math.min(W - 40, H - 84) / 2 - lab - 22);
  const R = Math.max(RMIN, room, span / ROW * RIMPX / TAU, (D + 1) * RINGMIN);
  for (let j = 0; j < vis.length; j++) vis[j].tth = (vis[j].ny + ROW) / span * TAU - Math.PI / 2;
  /* from the rim inwards: an open branch sits behind its children, further back the wider they fan out,
     and never closer to the centre than the ring of its level */
  for (let j = vis.length - 1; j >= 0; j--) {
    const n = vis[j];
    if (n === root) n.trr = 0;
    else if (!isInner(n)) n.trr = R;
    else {
      const kids = n.kids;
      let m = R;
      for (let i = 0; i < kids.length; i++) if (kids[i].trr < m) m = kids[i].trr;
      const arc = (kids[kids.length - 1].tth - kids[0].tth) * m;
      n.trr = Math.max(R * Math.pow(n.depth / (D + 1), 0.8), m - Math.max(RINGMIN + 14, Math.min(arc * 0.45, m * 0.5)));
    }
  }
  radT = { R: R, label: lab, span: span };
}
function fitRadial() {
  const D = 2 * (radT.R + radT.label + 22), k = Math.max(MINK, Math.min(1, (W - 40) / D, (H - 84) / D));
  return { x: W / 2, y: H / 2 + 8, k: k };
}
/* true while the whole circle is in view the way Fit leaves it; it then stays that way when branches open or close */
function radialAtFit() {
  const f = fitRadial();
  return Math.abs(rcam.k - f.k) <= f.k * 0.03 && Math.abs(rcam.x - f.x) < 40 && Math.abs(rcam.y - f.y) < 40;
}
function placeRadial(list) {
  for (let j = 0; j < list.length; j++) { const n = list[j]; n.rx = n.rr * Math.cos(n.th); n.ry = n.rr * Math.sin(n.th); }
}
function allLinksOn() { return S.allLinks === null ? M.rels.length + M.obs.length <= 400 : S.allLinks; }
function buildAllArcs() {
  const key = gen + '|' + S.f.relProps + S.f.relRestr + S.f.relObs;
  if (key === allKey) return;
  allKey = key;
  const map = new Map();
  collectArcs(M.rels, true, map); collectObs(M.obs, true, map);
  allList = Array.from(map.values());
  if (allList.length > 4000) allList.length = 4000;
}
/* The tree path from one node up to the common ancestor and down to the other. Links follow it, which bundles them. */
function treePath(a, b) {
  const up = [], at = new Map();
  for (let n = a; n; n = n.parent) { at.set(n, up.length); up.push(n); }
  const down = [];
  let n = b;
  while (n && !at.has(n)) { down.push(n); n = n.parent; }
  const li = at.get(n), path = up.slice(0, li + 1);
  for (let j = down.length - 1; j >= 0; j--) path.push(down[j]);
  /* the top of the path is left out, so that links pass by the centre and not all through it */
  if (path.length > 3 || (path.length === 3 && li === 1 && path[1] === root)) path.splice(li, 1);
  return path;
}
function radialArc(c, k, a, quiet) {
  const T = TH, A = a.a, B = a.b, col = a.cls === 'rel' ? T.rel : a.cls === 'restr' ? T.restr : a.cls === 'obs' ? T.ink : T.ink2;
  c.strokeStyle = col; c.fillStyle = col;
  c.setLineDash(a.cls === 'sec' ? [2 / k, 4 / k] : a.hidden && !quiet ? [6 / k, 4 / k] : []);
  if (A === B) {
    const r = 7 / k, d = A.rr - 9 - r, x = d * Math.cos(A.th), y = d * Math.sin(A.th);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.setLineDash([]);
    if (!quiet) arcChips.push([[[x - 2 * r * Math.cos(A.th), y - 2 * r * Math.sin(A.th)]], 0, a, col, false]);
    return;
  }
  const path = treePath(A, B), pts = [];
  for (let j = 0; j < path.length; j++) pts.push([path[j].rx, path[j].ry]);
  /* two ends only: a chord, bent towards the centre */
  if (pts.length === 2) pts.splice(1, 0, [(pts[0][0] + pts[1][0]) * 0.22, (pts[0][1] + pts[1][1]) * 0.22]);
  const n = pts.length;
  const sa = (A.rr - 8) / (A.rr || 1), sb = (B.rr - 8) / (B.rr || 1);
  pts[0] = [A.rx * sa, A.ry * sa]; pts[n - 1] = [B.rx * sb, B.ry * sb];
  const bx = pts[n - 1][0] - pts[0][0], by = pts[n - 1][1] - pts[0][1], beta = 0.86;
  for (let j = 1; j < n - 1; j++) { const t = j / (n - 1); pts[j] = [beta * pts[j][0] + (1 - beta) * (pts[0][0] + t * bx), beta * pts[j][1] + (1 - beta) * (pts[0][1] + t * by)]; }
  let ex = pts[n - 1][0], ey = pts[n - 1][1];
  const hd = quiet ? 0 : 7 / k, dx = ex - pts[n - 2][0], dy = ey - pts[n - 2][1], dl = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / dl, uy = dy / dl;
  const tipx = ex, tipy = ey;
  ex -= ux * hd; ey -= uy * hd;
  const mids = [];
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  let px = pts[0][0], py = pts[0][1];
  if (n === 2) { c.lineTo(ex, ey); mids.push([(px + ex) / 2, (py + ey) / 2]); }
  else for (let j = 1; j < n - 1; j++) {
    const last = j === n - 2, qx = last ? ex : (pts[j][0] + pts[j + 1][0]) / 2, qy = last ? ey : (pts[j][1] + pts[j + 1][1]) / 2;
    c.quadraticCurveTo(pts[j][0], pts[j][1], qx, qy);
    mids.push([(px + 2 * pts[j][0] + qx) / 4, (py + 2 * pts[j][1] + qy) / 4]);
    px = qx; py = qy;
  }
  c.stroke(); c.setLineDash([]);
  if (quiet) return;
  c.beginPath(); c.moveTo(tipx, tipy); c.lineTo(ex - uy * 4 / k, ey + ux * 4 / k); c.lineTo(ex + uy * 4 / k, ey - ux * 4 / k); c.closePath();
  if (a.cls === 'sec') { c.fillStyle = T.bg; c.fill(); c.stroke(); } else c.fill();
  if (a.cls !== 'sec') { mids.reverse(); arcChips.push([mids, 0, a, col, false]); }
}
function radialLink(P, p, kid) {
  const ck = Math.cos(kid.th), sk = Math.sin(kid.th), r1 = kid.rr - 6;
  if (p === root) { P.moveTo(8 * ck, 8 * sk); P.lineTo(r1 * ck, r1 * sk); return; }
  const cp = Math.cos(p.th), sp = Math.sin(p.th), r0 = p.rr + 5, rm = (r0 + r1) / 2, dth = kid.th - p.th, ad = Math.abs(dth);
  P.moveTo(r0 * cp, r0 * sp);
  if (ad < 0.4) { P.bezierCurveTo(rm * cp, rm * sp, rm * ck, rm * sk, r1 * ck, r1 * sk); return; }
  /* a wide turn: follow the circle, leaving and arriving along the radius */
  const m = Math.min(28, 3 + Math.ceil(ad * 7)), dt = 1 / m, dr = r1 - r0;
  let x0 = r0 * cp, y0 = r0 * sp, vx0 = dr * cp, vy0 = dr * sp;
  for (let i = 1; i <= m; i++) {
    const t = i * dt, a = p.th + dth * t * t * (3 - 2 * t), r = r0 + dr * t, w = r * dth * 6 * t * (1 - t), ca = Math.cos(a), sa = Math.sin(a);
    const x1 = r * ca, y1 = r * sa, vx1 = dr * ca - w * sa, vy1 = dr * sa + w * ca;
    P.bezierCurveTo(x0 + vx0 * dt / 3, y0 + vy0 * dt / 3, x1 - vx1 * dt / 3, y1 - vy1 * dt / 3, x1, y1);
    x0 = x1; y0 = y1; vx0 = vx1; vy0 = vy1;
  }
}

function renderRadial(c, W, H, cam, ex) {
  /* kk is the scale of the drawing; k is the zoom that sizes kept constant on screen go by (a picture is drawn at twice the size) */
  const kk = cam.k, k = ex ? kk / 2 : kk, T = TH, animating = !!(anim && anim.nodes) && !ex;
  c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
  if (!ex && k >= 0.6) {
    const st = 24 * k, ox = ((cam.x % st) + st) % st, oy = ((cam.y % st) + st) % st, sz = k >= 1 ? 1.5 : 1;
    c.fillStyle = T.grid;
    for (let y = oy; y < H; y += st) for (let x = ox; x < W; x += st) c.fillRect(x, y, sz, sz);
  }
  placeRadial(vis);
  if (animating) placeRadial(ghosts);
  const mg = 340, vx0 = -cam.x / kk - mg, vx1 = (W - cam.x) / kk + mg, vy0 = -cam.y / kk - mg, vy1 = (H - cam.y) / kk + mg;
  const off = (n) => n.rx < vx0 || n.rx > vx1 || n.ry < vy0 || n.ry > vy1;
  c.save();
  c.translate(cam.x, cam.y); c.scale(kk, kk);
  c.lineCap = 'round'; c.lineJoin = 'round';

  /* hierarchy */
  const LP = [];
  for (let b = 0; b <= NB; b++) LP.push(new Path2D());
  for (let j = 0; j < vis.length; j++) {
    const p = vis[j];
    if (!isInner(p)) continue;
    const kids = p.kids, po = off(p);
    for (let i = 0; i < kids.length; i++) { const kid = kids[i]; if (po && off(kid)) continue; radialLink(LP[kid.branch + 1], p, kid); }
  }
  if (animating) for (let j = 0; j < ghosts.length; j++) { const n = ghosts[j], P = LP[n.branch + 1]; P.moveTo(n.to.rx, n.to.ry); P.lineTo(n.rx, n.ry); }
  /* thinner where the rim is so crowded that neighbours would merge */
  c.lineWidth = Math.max(0.45, Math.min(1.2, RIMPX * k * 0.8)) / k;
  for (let b = 0; b <= NB; b++) { c.strokeStyle = mix(branchColor(b - 1), T.bg, b === 0 ? 0.4 : 0.5); c.stroke(LP[b]); }

  const sn0 = selNode(), hn = ex ? null : hoverNode();
  if (sn0 && isVisible(sn0)) {
    c.lineWidth = 2.2 / k;
    for (let n = sn0; n.parent; n = n.parent) { const P = new Path2D(); radialLink(P, n.parent, n); c.strokeStyle = branchColor(n.branch); c.stroke(P); }
  }

  /* links: all of them faintly if asked for, then those of the selection */
  arcChips = [];
  if (allLinksOn()) {
    buildAllArcs();
    c.lineWidth = 1 / k; c.globalAlpha = allList.length > 600 ? 0.18 : allList.length > 150 ? 0.26 : allList.length > 45 ? 0.36 : 0.5;
    for (let j = 0; j < allList.length; j++) radialArc(c, k, allList[j], true);
    c.globalAlpha = 1;
  }
  buildArcs();
  for (let j = 0; j < arcList.length; j++) {
    const a = arcList[j];
    if (ex && a.faint) continue;
    c.globalAlpha = a.faint ? 0.6 : 1; c.lineWidth = (a.cls === 'sec' ? 1.3 : 1.9) / k;
    radialArc(c, k, a, false);
  }
  c.globalAlpha = 1;

  /* dots */
  const all = animating && ghosts.length ? vis.concat(ghosts) : vis;
  const FP = [], RP = [];
  for (let b = 0; b <= NB; b++) { FP.push(new Path2D()); RP.push(new Path2D()); }
  for (let j = 0; j < all.length; j++) {
    const n = all[j];
    if (off(n)) continue;
    const r = !n.kids.length ? 2.6 : n.open ? 3.6 : 4.6, P = (isInner(n) ? RP : FP)[n.branch + 1];
    P.moveTo(n.rx + r, n.ry); P.arc(n.rx, n.ry, r, 0, TAU);
  }
  c.lineWidth = 1.7 / Math.max(k, 0.5);
  for (let b = 0; b <= NB; b++) {
    const col = branchColor(b - 1);
    c.fillStyle = col; c.fill(FP[b]);
    c.fillStyle = T.bg; c.fill(RP[b]); c.strokeStyle = col; c.stroke(RP[b]);
  }

  /* names on the rim, written outwards */
  const rim = 13 * k >= 6.2, selTypes = S.sel && S.sel.t === 'i' ? M.inds[S.sel.i].types : null;
  c.textBaseline = 'middle';
  if (rim) {
    c.font = LABEL_FONT;
    for (let j = 0; j < all.length; j++) {
      const n = all[j];
      if (isInner(n) || n === root || off(n)) continue;
      const isSel = n === sn0, isM = matches !== null && n.i >= 0 && matches.has(n.i), right = Math.cos(n.th) >= 0, tx = right ? PADL : -PADL - n.w;
      c.save();
      c.translate(n.rx, n.ry); c.rotate(right ? n.th : n.th + Math.PI);
      if (n.a < 1) c.globalAlpha = n.a;
      if (isSel) { c.fillStyle = T.ink; rr(c, tx - 5, -9.5, n.w + 10, 19, 5); c.fill(); }
      else if (isM) { c.fillStyle = T.match; rr(c, tx - 4, -9, n.w + 8, 18, 4); c.fill(); }
      else if (selTypes !== null && selTypes.indexOf(n.i) >= 0) { c.fillStyle = T.surface; rr(c, tx - 5, -9.5, n.w + 10, 19, 5); c.fill(); c.strokeStyle = T.ink; c.lineWidth = 1.5 / k; c.stroke(); }
      else if (n === hn) { c.fillStyle = T.surface; rr(c, tx - 5, -9.5, n.w + 10, 19, 5); c.fill(); c.strokeStyle = T.line2; c.lineWidth = 1 / k; c.stroke(); }
      c.textAlign = 'left';
      c.fillStyle = isSel ? T.bg : n.dep ? T.ink3 : n.ext ? T.ink2 : T.ink;
      c.fillText(n.t, tx, 0.5);
      if (n.dep) { c.strokeStyle = isSel ? T.bg : T.ink3; c.lineWidth = 1; c.beginPath(); c.moveTo(tx, 0.5); c.lineTo(tx + n.w, 0.5); c.stroke(); }
      if (n.kids.length) {
        const hit = matches !== null && n.mc > 0;
        c.font = (hit ? '700 ' : '') + CHIP_FONT; c.fillStyle = hit ? T.restr : T.ink3;
        if (right) c.fillText('+' + n.desc, tx + n.w + 8, 0.5); else { c.textAlign = 'right'; c.fillText('+' + n.desc, tx - 8, 0.5); }
      }
      c.restore();
    }
  }

  /* names inside the circle: upright, at a constant size on screen, and only where they do not collide */
  const fs = 11 / k, cand = [];
  c.font = '600 ' + fs + 'px ' + FONT;
  for (let j = 0; j < vis.length; j++) {
    const n = vis[j];
    if (off(n)) continue;
    if (isInner(n) || n === root) cand.push(n);
    else if (!rim && (n.kids.length || n === sn0 || n === hn || (matches !== null && n.i >= 0 && matches.has(n.i)))) cand.push(n);
  }
  const rank = (n) => (n === sn0 ? 0 : n === hn ? 1 : selTypes !== null && selTypes.indexOf(n.i) >= 0 ? 2 : isInner(n) || n === root ? 3 : 4);
  cand.sort((a, b) => rank(a) - rank(b) || a.depth - b.depth || b.desc - a.desc);
  const placed = [];
  innerHits = []; chipObst = [];
  c.lineWidth = 3.5 / k; c.strokeStyle = T.bg; c.textAlign = 'left';
  for (let j = 0; j < cand.length && placed.length < 500; j++) {
    const n = cand[j], tw = n.w * (11 / 13) * 1.07 / k, inner = isInner(n) || n === root, force = n === sn0 || n === hn;
    let x0, yc;
    if (inner) { x0 = n.rx - tw / 2; yc = n.ry + (n === root || Math.sin(n.th) < 0 ? -12 : 12) / k; }
    else { x0 = Math.cos(n.th) >= 0 ? n.rx + 8 / k : n.rx - 8 / k - tw; yc = n.ry; }
    const y0 = yc - 7.5 / k, y1 = yc + 7.5 / k;
    let hit = false;
    for (let z = 0; z < placed.length; z++) { const q = placed[z]; if (x0 < q[2] && x0 + tw > q[0] && y0 < q[3] && y1 > q[1]) { hit = true; break; } }
    if (hit && !force) continue;
    placed.push([x0 - 5 / k, y0, x0 + tw + 5 / k, y1]);
    chipObst.push(x0 - 5 / k, y0 - 2 / k, x0 + tw + 5 / k, y1 + 2 / k);
    innerHits.push([x0 - 4 / k, y0, x0 + tw + 4 / k, y1, n]);
    if (n === sn0) { c.fillStyle = T.ink; rr(c, x0 - 5 / k, y0 - 1 / k, tw + 10 / k, 17 / k, 4.5 / k); c.fill(); c.fillStyle = T.bg; }
    else {
      if (n === hn || (selTypes !== null && selTypes.indexOf(n.i) >= 0)) { c.fillStyle = T.surface; rr(c, x0 - 5 / k, y0 - 1 / k, tw + 10 / k, 17 / k, 4.5 / k); c.fill(); c.save(); c.strokeStyle = n === hn ? T.line2 : T.ink; c.lineWidth = 1 / k; c.stroke(); c.restore(); }
      else c.strokeText(n.t, x0, yc);
      c.fillStyle = matches !== null && n.i >= 0 && matches.has(n.i) ? T.restr : n.dep ? T.ink3 : T.ink;
    }
    c.fillText(n.t, x0, yc);
  }
  if (matches !== null && !rim) {
    c.fillStyle = T.match; c.strokeStyle = T.restr; c.lineWidth = 1 / k;
    for (let j = 0; j < vis.length; j++) {
      const n = vis[j];
      if ((n.i >= 0 && matches.has(n.i)) || (!n.open && n.mc > 0)) { c.beginPath(); c.arc(n.rx, n.ry, 4.5 / Math.max(k, 0.25), 0, TAU); c.fill(); c.stroke(); }
    }
  }
  drawArcChips(c, k, true);
  c.restore();
}

function hitRadial(sx, sy) {
  const k = rcam.k, wx = (sx - rcam.x) / k, wy = (sy - rcam.y) / k, r = Math.sqrt(wx * wx + wy * wy), rim = 13 * k >= 6.2;
  for (let j = 0; j < innerHits.length; j++) { const q = innerHits[j]; if (wx >= q[0] && wx <= q[2] && wy >= q[1] && wy <= q[3]) return { n: q[4], part: 'label' }; }
  let best = null, bd = Math.max(8, 9 / k);
  for (let j = 0; j < vis.length; j++) {
    const n = vis[j];
    if (rim && !isInner(n) && n !== root) continue;
    const d = Math.abs(n.rx - wx) + Math.abs(n.ry - wy);
    if (d < bd) { bd = d; best = n; }
  }
  if (best) return { n: best, part: 'dot' };
  if (!rim || r < radT.R - 9) return null;
  let th = Math.atan2(wy, wx) + Math.PI / 2;
  if (th < 0) th += TAU;
  const ty = th / TAU * radT.span - ROW, tx = r - radT.R;
  bd = ROW / 2 + 0.01;
  for (let j = 0; j < vis.length; j++) {
    const n = vis[j];
    if (isInner(n) || n === root) continue;
    const dy = Math.abs(ty - n.ny);
    if (dy >= bd || tx > PADL + n.w + chipW(n) + 6) continue;
    bd = dy; best = n;
  }
  if (!best) return null;
  return { n: best, part: tx < 7 ? 'dot' : tx > PADL + best.w + 3 ? 'chip' : 'label' };
}

/* ---------- hit testing ---------- */

function hitTree(sx, sy) {
  const k = cam.k;
  if (sy < 24 && k >= 0.22) {
    for (let d = 1; d < cols.length; d++) if (Math.abs(sx - (colX[d] * k + cam.x)) < 11) return { level: d };
  }
  const wx = (sx - cam.x) / k, wy = (sy - cam.y) / k, slack = Math.max(9, 8 / k), tol = Math.max(ROW / 2, 5 / k);
  let best = null, bd = 1e9;
  const small = 13 * k < 6.2;
  for (let j = 0; j < dn.length; j++) {
    const n = dn[j], dy = Math.abs(wy - n.y);
    if (dy > tol || dy >= bd) continue;
    const x1 = small ? n.x + Math.max(slack, n.w * 0.9 / k) : n.x + PADL + n.w + chipW(n) * (n.open ? 0 : 1) + 6;
    if (wx < n.x - slack || wx > x1) continue;
    bd = dy; best = n;
  }
  if (!best) return null;
  const part = wx < best.x + 7 / Math.min(1, k) ? 'dot' : (!small && wx > best.x + PADL + best.w + 3 ? 'chip' : 'label');
  return { n: best, part: part };
}

/* ---------- focus view ---------- */

let F = null;
const fcam = { x: 0, y: 0, k: 1 };

function indBranch(i) {
  const ts = M.inds[i].types;
  for (let j = 0; j < ts.length; j++) if (nodes[ts[j]]) return nodes[ts[j]].branch;
  return -1;
}
/* Neighbours of a focus node as [kind, index] pairs; kind is 'c' for a class and 'i' for an individual. */
function neigh(o, cat, kind) {
  const out = [], seen = new Set();
  const push = (k, i) => { const key = k + i; if (!seen.has(key) && (k === 'i' || nodes[i])) { seen.add(key); out.push([k, i]); } };
  if (o.k === 'i') {
    const ind = M.inds[o.i];
    if (cat === 'sup') { if (o.hop === 0) ind.types.forEach((t) => push('c', t)); }
    else if (cat === 'out') { for (let q = 0; q < ind.out.length; q += 2) if (ind.out[q + 1] !== o.i) push('i', ind.out[q + 1]); }
    else if (cat === 'in') { const inn = indIn[o.i]; for (let q = 0; q < inn.length; q += 2) if (inn[q + 1] !== o.i) push('i', inn[q + 1]); }
    return out;
  }
  if (kind === 'i') return out;
  const a = o.i;
  if (cat === 'sup') par[a].forEach((p) => push('c', p));
  else if (cat === 'sub') kidsAll[a].forEach((p) => push('c', p));
  else if (cat === 'out') {
    relOut[a].forEach((r) => { if (r.o !== a) push('c', r.o); });
    if (S.f.relObs) obsOut[a].forEach((r) => { if (r.o !== a) push('c', r.o); });
  } else if (cat === 'in') {
    relIn[a].forEach((r) => { if (r.s !== a) push('c', r.s); });
    if (S.f.relObs) obsIn[a].forEach((r) => { if (r.s !== a) push('c', r.s); });
  } else M.classes[a].eq.forEach((e) => { if (e.t === 'c') push('c', e.c); });
  return out;
}

function buildFocus(center, kind) {
  kind = kind || 'c';
  const prev = F && F.kind === kind ? F.map : null, prevCenter = F ? F.nodes[0] : null;
  const map = new Map(), fn = [], omitted = new Set();
  mctx.font = '600 ' + LABEL_FONT;
  const add = (k, i, hop, from, cat) => {
    const name = k === 'c' ? cname[i] : indName(M.inds[i]), t = trunc(name, 34);
    const o = { k: k, i: i, key: k + i, hop: hop, from: from, cat: cat, t: t, w: Math.ceil(mctx.measureText(t).width) + 26, h: 30, x: 0, y: 0, ox: 0, oy: 0, nx: 0, ny: 0, ang: 0, stub: false,
      branch: k === 'c' ? nodes[i].branch : indBranch(i) };
    map.set(o.key, o); fn.push(o);
    return o;
  };
  add(kind, center, 0, null, 'c');
  let frontier = [fn[0]];
  const cats = ['sup', 'out', 'in', 'eq', 'sub'];
  for (let hop = 1; hop <= S.hops; hop++) {
    const next = [];
    for (let ci = 0; ci < cats.length; ci++) for (let f = 0; f < frontier.length; f++) {
      const nb = neigh(frontier[f], cats[ci], kind);
      for (let j = 0; j < nb.length; j++) {
        const key = nb[j][0] + nb[j][1];
        if (map.has(key)) continue;
        if (fn.length >= S.cap) { omitted.add(key); continue; }
        next.push(add(nb[j][0], nb[j][1], hop, frontier[f], cats[ci]));
      }
    }
    frontier = next;
  }
  const em = new Map();
  const edge = (a, b, type, label) => {
    const key = a.key + '>' + b.key + (type === 'isa' ? 'i' : type === 'eq' ? 'e' : 'r');
    let e = em.get(key);
    if (!e) { e = { a: a, b: b, type: type, labels: [], text: '' }; em.set(key, e); }
    else if (type === 'rel' || (type === 'restr' && e.type === 'obs')) e.type = type;
    if (label && e.labels.indexOf(label) < 0) e.labels.push(label);
    return e;
  };
  fn.forEach((o) => {
    if (o.k === 'i') {
      const ind = M.inds[o.i];
      if (o.hop === 0) ind.types.forEach((t) => { const c = map.get('c' + t); if (c) edge(o, c, 'isa'); });
      for (let q = 0; q < ind.out.length; q += 2) { const tg = map.get('i' + ind.out[q + 1]); if (tg) edge(o, tg, 'obs', pname[ind.out[q]]); }
      return;
    }
    if (kind === 'i') return;
    par[o.i].forEach((p) => { const c = map.get('c' + p); if (c) edge(o, c, 'isa'); });
    relOut[o.i].forEach((r) => { const c = map.get('c' + r.o); if (c) edge(o, c, r.k === 'prop' || r.k === 'related' ? 'rel' : 'restr', relLabel(r)); });
    if (S.f.relObs) obsOut[o.i].forEach((r) => {
      const c = map.get('c' + r.o);
      if (!c) return;
      const e = edge(o, c, 'obs'), nm = pname[r.p], ix = e.labels.indexOf(nm), t = nm + ' (' + nf.format(r.n) + ')';
      if (ix >= 0) e.labels[ix] = t; else e.labels.push(t);
    });
    M.classes[o.i].eq.forEach((e) => { if (e.t === 'c' && o.i < e.c) { const c = map.get('c' + e.c); if (c) edge(o, c, 'eq', 'equivalent to'); } });
  });
  const edges = Array.from(em.values());
  edges.forEach((e) => { e.text = e.labels.length <= 2 ? e.labels.join(', ') : e.labels[0] + ', ' + e.labels[1] + ' +' + (e.labels.length - 2); e.rev = em.has(e.b.key + '>' + e.a.key + 'r'); });
  let stub = null;
  if (omitted.size) {
    const t = '+' + nf.format(omitted.size) + ' more';
    stub = { k: 's', i: -2, key: 'stub', hop: 1, from: fn[0], cat: 'sub', t: t, w: Math.ceil(mctx.measureText(t).width) + 26, h: 30, x: 0, y: 0, ox: 0, oy: 0, nx: 0, ny: 0, ang: 0, stub: true, branch: -1 };
    fn.push(stub);
    edges.push({ a: stub, b: fn[0], type: 'stub', labels: [], text: '', rev: false });
  }
  simulate(fn, edges);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  fn.forEach((o) => { x0 = Math.min(x0, o.nx - o.w / 2); x1 = Math.max(x1, o.nx + o.w / 2); y0 = Math.min(y0, o.ny - o.h / 2); y1 = Math.max(y1, o.ny + o.h / 2); });
  fn.forEach((o) => {
    const p = prev && !o.stub ? prev.get(o.key) : null;
    if (p) { o.ox = p.x; o.oy = p.y; }
    else { const src = prev && prev.get(fn[0].key) ? prev.get(fn[0].key) : prevCenter; o.ox = src ? src.x : 0; o.oy = src ? src.y : 0; }
    o.x = o.ox; o.y = o.oy;
  });
  F = { kind: kind, center: center, title: fn[0].t, nodes: fn, edges: edges, map: map, omitted: omitted.size, total: fn.length - (stub ? 1 : 0) + omitted.size, box: [x0, y0, x1, y1] };
  const padT = 64, pad = 40;
  const k = Math.max(0.3, Math.min(1, (W - pad * 2) / (x1 - x0), (H - padT - pad - 40) / (y1 - y0)));
  const c1 = { x: W / 2 - (x0 + x1) / 2 * k, y: padT + (H - padT - pad - 40) / 2 - (y0 + y1) / 2 * k, k: k };
  if (REDUCED || !prevCenter) {
    fn.forEach((o) => { o.x = o.nx; o.y = o.ny; });
    fcam.x = c1.x; fcam.y = c1.y; fcam.k = c1.k;
    anim = null;
  } else anim = { t0: performance.now(), dur: 380, nodes: false, focus: true, c0: null, c1: null, f0: { x: fcam.x, y: fcam.y, k: fcam.k }, f1: c1 };
  renderFocusBar();
  draw();
}
function focusTween(e) {
  if (!F) return;
  for (let j = 0; j < F.nodes.length; j++) { const o = F.nodes[j]; o.x = o.ox + (o.nx - o.ox) * e; o.y = o.oy + (o.ny - o.oy) * e; }
  fcam.x = anim.f0.x + (anim.f1.x - anim.f0.x) * e; fcam.y = anim.f0.y + (anim.f1.y - anim.f0.y) * e; fcam.k = anim.f0.k + (anim.f1.k - anim.f0.k) * e;
}

/* Focus layout. Direct neighbours get fixed places, so the picture is the same every time and reads left to right:
   parents and the classes that point here on the left, property targets and children on the right.
   Only second-step neighbours are relaxed with forces. */
function simulate(fn, edges) {
  const n = fn.length, c = fn[0];
  const by = { sup: [], sub: [], out: [], in: [], eq: [] };
  for (let j = 0; j < n; j++) { fn[j].ix = j; fn[j].pin = fn[j].hop <= 1; fn[j].cw = 0; if (j && fn[j].hop === 1) by[fn[j].cat].push(fn[j]); }
  mctx.font = '600 11px ' + FONT;
  for (let j = 0; j < edges.length; j++) {
    const e = edges[j];
    e.cw = e.text ? Math.ceil(mctx.measureText(trunc(e.text, 40)).width) + 12 : 0;
    if (!e.cw || e.a === e.b) continue;
    const o = e.a === c ? e.b : e.b === c ? e.a : null;
    if (o && o.hop === 1 && (o.cat === 'out' || o.cat === 'in' || o.cat === 'eq')) o.cw = Math.max(o.cw, e.cw);
  }
  c.nx = 0; c.ny = 0;
  const VG = 44, COLMAX = 12, inner = c.w / 2 + 84;
  const blockH = (L) => (L.length ? (Math.min(L.length, COLMAX) - 1) * VG + 30 : 0);
  const side = (sd, top, bottom) => {
    const hT = blockH(top), hB = blockH(bottom), gap = hT && hB ? 48 : 0;
    let y = -(hT + gap + hB) / 2;
    [top, bottom].forEach((L) => {
      if (!L.length) return;
      const hgt = blockH(L);
      let x = sd * inner;
      for (let st = 0; st < L.length; st += COLMAX) {
        const part = L.slice(st, st + COLMAX);
        let mw = 0, mc = 0;
        part.forEach((o) => { mw = Math.max(mw, o.w); mc = Math.max(mc, o.cw); });
        const lead = mc ? mc + 30 : 0, y0 = y + 15 + (hgt - 30 - (part.length - 1) * VG) / 2;
        part.forEach((o, j) => { o.nx = x + sd * (lead + o.w / 2); o.ny = y0 + j * VG; });
        x += sd * (lead + mw + 60);
      }
      y += hgt + gap;
    });
  };
  side(-1, by.sup, by.in.concat(by.eq));
  side(1, by.out, by.sub);

  /* second-step neighbours: one more column on each side, each as close as possible to the class it hangs off */
  const free = fn.filter((o) => !o.pin);
  if (!free.length) return;
  const outer = (sd) => {
    const L = free.filter((o) => (o.from.nx >= 0 ? 1 : -1) === sd).sort((a, b) => a.from.ny - b.from.ny || a.ix - b.ix);
    if (!L.length) return;
    let ext = c.w / 2;
    fn.forEach((o) => { if (o.pin) ext = Math.max(ext, sd * o.nx + o.w / 2); });
    let x = ext + 120;
    const R = 18, SP = 40;
    for (let st = 0; st < L.length; st += R) {
      const part = L.slice(st, st + R);
      let mw = 0, prev = -1e9, shift = 0;
      part.forEach((o) => { mw = Math.max(mw, o.w); o.ny = Math.max(o.from.ny, prev + SP); prev = o.ny; shift += o.ny - o.from.ny; });
      shift /= part.length;
      part.forEach((o) => { o.ny -= shift; o.nx = sd * (x + o.w / 2); });
      x += mw + 70;
    }
  };
  outer(-1); outer(1);
}

function rectEdge(o, tx, ty) {
  const dx = tx - o.x, dy = ty - o.y;
  if (dx === 0 && dy === 0) return [o.x, o.y];
  const hw = o.w / 2 + 3, hh = o.h / 2 + 3;
  const s = Math.min(Math.abs(dx) > 0 ? hw / Math.abs(dx) : 1e9, Math.abs(dy) > 0 ? hh / Math.abs(dy) : 1e9);
  return [o.x + dx * s, o.y + dy * s];
}

function renderFocus(c, W, H, cam, ex) {
  const T = TH, k = cam.k;
  c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
  if (!F) return;
  if (!ex && k >= 0.6) {
    const st = 24 * k, ox = ((cam.x % st) + st) % st, oy = ((cam.y % st) + st) % st;
    c.fillStyle = T.grid;
    for (let y = oy; y < H; y += st) for (let x = ox; x < W; x += st) c.fillRect(x, y, 1, 1);
  }
  c.save();
  c.translate(cam.x, cam.y); c.scale(k, k);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const chips = [], hov = S.hover && S.hover.f ? S.hover.f : null;
  c.font = '600 11px ' + FONT;
  for (let j = 0; j < F.edges.length; j++) {
    const e = F.edges[j], A = e.a, B = e.b;
    const col = e.type === 'rel' ? T.rel : e.type === 'restr' ? T.restr : e.type === 'obs' ? T.ink : e.type === 'eq' ? T.ink2 : T.ink3;
    const lit = hov && (hov === A || hov === B), main = A === F.nodes[0] || B === F.nodes[0] || A.hop + B.hop <= 2;
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = (e.type === 'isa' || e.type === 'stub' ? 1.3 : 1.7) * (lit ? 1.5 : 1);
    c.globalAlpha = hov ? (lit ? 1 : 0.22) : main ? 1 : 0.4;
    c.setLineDash(e.type === 'stub' ? [3, 4] : e.type === 'eq' ? [6, 4] : []);
    if (A === B) {
      const x = A.x + A.w / 2 - 14, y = A.y - A.h / 2;
      c.beginPath(); c.arc(x, y - 9, 11, Math.PI * 0.6, Math.PI * 2.4); c.stroke();
      chips.push([x, y - 30, e.text, col]);
      continue;
    }
    if (e.type === 'isa' || e.type === 'stub') {
      const al = A.x - A.w / 2, ar = A.x + A.w / 2, bl = B.x - B.w / 2, br = B.x + B.w / 2;
      let x0 = 0, x1 = 0, sd = 0;
      if (al > br + 18) { x0 = al - 3; x1 = br + 3; sd = -1; } else if (ar < bl - 18) { x0 = ar + 3; x1 = bl - 3; sd = 1; }
      if (sd) {
        const tip = e.type === 'stub' ? 0 : 10, hx = x1 - sd * tip, mx2 = (x0 + hx) / 2;
        c.beginPath(); c.moveTo(x0, A.y); c.bezierCurveTo(mx2, A.y, mx2, B.y, hx, B.y); c.stroke();
        c.setLineDash([]);
        if (tip) { c.beginPath(); c.moveTo(x1, B.y); c.lineTo(hx, B.y - 5.5); c.lineTo(hx, B.y + 5.5); c.closePath(); c.fillStyle = T.bg; c.fill(); c.stroke(); }
        continue;
      }
    }
    const ctr = F.nodes[0], oth = A === ctr ? B : B === ctr ? A : null;
    if (oth && oth.hop === 1 && e.cw && Math.abs(oth.x - ctr.x) > (oth.w + ctr.w) / 2 + e.cw + 40) {
      const sd = oth.x > ctr.x ? 1 : -1, toOther = A === ctr;
      const off = e.rev ? (toOther ? -9.5 : 9.5) : 0, yo = oth.y + off, yc = ctr.y + off * 0.45;
      const xc = ctr.x + sd * (ctr.w / 2 + 3), xo = oth.x - sd * (oth.w / 2 + 3), xs = xo - sd * (e.cw + 24), xm = (xc + xs) / 2;
      const tipC = toOther || e.type === 'eq' ? 0 : 8, tipO = toOther && e.type !== 'eq' ? 8 : 0;
      c.beginPath(); c.moveTo(xc + sd * tipC, yc); c.bezierCurveTo(xm, yc, xm, yo, xs, yo); c.lineTo(xo - sd * tipO, yo); c.stroke();
      c.setLineDash([]);
      if (tipO) { c.beginPath(); c.moveTo(xo, yo); c.lineTo(xo - sd * 8, yo - 4); c.lineTo(xo - sd * 8, yo + 4); c.closePath(); c.fill(); }
      if (tipC) { c.beginPath(); c.moveTo(xc, yc); c.lineTo(xc + sd * 8, yc - 4); c.lineTo(xc + sd * 8, yc + 4); c.closePath(); c.fill(); }
      chips.push([xo - sd * (12 + e.cw / 2), yo, e.text, col, lit, true]);
      continue;
    }
    /* a link between two direct neighbours in the same column bows outwards, with its label beside it */
    if (oth === null && A !== B && A.hop === 1 && B.hop === 1 && e.type !== 'isa' && e.type !== 'stub' && Math.abs(A.x - B.x) < (A.w + B.w) / 2 && Math.abs(A.y - B.y) > 1) {
      const sd = A.x >= ctr.x ? 1 : -1, xa = A.x + sd * (A.w / 2 + 3), xb = B.x + sd * (B.w / 2 + 3);
      const xm = (sd > 0 ? Math.max(xa, xb) : Math.min(xa, xb)) + sd * (34 + Math.min(70, Math.abs(A.y - B.y) * 0.3)), tip = e.type === 'eq' ? 0 : 8;
      c.beginPath(); c.moveTo(xa, A.y); c.bezierCurveTo(xm, A.y, xm, B.y, xb + sd * tip, B.y); c.stroke();
      c.setLineDash([]);
      if (tip) { c.beginPath(); c.moveTo(xb, B.y); c.lineTo(xb + sd * 8, B.y - 4); c.lineTo(xb + sd * 8, B.y + 4); c.closePath(); c.fill(); }
      if (e.text) chips.push([(xa + 6 * xm + xb) / 8 + sd * (e.cw / 2 + 6), (A.y + B.y) / 2, e.text, col, lit, false]);
      continue;
    }
    let mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const bend = e.rev ? 22 : 0;
    const qx = mx - dy / d * bend, qy = my + dx / d * bend;
    const p0 = rectEdge(A, qx, qy), p1 = rectEdge(B, qx, qy);
    const adx = p1[0] - qx, ady = p1[1] - qy, ad = Math.sqrt(adx * adx + ady * ady) || 1, ux = adx / ad, uy = ady / ad;
    const hl = e.type === 'isa' ? 10 : 8, hw = e.type === 'isa' ? 5.5 : 4;
    const bx = p1[0] - ux * hl, by = p1[1] - uy * hl;
    c.beginPath(); c.moveTo(p0[0], p0[1]);
    if (bend) c.quadraticCurveTo(qx, qy, bx, by); else c.lineTo(bx, by);
    c.stroke();
    c.setLineDash([]);
    if (e.type !== 'stub' && e.type !== 'eq') {
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(bx - uy * hw, by + ux * hw); c.lineTo(bx + uy * hw, by - ux * hw); c.closePath();
      if (e.type === 'isa') { c.fillStyle = T.bg; c.fill(); c.stroke(); } else c.fill();
    }
    if (e.text && (lit || main || F.edges.length < 28)) chips.push([bend ? (p0[0] + 2 * qx + bx) / 4 : (p0[0] + bx) / 2, bend ? (p0[1] + 2 * qy + by) / 4 : (p0[1] + by) / 2, e.text, col, lit, false]);
  }
  c.globalAlpha = 1; c.setLineDash([]);
  c.font = '600 11px ' + FONT; c.textBaseline = 'middle'; c.textAlign = 'center';
  const placed = [];
  chips.sort((a, b) => (b[5] ? 1 : 0) - (a[5] ? 1 : 0) || (b[4] ? 1 : 0) - (a[4] ? 1 : 0));
  for (let j = 0; j < chips.length; j++) {
    const ch = chips[j], text = trunc(ch[2], 40), w = c.measureText(text).width + 12, h = 18;
    let x = ch[0] - w / 2, y = ch[1] - h / 2, ok = true;
    if (!ch[5]) {
      for (let q = 0; q < placed.length; q++) { const p = placed[q]; if (x < p[2] && x + w > p[0] && y < p[3] && y + h > p[1]) { ok = false; break; } }
      if (!ok) { y += h + 2; ok = true; for (let q = 0; q < placed.length; q++) { const p = placed[q]; if (x < p[2] && x + w > p[0] && y < p[3] && y + h > p[1]) { ok = false; break; } } }
      if (!ok && chips.length > 30 && !ch[4]) continue;
    }
    placed.push([x, y, x + w, y + h]);
    c.globalAlpha = hov && !ch[4] ? 0.3 : 1;
    c.fillStyle = T.surface; rr(c, x, y, w, h, 5); c.fill();
    c.strokeStyle = ch[3]; c.lineWidth = 1; c.stroke();
    c.fillStyle = ch[3]; c.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }
  c.globalAlpha = 1;
  for (let j = F.nodes.length - 1; j >= 0; j--) {
    const o = F.nodes[j], x = o.x - o.w / 2, y = o.y - o.h / 2;
    rr(c, x, y, o.w, o.h, o.k === 'i' ? o.h / 2 : 8);
    if (j === 0) { c.fillStyle = T.ink; c.fill(); }
    else {
      c.fillStyle = T.surface; c.fill();
      c.lineWidth = o === hov ? 2.4 : 1.6;
      c.strokeStyle = o.stub ? T.ink3 : branchColor(o.branch);
      if (o.stub) c.setLineDash([4, 3]);
      c.stroke(); c.setLineDash([]);
    }
    c.font = (j === 0 ? '600 ' : '') + LABEL_FONT;
    c.fillStyle = j === 0 ? T.bg : o.stub || o.hop > 1 ? T.ink2 : T.ink;
    c.fillText(o.t, o.x, o.y + 0.5);
  }
  c.textAlign = 'left';
  c.restore();
}

function hitFocus(sx, sy) {
  if (!F) return null;
  const wx = (sx - fcam.x) / fcam.k, wy = (sy - fcam.y) / fcam.k;
  for (let j = 0; j < F.nodes.length; j++) {
    const o = F.nodes[j];
    if (Math.abs(wx - o.x) <= o.w / 2 + 2 && Math.abs(wy - o.y) <= o.h / 2 + 2) return o;
  }
  return null;
}
