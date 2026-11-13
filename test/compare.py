# Cross-check Canopy's parsers and model against rdflib on real ontologies.
# Usage: python3 test/compare.py [+]file ...   (a leading + also runs a full graph isomorphism check; slow on big files)
import json, os, subprocess, sys, tempfile, time
import rdflib
from rdflib import Graph, URIRef, BNode, Literal, RDF, RDFS, OWL, XSD
from rdflib.compare import isomorphic
rdflib.NORMALIZE_LITERALS = False
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.gettempdir()
TOP = {OWL.Thing, OWL.Nothing, RDFS.Resource}
def canon(t):
    if isinstance(t, Literal):
        dt = str(t.datatype) if t.datatype and t.datatype != XSD.string else ''
        return 'L' + json.dumps([str(t), (t.language or '').lower(), dt])
    return ('B' if isinstance(t, BNode) else 'I') + str(t)
def check(path, full_iso):
    name = os.path.basename(path); base = 'file:///' + name
    fmt = 'xml' if open(path, 'rb').read(300).lstrip(b'\xef\xbb\xbf').lstrip().startswith(b'<') and b'@prefix' not in open(path,'rb').read(300) else 'turtle'
    nt = os.path.join(TMP, 'canopy-cmp-' + name + '.nt')
    for f in (nt, nt + '.err'):
        if os.path.exists(f): os.remove(f)
    job = os.path.join(TMP, 'canopy-cmp-job.json')
    json.dump([{'file': path, 'base': base, 'out': nt, 'verbose': True}], open(job, 'w'))
    subprocess.run(['node', os.path.join(HERE, 'dump.js'), job], check=True)
    problems = []
    if os.path.exists(nt + '.err'): return ['parser error: ' + open(nt + '.err').read()]
    t0 = time.time(); ref = Graph(); ref.parse(path, format=fmt, publicID=base)
    mine = Graph(); mine.parse(nt, format='nt')
    def split(g):
        ground = set(); bn = {}
        for s, p, o in g:
            if isinstance(s, BNode) or isinstance(o, BNode): bn[str(p)] = bn.get(str(p), 0) + 1
            else: ground.add((canon(s), str(p), canon(o)))
        return ground, bn
    g1, b1 = split(mine); g2, b2 = split(ref)
    if g1 != g2:
        problems.append('ground triples differ: only mine %d, only rdflib %d; e.g. %s | %s' % (len(g1 - g2), len(g2 - g1), list(g1 - g2)[:2], list(g2 - g1)[:2]))
    if b1 != b2: problems.append('blank-node triple counts per predicate differ: %s' % {k: (b1.get(k), b2.get(k)) for k in set(b1) | set(b2) if b1.get(k) != b2.get(k)})
    if full_iso and not isomorphic(mine, ref): problems.append('graphs are not isomorphic')
    # model facts
    fj = os.path.join(TMP, 'canopy-cmp-' + name + '.json')
    subprocess.run(['node', '--max-old-space-size=4096', os.path.join(HERE, 'stats.js'), fj, path], check=True)
    F = json.load(open(fj))
    g = ref
    def isdt(x): return str(x).startswith(str(XSD)) or x in (RDFS.Literal, RDF.langString, RDF.PlainLiteral, RDF.XMLLiteral, RDF.HTML, OWL.real, OWL.rational) or (x, RDF.type, RDFS.Datatype) in g
    decl = set()
    for T in (OWL.Class, RDFS.Class, OWL.DeprecatedClass):
        decl |= {s for s in g.subjects(RDF.type, T) if isinstance(s, URIRef)}
    decl -= TOP
    if sorted(map(str, decl)) != F['declared']: problems.append('declared classes differ: mine %d, rdflib %d' % (len(F['declared']), len(decl)))
    parents = {}
    preds = [RDFS.subClassOf]
    if not decl: preds = []
    for s, o in g.subject_objects(RDFS.subClassOf):
        if isinstance(s, URIRef) and isinstance(o, URIRef) and s != o and s not in TOP and o not in TOP and (s in decl or not isdt(s)) and (o in decl or not isdt(o)):
            parents.setdefault(str(s), set()).add(str(o))
    parents = {k: sorted(v) for k, v in parents.items()}
    if decl and parents != F['parents']:
        diff = [k for k in set(parents) | set(F['parents']) if parents.get(k) != F['parents'].get(k)]
        problems.append('subClassOf parents differ for %d classes, e.g. %s' % (len(diff), diff[:3]))
    rank = {'object': 4, 'data': 3, 'annotation': 2, 'rdf': 1}
    kinds = {}
    def put(s, k):
        if isinstance(s, URIRef) and rank[k] > rank.get(kinds.get(str(s)), 0): kinds[str(s)] = k
    for s in g.subjects(RDF.type, OWL.ObjectProperty): put(s, 'object')
    for s in g.subjects(RDF.type, OWL.DatatypeProperty): put(s, 'data')
    for s in g.subjects(RDF.type, OWL.AnnotationProperty): put(s, 'annotation')
    for s in g.subjects(RDF.type, OWL.OntologyProperty): put(s, 'annotation')
    for s in g.subjects(RDF.type, RDF.Property): put(s, 'rdf')
    for s in g.subjects(RDF.type, OWL.DeprecatedProperty): put(s, 'rdf')
    for c in ('InverseFunctional', 'Transitive', 'Symmetric', 'Asymmetric', 'Reflexive', 'Irreflexive'):
        for s in g.subjects(RDF.type, OWL[c + 'Property']): put(s, 'object')
    for s in g.subjects(RDF.type, OWL.FunctionalProperty): put(s, 'rdf')
    for s, o in g.subject_objects(OWL.inverseOf):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            for x in (s, o):
                if kinds.get(str(x)) == 'rdf': kinds[str(x)] = 'object'
    if kinds != F['props']:
        diff = [k for k in set(kinds) | set(F['props']) if kinds.get(k) != F['props'].get(k)]
        problems.append('property kinds differ for %d, e.g. %s' % (len(diff), [(d, kinds.get(d), F['props'].get(d)) for d in diff[:3]]))
    nres = len(set(g.subjects(RDF.type, OWL.Restriction)))
    if nres != F['stats']['restrictions']: problems.append('restriction count: mine %d rdflib %d' % (F['stats']['restrictions'], nres))
    some = set()
    def named(x): return isinstance(x, URIRef) and x not in TOP and (x in decl or not isdt(x))
    def walk(s, r, depth):
        p = g.value(r, OWL.onProperty); f = g.value(r, OWL.someValuesFrom)
        if p is not None:
            if isinstance(p, URIRef) and f is not None:
                fs = [f] if named(f) else []
                if isinstance(f, BNode) and g.value(f, OWL.unionOf) is not None:
                    fs = list(rdflib.collection.Collection(g, g.value(f, OWL.unionOf)))
                    if not fs or not all(named(x) for x in fs): fs = []
                for x in fs: some.add('%s %s %s' % (s, p, x))
            return
        inter = g.value(r, OWL.intersectionOf)
        if inter is not None and depth < 3:
            for m in rdflib.collection.Collection(g, inter):
                if isinstance(m, BNode): walk(s, m, depth + 1)
    for s, r in g.subject_objects(RDFS.subClassOf):
        if isinstance(s, URIRef) and isinstance(r, BNode) and s not in TOP and (s in decl or not isdt(s)): walk(s, r, 0)
    if sorted(some) != sorted(set(F['some'])): problems.append('existential restrictions differ: mine %d rdflib %d; e.g. %s | %s' % (len(set(F['some'])), len(some), sorted(set(F['some']) - some)[:2], sorted(some - set(F['some']))[:2]))
    nlab = sum(1 for c in decl if any(True for _ in g.objects(c, RDFS.label)) or any(True for _ in g.objects(c, URIRef('http://www.w3.org/2004/02/skos/core#prefLabel'))))
    dep = sorted({str(s) for s in g.subjects(OWL.deprecated, None) if (str(g.value(s, OWL.deprecated)) in ('true', '1'))} & set(F['declared']) | {str(s) for s in g.subjects(RDF.type, OWL.DeprecatedClass)})
    mdep = [d for d in F['deprecated'] if d in set(F['declared'])]
    if dep != mdep: problems.append('deprecated classes differ: mine %d rdflib %d' % (len(mdep), len(dep)))
    print('   rdflib: %d triples, %d declared classes, %d labelled, %d restrictions (%.0fs)' % (len(ref), len(decl), nlab, nres, time.time() - t0))
    return problems
if __name__ == '__main__':
    bad = 0
    for a in sys.argv[1:]:
        iso = a.startswith('+'); path = a.lstrip('+')
        pr = check(path, iso)
        print(('PASS ' if not pr else 'FAIL ') + path + (' (isomorphic)' if iso and not pr else ''))
        for p in pr: print('     -', p[:600]); bad += 1
    sys.exit(1 if bad else 0)
