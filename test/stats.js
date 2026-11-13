// Usage: node stats.js <out.json> <file> [more files...]  -- builds the model and writes facts used for cross-checking.
const fs = require('fs');
const C = require('../src/core.js')();
const out = process.argv[2], files = process.argv.slice(3);
const t0 = Date.now();
const docs = files.map(f => ({ name: f.split('/').pop(), text: C.decodeBytes(fs.readFileSync(f)) }));
const t1 = Date.now();
const m = C.load(docs);
const t2 = Date.now();
const cls = m.classes, pr = m.props;
const facts = {
  stats: m.stats, ms: { read: t1 - t0, parseAndModel: t2 - t1 },
  declared: cls.filter(c => c.declared).map(c => c.iri).sort(),
  parents: Object.fromEntries(cls.filter(c => c.sup.length).map(c => [c.iri, c.sup.map(i => cls[i].iri).sort()])),
  props: Object.fromEntries(pr.filter(p => p.declared).map(p => [p.iri, p.kind])),
  some: m.rels.filter(r => r.k === 'some' && !r.eq && !r.inv).map(r => cls[r.s].iri + ' ' + pr[r.p].iri + ' ' + cls[r.o].iri).sort(),
  domrange: m.rels.filter(r => r.k === 'prop').map(r => cls[r.s].iri + ' ' + pr[r.p].iri + ' ' + cls[r.o].iri).sort(),
  labelled: cls.filter(c => c.labels.length).length,
  individuals: m.inds.map(i => i.iri).sort(),
  deprecated: cls.filter(c => c.dep).map(c => c.iri).sort(),
};
fs.writeFileSync(out, JSON.stringify(facts));
console.log(files.join(', '), JSON.stringify(m.stats), JSON.stringify(facts.ms));
