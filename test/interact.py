# Interaction checks in headless Chrome (offline): export, clipboard fallback, zoom, levels, minimap, narrow layout.
import asyncio, json, os, tempfile
from playwright.async_api import async_playwright
import pathlib
HERE = pathlib.Path(__file__).resolve().parent
URL = (HERE.parent / 'canopy.html').as_uri() + '#debug'
DATA = HERE / 'data'
def launch_args():
    # Uses Playwright's own Chromium unless CHROME points at a browser binary.
    a = {'args': ['--no-sandbox']}
    if os.environ.get('CHROME'): a['executable_path'] = os.environ['CHROME']
    return a
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_args())
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, offline=True, accept_downloads=True)
        page = await ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        requests = []
        page.on('request', lambda r: requests.append(r.url))
        await page.goto(URL); await page.wait_for_timeout(400)
        info = lambda: page.evaluate('canopyDebug.info()')
        # 1 PNG export
        async with page.expect_download() as dl:
            await page.click('#expBtn'); await page.click('.pop .item:nth-child(1)')
        d = await dl.value; path = os.path.join(tempfile.gettempdir(), 'canopy-export-tree.png'); await d.save_as(path)
        print('png export:', d.suggested_filename, os.path.getsize(path), 'bytes')
        # 2 outline copy (clipboard is not granted in this context, so the fallback dialog must appear)
        await page.click('#expBtn'); await page.click('.pop .item:nth-child(3)'); await page.wait_for_timeout(300)
        modal = await page.evaluate("document.getElementById('modal').hidden ? null : document.querySelector('#modal textarea').value.split('\\n').slice(0,6).join(' | ')")
        toast = await page.evaluate("document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent")
        print('outline:', 'dialog ->' if modal else 'toast ->', modal or toast)
        await page.keyboard.press('Escape')
        # 3 ctrl+wheel zoom keeps the point under the cursor, wheel pans
        z0 = (await info())['zoom']
        await page.mouse.move(500, 400); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.wait_for_timeout(200)
        z1 = (await info())['zoom']; print('ctrl+wheel zoom: %.2f -> %.2f' % (z0, z1))
        # 4 level markers and keys
        await page.keyboard.press('2'); await page.wait_for_timeout(500); d2 = (await info())['depth']
        await page.keyboard.press(']'); await page.wait_for_timeout(500); d3 = (await info())['depth']
        await page.keyboard.press('['); await page.wait_for_timeout(500); d4 = (await info())['depth']
        await page.keyboard.press('0'); await page.wait_for_timeout(500); d5 = (await info())['depth']
        print('levels via keys 2 ] [ 0 ->', d2, d3, d4, d5)
        # 5 focus view export
        await page.click('#search'); await page.keyboard.type('pianist'); await page.keyboard.press('Enter'); await page.wait_for_timeout(600)
        await page.keyboard.press('g'); await page.wait_for_timeout(700)
        async with page.expect_download() as dl:
            await page.click('#expBtn'); await page.click('.pop .item:nth-child(1)')
        d = await dl.value; fp = os.path.join(tempfile.gettempdir(), 'canopy-export-focus.png'); await d.save_as(fp); print('focus export:', d.suggested_filename, os.path.getsize(fp), 'bytes')
        await page.keyboard.press('g'); await page.wait_for_timeout(500)
        # 6 paste dialog
        await page.click('#fileBtn'); await page.click('.pop .item:nth-child(2)')
        await page.fill('#modal textarea', '@prefix : <http://e/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n:A a owl:Class . :B a owl:Class ; rdfs:subClassOf :A . :C a owl:Class ; rdfs:subClassOf :B, :A .')
        await page.click('#modal footer .btn.primary'); await page.wait_for_timeout(600)
        print('paste ->', await page.evaluate("document.querySelector('#fileBtn .fname').textContent"), (await info())['classes'], 'classes', await page.evaluate('canopyDebug.names()'))
        # 7 narrow layouts
        for w, h in ((820, 700), (390, 760)):
            await page.set_viewport_size({'width': w, 'height': h}); await page.wait_for_timeout(400)
            await page.click('#fileBtn'); await page.click('.pop .item:nth-child(3)'); await page.wait_for_timeout(500)
            ov = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            print('viewport', w, 'horizontal overflow:', ov, 'overlaps:', await page.evaluate('canopyDebug.overlaps()'))
        print('network requests besides the page itself:', [r for r in requests if not r.startswith('file:') and not r.startswith('blob:') and not r.startswith('data:')])
        for l in logs: print('LOG', l)
        await b.close()
asyncio.run(main())
