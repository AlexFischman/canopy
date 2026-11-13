#!/usr/bin/env python3
"""Assemble the single-file viewer from src/ into canopy.html."""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: open(os.path.join(here, 'src', n), encoding='utf-8').read()
html = rd('template.html')
ui = "(function () {\n'use strict';\n" + rd('ui-a.js') + "\n" + rd('ui-b.js') + "\n})();"
core = rd('core.js')
sample = rd('sample.ttl')
def ascii_js(t):
    out = []
    for ch in t:
        o = ord(ch)
        if o < 128: out.append(ch)
        elif o > 0xFFFF:
            o -= 0x10000
            out.append('\\u%04X\\u%04X' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
        else: out.append('\\u%04X' % o)
    return ''.join(out)
ui, core = ascii_js(ui), ascii_js(core)
sample = ''.join(ch if ord(ch) < 128 else '\\u%04X' % ord(ch) for ch in sample)
for name, text in (('core', core), ('ui', ui), ('sample', sample)):
    if '</script' in text.lower(): sys.exit(name + ' contains a closing script tag')
out = html.replace('/*CSS*/', rd('style.css')).replace('/*SAMPLE*/', sample).replace('/*CORE*/', core).replace('/*UI*/', ui)
dst = os.path.join(here, 'canopy.html')
open(dst, 'w', encoding='utf-8').write(out)
ext = re.findall(r'(?:src|href)\s*=\s*["\'](https?:)?//', html)
nonascii = sum(1 for ch in out if ord(ch) > 127)
print('non-ASCII characters in output:', nonascii)
print('wrote', dst, '%.1f KB' % (len(out.encode()) / 1024), 'external references in markup:', len(ext))
