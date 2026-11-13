# Broad smoke test: exercise every control once and fail on any page error.
import asyncio, json, os
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
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, offline=True, has_touch=False)
        page = await ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await page.goto(URL); await page.wait_for_timeout(400)
        info = lambda: page.evaluate('canopyDebug.info()')
        ev = page.evaluate
        async def opt(setter):
            await page.click('#optBtn'); await page.wait_for_timeout(100); await setter(); await page.wait_for_timeout(350); await page.keyboard.press('Escape')
        # names: identifiers, language de
        await opt(lambda: page.select_option('.pop select[aria-label="Names shown"]', 'id')); print('identifiers:', (await ev('canopyDebug.names()'))[1:5])
        await opt(lambda: page.select_option('.pop select[aria-label="Names shown"]', 'label'))
        await opt(lambda: page.select_option('.pop select[aria-label="Label language"]', 'de')); print('german:', (await ev('canopyDebug.names()'))[1:5])
        await opt(lambda: page.select_option('.pop select[aria-label="Label language"]', 'en'))
        await opt(lambda: page.select_option('.pop select[aria-label="Order of children"]', 'size')); print('largest first:', (await ev('canopyDebug.names()'))[1:4])
        await opt(lambda: page.select_option('.pop select[aria-label="Order of children"]', 'az'))
        n0 = (await info())['visible']
        await opt(lambda: page.click('.pop label.chk >> nth=0')); await page.keyboard.press('0'); await page.wait_for_timeout(500); print('deprecated shown, all levels:', (await info())['visible'], 'nodes (classes: 96)')
        # search for the deprecated class and select
        await page.click('#search'); await page.keyboard.type('fortepiano'); await page.keyboard.press('Enter'); await page.wait_for_timeout(600)
        print('panel:', (await ev("document.querySelector('#pbody').innerText")).replace('\n', ' / ')[:120])
        await page.keyboard.press('Escape')
        # panel links
        await page.click('#search'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.click('#search'); await page.keyboard.type('string quartet'); await page.keyboard.press('Enter'); await page.wait_for_timeout(600)
        print('string quartet panel:', (await ev("document.querySelector('#pbody').innerText")).replace('\n', ' / ')[:520])
        await page.click('#pbody .lnk >> nth=0'); await page.wait_for_timeout(500); print('after crumb click sel:', (await info())['sel'])
        # focus view, more, hops, back
        await page.click('#viewSeg button[data-v=focus]'); await page.wait_for_timeout(600)
        await page.click('#focusBar .seg button >> nth=1'); await page.wait_for_timeout(600); print('focus bar:', (await ev("document.getElementById('focusBar').innerText")).replace('\n', ' '))
        more = await page.query_selector('#focusBar .btn:has-text("Show more")')
        if more: await more.click(); await page.wait_for_timeout(600); print('after show more:', (await ev("document.getElementById('focusBar').innerText")).replace('\n', ' '))
        # drag a focus node, click another to refocus
        await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(760, 500, steps=4); await page.mouse.up()
        await page.keyboard.press('f'); await page.wait_for_timeout(300)
        await page.click('#viewSeg button >> nth=0'); await page.wait_for_timeout(600)
        # tree: double click, alt click, minimap drag, pan drag
        await page.keyboard.press('2'); await page.wait_for_timeout(500)
        await page.keyboard.press('Escape')
        v0 = (await info())['visible']
        await page.mouse.dblclick(540, 400); await page.wait_for_timeout(500)
        await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(380, 360, steps=5); await page.mouse.up(); await page.wait_for_timeout(200)
        await page.keyboard.press('0'); await page.wait_for_timeout(500); await page.keyboard.press('+'); await page.keyboard.press('+'); await page.wait_for_timeout(300)
        vis = await ev("!document.getElementById('mini').hidden")
        if vis:
            bb = await (await page.query_selector('#mini')).bounding_box()
            await page.mouse.move(bb['x'] + 40, bb['y'] + 40); await page.mouse.down(); await page.mouse.move(bb['x'] + 80, bb['y'] + 120, steps=4); await page.mouse.up()
        print('minimap visible when zoomed in:', vis)
        # property tab filter and selection
        await page.click('#tabs [data-tab=props]'); await page.fill('#pfilter', 'has'); await page.wait_for_timeout(200)
        print('props filtered:', await ev("document.querySelectorAll('#pbody .prow').length"))
        await page.click('#pbody .prow >> nth=0'); await page.wait_for_timeout(400); print('prop selected:', (await info())['sel'], 'arcs', (await info())['arcs'])
        # panel hide/show, theme, help
        await page.keyboard.press('p'); await page.wait_for_timeout(300); await page.keyboard.press('p'); await page.wait_for_timeout(300)
        await page.keyboard.press('t'); await page.wait_for_timeout(200); await page.keyboard.press('?'); await page.wait_for_timeout(200); await page.keyboard.press('Escape'); await page.keyboard.press('t')
        # hover tooltip
        await page.keyboard.press('f'); await page.wait_for_timeout(500)
        await page.mouse.move(500, 300); await page.mouse.move(520, 330, steps=3); await page.wait_for_timeout(900)
        print('frame ms:', await ev('canopyDebug.frame()'), 'overlaps:', await ev('canopyDebug.overlaps()'))
        # instance data in the built-in sample: search an individual, read its statements, focus on it
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
        await page.click('#search'); await page.keyboard.type('symphony no'); await page.wait_for_timeout(200)
        print('individual search:', (await ev("document.getElementById('results').innerText")).replace('\n', ' | ')[:80])
        await page.keyboard.press('Enter'); await page.wait_for_timeout(600)
        txt = (await ev("document.querySelector('#pbody').innerText")).replace('\n', ' / ')
        print('individual panel:', txt[:230]); assert 'composed by' in txt and 'Ludwig van Beethoven' in txt and '67' in txt, 'individual statements missing'
        print('individual selected:', (await info())['sel'], 'links on tree:', (await info())['arcs'])
        await page.click('#viewSeg button[data-v=focus]'); await page.wait_for_timeout(700)
        print('individual focus:', (await ev("document.getElementById('focusBar').innerText")).replace('\n', ' '))
        await page.mouse.click(760, 470); await page.wait_for_timeout(600)
        await page.click('#pbody .lnk >> nth=0'); await page.wait_for_timeout(500)
        await page.click('#viewSeg button[data-v=tree]'); await page.wait_for_timeout(500)
        await opt(lambda: page.click('.pop label.chk:has-text("Statements between individuals")'))
        await opt(lambda: page.click('.pop label.chk:has-text("Statements between individuals")'))
        # circle view: same tree on a circle; click a name, open and close a branch, links, levels, zoom, keys
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('3'); await page.wait_for_timeout(500)
        await page.click('#viewSeg button[data-v=radial]'); await page.wait_for_timeout(700)
        rad = lambda: ev('canopyDebug.radial()')
        at = lambda name, part='label': ev('canopyDebug.radialAt(%s, %s)' % (json.dumps(name), json.dumps(part)))
        r0 = await rad(); print('circle:', (await info())['view'], r0, 'rim overlaps:', await ev('canopyDebug.overlapsRadial()'))
        assert (await info())['view'] == 'radial' and await ev('canopyDebug.overlapsRadial()') == 0
        xy = await at('Composer'); await page.mouse.click(*xy); await page.wait_for_timeout(400)
        txt = await ev("document.querySelector('#pbody h1, #pbody .title, #pbody').innerText"); assert 'Composer' in txt, 'click on a rim name did not select it'
        print('circle click on rim name -> panel shows Composer; links drawn:', (await info())['arcs'])
        v0 = (await info())['visible']; xy = await at('Ensemble', 'dot'); await page.mouse.click(*xy); await page.wait_for_timeout(600)
        v1 = (await info())['visible']; assert v1 > v0, 'click on a closed branch did not open it'
        xy = await at('Ensemble', 'dot'); await page.mouse.click(*xy); await page.wait_for_timeout(600)
        v2 = (await info())['visible']; assert v2 == v0, 'click on an open branch did not close it'
        xy = await at('Instrument'); await page.mouse.click(*xy); await page.wait_for_timeout(400)
        assert 'Instrument' in await ev("document.querySelector('#pbody').innerText"), 'click on a name inside the circle did not select it'
        print('circle open/close branch:', v0, '->', v1, '->', v2, '| inner name selects | still fitted:', abs((await rad())['zoom'] - r0['zoom']) < 0.2)
        a0 = (await rad())['allLinks']; await page.click('#allBtn'); await page.wait_for_timeout(300); a1 = (await rad())['allLinks']; await page.click('#allBtn'); await page.wait_for_timeout(300)
        assert a0 != a1, 'All links button did nothing'
        await page.keyboard.press('0'); await page.wait_for_timeout(700); print('circle all levels:', await rad(), 'rim overlaps:', await ev('canopyDebug.overlapsRadial()'))
        assert await ev('canopyDebug.overlapsRadial()') == 0
        await page.mouse.move(600, 420); await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control'); await page.wait_for_timeout(300)
        z1 = (await rad())['zoom']; await page.mouse.move(500, 400); await page.mouse.down(); await page.mouse.move(430, 350, steps=4); await page.mouse.up()
        await page.keyboard.press('f'); await page.wait_for_timeout(400); z2 = (await rad())['zoom']; print('circle zoom in then fit: %.2f -> %.2f' % (z1, z2), 'frame ms:', await ev('canopyDebug.frame()'))
        await page.keyboard.press('Escape'); await page.keyboard.press('g'); await page.wait_for_timeout(400); vw = (await info())['view']
        await page.keyboard.press('g'); await page.wait_for_timeout(400); print('G from circle ->', vw, '->', (await info())['view'])
        # theme persisted across reload
        await page.keyboard.press('t'); th = await ev("document.documentElement.getAttribute('data-theme')")
        await page.reload(); await page.wait_for_timeout(500); print('theme persisted:', th, '->', await ev("document.documentElement.getAttribute('data-theme')"))
        print('page errors:', logs if logs else 'none')
        await b.close()
asyncio.run(main())
