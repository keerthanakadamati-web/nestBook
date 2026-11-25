import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
P=Path('/tmp/browser/account-recovery')
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page()
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  await page.goto('http://localhost:8080/auth')
  await page.get_by_label('Password',exact=True).fill('Not-a-real-password')
  await page.get_by_role('button',name='Show password',exact=True).click()
  assert await page.get_by_label('Password',exact=True).get_attribute('type')=='text'
  await page.get_by_role('button',name='Hide password',exact=True).click()
  await page.get_by_role('button',name='Forgot password?',exact=True).click()
  await page.get_by_role('heading',name='Forgot password').wait_for()
  await page.screenshot(path=str(P/'forgot.png'))
  await page.goto('http://localhost:8080/reset-password')
  await page.get_by_text('Open the password-reset link',exact=False).wait_for()
  assert await page.get_by_role('button',name='Save new password').is_disabled()
  await page.screenshot(path=str(P/'invalid-link.png'))
  if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS')=='injected':
   session_json=os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
   session=json.loads(session_json)
   key=os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']
   await page.goto('http://localhost:8080')
   await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[key,session_json])
   await page.goto('http://localhost:8080/settings')
   await page.get_by_label('Email Address',exact=True).wait_for()
   await page.get_by_label('Email Address',exact=True).fill('no-account-'+os.urandom(8).hex()+'@example.com')
   await page.get_by_role('button',name='Save role',exact=True).click()
   await page.get_by_text('No registered account matches this email address.',exact=True).wait_for()
   await page.screenshot(path=str(P/'missing-account.png'))
   print('Authenticated email-based role form rejects unknown account; no role changes made.')
   await page.get_by_label('Email Address',exact=True).fill(session['user']['email'])
   await page.get_by_role('button',name='Save role',exact=True).click()
   await page.get_by_text('You cannot change your own role',exact=False).wait_for()
   print('Registered email resolves to the current existing user ID; self-role change is blocked.')
   await page.screenshot(path=str(P/'self-role-blocked.png'))
  print('Browser errors:',len(errors))
  if errors: raise RuntimeError('Browser errors occurred')
  await browser.close()
asyncio.run(main())
