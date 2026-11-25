import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    secret_path=Path(sys.argv[1])
    config=json.loads(secret_path.read_text())
    out=Path('/tmp/browser/reports'); out.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        for role in ['treasurer','secretary','president','resident']:
            context=await browser.new_context(viewport={'width':1280,'height':1800},accept_downloads=True)
            page=await context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            await page.goto('http://localhost:8080')
            await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[config['storageKey'],json.dumps(config['sessions'][role])])
            await page.goto('http://localhost:8080/reports',wait_until='networkidle')
            if role=='resident':
                await page.get_by_role('heading',name='Financial reports unavailable').wait_for()
                assert await page.get_by_role('button',name='Download spreadsheet').count()==0
                print('Owner report access denied')
                await context.close(); continue
            await page.get_by_role('heading',name='Financial reports',exact=True).wait_for()
            row=page.locator('tr').filter(has_text=config['sessions']['treasurer']['user']['email']).filter(has_text='Monthly').first
            await row.get_by_role('button',name='View',exact=True).click()
            if role=='treasurer':
                assert await page.get_by_role('link',name='Flats',exact=True).count()==0
                await page.get_by_role('button',name='Submit to President & Secretary').click()
                await page.get_by_role('button',name='Submit to President & Secretary').wait_for(state='detached')
            else:
                await page.get_by_role('button',name='Mark reviewed').click()
                await page.get_by_role('button',name='Mark reviewed').wait_for(state='detached')
                if role=='president':
                    page.on('dialog',lambda dialog:dialog.accept())
                    await page.get_by_role('button',name='Approve report',exact=True).click()
                    await page.get_by_role('button',name='Approve report',exact=True).wait_for(state='detached')
            await page.get_by_role('button',name='Create PDF',exact=True).click()
            await page.get_by_role('button',name='Download PDF',exact=True).wait_for()
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='Download PDF',exact=True).click()
            await (await dl.value).save_as(out/f'{role}.pdf')
            assert (out/f'{role}.pdf').read_bytes().startswith(b'%PDF')
            async with page.expect_download() as dl:
                await page.get_by_role('button',name='Download spreadsheet',exact=True).click()
            await (await dl.value).save_as(out/f'{role}.csv')
            assert 'Maintenance collected' in (out/f'{role}.csv').read_text()
            await page.screenshot(path=str(out/f'{role}.png'))
            assert not errors, 'Unexpected report page runtime errors'
            print(f'{role}: actual report, status action, PDF and spreadsheet verified')
            await context.close()
        await browser.close()
    secret_path.unlink(missing_ok=True)

asyncio.run(main())