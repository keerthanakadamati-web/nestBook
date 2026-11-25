import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path('/tmp/browser/gallery')

async def main():
    state = json.loads((ROOT / 'state.json').read_text())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        async def signed(role):
            context = await browser.new_context(viewport={'width':1280,'height':1800}, accept_downloads=True)
            page = await context.new_page()
            await page.goto('http://localhost:8080',wait_until='networkidle')
            await page.evaluate('([k,v])=>localStorage.setItem(k,v)', [state['storageKey'],json.dumps(state['sessions'][role])])
            try:
                await page.goto('http://localhost:8080/gallery',wait_until='domcontentloaded')
            except Exception as error:
                if 'ERR_ABORTED' not in str(error):
                    raise
                await page.wait_for_load_state('domcontentloaded')
                await page.goto('http://localhost:8080/gallery',wait_until='domcontentloaded')
            await page.get_by_role('heading',name='Event photos',exact=True).wait_for()
            return context,page
        context,page=await signed('president')
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.get_by_role('button',name='Create album',exact=True).click()
        await page.get_by_label('Event name',exact=True).last.fill(state['name'])
        await page.get_by_label('Event date',exact=True).fill('2026-10-26')
        await page.get_by_label('Description',exact=True).fill('Temporary gallery verification')
        await page.get_by_role('button',name='Save album',exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        await page.get_by_role('article').filter(has=page.get_by_role('heading',name=state['name'],exact=True)).get_by_role('button',name='View album').click()
        await page.set_input_files('#gallery-upload',str(ROOT/'input.jpg'))
        await page.get_by_text('Photo saved.',exact=False).wait_for(timeout=90000)
        await page.get_by_role('button',name='Publish',exact=True).click()
        await page.get_by_role('button',name='Unpublish',exact=True).wait_for()
        await page.set_input_files('#gallery-upload',{'name':'invalid.jpg','mimeType':'image/jpeg','buffer':b'not a photo'})
        await page.get_by_text('The source image could not be decoded.',exact=False).wait_for(timeout=15000)
        await page.screenshot(path=str(ROOT/'president.png'))
        await context.close()
        for role in ['resident','treasurer']:
            c,pg=await signed(role)
            await pg.get_by_role('article').filter(has=pg.get_by_role('heading',name=state['name'],exact=True)).get_by_role('button',name='View album').click()
            assert await pg.get_by_role('button',name='Create album').count()==0
            assert await pg.locator('#gallery-upload').count()==0
            await pg.get_by_role('button',name='Prepare photo',exact=True).click()
            await pg.get_by_role('button',name='Download photo',exact=True).wait_for(timeout=30000)
            async with pg.expect_download() as d:
                await pg.get_by_role('button',name='Download photo',exact=True).click()
            await (await d.value).save_as(str(ROOT/f'{role}.jpg'))
            await pg.get_by_role('button',name='Prepare album ZIP',exact=True).click()
            await pg.get_by_role('button',name='Download album ZIP',exact=True).wait_for(timeout=30000)
            async with pg.expect_download() as d:
                await pg.get_by_role('button',name='Download album ZIP',exact=True).click()
            await (await d.value).save_as(str(ROOT/f'{role}.zip'))
            await pg.screenshot(path=str(ROOT/f'{role}.png'))
            await pg.goto('http://localhost:8080/storage')
            await pg.get_by_role('heading',name='Storage Management unavailable').wait_for()
            await c.close()
        c,pg=await signed('secretary')
        await pg.get_by_role('article').filter(has=pg.get_by_role('heading',name=state['name'],exact=True)).get_by_role('button',name='View album').click()
        await pg.set_input_files('#gallery-upload',str(ROOT/'input.jpg'))
        await pg.get_by_text('Waiting for President approval.',exact=False).wait_for(timeout=90000)
        await pg.screenshot(path=str(ROOT/'secretary.png'))
        await pg.goto('http://localhost:8080/storage')
        await pg.get_by_role('heading',name='Storage Management',exact=True).wait_for()
        await pg.get_by_role('button',name='Prepare metadata backup',exact=True).click()
        await pg.get_by_role('button',name='Download metadata',exact=True).wait_for()
        async with pg.expect_download() as d:
            await pg.get_by_role('button',name='Download metadata',exact=True).click()
        await (await d.value).save_as(str(ROOT/'metadata.json'))
        exported=json.loads((ROOT/'metadata.json').read_text())
        assert len(exported['albums']) >= 2 and len(exported['uploads']) >= 2
        assert 'signedUrl' not in json.dumps(exported)
        await pg.screenshot(path=str(ROOT/'storage.png'))
        await c.close()
        c,pg=await signed('resident')
        await pg.set_viewport_size({'width':390,'height':844})
        assert await pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
        await pg.screenshot(path=str(ROOT/'mobile.png'))
        await c.close()
        assert not errors,errors
        print('Gallery upload, invalid-image rejection, publication, separate role downloads, metadata backup, Secretary staging, management restrictions and mobile layout verified.')
        await browser.close()

asyncio.run(main())