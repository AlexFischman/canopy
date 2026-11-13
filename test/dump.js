// Usage: node dump.js <jobs.json>  -- jobs: [{file, base, format, out}]
// Writes N-Triples for each job (or <out>.err with the error message).
const fs = require('fs');
const C = require('../src/core.js')();
function esc(v) { return v.replace(/[\\"\n\r]/g, c => c === '\\' ? '\\\\' : c === '"' ? '\\"' : c === '\n' ? '\\n' : '\\r'); }
function term(x) {
  if (typeof x === 'string') return x.startsWith('_:') ? '_:' + x.slice(2).replace(/[^A-Za-z0-9]/g, c => 'x' + c.charCodeAt(0).toString(16) + 'x') : '<' + x.replace(/[\x00-\x20<>"{}|^`\\]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()) + '>';
  return '"' + esc(x.v) + '"' + (x.l ? '@' + x.l : x.d ? '^^<' + x.d + '>' : '');
}
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const j of jobs) {
  try {
    const text = C.decodeBytes(fs.readFileSync(j.file));
    const fmt = j.format || C.detectFormat(text, j.file);
    const t0 = process.hrtime.bigint();
    const r = fmt === 'rdfxml' ? C.parseRdfXml(text, { base: j.base }) : C.parseTurtle(text, { base: j.base });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const T = r.triples, lines = [];
    for (let k = 0; k < T.length; k += 3) lines.push(term(T[k]) + ' ' + term(T[k + 1]) + ' ' + term(T[k + 2]) + ' .');
    fs.writeFileSync(j.out, lines.join('\n') + '\n');
    if (j.verbose) console.log(j.file, fmt, T.length / 3, 'triples', ms.toFixed(0) + 'ms');
  } catch (e) {
    fs.writeFileSync(j.out + '.err', (e.line ? 'line ' + e.line + ':' + e.col + ' ' : '') + e.message + '\n');
    if (j.verbose) console.log(j.file, 'ERROR', e.message, e.line, e.col, e.excerpt);
  }
}
