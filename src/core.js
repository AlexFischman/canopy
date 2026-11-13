/* Canopy core: parsers (Turtle / N-Triples, RDF/XML) and the schema model.
   Pure functions, no DOM. Runs in the page, in a Web Worker and in Node. */
function CanopyCore() {
  'use strict';

  var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  var RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
  var OWL = 'http://www.w3.org/2002/07/owl#';
  var XSD = 'http://www.w3.org/2001/XMLSchema#';
  var SKOS = 'http://www.w3.org/2004/02/skos/core#';
  var XMLNS = 'http://www.w3.org/XML/1998/namespace';
  var OBOINOWL = 'http://www.geneontology.org/formats/oboInOwl#';

  /* ---------- errors ---------- */

  function makeError(msg, text, pos) {
    if (pos > text.length) pos = text.length;
    var line = 1, last = -1, i = -1;
    while ((i = text.indexOf('\n', i + 1)) !== -1 && i < pos) { line++; last = i; }
    var col = pos - last;
    var end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    var lineText = text.slice(last + 1, end).replace(/\r$/, '');
    var from = Math.max(0, col - 1 - 70);
    var e = new Error(msg);
    e.name = 'ParseError';
    e.line = line; e.col = col;
    e.excerpt = (from > 0 ? '…' : '') + lineText.slice(from, from + 140) + (lineText.length > from + 140 ? '…' : '');
    e.caret = col - 1 - from + (from > 0 ? 1 : 0);
    return e;
  }

  /* ---------- IRI resolution (RFC 3986, section 5) ---------- */

  var RE_ABS = /^[A-Za-z][A-Za-z0-9+.\-]*:/;
  var RE_IRI = /^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/;

  function removeDotSegments(p) {
    var out = '';
    while (p.length) {
      if (p.slice(0, 3) === '../') p = p.slice(3);
      else if (p.slice(0, 2) === './') p = p.slice(2);
      else if (p.slice(0, 3) === '/./') p = p.slice(2);
      else if (p === '/.') p = '/';
      else if (p.slice(0, 4) === '/../') { p = p.slice(3); out = out.slice(0, Math.max(0, out.lastIndexOf('/'))); }
      else if (p === '/..') { p = '/'; out = out.slice(0, Math.max(0, out.lastIndexOf('/'))); }
      else if (p === '.' || p === '..') p = '';
      else { var i = p.indexOf('/', 1); if (i < 0) { out += p; p = ''; } else { out += p.slice(0, i); p = p.slice(i); } }
    }
    return out;
  }

  function resolveIri(ref, base) {
    if (RE_ABS.test(ref) || !base) return ref;
    var r = RE_IRI.exec(ref), b = RE_IRI.exec(base);
    if (!r || !b) return ref;
    var auth, path, query;
    if (r[2] !== undefined) { auth = r[2]; path = removeDotSegments(r[3]); query = r[4]; }
    else {
      if (r[3] === '') { path = b[3]; query = r[4] !== undefined ? r[4] : b[4]; }
      else {
        if (r[3].charAt(0) === '/') path = removeDotSegments(r[3]);
        else {
          var merged = (b[2] !== undefined && b[3] === '') ? '/' + r[3] : b[3].slice(0, b[3].lastIndexOf('/') + 1) + r[3];
          path = removeDotSegments(merged);
        }
        query = r[4];
      }
      auth = b[2];
    }
    return (b[1] !== undefined ? b[1] + ':' : '') + (auth !== undefined ? '//' + auth : '') + path +
      (query !== undefined ? '?' + query : '') + (r[5] !== undefined ? '#' + r[5] : '');
  }

  /* ---------- Turtle / N-Triples ---------- */

  var PNB = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\uD800-\\uDFFF';
  var PNU = PNB + '_';
  var PNC = PNU + '0-9\\-\\u00B7\\u0300-\\u036F\\u203F\\u2040';
  var PLX = '%[0-9A-Fa-f]{2}|\\\\[_~.\\-!$&\'()*+,;=/?#@%]';
  var PFX = '(?:[' + PNB + '](?:[' + PNC + '.]*[' + PNC + '])?)?:';
  var RE_PNAME = new RegExp(PFX + '(?:(?:[' + PNU + ':0-9]|' + PLX + ')(?:(?:[' + PNC + '.:]|' + PLX + ')*(?:[' + PNC + ':]|' + PLX + '))?)?', 'y');
  var RE_PNAME_NS = new RegExp(PFX, 'y');
  var RE_BNODE = new RegExp('_:[' + PNU + '0-9](?:[' + PNC + '.]*[' + PNC + '])?', 'y');
  var RE_NUM = /[+-]?(?:\d+\.\d*[eE][+-]?\d+|\.\d+[eE][+-]?\d+|\d+[eE][+-]?\d+|\d*\.\d+|\d+)/y;
  var RE_LANG = /@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/y;
  var RE_IRI_BAD = /[\x00-\x20<>"{}|^`\\]/;
  var RE_NAMECH = new RegExp('[' + PNC + ':]');

  function parseTurtle(text, opts) {
    opts = opts || {};
    var s = text, n = s.length, i = 0;
    var base = opts.base || '';
    var prefixes = Object.create(null);
    var out = opts.out || [];
    var bp = '_:' + (opts.docId || 'd0');
    var bn = 0;
    var relCache = new Map();

    function fail(msg, pos) { throw makeError(msg, s, pos === undefined ? i : pos); }
    function newB() { return bp + 'g' + (bn++); }

    function ws() {
      for (;;) {
        var c = s.charCodeAt(i);
        if (c === 32 || c === 10 || c === 13 || c === 9) i++;
        else if (c === 35) { i++; while (i < n) { c = s.charCodeAt(i); if (c === 10 || c === 13) break; i++; } }
        else break;
      }
    }

    function unescapeU(v, pos) {
      return v.replace(/\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|([\s\S]?))/g, function (m, a, b) {
        if (a === undefined && b === undefined) fail('Only \\uXXXX and \\UXXXXXXXX escapes are allowed inside an IRI', pos);
        var cp = parseInt(a || b, 16);
        if (cp > 0x10FFFF) fail('Escape \\U' + b + ' is not a valid character', pos);
        return String.fromCodePoint(cp);
      });
    }

    function resolve(v) {
      if (RE_ABS.test(v) || !base) return v;
      var r = relCache.get(v);
      if (r === undefined) { r = resolveIri(v, base); relCache.set(v, r); }
      return r;
    }

    function iriRef() {
      var st = i, j = s.indexOf('>', i + 1);
      if (j < 0) fail('This IRI is missing its closing ">"');
      var v = s.slice(i + 1, j);
      if (RE_IRI_BAD.test(v)) {
        if (v.indexOf('\\') >= 0) v = unescapeU(v, st);
        if (RE_IRI_BAD.test(v)) {
          var nl = v.search(/[\n\r]/);
          if (nl >= 0) fail('This IRI is missing its closing ">"', st);
          fail('This IRI contains a character that is not allowed (spaces and < > " { } | ^ ` \\ must be escaped)', st);
        }
      }
      i = j + 1;
      return resolve(v);
    }

    function pname() {
      RE_PNAME.lastIndex = i;
      var m = RE_PNAME.exec(s);
      if (!m) {
        var ch = s.charAt(i);
        if (i >= n) fail('The file ends in the middle of a statement');
        if (ch === '{' || ch === '}') fail('Named graphs (TriG, N-Quads) are not supported; expected a Turtle statement');
        var w = /^[^\s<>"';,.\[\]()]{1,40}/.exec(s.slice(i, i + 40));
        if (w && w[0].length > 1) fail('Expected an IRI, a prefixed name or a literal but found "' + w[0] + '"');
        fail('Unexpected character "' + ch + '"');
      }
      var t = m[0], c = t.indexOf(':'), pfx = t.slice(0, c), ns = prefixes[pfx];
      if (ns === undefined) fail('The prefix "' + pfx + ':" is used but never declared');
      i += t.length;
      var local = t.slice(c + 1);
      if (local.indexOf('\\') >= 0) local = local.replace(/\\(.)/g, '$1');
      return ns + local;
    }

    function bnodeLabel() {
      RE_BNODE.lastIndex = i;
      var m = RE_BNODE.exec(s);
      if (!m) fail('Malformed blank node label');
      i += m[0].length;
      return bp + 'l' + m[0].slice(2);
    }

    function iri() {
      return s.charCodeAt(i) === 60 ? iriRef() : pname();
    }

    function stringLit() {
      var st = i, q = s.charCodeAt(i);
      var long = s.charCodeAt(i + 1) === q && s.charCodeAt(i + 2) === q;
      var j = i + (long ? 3 : 1), start = j, val = '';
      for (;;) {
        if (j >= n) fail('This string is never closed', st);
        var c = s.charCodeAt(j);
        if (c === q) {
          if (!long || (s.charCodeAt(j + 1) === q && s.charCodeAt(j + 2) === q)) break;
          j++;
        } else if (c === 92) {
          val += s.slice(start, j);
          var e = s.charCodeAt(j + 1), hex;
          switch (e) {
            case 116: val += '\t'; j += 2; break;
            case 110: val += '\n'; j += 2; break;
            case 114: val += '\r'; j += 2; break;
            case 98: val += '\b'; j += 2; break;
            case 102: val += '\f'; j += 2; break;
            case 34: val += '"'; j += 2; break;
            case 39: val += "'"; j += 2; break;
            case 92: val += '\\'; j += 2; break;
            case 117:
              hex = s.slice(j + 2, j + 6);
              if (!/^[0-9A-Fa-f]{4}$/.test(hex)) fail('\\u must be followed by four hex digits', j);
              if (/^[dD][89a-fA-F]/.test(hex)) fail('\\u' + hex + ' is half of a surrogate pair, not a character; use \\UXXXXXXXX instead', j);
              val += String.fromCharCode(parseInt(hex, 16)); j += 6; break;
            case 85:
              hex = s.slice(j + 2, j + 10);
              if (!/^[0-9A-Fa-f]{8}$/.test(hex) || parseInt(hex, 16) > 0x10FFFF || /^0000[dD][89a-fA-F]/.test(hex)) fail('\\U must be followed by eight hex digits that name a character', j);
              val += String.fromCodePoint(parseInt(hex, 16)); j += 10; break;
            default: fail('Unknown escape sequence "\\' + s.charAt(j + 1) + '" in string', j);
          }
          start = j;
        } else if (!long && (c === 10 || c === 13)) {
          fail('This string is never closed (use triple quotes for text that spans lines)', st);
        } else j++;
      }
      val += s.slice(start, j);
      i = j + (long ? 3 : 1);
      var c2 = s.charCodeAt(i);
      if (c2 === 64) {
        RE_LANG.lastIndex = i;
        var m = RE_LANG.exec(s);
        if (!m) fail('Malformed language tag');
        i += m[0].length;
        return { v: val, l: m[0].slice(1) };
      }
      if (c2 === 94 && s.charCodeAt(i + 1) === 94) {
        i += 2;
        return { v: val, d: iri() };
      }
      return { v: val };
    }

    function collection() {
      i++; ws();
      var head = RDF + 'nil', prev = null;
      while (s.charCodeAt(i) !== 41) {
        if (i >= n) fail('A list "(" is never closed');
        var node = newB();
        var o = object();
        if (prev === null) head = node; else out.push(prev, RDF + 'rest', node);
        out.push(node, RDF + 'first', o);
        prev = node;
        ws();
      }
      i++;
      if (prev !== null) out.push(prev, RDF + 'rest', RDF + 'nil');
      return head;
    }

    function bnodePropList() {
      var st = i;
      i++; ws();
      var b = newB();
      if (s.charCodeAt(i) === 93) { i++; return b; }
      predicateObjectList(b);
      ws();
      if (s.charCodeAt(i) !== 93) { if (i >= n) fail('A "[" is never closed', st); fail('Expected "]" or ";" here'); }
      i++;
      return b;
    }

    function object() {
      var c = s.charCodeAt(i);
      if (c === 60) return iriRef();
      if (c === 34 || c === 39) return stringLit();
      if (c === 95 && s.charCodeAt(i + 1) === 58) return bnodeLabel();
      if (c === 91) return bnodePropList();
      if (c === 40) return collection();
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
        RE_NUM.lastIndex = i;
        var m = RE_NUM.exec(s);
        if (m) {
          i += m[0].length;
          var t = m[0];
          return { v: t, d: XSD + (/[eE]/.test(t) ? 'double' : t.indexOf('.') >= 0 ? 'decimal' : 'integer') };
        }
        if (c === 46) fail('Expected an object before "."');
        fail('Malformed number');
      }
      if (c === 116 && s.startsWith('true', i) && !RE_NAMECH.test(s.charAt(i + 4))) { i += 4; return { v: 'true', d: XSD + 'boolean' }; }
      if (c === 102 && s.startsWith('false', i) && !RE_NAMECH.test(s.charAt(i + 5))) { i += 5; return { v: 'false', d: XSD + 'boolean' }; }
      return pname();
    }

    function verb() {
      var c = s.charCodeAt(i);
      if (c === 60) return iriRef();
      if (c === 97) {
        var d = s.charCodeAt(i + 1);
        if (d === 32 || d === 9 || d === 10 || d === 13 || d === 60 || d === 91 || d === 40 || d === 34 || d === 39 || d === 35) { i++; return RDF + 'type'; }
      }
      if (c === 34 || c === 39) fail('A literal cannot be used as a predicate');
      if (c === 95 && s.charCodeAt(i + 1) === 58) fail('A blank node cannot be used as a predicate');
      return pname();
    }

    function predicateObjectList(subj) {
      for (;;) {
        ws();
        var p = verb();
        for (;;) {
          ws();
          var o = object();
          out.push(subj, p, o);
          ws();
          if (s.charCodeAt(i) !== 44) break;
          i++;
        }
        if (s.charCodeAt(i) !== 59) break;
        while (s.charCodeAt(i) === 59) { i++; ws(); }
        var c = s.charCodeAt(i);
        if (c === 46 || c === 93 || i >= n) break;
      }
    }

    function directive(sparql) {
      var st = i;
      ws();
      RE_PNAME_NS.lastIndex = i;
      var m = RE_PNAME_NS.exec(s);
      if (!m) fail('Expected a prefix name ending in ":" after the prefix keyword');
      i += m[0].length;
      ws();
      if (s.charCodeAt(i) !== 60) fail('Expected an <IRI> for the prefix "' + m[0] + '"');
      var ns = iriRef();
      prefixes[m[0].slice(0, -1)] = ns;
      if (!sparql) { ws(); if (s.charCodeAt(i) !== 46) fail('An @prefix line must end with "."'); i++; }
      return st;
    }

    function baseDirective(sparql) {
      ws();
      if (s.charCodeAt(i) !== 60) fail('Expected an <IRI> after the base keyword');
      base = iriRef();
      relCache.clear();
      if (!sparql) { ws(); if (s.charCodeAt(i) !== 46) fail('An @base line must end with "."'); i++; }
    }

    function statement() {
      var c = s.charCodeAt(i), subj;
      if (c === 64) {
        if (s.startsWith('@prefix', i)) { i += 7; directive(false); return; }
        if (s.startsWith('@base', i)) { i += 5; baseDirective(false); return; }
        fail('Unknown directive (expected @prefix or @base)');
      }
      if ((c === 80 || c === 112) && /^prefix\s/i.test(s.substr(i, 7))) { i += 6; directive(true); return; }
      if ((c === 66 || c === 98) && /^base[\s<]/i.test(s.substr(i, 5))) { i += 4; baseDirective(true); return; }
      if (c === 91) {
        subj = bnodePropList();
        ws();
        if (s.charCodeAt(i) !== 46) predicateObjectList(subj);
      } else {
        if (c === 60) subj = iriRef();
        else if (c === 95 && s.charCodeAt(i + 1) === 58) subj = bnodeLabel();
        else if (c === 40) subj = collection();
        else if (c === 34 || c === 39) fail('A statement cannot start with a literal');
        else subj = pname();
        predicateObjectList(subj);
      }
      ws();
      if (s.charCodeAt(i) !== 46) {
        if (i >= n) fail('The last statement is missing its final "."');
        fail('Expected "." , ";" or "," here');
      }
      i++;
    }

    if (s.charCodeAt(0) === 0xFEFF) i = 1;
    for (;;) {
      ws();
      if (i >= n) break;
      statement();
    }
    return { triples: out, prefixes: prefixes, base: base };
  }

  /* ---------- XML reader ---------- */

  function xmlReader(s) {
    var n = s.length, i = 0;
    var ents = Object.create(null);
    ents.lt = '<'; ents.gt = '>'; ents.amp = '&'; ents.quot = '"'; ents.apos = "'";
    var scope = Object.create(null);
    scope.xml = XMLNS; scope[''] = '';
    var scopes = [], names = [], pendingEnd = false;
    var END = { t: 2 };
    var allPrefixes = Object.create(null);

    function fail(msg, pos) { throw makeError(msg, s, pos === undefined ? i : pos); }

    function decode(str, depth, pos) {
      if (str.indexOf('&') < 0) return str;
      return str.replace(/&([^;&\s<]*);?/g, function (m, e) {
        if (m.charAt(m.length - 1) !== ';' || !e) fail('"&" must be written as "&amp;" (or start an entity like "&name;")', pos);
        if (e.charAt(0) === '#') {
          var cp = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          if (!(cp >= 0 && cp <= 0x10FFFF)) fail('Invalid character reference "&' + e + ';"', pos);
          return String.fromCodePoint(cp);
        }
        var v = ents[e];
        if (v === undefined) fail('The entity "&' + e + ';" is not declared', pos);
        if (e === 'amp' || e === 'lt' || e === 'gt' || e === 'quot' || e === 'apos') return v;
        if (depth > 12) fail('Entity "&' + e + ';" refers to itself', pos);
        return v.indexOf('&') < 0 ? v : decode(v, (depth || 0) + 1, pos);
      });
    }

    function doctype() {
      var st = i, j = i + 9, c;
      for (;;) {
        if (j >= n) fail('This <!DOCTYPE is never closed', st);
        c = s.charCodeAt(j);
        if (c === 62) { i = j + 1; return; }
        if (c === 34 || c === 39) { j = s.indexOf(c === 34 ? '"' : "'", j + 1); if (j < 0) fail('This <!DOCTYPE is never closed', st); j++; continue; }
        if (c === 91) break;
        j++;
      }
      var k = j + 1;
      for (;;) {
        if (k >= n) fail('This <!DOCTYPE is never closed', st);
        c = s.charCodeAt(k);
        if (c === 93) break;
        if (c === 34 || c === 39) { k = s.indexOf(c === 34 ? '"' : "'", k + 1); if (k < 0) fail('This <!DOCTYPE is never closed', st); k++; continue; }
        if (c === 60 && s.startsWith('<!--', k)) { k = s.indexOf('-->', k + 4); if (k < 0) fail('This comment is never closed', st); k += 3; continue; }
        k++;
      }
      var subset = s.slice(j + 1, k), re = /<!ENTITY\s+([^\s%"']+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g, m;
      while ((m = re.exec(subset))) {
        if (ents[m[1]] === undefined) ents[m[1]] = m[2] !== undefined ? m[2] : m[3];
      }
      k = s.indexOf('>', k);
      if (k < 0) fail('This <!DOCTYPE is never closed', st);
      i = k + 1;
    }

    function startTag() {
      var st = i, j = i + 1, c;
      while (j < n) { c = s.charCodeAt(j); if (c === 32 || c === 62 || c === 47 || c === 10 || c === 9 || c === 13) break; j++; }
      var qn = s.slice(i + 1, j);
      if (!qn || /[<&"'=]/.test(qn)) fail('Stray "<" (write "&lt;" for a literal less-than sign)', st);
      var an = null, av = null, empty = false, hasNs = false;
      for (;;) {
        while (j < n) { c = s.charCodeAt(j); if (c === 32 || c === 10 || c === 9 || c === 13) j++; else break; }
        if (j >= n) fail('The tag <' + qn + ' is never closed', st);
        if (c === 62) { j++; break; }
        if (c === 47) { if (s.charCodeAt(j + 1) !== 62) fail('Expected "/>" here', j); empty = true; j += 2; break; }
        var k = j;
        while (k < n) { c = s.charCodeAt(k); if (c === 61 || c === 32 || c === 10 || c === 9 || c === 13 || c === 62 || c === 47 || c === 60) break; k++; }
        var name = s.slice(j, k);
        while (k < n) { c = s.charCodeAt(k); if (c === 32 || c === 10 || c === 9 || c === 13) k++; else break; }
        if (c !== 61) fail('The attribute "' + name + '" in <' + qn + '> has no value', j);
        k++;
        while (k < n) { c = s.charCodeAt(k); if (c === 32 || c === 10 || c === 9 || c === 13) k++; else break; }
        if (c !== 34 && c !== 39) fail('The value of attribute "' + name + '" must be in quotes', k);
        var e = s.indexOf(c === 34 ? '"' : "'", k + 1);
        if (e < 0) fail('The value of attribute "' + name + '" is never closed', k);
        var val = s.slice(k + 1, e);
        if (val.indexOf('<') >= 0) fail('The value of attribute "' + name + '" is never closed', k);
        if (val.indexOf('&') >= 0) val = decode(val, 0, k);
        if (/[\t\n\r]/.test(val)) val = val.replace(/[\t\n\r]/g, ' ');
        if (an === null) { an = []; av = []; }
        an.push(name); av.push(val);
        if (name.charCodeAt(0) === 120 && name.startsWith('xmlns')) hasNs = true;
        j = e + 1;
      }
      i = j;
      scopes.push(scope); names.push(qn);
      var a;
      if (hasNs) {
        scope = Object.create(scope);
        for (a = 0; a < an.length; a++) {
          if (an[a] === 'xmlns') scope[''] = av[a];
          else if (an[a].startsWith('xmlns:')) { scope[an[a].slice(6)] = av[a]; if (!(an[a].slice(6) in allPrefixes)) allPrefixes[an[a].slice(6)] = av[a]; }
        }
      }
      var ci = qn.indexOf(':'), ns, local;
      if (ci < 0) { ns = scope['']; local = qn; }
      else {
        ns = scope[qn.slice(0, ci)]; local = qn.slice(ci + 1);
        if (ns === undefined) fail('The namespace prefix "' + qn.slice(0, ci) + ':" is not declared', st);
      }
      var ev = { t: 1, ns: ns, local: local, uri: ns + local, qn: qn, ans: null, al: null, av: null, pos: st };
      if (an !== null) {
        var ans = [], al = [], avs = [];
        for (a = 0; a < an.length; a++) {
          var nm = an[a];
          if (nm === 'xmlns' || nm.startsWith('xmlns:')) continue;
          var c2 = nm.indexOf(':');
          if (c2 < 0) { ans.push(''); al.push(nm); }
          else {
            var ans1 = scope[nm.slice(0, c2)];
            if (ans1 === undefined) fail('The namespace prefix "' + nm.slice(0, c2) + ':" is not declared', st);
            ans.push(ans1); al.push(nm.slice(c2 + 1));
          }
          avs.push(av[a]);
        }
        ev.ans = ans; ev.al = al; ev.av = avs;
      }
      if (empty) pendingEnd = true;
      return ev;
    }

    function next() {
      if (pendingEnd) { pendingEnd = false; scope = scopes.pop(); names.pop(); return END; }
      for (;;) {
        if (i >= n) {
          if (names.length) fail('The file ends before <' + names[names.length - 1] + '> is closed');
          return null;
        }
        if (s.charCodeAt(i) !== 60) {
          var j = s.indexOf('<', i);
          if (j < 0) j = n;
          var raw = s.slice(i, j), p0 = i;
          i = j;
          return { t: 3, v: raw.indexOf('&') < 0 ? raw : decode(raw, 0, p0) };
        }
        var c = s.charCodeAt(i + 1), e;
        if (c === 33) {
          if (s.startsWith('<!--', i)) { e = s.indexOf('-->', i + 4); if (e < 0) fail('This comment is never closed'); i = e + 3; continue; }
          if (s.startsWith('<![CDATA[', i)) { e = s.indexOf(']]>', i + 9); if (e < 0) fail('This CDATA section is never closed'); var v = s.slice(i + 9, e); i = e + 3; return { t: 3, v: v }; }
          if (s.startsWith('<!DOCTYPE', i)) { doctype(); continue; }
          fail('Unexpected "<!" markup');
        }
        if (c === 63) { e = s.indexOf('?>', i + 2); if (e < 0) fail('This processing instruction is never closed'); i = e + 2; continue; }
        if (c === 47) {
          e = s.indexOf('>', i);
          if (e < 0) fail('This closing tag is never finished');
          var nm = s.slice(i + 2, e).trim();
          if (!names.length) fail('Closing tag </' + nm + '> has no matching opening tag');
          var open = names[names.length - 1];
          if (nm !== open) fail('Expected </' + open + '> but found </' + nm + '>');
          i = e + 1;
          scope = scopes.pop(); names.pop();
          return END;
        }
        return startTag();
      }
    }

    /* Raw inner XML up to the end tag of the element whose start tag was just read. */
    function rawUntilEnd() {
      if (pendingEnd) { next(); return ''; }
      var st = i, depth = 1, before;
      for (;;) {
        before = i;
        var ev = next();
        if (!ev) fail('Unexpected end of file');
        if (ev.t === 1) depth++;
        else if (ev.t === 2) { depth--; if (depth === 0) return s.slice(st, before); }
      }
    }

    return { next: next, rawUntilEnd: rawUntilEnd, fail: fail, pos: function () { return i; }, prefixes: allPrefixes, depth: function () { return names.length; } };
  }

  /* ---------- RDF/XML ---------- */

  function parseRdfXml(text, opts) {
    opts = opts || {};
    var out = opts.out || [];
    var bp = '_:' + (opts.docId || 'd0');
    var bn = 0;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (text.indexOf('\r') >= 0) text = text.replace(/\r\n?/g, '\n');
    var R = xmlReader(text);
    var fail = R.fail;
    var T_ABOUT = RDF + 'about', T_ID = RDF + 'ID', T_NODEID = RDF + 'nodeID', T_RES = RDF + 'resource',
      T_DT = RDF + 'datatype', T_PT = RDF + 'parseType', T_TYPE = RDF + 'type', T_LI = RDF + 'li',
      T_DESC = RDF + 'Description', T_RDF = RDF + 'RDF';
    var OLD = {}; OLD[RDF + 'aboutEach'] = 1; OLD[RDF + 'aboutEachPrefix'] = 1; OLD[RDF + 'bagID'] = 1;
    var CORE = {}; [T_RDF, T_ID, T_ABOUT, T_PT, T_RES, T_NODEID, T_DT].forEach(function (x) { CORE[x] = 1; });
    var LEGACY = { about: 1, ID: 1, resource: 1, parseType: 1, type: 1 };
    var resCache = new Map(), resBase = null;

    function newB() { return bp + 'g' + (bn++); }
    function bnode(id, pos) {
      if (!/^[A-Za-z_À-￿][\w.\-·-￿]*$/.test(id)) fail('rdf:nodeID "' + id + '" is not a valid name', pos);
      return bp + 'l' + id;
    }
    function resolve(v, base) {
      if (RE_ABS.test(v) || !base) return v;
      if (base !== resBase) { resBase = base; resCache.clear(); }
      var r = resCache.get(v);
      if (r === undefined) { r = resolveIri(v, base); resCache.set(v, r); }
      return r;
    }
    function idIri(id, base, pos) {
      if (!/^[A-Za-z_À-￿][\w.\-·-￿]*$/.test(id)) fail('rdf:ID "' + id + '" is not a valid name', pos);
      var h = base.indexOf('#');
      return (h < 0 ? base : base.slice(0, h)) + '#' + id;
    }
    function attrUri(ev, a) {
      var ns = ev.ans[a];
      if (ns === '') return LEGACY[ev.al[a]] ? RDF + ev.al[a] : '';
      return ns + ev.al[a];
    }

    function nodeElement(ev, base, lang) {
      var uri = ev.uri, a, u;
      if (CORE[uri] || uri === T_LI || OLD[uri]) fail('<' + ev.qn + '> cannot be used as a node element here', ev.pos);
      if (ev.ns === '') fail('The element <' + ev.qn + '> has no namespace; RDF/XML elements must be namespace-qualified', ev.pos);
      var subj = null, pa = null, count = 0;
      if (ev.ans !== null) {
        for (a = 0; a < ev.ans.length; a++) {
          if (ev.ans[a] === XMLNS) {
            if (ev.al[a] === 'base') base = resolve(ev.av[a], base);
            else if (ev.al[a] === 'lang') lang = ev.av[a];
          }
        }
        for (a = 0; a < ev.ans.length; a++) {
          if (ev.ans[a] === XMLNS) continue;
          u = attrUri(ev, a);
          if (u === '') continue;
          if (u === T_ABOUT) { subj = resolve(ev.av[a], base); count++; }
          else if (u === T_ID) { subj = idIri(ev.av[a], base, ev.pos); count++; }
          else if (u === T_NODEID) { subj = bnode(ev.av[a], ev.pos); count++; }
          else if (u === T_LI || OLD[u] || u === T_RES || u === T_PT || u === T_DT || u === T_RDF || u === T_DESC) {
            fail('The attribute "' + ev.al[a] + '" is not allowed on <' + ev.qn + '>', ev.pos);
          } else { if (pa === null) pa = []; pa.push(a); }
        }
        if (count > 1) fail('<' + ev.qn + '> may have only one of rdf:about, rdf:ID and rdf:nodeID', ev.pos);
      }
      if (subj === null) subj = newB();
      if (uri !== T_DESC) out.push(subj, T_TYPE, uri);
      if (pa !== null) {
        for (a = 0; a < pa.length; a++) {
          u = attrUri(ev, pa[a]);
          if (u === T_TYPE) out.push(subj, T_TYPE, resolve(ev.av[pa[a]], base));
          else out.push(subj, u, lang ? { v: ev.av[pa[a]], l: lang } : { v: ev.av[pa[a]] });
        }
      }
      propertyElements(subj, base, lang);
      return subj;
    }

    function propertyElements(subj, base, lang) {
      var li = 1;
      for (;;) {
        var e = R.next();
        if (!e) fail('Unexpected end of file');
        if (e.t === 3) {
          if (/\S/.test(e.v)) fail('Unexpected text "' + e.v.trim().slice(0, 30) + '" where a property element was expected');
          continue;
        }
        if (e.t === 2) return;
        li = propertyElement(subj, e, base, lang, li);
      }
    }

    function reify(id, s, p, o) {
      out.push(id, T_TYPE, RDF + 'Statement', id, RDF + 'subject', s, id, RDF + 'predicate', p, id, RDF + 'object', o);
    }

    function propertyElement(subj, e, base, lang, li) {
      var p = e.uri, a, u;
      if (p === T_LI) { p = RDF + '_' + li; li++; }
      else if (CORE[p] || p === T_DESC || OLD[p]) fail('<' + e.qn + '> cannot be used as a property element', e.pos);
      if (e.ns === '') fail('The element <' + e.qn + '> has no namespace; RDF/XML elements must be namespace-qualified', e.pos);
      var id, res, nodeId, dt, pt, pa = null;
      if (e.ans !== null) {
        for (a = 0; a < e.ans.length; a++) {
          if (e.ans[a] === XMLNS) {
            if (e.al[a] === 'base') base = resolve(e.av[a], base);
            else if (e.al[a] === 'lang') lang = e.av[a];
          }
        }
        for (a = 0; a < e.ans.length; a++) {
          if (e.ans[a] === XMLNS) continue;
          u = attrUri(e, a);
          if (u === '') continue;
          if (u === T_ID) id = idIri(e.av[a], base, e.pos);
          else if (u === T_RES) res = e.av[a];
          else if (u === T_NODEID) nodeId = e.av[a];
          else if (u === T_DT) dt = e.av[a];
          else if (u === T_PT) pt = e.av[a];
          else if (u === T_ABOUT || u === T_LI || OLD[u] || u === T_RDF || u === T_DESC) fail('The attribute "' + e.al[a] + '" is not allowed on <' + e.qn + '>', e.pos);
          else { if (pa === null) pa = []; pa.push(a); }
        }
      }
      var o, ev;
      if (pt !== undefined) {
        if (res !== undefined || nodeId !== undefined || dt !== undefined || pa !== null) fail('<' + e.qn + '> mixes rdf:parseType with other RDF attributes', e.pos);
        if (pt === 'Resource') {
          o = newB();
          out.push(subj, p, o);
          if (id !== undefined) reify(id, subj, p, o);
          propertyElements(o, base, lang);
        } else if (pt === 'Collection') {
          var head = RDF + 'nil', prev = null;
          for (;;) {
            ev = R.next();
            if (!ev) fail('Unexpected end of file');
            if (ev.t === 3) { if (/\S/.test(ev.v)) fail('Unexpected text inside a rdf:parseType="Collection" element'); continue; }
            if (ev.t === 2) break;
            var item = nodeElement(ev, base, lang), node = newB();
            if (prev === null) head = node; else out.push(prev, RDF + 'rest', node);
            out.push(node, RDF + 'first', item);
            prev = node;
          }
          if (prev !== null) out.push(prev, RDF + 'rest', RDF + 'nil');
          out.push(subj, p, head);
          if (id !== undefined) reify(id, subj, p, head);
        } else {
          o = { v: R.rawUntilEnd(), d: RDF + 'XMLLiteral' };
          out.push(subj, p, o);
          if (id !== undefined) reify(id, subj, p, o);
        }
        return li;
      }
      var txt = '', child = null;
      for (;;) {
        ev = R.next();
        if (!ev) fail('Unexpected end of file');
        if (ev.t === 3) txt += ev.v;
        else if (ev.t === 1) {
          if (child !== null) fail('<' + e.qn + '> contains more than one element; a property can only hold one value', ev.pos);
          if (/\S/.test(txt)) fail('<' + e.qn + '> mixes text and elements', ev.pos);
          if (res !== undefined || nodeId !== undefined || dt !== undefined) fail('<' + e.qn + '> has both an RDF attribute value and a nested element', ev.pos);
          child = nodeElement(ev, base, lang);
          txt = '';
        } else break;
      }
      if (child !== null) {
        if (/\S/.test(txt)) fail('<' + e.qn + '> mixes text and elements');
        o = child;
      } else if (res === undefined && nodeId === undefined && pa === null) {
        o = dt !== undefined ? { v: txt, d: resolve(dt, base) } : lang ? { v: txt, l: lang } : { v: txt };
      } else {
        if (/\S/.test(txt)) fail('<' + e.qn + '> has both an RDF attribute value and text content', e.pos);
        if (res !== undefined && nodeId !== undefined) fail('<' + e.qn + '> has both rdf:resource and rdf:nodeID', e.pos);
        o = res !== undefined ? resolve(res, base) : nodeId !== undefined ? bnode(nodeId, e.pos) : newB();
        if (pa !== null) {
          for (a = 0; a < pa.length; a++) {
            u = attrUri(e, pa[a]);
            if (u === T_TYPE) out.push(o, T_TYPE, resolve(e.av[pa[a]], base));
            else out.push(o, u, lang ? { v: e.av[pa[a]], l: lang } : { v: e.av[pa[a]] });
          }
        }
      }
      out.push(subj, p, o);
      if (id !== undefined) reify(id, subj, p, o);
      return li;
    }

    var ev = R.next();
    while (ev && ev.t === 3) {
      if (/\S/.test(ev.v)) fail('Unexpected text before the first XML element', 0);
      ev = R.next();
    }
    if (!ev) fail('The file contains no XML element', 0);
    var base = opts.base || '', lang = '';
    if (ev.uri === T_RDF) {
      if (ev.ans !== null) {
        for (var a = 0; a < ev.ans.length; a++) {
          if (ev.ans[a] === XMLNS && ev.al[a] === 'base') base = resolve(ev.av[a], base);
          else if (ev.ans[a] === XMLNS && ev.al[a] === 'lang') lang = ev.av[a];
        }
      }
      for (;;) {
        var e2 = R.next();
        if (!e2) fail('Unexpected end of file');
        if (e2.t === 3) { if (/\S/.test(e2.v)) fail('Unexpected text "' + e2.v.trim().slice(0, 30) + '" inside <rdf:RDF>'); continue; }
        if (e2.t === 2) break;
        nodeElement(e2, base, lang);
      }
    } else if (ev.ns === OWL && ev.qn === 'Ontology') {
      var x = new Error('This file is in OWL/XML syntax, which Canopy does not read. Save it as RDF/XML or Turtle first (in Protégé: File › Save as).');
      x.name = 'FormatError';
      throw x;
    } else if (/^html$/i.test(ev.local)) {
      var h = new Error('This is an HTML page, not an ontology file. If it came from GitHub, download the "Raw" file instead.');
      h.name = 'FormatError';
      throw h;
    } else {
      nodeElement(ev, base, lang);
    }
    // anything after the root must be whitespace, comments or processing instructions
    for (;;) {
      var tail = R.next();
      if (!tail) break;
      if (tail.t !== 3 || /\S/.test(tail.v)) fail('Unexpected content after the end of the document');
    }
    return { triples: out, prefixes: R.prefixes, base: base };

  }

  /* ---------- format detection and decoding ---------- */

  function formatError(msg) { var e = new Error(msg); e.name = 'FormatError'; return e; }

  function detectFormat(text, name) {
    var head = text.slice(0, 4000).replace(/^﻿/, '');
    var t = head.replace(/^\s+/, '');
    var ext = (/\.([A-Za-z0-9]+)$/.exec(name || '') || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (!t) throw formatError('This file is empty.');
    if (/^<\?xml|^<!DOCTYPE\s+rdf:RDF|^<rdf:RDF[\s>]/i.test(t)) {
      if (/^<\?xml[^>]*>\s*(<!--[\s\S]*?-->\s*)*<(!DOCTYPE\s+)?html/i.test(t)) throw formatError('This is an HTML page, not an ontology file. If it came from GitHub, download the "Raw" file instead.');
      return 'rdfxml';
    }
    if (/^<!DOCTYPE\s+html|^<html[\s>]/i.test(t)) throw formatError('This is an HTML page, not an ontology file. If it came from GitHub, download the "Raw" file instead.');
    if (/^<!--|^<!DOCTYPE/.test(t)) return 'rdfxml';
    if (/^<[A-Za-z_][\w.\-]*(:[A-Za-z_][\w.\-]*)?(\s+[\w.\-:]+\s*=|\s*>\s*<|\s+xmlns)/.test(t) && !/^<[^>\s]*>\s+(a\s|<|[\w\-]*:)/.test(t)) return 'rdfxml';
    if (/^(Prefix|Ontology|Import)\s*\(/.test(t)) throw formatError('This file is in OWL functional syntax, which Canopy does not read. Save it as RDF/XML or Turtle first (in Protégé: File › Save as).');
    if (/^(Prefix|Ontology|Class|Import):\s/.test(t)) throw formatError('This file is in OWL Manchester syntax, which Canopy does not read. Save it as RDF/XML or Turtle first (in Protégé: File › Save as).');
    if (/^format-version:/.test(t)) throw formatError('This file is in OBO format, which Canopy does not read. Convert it to OWL (RDF/XML) first, for example with ROBOT: robot convert -i file.obo -o file.owl');
    if (/^[\[{]/.test(t) && (ext === 'json' || ext === 'jsonld' || /^[\[{]\s*("|\{|\[|$)/.test(t))) throw formatError('This file looks like JSON-LD, which Canopy does not read. Convert it to Turtle or RDF/XML first.');
    if (/^PK\x03\x04/.test(t)) throw formatError('This is a ZIP archive. Unpack it and open the ontology file inside.');
    return 'turtle';
  }

  function decodeBytes(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var enc = 'utf-8';
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) enc = 'utf-16le';
    else if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) enc = 'utf-16be';
    else {
      var head = '';
      for (var i = 0; i < Math.min(u8.length, 200); i++) head += String.fromCharCode(u8[i]);
      var m = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.\-]+)["']/.exec(head.replace(/^\xEF\xBB\xBF/, ''));
      if (m) enc = m[1].toLowerCase();
    }
    var dec;
    try { dec = new TextDecoder(enc); } catch (e) { dec = new TextDecoder('utf-8'); }
    return dec.decode(u8);
  }

  /* Parse one document. Returns {triples, prefixes, format}. */
  function parseDocument(text, name, docId, out) {
    var format = detectFormat(text, name);
    var base = 'file:///' + encodeURIComponent(name || 'ontology').replace(/%2F/gi, '/');
    var r = format === 'rdfxml'
      ? parseRdfXml(text, { base: base, docId: docId, out: out })
      : parseTurtle(text, { base: base, docId: docId, out: out });
    r.format = format;
    return r;
  }

  /* ---------- model ---------- */

  function buildModel(T, prefixes) {
    var N = T.length, k, i, j;
    var TYPE = RDF + 'type', FIRST = RDF + 'first', REST = RDF + 'rest', NIL = RDF + 'nil';
    var THING = OWL + 'Thing', NOTHING = OWL + 'Nothing', RESOURCE = RDFS + 'Resource';
    var LABEL = RDFS + 'label', PREFLABEL = SKOS + 'prefLabel';
    var DEFINITION = 'http://purl.obolibrary.org/obo/IAO_0000115';
    var COMMENT_P = {}; [RDFS + 'comment', SKOS + 'definition', DEFINITION, 'http://purl.org/dc/terms/description', 'http://purl.org/dc/elements/1.1/description'].forEach(function (p, ix) { COMMENT_P[p] = ix + 1; });
    var ALT_P = {}; [SKOS + 'altLabel', OBOINOWL + 'hasExactSynonym', OBOINOWL + 'hasRelatedSynonym', OBOINOWL + 'hasBroadSynonym', OBOINOWL + 'hasNarrowSynonym', 'http://purl.obolibrary.org/obo/IAO_0000118'].forEach(function (p) { ALT_P[p] = 1; });
    var SDO_DOM = { 'http://schema.org/domainIncludes': 1, 'https://schema.org/domainIncludes': 1 };
    var SDO_RNG = { 'http://schema.org/rangeIncludes': 1, 'https://schema.org/rangeIncludes': 1 };
    var CHARS = {}; ['Functional', 'InverseFunctional', 'Transitive', 'Symmetric', 'Asymmetric', 'Reflexive', 'Irreflexive'].forEach(function (c) { CHARS[OWL + c + 'Property'] = c; });
    var DT_EXTRA = {}; [RDFS + 'Literal', RDF + 'langString', RDF + 'PlainLiteral', RDF + 'XMLLiteral', RDF + 'HTML', RDF + 'JSON', OWL + 'real', OWL + 'rational'].forEach(function (d) { DT_EXTRA[d] = 1; });

    function isStr(x) { return typeof x === 'string'; }
    function isB(x) { return typeof x === 'string' && x.charCodeAt(0) === 95 && x.charCodeAt(1) === 58; }
    function isI(x) { return typeof x === 'string' && !(x.charCodeAt(0) === 95 && x.charCodeAt(1) === 58); }
    function builtin(x) { return x.startsWith(OWL) || x.startsWith(RDFS) || x.startsWith(RDF) || x.startsWith(XSD); }
    function addU(arr, v) { if (arr.indexOf(v) < 0) arr.push(v); }

    var SP = new Map(), unique = 0;
    for (k = 0; k < N; k += 3) { var s0 = T[k], arr0 = SP.get(s0); if (arr0 === undefined) SP.set(s0, arr0 = []); arr0.push(k); }
    SP.forEach(function (a, subj) {
      if (a.length < 2) { unique += a.length; return; }
      var seen = new Set(), keep = [];
      for (var q = 0; q < a.length; q++) {
        var o = T[a[q] + 2];
        var key = T[a[q] + 1] + '\u0001' + (typeof o === 'string' ? o : '"' + o.v + '\u0001' + (o.l || '') + '\u0001' + (o.d || ''));
        if (!seen.has(key)) { seen.add(key); keep.push(a[q]); }
      }
      unique += keep.length;
      if (keep.length !== a.length) SP.set(subj, keep);
    });

    function list(head) {
      var r = [], seen = new Set();
      while (isStr(head) && head !== NIL && !seen.has(head) && r.length < 20000) {
        seen.add(head);
        var a = SP.get(head); if (!a) break;
        var f, rest;
        for (var q = 0; q < a.length; q++) { var p = T[a[q] + 1]; if (p === FIRST) f = T[a[q] + 2]; else if (p === REST) rest = T[a[q] + 2]; }
        if (f !== undefined) r.push(f);
        head = rest;
      }
      return r;
    }

    /* pass 1: declarations */
    var classes = [], cidx = new Map(), props = [], pidx = new Map();
    var datatypes = new Set(), declClass = [], declSeen = new Set();
    var typed = [], namedInd = new Set(), ontologies = [], nRestr = 0, depClass = new Set();
    var propDecl = [], propDeclSeen = new Map();
    var KIND_RANK = { object: 4, data: 3, annotation: 2, rdf: 1 };

    function declProp(iri, kind, ch) {
      var d = propDeclSeen.get(iri);
      if (!d) { d = { iri: iri, kind: kind, chars: [] }; propDeclSeen.set(iri, d); propDecl.push(d); }
      else if (KIND_RANK[kind] > KIND_RANK[d.kind]) d.kind = kind;
      if (ch) addU(d.chars, ch);
    }

    for (k = 0; k < N; k += 3) {
      if (T[k + 1] !== TYPE) continue;
      var s = T[k], o = T[k + 2];
      if (!isStr(o)) continue;
      if (o.startsWith(OWL) || o.startsWith(RDFS) || o.startsWith(RDF)) {
        switch (o) {
          case OWL + 'Class': case RDFS + 'Class':
            if (isI(s) && !declSeen.has(s)) { declSeen.add(s); declClass.push(s); } break;
          case OWL + 'DeprecatedClass':
            if (isI(s)) { if (!declSeen.has(s)) { declSeen.add(s); declClass.push(s); } depClass.add(s); } break;
          case OWL + 'ObjectProperty': if (isI(s)) declProp(s, 'object'); break;
          case OWL + 'DatatypeProperty': if (isI(s)) declProp(s, 'data'); break;
          case OWL + 'AnnotationProperty': if (isI(s)) declProp(s, 'annotation'); break;
          case OWL + 'OntologyProperty': if (isI(s)) declProp(s, 'annotation'); break;
          case RDF + 'Property': if (isI(s)) declProp(s, 'rdf'); break;
          case OWL + 'DeprecatedProperty': if (isI(s)) declProp(s, 'rdf'); break;
          case RDFS + 'Datatype': if (isI(s)) datatypes.add(s); break;
          case OWL + 'Ontology': if (isI(s)) ontologies.push(s); break;
          case OWL + 'NamedIndividual': if (isI(s)) namedInd.add(s); break;
          case OWL + 'Restriction': nRestr++; break;
          default:
            if (CHARS[o] && isI(s)) declProp(s, o === OWL + 'FunctionalProperty' ? 'rdf' : 'object', CHARS[o]);
        }
      } else if (isI(s) && isI(o)) typed.push(s, o);
    }

    function isDt(iri) { return iri.startsWith(XSD) || DT_EXTRA[iri] === 1 || datatypes.has(iri); }

    function mkClass(iri, declared) {
      var c = { iri: iri, declared: declared, dep: false, labels: [], alts: [], comments: [], sup: [], def: [], supx: [], eq: [], dj: [], ann: [], ind: [] };
      cidx.set(iri, classes.length);
      classes.push(c);
      return classes.length - 1;
    }
    for (i = 0; i < declClass.length; i++) {
      var dc = declClass[i];
      if (dc !== THING && dc !== NOTHING && dc !== RESOURCE) mkClass(dc, true);
    }
    var nDeclared = classes.length;

    /* class reference: index, or -1 top, -2 bottom, -3 datatype */
    function cref(iri) {
      var x = cidx.get(iri);
      if (x !== undefined) return x;
      if (iri === THING || iri === RESOURCE) return -1;
      if (iri === NOTHING) return -2;
      if (isDt(iri)) return -3;
      return mkClass(iri, false);
    }

    function mkProp(iri, kind, declared) {
      var p = { iri: iri, kind: kind, declared: declared, dep: false, labels: [], alts: [], comments: [], dom: [], rng: [], rdt: [], domx: [], rngx: [], sup: [], inv: [], chars: [], ann: [] };
      pidx.set(iri, props.length);
      props.push(p);
      return props.length - 1;
    }
    for (i = 0; i < propDecl.length; i++) {
      var pd = propDecl[i];
      props[mkProp(pd.iri, pd.kind, true)].chars = pd.chars;
    }
    function pref(iri) {
      var x = pidx.get(iri);
      return x !== undefined ? x : mkProp(iri, 'rdf', false);
    }

    function litText(l) { return l.v; }

    /* class expressions */
    function expr(x, depth) {
      if (!isStr(x)) return { t: 'lit', v: x.v, d: x.d };
      if (isI(x)) { var c = cref(x); return c >= 0 ? { t: 'c', c: c } : c === -1 ? { t: 'top' } : c === -2 ? { t: 'bot' } : { t: 'dt', iri: x }; }
      if (depth > 24) return { t: 'anon' };
      var a = SP.get(x);
      if (!a) return { t: 'anon' };
      var onProp, some, only, val, self, minC, maxC, exC, minQ, maxQ, exQ, onClass, inter, union, compl, oneOf, onDt, withR;
      for (var q = 0; q < a.length; q++) {
        var p = T[a[q] + 1], o = T[a[q] + 2];
        if (!p.startsWith(OWL)) continue;
        switch (p.slice(OWL.length)) {
          case 'onProperty': onProp = o; break;
          case 'someValuesFrom': some = o; break;
          case 'allValuesFrom': only = o; break;
          case 'hasValue': val = o; break;
          case 'hasSelf': self = o; break;
          case 'minCardinality': minC = o; break;
          case 'maxCardinality': maxC = o; break;
          case 'cardinality': exC = o; break;
          case 'minQualifiedCardinality': minQ = o; break;
          case 'maxQualifiedCardinality': maxQ = o; break;
          case 'qualifiedCardinality': exQ = o; break;
          case 'onClass': case 'onDataRange': onClass = o; break;
          case 'intersectionOf': inter = o; break;
          case 'unionOf': union = o; break;
          case 'complementOf': case 'datatypeComplementOf': compl = o; break;
          case 'oneOf': oneOf = o; break;
          case 'onDatatype': onDt = o; break;
          case 'withRestrictions': withR = o; break;
        }
      }
      if (onProp !== undefined) {
        var r = { t: 'r', p: -1, k: '' };
        if (isI(onProp)) r.p = pref(onProp);
        else if (isB(onProp)) {
          var ia = SP.get(onProp);
          if (ia) for (q = 0; q < ia.length; q++) if (T[ia[q] + 1] === OWL + 'inverseOf' && isI(T[ia[q] + 2])) { r.p = pref(T[ia[q] + 2]); r.inv = true; }
        }
        var num = function (l) { var v = parseInt(isStr(l) ? l : l.v, 10); return isNaN(v) ? 0 : v; };
        if (some !== undefined) { r.k = 'some'; r.x = expr(some, depth + 1); }
        else if (only !== undefined) { r.k = 'only'; r.x = expr(only, depth + 1); }
        else if (val !== undefined) { r.k = 'value'; r.x = isStr(val) ? (isI(val) ? { t: 'ind', iri: val } : { t: 'anon' }) : { t: 'lit', v: val.v, d: val.d }; }
        else if (self !== undefined) { r.k = 'self'; }
        else if (minQ !== undefined) { r.k = 'min'; r.n = num(minQ); if (onClass !== undefined) r.x = expr(onClass, depth + 1); }
        else if (maxQ !== undefined) { r.k = 'max'; r.n = num(maxQ); if (onClass !== undefined) r.x = expr(onClass, depth + 1); }
        else if (exQ !== undefined) { r.k = 'exactly'; r.n = num(exQ); if (onClass !== undefined) r.x = expr(onClass, depth + 1); }
        else if (minC !== undefined) { r.k = 'min'; r.n = num(minC); }
        else if (maxC !== undefined) { r.k = 'max'; r.n = num(maxC); }
        else if (exC !== undefined) { r.k = 'exactly'; r.n = num(exC); }
        else r.k = '?';
        return r;
      }
      if (inter !== undefined) return { t: 'and', xs: list(inter).map(function (y) { return expr(y, depth + 1); }) };
      if (union !== undefined) return { t: 'or', xs: list(union).map(function (y) { return expr(y, depth + 1); }) };
      if (compl !== undefined) return { t: 'not', x: expr(compl, depth + 1) };
      if (oneOf !== undefined) return { t: 'one', xs: list(oneOf).map(function (y) { return isStr(y) ? (isI(y) ? { t: 'ind', iri: y } : { t: 'anon' }) : { t: 'lit', v: y.v, d: y.d }; }) };
      if (onDt !== undefined && isI(onDt)) {
        var fs = [];
        list(withR).forEach(function (f) {
          var fa = SP.get(f);
          if (fa) for (var z = 0; z < fa.length; z++) { var fo = T[fa[z] + 2]; fs.push([T[fa[z] + 1], isStr(fo) ? fo : fo.v]); }
        });
        return { t: 'dt', iri: onDt, facets: fs };
      }
      return { t: 'anon' };
    }

    function namedOf(e) {
      if (e.t === 'c') return [e.c];
      if (e.t === 'or' && e.xs.length && e.xs.every(function (y) { return y.t === 'c'; })) return e.xs.map(function (y) { return y.c; });
      return null;
    }

    /* pass 2: axioms */
    var gci = 0, groups = [], subEdges = 0;
    function group(members) {
      var g = [];
      members.forEach(function (m) { if (isI(m)) { var c = cref(m); if (c >= 0) addU(g, c); } });
      if (g.length < 2) return;
      groups.push(g);
      g.forEach(function (c) { classes[c].dj.push(groups.length - 1); });
    }
    var eqPairs = new Set();

    for (k = 0; k < N; k += 3) {
      var p = T[k + 1];
      if (p === TYPE) continue;
      s = T[k]; o = T[k + 2];
      var ci, co, pi, e, nm;
      if (p.startsWith(RDFS)) {
        switch (p) {
          case RDFS + 'subClassOf':
            if (isI(s)) {
              ci = cref(s);
              if (ci < 0) break;
              if (isI(o)) { co = cref(o); if (co >= 0 && co !== ci && classes[ci].sup.indexOf(co) < 0) { classes[ci].sup.push(co); subEdges++; } }
              else if (isB(o)) classes[ci].supx.push(expr(o, 0));
            } else if (isB(s)) gci++;
            break;
          case RDFS + 'domain':
            if (!isI(s)) break;
            pi = pref(s);
            if (isI(o)) { co = cref(o); if (co >= 0) addU(props[pi].dom, co); }
            else if (isB(o)) { e = expr(o, 0); nm = namedOf(e); if (nm) nm.forEach(function (c) { addU(props[pi].dom, c); }); else props[pi].domx.push(e); }
            break;
          case RDFS + 'range':
            if (!isI(s)) break;
            pi = pref(s);
            if (isI(o)) {
              if (props[pi].kind === 'data') addU(props[pi].rdt, o);
              else { co = cref(o); if (co >= 0) addU(props[pi].rng, co); else if (co === -3) addU(props[pi].rdt, o); }
            } else if (isB(o)) { e = expr(o, 0); nm = props[pi].kind === 'data' ? null : namedOf(e); if (nm) nm.forEach(function (c) { addU(props[pi].rng, c); }); else props[pi].rngx.push(e); }
            break;
          case RDFS + 'subPropertyOf':
            if (isI(s) && isI(o) && s !== o) { pi = pref(s); addU(props[pi].sup, pref(o)); }
            break;
        }
      } else if (p.startsWith(OWL)) {
        switch (p) {
          case OWL + 'equivalentClass':
            if (isI(s)) {
              ci = cref(s);
              if (ci < 0) break;
              if (isI(o)) {
                co = cref(o);
                if (co >= 0 && co !== ci && !eqPairs.has(ci + '|' + co)) {
                  eqPairs.add(ci + '|' + co); eqPairs.add(co + '|' + ci);
                  classes[ci].eq.push({ t: 'c', c: co }); classes[co].eq.push({ t: 'c', c: ci });
                }
              } else if (isB(o)) classes[ci].eq.push(expr(o, 0));
            } else if (isB(s) && isI(o)) { co = cref(o); if (co >= 0) classes[co].eq.push(expr(s, 0)); }
            else if (isB(s)) gci++;
            break;
          case OWL + 'disjointWith':
            if (isI(s) && isI(o)) group([s, o]);
            break;
          case OWL + 'disjointUnionOf':
            if (isI(s)) {
              ci = cref(s);
              var mem = list(o);
              group(mem);
              if (ci >= 0) classes[ci].eq.push({ t: 'or', xs: mem.map(function (y) { return expr(y, 1); }) });
            }
            break;
          case OWL + 'members':
            if (isB(s)) {
              var ta = SP.get(s), isAdc = false;
              for (j = 0; j < ta.length; j++) if (T[ta[j] + 1] === TYPE && T[ta[j] + 2] === OWL + 'AllDisjointClasses') isAdc = true;
              if (isAdc) group(list(o));
            }
            break;
          case OWL + 'inverseOf':
            if (isI(s) && isI(o)) { pi = pref(s); var po = pref(o); addU(props[pi].inv, po); addU(props[po].inv, pi); if (props[pi].kind === 'rdf') props[pi].kind = 'object'; if (props[po].kind === 'rdf') props[po].kind = 'object'; }
            break;
        }
      } else if (SDO_DOM[p] === 1) {
        if (isI(s) && isI(o)) { pi = pref(s); co = cref(o); if (co >= 0) addU(props[pi].dom, co); }
      } else if (SDO_RNG[p] === 1) {
        if (isI(s) && isI(o)) { pi = pref(s); co = cref(o); if (co >= 0) addU(props[pi].rng, co); else if (co === -3) addU(props[pi].rdt, o); }
      }
    }

    /* SKOS fallback: a concept scheme with no classes is shown as a concept hierarchy */
    var mode = 'owl';
    if (classes.length === 0) {
      var concepts = new Set();
      for (k = 0; k < N; k += 3) {
        p = T[k + 1]; s = T[k]; o = T[k + 2];
        if (p === TYPE && o === SKOS + 'Concept' && isI(s)) concepts.add(s);
        else if ((p === SKOS + 'broader' || p === SKOS + 'narrower' || p === SKOS + 'broaderTransitive' || p === SKOS + 'narrowerTransitive') && isI(s) && isI(o)) { concepts.add(s); concepts.add(o); }
      }
      if (concepts.size) {
        mode = 'skos';
        concepts.forEach(function (c) { mkClass(c, true); });
        nDeclared = classes.length;
        var relProp = -1;
        for (k = 0; k < N; k += 3) {
          p = T[k + 1]; s = T[k]; o = T[k + 2];
          if (!isI(s) || !isI(o)) continue;
          var a1 = cidx.get(s), b1 = cidx.get(o);
          if (a1 === undefined || b1 === undefined || a1 === b1) continue;
          if (p === SKOS + 'broader' || p === SKOS + 'broaderTransitive') { if (classes[a1].sup.indexOf(b1) < 0) { classes[a1].sup.push(b1); subEdges++; } }
          else if (p === SKOS + 'narrower' || p === SKOS + 'narrowerTransitive') { if (classes[b1].sup.indexOf(a1) < 0) { classes[b1].sup.push(a1); subEdges++; } }
          else if (p === SKOS + 'related') { if (relProp < 0) { relProp = pref(p); props[relProp].kind = 'object'; } classes[a1].supx.push({ t: 'r', p: relProp, k: 'related', x: { t: 'c', c: b1 } }); }
        }
        typed = [];
      }
    }

    /* definitions: named conjuncts of an equivalent-class intersection act as parents */
    for (i = 0; i < classes.length; i++) {
      var cl = classes[i];
      for (j = 0; j < cl.eq.length; j++) {
        e = cl.eq[j];
        if (e.t === 'and') e.xs.forEach(function (y) { if (y.t === 'c' && y.c !== i && cl.sup.indexOf(y.c) < 0) addU(cl.def, y.c); });
      }
    }

    /* individuals: who they are */
    var inds = [], iidx = new Map();
    function mkInd(iri, explicit) {
      var x = iidx.get(iri);
      if (x === undefined) { x = inds.length; iidx.set(iri, x); inds.push({ iri: iri, labels: [], types: [], out: [], dv: [], ov: [], explicit: explicit }); }
      return x;
    }
    var ontSet = new Set(ontologies), typeTargets = new Set(), schemaProps = props.length;
    for (k = 0; k < typed.length; k += 2) if (!builtin(typed[k + 1])) typeTargets.add(typed[k + 1]);
    /* anything that is part of the schema is not treated as an individual unless it is declared as one */
    function schemaEntity(x) {
      if (cidx.has(x) || ontSet.has(x) || datatypes.has(x) || typeTargets.has(x)) return true;
      var pi = pidx.get(x);
      return pi !== undefined && pi < schemaProps;
    }
    for (k = 0; k < typed.length; k += 2) {
      s = typed[k]; o = typed[k + 1];
      if (builtin(o)) continue;
      if (!namedInd.has(s) && schemaEntity(s)) continue;
      var ct = cref(o);
      if (ct < 0) continue;
      var ii = mkInd(s, true);
      if (inds[ii].types.indexOf(ct) < 0) { inds[ii].types.push(ct); classes[ct].ind.push(ii); }
    }
    namedInd.forEach(function (iri) { mkInd(iri, true); });

    /* individuals without a type: subjects and objects of declared properties, and whatever is linked to an individual */
    var nAssert = 0, nValues = 0, obs = [];
    if (mode === 'owl') {
      var cand = function (x) { return isI(x) && !builtin(x) && !schemaEntity(x); };
      for (k = 0; k < N; k += 3) {
        p = T[k + 1];
        if (p === TYPE) continue;
        var dpi = pidx.get(p);
        if (dpi === undefined || dpi >= schemaProps) continue;
        s = T[k]; o = T[k + 2];
        if (!cand(s)) continue;
        if (props[dpi].kind === 'object') { if (cand(o)) { mkInd(s, false); mkInd(o, false); } }
        else if (props[dpi].kind === 'data') { if (!isStr(o)) mkInd(s, false); }
      }
      if (inds.length) {
        for (var round = 0; round < 4; round++) {
          var before = inds.length;
          for (k = 0; k < N; k += 3) {
            p = T[k + 1];
            if (p === TYPE || builtin(p)) continue;
            s = T[k]; o = T[k + 2];
            if (!isI(s) || !isI(o)) continue;
            var si = iidx.has(s), oi = iidx.has(o);
            if (si && !oi) { if (cand(o) && SP.has(o)) mkInd(o, false); }
            else if (oi && !si) { if (cand(s)) mkInd(s, false); }
          }
          if (inds.length === before) break;
        }
      }
      /* what is said about them */
      var usedObj = [], usedLit = [], obsMap = new Map();
      for (i = 0; i < inds.length; i++) {
        var ind = inds[i], ia2 = SP.get(ind.iri);
        if (!ia2) continue;
        for (j = 0; j < ia2.length; j++) {
          p = T[ia2[j] + 1]; o = T[ia2[j] + 2];
          if (p === TYPE || p === LABEL || p === PREFLABEL) continue;
          if (isB(o)) continue;
          var api = pref(p);
          props[api].uses = (props[api].uses || 0) + 1;
          if (!isStr(o)) { ind.dv.push(api, o.v, o.l || '', o.d || ''); usedLit[api] = 1; nValues++; }
          else {
            var ti = iidx.get(o);
            if (ti !== undefined) {
              ind.out.push(api, ti); usedObj[api] = 1; nAssert++;
              var ta2 = ind.types, tb2 = inds[ti].types;
              for (var x1 = 0; x1 < ta2.length; x1++) for (var x2 = 0; x2 < tb2.length; x2++) {
                var ok = ta2[x1] + '|' + api + '|' + tb2[x2];
                obsMap.set(ok, (obsMap.get(ok) || 0) + 1);
              }
            } else ind.ov.push(api, o);
          }
        }
      }
      for (i = schemaProps; i < props.length; i++) if (props[i].kind === 'rdf') props[i].kind = usedObj[i] ? 'object' : usedLit[i] ? 'data' : 'rdf';
      obsMap.forEach(function (n, key) { var q = key.split('|'); obs.push({ s: +q[0], p: +q[1], o: +q[2], n: n }); });
    }

    /* labels, comments, annotations */
    var STRUCT = new Set([TYPE, LABEL, PREFLABEL, RDFS + 'subClassOf', RDFS + 'domain', RDFS + 'range', RDFS + 'subPropertyOf',
      OWL + 'equivalentClass', OWL + 'disjointWith', OWL + 'disjointUnionOf', OWL + 'inverseOf', OWL + 'deprecated',
      OWL + 'equivalentProperty', OWL + 'propertyDisjointWith', OWL + 'propertyChainAxiom', OWL + 'hasKey',
      SKOS + 'broader', SKOS + 'narrower', SKOS + 'related', SKOS + 'broaderTransitive', SKOS + 'narrowerTransitive']);
    var langs = Object.create(null);
    function meta(ent, full) {
      var a = SP.get(ent.iri);
      if (!a) return;
      var cm = [];
      for (var q = 0; q < a.length; q++) {
        var p = T[a[q] + 1], o = T[a[q] + 2];
        if (p === LABEL || p === PREFLABEL) {
          if (!isStr(o)) { ent.labels.push([o.v, o.l || '']); langs[o.l || ''] = (langs[o.l || ''] || 0) + 1; }
          continue;
        }
        if (!full) continue;
        if (p === OWL + 'deprecated') { if (!isStr(o) && (o.v === 'true' || o.v === '1')) ent.dep = true; continue; }
        if (ALT_P[p] === 1) { if (!isStr(o)) { ent.alts.push(o.v); ent.ann.push([p, o.v, o.l || '', 0]); } continue; }
        if (COMMENT_P[p] !== undefined) { if (!isStr(o)) cm.push([COMMENT_P[p], o.v, o.l || '']); continue; }
        if (STRUCT.has(p) || SDO_DOM[p] === 1 || SDO_RNG[p] === 1) continue;
        if (ent.ann.length >= 80) continue;
        if (!isStr(o)) ent.ann.push([p, o.v, o.l || '', 0]);
        else if (isI(o)) ent.ann.push([p, o, '', 1]);
      }
      if (full) {
        cm.sort(function (x, y) { return x[0] - y[0]; });
        ent.comments = cm.map(function (c) { return [c[1], c[2]]; });
      }
    }
    for (i = 0; i < classes.length; i++) { meta(classes[i], true); if (depClass.has(classes[i].iri)) classes[i].dep = true; }
    for (i = 0; i < props.length; i++) meta(props[i], true);
    for (i = 0; i < inds.length; i++) meta(inds[i], false);

    /* relations between classes: property domain to range, and simple restrictions */
    var rels = [];
    for (i = 0; i < props.length; i++) {
      var pr = props[i];
      if (pr.kind === 'data' || pr.kind === 'annotation') continue;
      for (j = 0; j < pr.dom.length; j++) for (k = 0; k < pr.rng.length; k++) rels.push({ s: pr.dom[j], o: pr.rng[k], p: i, k: 'prop' });
    }
    function collect(e, ci, viaEq, depth) {
      if (e.t === 'r') {
        if (e.p < 0 || !e.x) return;
        var nm = namedOf(e.x);
        if (nm) nm.forEach(function (c) { var r = { s: ci, o: c, p: e.p, k: e.k }; if (e.n !== undefined) r.n = e.n; if (e.inv) r.inv = true; if (viaEq) r.eq = true; rels.push(r); });
      } else if (e.t === 'and' && depth < 3) e.xs.forEach(function (y) { collect(y, ci, viaEq, depth + 1); });
    }
    for (i = 0; i < classes.length; i++) {
      classes[i].supx.forEach(function (e) { collect(e, i, false, 0); });
      classes[i].eq.forEach(function (e) { collect(e, i, true, 0); });
    }

    /* ontology header */
    var ont = null;
    if (ontologies.length) {
      var best = ontologies[0], bestN = -1;
      ontologies.forEach(function (x) { var c = (SP.get(x) || []).length; if (c > bestN) { bestN = c; best = x; } });
      ont = { iri: best, title: '', description: '', version: '', versionIri: '', license: '', imports: [] };
      (SP.get(best) || []).forEach(function (kk) {
        var p = T[kk + 1], o = T[kk + 2], v = isStr(o) ? o : o.v;
        if (p === 'http://purl.org/dc/terms/title' || p === 'http://purl.org/dc/elements/1.1/title') { if (!ont.title || (!isStr(o) && (o.l || '').slice(0, 2) === 'en')) ont.title = v; }
        else if (p === LABEL) { if (!ont.title) ont.title = v; }
        else if (p === 'http://purl.org/dc/terms/description' || p === 'http://purl.org/dc/elements/1.1/description') { if (!ont.description || (!isStr(o) && (o.l || '').slice(0, 2) === 'en')) ont.description = v; }
        else if (p === RDFS + 'comment') { if (!ont.description) ont.description = v; }
        else if (p === OWL + 'versionInfo') ont.version = v;
        else if (p === OWL + 'versionIRI') ont.versionIri = v;
        else if (p === 'http://purl.org/dc/terms/license' || p === 'http://purl.org/dc/elements/1.1/rights' || p === 'http://purl.org/dc/terms/rights') { if (!ont.license) ont.license = v; }
        else if (p === OWL + 'imports' && isStr(o)) ont.imports.push(o);
      });
    }

    var kinds = { object: 0, data: 0, annotation: 0, rdf: 0 };
    props.forEach(function (p) { kinds[p.kind]++; });
    var nDep = 0;
    classes.forEach(function (c) { if (c.dep) nDep++; });

    return {
      mode: mode,
      classes: classes, props: props, inds: inds, rels: rels, obs: obs, groups: groups, schemaProps: schemaProps,
      ontology: ont, prefixes: prefixes || {},
      langs: langs,
      stats: {
        triples: unique, classes: classes.length, declared: nDeclared, deprecated: nDep,
        objectProps: kinds.object, dataProps: kinds.data, annotationProps: kinds.annotation, otherProps: kinds.rdf,
        individuals: inds.length, restrictions: nRestr, subClassEdges: subEdges, gci: gci, relations: rels.length,
        assertions: nAssert, dataValues: nValues
      }
    };
  }

  /* Load several documents (for example an ontology and its imports) into one model. */
  function load(docs) {
    var out = [], prefixes = {}, formats = [];
    for (var d = 0; d < docs.length; d++) {
      var r;
      try { r = parseDocument(docs[d].text, docs[d].name, 'd' + d, out); }
      catch (e) { e.file = docs[d].name; throw e; }
      formats.push(r.format);
      for (var p in r.prefixes) if (!(p in prefixes)) prefixes[p] = r.prefixes[p];
    }
    var m = buildModel(out, prefixes);
    m.formats = formats;
    return m;
  }

  return {
    parseTurtle: parseTurtle, parseRdfXml: parseRdfXml, parseDocument: parseDocument, detectFormat: detectFormat,
    decodeBytes: decodeBytes, buildModel: buildModel, load: load, resolveIri: resolveIri
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = CanopyCore;
