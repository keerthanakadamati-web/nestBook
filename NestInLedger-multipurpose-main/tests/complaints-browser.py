import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

P=Path('/tmp/browser/complaints')
async def main():
 config=json.loads((P/'state.json').read_text())
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  for role in ['resident','secretary','president','admin','treasurer','other']:
   context=await browser.new_context(viewport={'width':1280,'height':1800})
   page=await context.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080')
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[config['storageKey'],json.dumps(config['sessions'][role])])
   await page.goto('http://localhost:8080/complaints',wait_until='networkidle')
   if role=='treasurer':
    await page.get_by_text('Complaints are not available with your finance-only access.').wait_for()
    assert await page.get_by_role('link',name='Complaints',exact=True).count()==0
   elif role=='other':
    await page.get_by_text('No complaints found.').wait_for()
   else:
    await page.get_by_role('heading',name='Water leak verification',exact=True).wait_for()
    await page.get_by_role('button',name='View complaint',exact=True).first.click()
    await page.get_by_role('heading',name='Comments and history',exact=True).wait_for()
    assert await page.get_by_role('img',name='Complaint photo').count()==1
    if role=='resident':
     await page.get_by_label('Add a comment',exact=True).fill('Owner browser comment')
     await page.get_by_role('button',name='Send comment',exact=True).click()
     await page.get_by_text('Owner browser comment',exact=True).wait_for()
    if role=='secretary':
     await page.get_by_role('button',name='Propose update',exact=True).click()
     await page.get_by_label('Committee response / progress update').fill('Browser inspection arranged')
     await page.get_by_role('button',name='Submit for President approval',exact=True).click()
     await page.get_by_role('heading',name='Proposal: pending',exact=True).wait_for()
    if role=='president':
     await page.get_by_role('button',name='Approve',exact=True).click()
     await page.get_by_role('button',name='Approve',exact=True).wait_for(state='detached')
    await page.screenshot(path=str(P/(role+'.png')))
   assert not errors,'Complaint page runtime error'
   print(role+': complaint access and workflow verified')
   await context.close()
  context=await browser.new_context(viewport={'width':390,'height':844})
  page=await context.new_page()
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[config['storageKey'],json.dumps(config['sessions']['resident'])])
  await page.goto('http://localhost:8080/complaints',wait_until='networkidle')
  await page.get_by_role('button',name='Submit complaint',exact=True).click()
  await page.get_by_label('Title',exact=True).fill('Mobile complaint verification')
  await page.get_by_label('Description',exact=True).fill('Light requires inspection')
  await page.get_by_role('button',name='Submit complaint',exact=True).last.click()
  await page.get_by_role('heading',name='Mobile complaint verification',exact=True).last.wait_for()
  assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  await page.screenshot(path=str(P/'mobile.png'))
  print('Mobile submission read back through complaint details')
  await browser.close()
asyncio.run(main())