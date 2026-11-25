import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright, expect

async def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    out = Path('/tmp/browser/sidebar-access'); out.mkdir(parents=True, exist_ok=True)
    admin_links = {'Dashboard':'/dashboard','Owners':'/owners','Flats':'/flats','Tenants':'/tenants','Announcements':'/announcements','Maintenance':'/maintenance','Payments':'/payments','Expenses':'/expenses','Corporate Fund':'/fund','Reports':'/reports','Proposals / History':'/approvals','Settings':'/settings','Documents':'/documents'}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role in ['admin','president','secretary','treasurer','resident']:
            context = await browser.new_context(viewport={'width':1280,'height':1800})
            page = await context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.goto('http://localhost:8080')
            await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[config['storageKey'],json.dumps(config['sessions'][role])])
            await page.goto('http://localhost:8080/dashboard',wait_until='domcontentloaded')
            nav = page.get_by_role('navigation',name='Pages',exact=True)
            await expect(nav).to_be_visible()
            if role != 'resident':
                await expect(page.get_by_text('Six-month trend',exact=True)).to_be_visible()
                await page.screenshot(path=str(out/f'{role}-dashboard.png'))
                await page.set_viewport_size({'width':390,'height':844})
                await expect(page.get_by_role('button',name='Open menu',exact=True)).to_be_visible()
                widths = await page.locator('body').evaluate('(e)=>[e.scrollWidth,document.documentElement.clientWidth]')
                assert widths[0] <= widths[1], 'Dashboard has page-level horizontal overflow'
                await page.screenshot(path=str(out/f'{role}-mobile-dashboard.png'))
                await page.set_viewport_size({'width':1280,'height':1800})
            if role in ['admin','president','secretary']:
                for label, path in admin_links.items():
                    link = nav.get_by_role('link',name=label,exact=True)
                    assert await link.get_attribute('href') == path
                    await link.click(); await page.wait_for_url('**'+path); await page.wait_for_load_state('networkidle')
                    await page.get_by_text('Loading dashboard…',exact=True).wait_for(state='detached')
                    if path == '/settings':
                        await page.get_by_role('heading',name='Apartment configuration',exact=True).wait_for()
                        assert await page.get_by_role('textbox',name='UPI ID',exact=True).count() == 0
                    if path == '/documents':
                        await page.screenshot(path=str(out/'documents-debug.png'))
                        async with page.expect_download() as event:
                            await page.get_by_role('button',name='Download PDF',exact=True).first.click()
                        assert (await (await event.value).path()).stat().st_size > 100
                    assert await page.locator('main').count() > 0
                    assert await nav.locator('[aria-current="page"]').count() == 1
                    assert await page.get_by_text('Administrative access is required',exact=False).count() == 0
                    if path in ['/owners','/tenants','/maintenance']:
                        await page.get_by_text(config['flatNumber'],exact=True).wait_for()
                assert await nav.get_by_role('link',name='Complaints',exact=True).get_attribute('href') == '/complaints'
                assert await nav.get_by_role('link',name='Documents',exact=True).count() == 1
                for path in ['/owners','/flats','/tenants','/maintenance','/payments','/settings']:
                    await page.goto('http://localhost:8080'+path,wait_until='networkidle')
                    main = page.locator('main')
                    assert await main.get_by_role('textbox',name='UPI ID',exact=True).count() == (1 if path == '/payments' else 0)
                    if path == '/payments':
                        await page.screenshot(path=str(out/'payment-debug.png'))
                        await page.get_by_label('Flat',exact=True).select_option(config['flatId'])
                        await page.get_by_text('Pending confirmation',exact=True).last.wait_for()
                        await page.get_by_role('button',name='Details',exact=True).click()
                        await page.get_by_role('heading',name='Payment details',exact=True).wait_for()
                        await page.get_by_role('button',name='Close',exact=True).click()
                    if path == '/maintenance':
                        await page.get_by_label('Search flat or owner',exact=True).fill(config['flatNumber'])
                        await page.get_by_label('Month and year',exact=True).fill('2026-02')
                        async with page.expect_download() as event:
                            await page.get_by_role('button',name='Download statement',exact=True).click()
                        download = await event.value
                        assert (await download.path()).stat().st_size > 100
                        await page.screenshot(path=str(out/f'{role}-maintenance.png'))
                    if path == '/tenants':
                        row = page.locator('article').filter(has=page.get_by_text(config['flatNumber'],exact=True))
                        await row.get_by_role('button',name='Edit',exact=True).click()
                        assert await page.get_by_role('textbox',name='Owner name',exact=True).count() == 0
                        await page.get_by_role('button',name='Close',exact=True).click()
                    if path == '/owners':
                        row = page.locator('article').filter(has=page.get_by_text(config['flatNumber'],exact=True))
                        await row.get_by_role('button',name='Edit',exact=True).click()
                        assert await page.get_by_role('textbox',name='Tenant name',exact=True).count() == 0
                        await page.get_by_role('button',name='Close',exact=True).click()
                await page.goto('http://localhost:8080/payments',wait_until='networkidle')
                await page.screenshot(path=str(out/f'{role}.png'))
                if role == 'secretary':
                    await nav.get_by_role('link',name='Payments',exact=True).click()
                    await page.get_by_label('Record cash for flat',exact=True).select_option(config['flatId'])
                    await page.get_by_role('spinbutton',name='Amount received',exact=False).fill('250')
                    await page.get_by_role('button',name='Save payment',exact=True).click()
                    await page.get_by_role('button',name='Save payment',exact=True).wait_for(state='detached')
                    await nav.get_by_role('link',name='Tenants',exact=True).click()
                    row = page.locator('article').filter(has=page.get_by_text(config['flatNumber'],exact=True))
                    await row.get_by_role('button',name='Edit',exact=True).click()
                    await page.get_by_role('textbox',name='Tenant name',exact=True).fill('Proposed tenant')
                    await page.get_by_role('button',name='Save',exact=True).click()
                    await page.get_by_role('button',name='Save',exact=True).wait_for(state='detached')
                    await nav.get_by_role('link',name='Proposals / History',exact=True).click()
                    await page.get_by_role('textbox',name='Search history',exact=True).fill(config['flatNumber'])
                    await page.get_by_text('Proposed tenant',exact=True).wait_for()
                    await page.screenshot(path=str(out/'secretary-proposal.png'))
                if role == 'president':
                    await nav.get_by_role('link',name='Proposals / History',exact=True).click()
                    await page.get_by_role('heading',name='Pending Approvals',exact=True).wait_for()
                    assert await page.get_by_role('button',name='Approve',exact=True).count() >= 1
                if role == 'admin':
                    await nav.get_by_role('link',name='Proposals / History',exact=True).click()
                    assert await page.get_by_role('button',name='Approve',exact=True).count() == 0
            else:
                denied_links = ['/owners','/flats','/tenants'] + (['/settings','/approvals'] if role == 'resident' else [])
                for path in denied_links:
                    assert await nav.locator('a[href="'+path+'"]').count() == 0
                if role == 'treasurer':
                    await expect(nav.get_by_role('link',name='Finance Settings',exact=True)).to_have_attribute('href','/settings')
                    await expect(nav.get_by_role('link',name='Proposals / History',exact=True)).to_have_attribute('href','/approvals')
                    await nav.get_by_role('link',name='Documents',exact=True).click()
                    async with page.expect_download() as event:
                        await page.get_by_role('button',name='Download spreadsheet',exact=True).first.click()
                    assert (await (await event.value).path()).stat().st_size > 100
                    for name in ['Maintenance','Payments']:
                        await nav.get_by_role('link',name=name,exact=True).click()
                        if name == 'Maintenance':
                            await page.get_by_text(config['flatNumber'],exact=True).wait_for()
                        else:
                            await page.screenshot(path=str(out/'payment-debug.png'))
                            await page.get_by_label('Flat',exact=True).select_option(config['flatId'])
                            await page.get_by_text('Pending confirmation',exact=True).last.wait_for()
                        assert await page.get_by_role('button',name='Confirm',exact=True).count() == 0
                denied_pages = ['/owners','/tenants','/flats'] + (['/settings'] if role == 'resident' else [])
                for path in denied_pages:
                    await page.goto('http://localhost:8080'+path,wait_until='networkidle')
                    await page.wait_for_url('**/my-flat')
                    assert await page.get_by_text(config['flatNumber'],exact=True).count() == 0
                await page.goto('http://localhost:8080/approvals',wait_until='networkidle')
                if role == 'resident':
                    await expect(page.get_by_text('Administrative access is required to view these changes.',exact=True)).to_be_visible()
                else:
                    await expect(page.get_by_role('heading',name='My proposed changes',exact=True)).to_be_visible()
                    await expect(page.get_by_role('button',name='Approve',exact=True)).to_have_count(0)
                await page.screenshot(path=str(out/f'{role}-denied.png'))
            assert not errors, 'Unexpected page runtime error'
            print(role+': menu, page access and permission controls verified')
            await context.close()
        await browser.close()

asyncio.run(main())