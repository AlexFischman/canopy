# Load each test ontology in headless Chromium (offline) and report load time, label overlaps and frame time.
# Usage: python3 test/large.py            (needs test/data, see test/fetch-data.sh)
import asyncio, json, os, pathlib, time
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).resolve().parent
URL = (HERE.parent / 'canopy.html').as_uri() + '#debug'
DATA = HERE / 'data'
FILES = ['koala/koala.owl', 'bfo/bfo.owl', 'sosa/ssn.ttl', 'gist/gistCore.ttl', 'pizza/pizza.owl', 'wine/wine.owl',
         'schema/schemaorg.ttl', 'brick/Brick.ttl', 'envo/envo.owl', 'doid/doid.owl']
def launch_args():
    a = {'args': ['--no-sandbox']}
    if os.environ.get('CHROME'): a['executable_path'] = os.environ['CHROME']
    return a
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**launch_args())
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, offline=True)
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(400)
        print('%-22s %8s %8s %9s %9s %10s %14s %10s' % ('file', 'classes', 'load s', 'overlaps', 'all open', 'frame ms', 'circle overlaps', 'frame ms'))
        bad = 0
        for f in FILES:
            path = DATA / f
            if not path.exists(): print('%-22s missing (run test/fetch-data.sh)' % f); continue
            t0 = time.time()
            await page.set_input_files('#file', str(path))
            await page.wait_for_function("document.getElementById('busy').hidden === true && (document.querySelector('#fileBtn .fname').textContent === %s || !document.getElementById('modal').hidden)" % json.dumps(path.name), timeout=180000)
            load = time.time() - t0
            if await page.evaluate("!document.getElementById('modal').hidden"):
                print('%-22s ERROR %s' % (f, (await page.evaluate("document.getElementById('modal').innerText"))[:120].replace('\n', ' '))); bad += 1
                await page.keyboard.press('Escape'); continue
            await page.wait_for_timeout(300)
            info = await page.evaluate('canopyDebug.info()'); o1 = await page.evaluate('canopyDebug.overlaps()')
            await page.keyboard.press('0'); await page.wait_for_timeout(1200)
            n = (await page.evaluate('canopyDebug.info()'))['visible']; o2 = await page.evaluate('canopyDebug.overlaps()')
            await page.keyboard.press('f'); await page.wait_for_timeout(600)
            ms = max(await page.evaluate('canopyDebug.frame()'), await page.evaluate('canopyDebug.frame()'))
            # the same tree, all levels open, in the circle view
            await page.click('#viewSeg button[data-v=radial]'); await page.wait_for_timeout(700)
            o3 = await page.evaluate('canopyDebug.overlapsRadial()')
            ms2 = max(await page.evaluate('canopyDebug.frame()'), await page.evaluate('canopyDebug.frame()'))
            await page.click('#viewSeg button[data-v=tree]'); await page.wait_for_timeout(200)
            bad += (o1 + o2 + o3 > 0)
            print('%-22s %8d %8.2f %9d %9d %10.1f %14d %10.1f' % (f, info['classes'], load, o1 + o2, n, ms, o3, ms2))
        print('page errors:', errors if errors else 'none')
        await b.close()
        raise SystemExit(1 if bad or errors else 0)
asyncio.run(main())
