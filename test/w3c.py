# Run the W3C Turtle and RDF/XML conformance suites against the Canopy parsers.
import json, os, subprocess, sys, shutil, tempfile
import rdflib
from rdflib import Graph, Namespace, RDF, URIRef
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS = False
MF = Namespace('http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#')
RDFT = Namespace('http://www.w3.org/ns/rdftest#')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, 'data', 'rdf-tests', 'rdf', 'rdf11')
OUT = os.path.join(tempfile.gettempdir(), 'canopy-w3c-out')
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
suites = [('rdf-turtle', 'turtle', 'https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-turtle/'),
          ('rdf-n-triples', 'turtle', 'https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-n-triples/'),
          ('rdf-xml', 'rdfxml', 'https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-xml/')]
jobs = []; tests = []
for d, fmt, webbase in suites:
    mdir = os.path.join(ROOT, d)
    g = Graph(); g.parse(os.path.join(mdir, 'manifest.ttl'), format='turtle', publicID=webbase + 'manifest.ttl')
    for t in set(g.subjects(RDF.type, None)):
        ty = g.value(t, RDF.type)
        if ty == MF.Manifest: continue
        kind = str(ty).split('#')[1]
        action = g.value(t, MF.action); result = g.value(t, MF.result)
        if action is None: continue
        rel = str(action)[len(webbase):]
        f = os.path.join(mdir, rel)
        out = os.path.join(OUT, d + '__' + rel.replace('/', '__') + '.nt')
        jobs.append({'file': f, 'base': str(action), 'format': fmt, 'out': out})
        tests.append((d, kind, str(g.value(t, MF.name)), f, out, os.path.join(mdir, str(result)[len(webbase):]) if result else None, str(action)))
JOBS = os.path.join(OUT, 'jobs.json')
json.dump(jobs, open(JOBS, 'w'))
subprocess.run(['node', os.path.join(HERE, 'dump.js'), JOBS], check=True)
res = {}
fails = []
for d, kind, name, f, out, expected, base in tests:
    key = (d, kind); res.setdefault(key, [0, 0])
    res[key][1] += 1
    err = os.path.exists(out + '.err')
    ok = False; why = ''
    if 'Negative' in kind:
        ok = err; why = 'accepted invalid input'
    elif 'Eval' in kind:
        if err: why = 'error: ' + open(out + '.err').read().strip()
        else:
            try:
                g1 = Graph(); g1.parse(out, format='nt')
                g2 = Graph(); g2.parse(expected, format='nt')
                ok = isomorphic(g1, g2)
                if not ok: why = 'graph differs (%d vs %d triples)' % (len(g1), len(g2))
            except Exception as e: why = 'compare failed: ' + str(e)[:200]
    else:
        ok = not err
        if err: why = 'error: ' + open(out + '.err').read().strip()
        else:
            try: Graph().parse(out, format='nt')
            except Exception as e: ok = False; why = 'output not valid N-Triples: ' + str(e)[:200]
    if ok: res[key][0] += 1
    else: fails.append((d, kind, name, why))
for k in sorted(res): print('%-14s %-28s %d/%d' % (k[0], k[1], res[k][0], res[k][1]))
if '-v' in sys.argv:
    for f in fails: print('FAIL', *f)
