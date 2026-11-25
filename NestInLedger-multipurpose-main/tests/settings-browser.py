import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 state=json.loads(Path('/tmp/browser/settings/state.json').read_text())
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  async def signed(role):
   context=await browser.new_context(viewport={'width':1280,'height':1800})
   page=await context.new_page()
   await page.goto('http://localhost:8080')
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[state['storageKey'],json.dumps(state['sessions'][role])])
   await page.goto('http://localhost:8080/settings',wait_until='networkidle')
   return page
  sec=await signed('secretary')
  await sec.get_by_role('heading',name='Maintenance configuration',exact=True).wait_for()
  amount=sec.get_by_label('Monthly maintenance per flat (₹)',exact=True)
  await amount.fill('2300')
  maintenance=sec.locator('section').filter(has=sec.get_by_role('heading',name='Maintenance configuration',exact=True))
  await maintenance.get_by_role('button',name='Cancel',exact=True).click()
  assert await amount.input_value()==str(state['original']['monthly_amount'])
  assert await sec.get_by_label('Monthly due day',exact=True).get_attribute('max')=='31'
  reminders=sec.locator('section').filter(has=sec.get_by_role('heading',name='Maintenance reminder settings',exact=True))
  await sec.get_by_label('Reminder time',exact=True).fill('12:15')
  await sec.get_by_role('button',name='Save reminders',exact=True).click()
  await sec.get_by_text('Submitted for President approval. Saved settings remain unchanged until approval.',exact=True).wait_for()
  assert await sec.get_by_label('Reminder time',exact=True).input_value()=='11:15'
  await sec.screenshot(path='/tmp/browser/settings/secretary-pending.png')
  pres=await signed('president')
  await pres.goto('http://localhost:8080/approvals',wait_until='networkidle')
  await pres.get_by_role('button',name='Approve',exact=True).click()
  await pres.get_by_text('No pending changes.',exact=True).wait_for()
  await pres.goto('http://localhost:8080/settings',wait_until='networkidle')
  assert await pres.get_by_label('Reminder time',exact=True).input_value()=='12:15'
  await pres.screenshot(path='/tmp/browser/settings/president-saved.png')
  await sec.goto('http://localhost:8080/settings',wait_until='networkidle')
  await sec.get_by_label('Reminder time',exact=True).fill('13:15')
  await sec.get_by_role('button',name='Save reminders',exact=True).click()
  await sec.get_by_text('Submitted for President approval. Saved settings remain unchanged until approval.',exact=True).wait_for()
  await pres.goto('http://localhost:8080/approvals',wait_until='networkidle')
  await pres.get_by_label('Comment (required when rejecting)').fill('Keep the approved time')
  await pres.get_by_role('button',name='Reject',exact=True).click()
  await pres.get_by_text('No pending changes.',exact=True).wait_for()
  await sec.goto('http://localhost:8080/settings',wait_until='networkidle')
  assert await sec.get_by_label('Reminder time',exact=True).input_value()=='12:15'
  admin=await signed('admin')
  await admin.get_by_label('Reminder time',exact=True).fill('11:15')
  await admin.get_by_role('button',name='Save reminders',exact=True).click()
  await admin.get_by_text('Settings saved.',exact=True).wait_for()
  await admin.reload(wait_until='networkidle')
  assert await admin.get_by_label('Reminder time',exact=True).input_value()=='11:15'
  for role in ['resident','treasurer']:
   page=await signed(role)
   assert await page.get_by_role('button',name='Save maintenance',exact=True).count()==0
   assert await page.get_by_role('button',name='Save reminders',exact=True).count()==0
  print('Settings UI: Cancel, Secretary pending, President approval/rejection, Admin save/reload and Owner/Treasurer boundaries verified')
  await browser.close()
asyncio.run(main())
