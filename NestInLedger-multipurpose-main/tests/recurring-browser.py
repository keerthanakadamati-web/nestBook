import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path('/tmp/browser/recurring')

async def main():
    state = json.loads((ROOT / 'state.json').read_text())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors = []
        async def signed(role, route):
            context = await browser.new_context(viewport={'width':1280,'height':1800})
            page = await context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto('http://localhost:8080', wait_until='networkidle')
            await page.evaluate('([k,v])=>localStorage.setItem(k,v)', [state['storageKey'],json.dumps(state['sessions'][role])])
            await page.goto('http://localhost:8080'+route, wait_until='networkidle')
            return context, page
        c, page = await signed('treasurer', '/settings')
        await page.get_by_role('button',name='Add recurring expense',exact=True).click()
        await page.get_by_label('Expense name',exact=True).fill(state['name'])
        await page.get_by_label('Expected amount (₹)',exact=True).fill('1200')
        await page.get_by_label('Start date',exact=True).fill('2099-05-01')
        await page.get_by_label('Vendor, employee or service provider',exact=True).fill('Temporary test vendor')
        await page.get_by_role('checkbox').check()
        await page.get_by_role('button',name='Add recurring expense',exact=True).last.click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        await page.get_by_text('Submitted for President approval.',exact=True).wait_for()
        await page.screenshot(path=str(ROOT/'treasurer-settings.png'))
        await c.close()
        c, page = await signed('president','/approvals')
        await page.get_by_label('Search history',exact=True).fill(state['name'])
        await page.get_by_role('button',name='Approve',exact=True).click()
        await page.get_by_role('button',name='Approve',exact=True).wait_for(state='hidden')
        await c.close()
        c, page = await signed('treasurer','/expenses')
        await page.get_by_label('Month and year',exact=True).fill('2099-05')
        await page.get_by_role('button',name="Create This Month's Expenses",exact=True).click()
        await page.get_by_role('button',name='Record payment',exact=True).first.wait_for()
        # Select the fixture row, not other temporary test schedules.
        row = page.locator('div.grid').filter(has=page.get_by_text(state['name'],exact=True)).last
        await row.get_by_role('button',name='Record payment',exact=True).click()
        await page.get_by_label('Payment date',exact=True).fill('2099-05-05')
        await page.get_by_label('Payment reference',exact=True).fill('browser-test-reference')
        await page.get_by_role('button',name='Submit for approval',exact=True).click()
        await page.get_by_text('Attach the required bill or receipt before submitting this payment.',exact=True).wait_for()
        await page.set_input_files('input[type=file]', {'name':'receipt.txt','mimeType':'text/plain','buffer':b'Temporary verification receipt'})
        await page.get_by_role('button',name='Submit for approval',exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        await page.get_by_text('Payment submitted for President approval.',exact=True).wait_for()
        await page.get_by_text('Awaiting Approval',exact=True).wait_for()
        await page.screenshot(path=str(ROOT/'treasurer-payment.png'))
        await c.close()
        c, page = await signed('president','/approvals')
        await page.get_by_label('Search history',exact=True).fill(state['name'])
        await page.get_by_text('receipt.txt',exact=True).wait_for()
        async with page.expect_popup() as popup:
            await page.get_by_role('button',name='View',exact=True).click()
        proof = await popup.value
        await proof.wait_for_load_state()
        assert 'Temporary verification receipt' in await proof.locator('body').inner_text()
        await proof.close()
        await page.get_by_role('button',name='Approve',exact=True).click()
        await page.get_by_role('button',name='Approve',exact=True).wait_for(state='hidden')
        await c.close()
        c, page = await signed('treasurer','/expenses')
        await page.get_by_label('Month and year',exact=True).fill('2099-05')
        await page.get_by_text('Paid',exact=True).last.wait_for()
        await page.get_by_text('Payment reference: browser-test-reference',exact=False).wait_for()
        row = page.locator('div.grid').filter(has=page.get_by_text(state['name'],exact=True)).last
        await row.get_by_role('button',name='Details',exact=True).click()
        assert await page.get_by_text('browser-test-reference',exact=False).count() > 0
        await page.get_by_text('receipt.txt',exact=True).wait_for()
        await page.screenshot(path=str(ROOT/'paid.png'))
        await page.get_by_role('button',name='Close',exact=True).click()
        await page.set_viewport_size({'width':390,'height':844})
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        await page.screenshot(path=str(ROOT/'mobile.png'))
        await c.close()
        for role in ['secretary','resident']:
            c, page = await signed(role,'/expenses')
            assert await page.get_by_text(state['name'],exact=False).count()==0
            await c.close()
        assert not errors, errors
        await browser.close()
        print('Treasurer settings proposal, President approval, required proof, payment approval, read-back and mobile layout verified.')

asyncio.run(main())