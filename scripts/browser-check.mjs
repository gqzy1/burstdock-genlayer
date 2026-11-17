/** Read-only browser acceptance. Connecting a session does not broadcast a transaction. */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const origin = process.env.BURSTDOCK_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const wait = {timeout: 90000};
try {
  await mkdir('artifacts', {recursive: true});
  await page.goto(origin);
  await page.getByText('Shared inventory refresh', {exact: true}).first().waitFor(wait);
  await page.getByText('COMMITTED', {exact: true}).first().waitFor(wait);
  await page.getByRole('tab', {name:'Proof', exact:true}).click();
  await page.getByRole('columnheader', {name:'Credit before'}).waitFor();
  await page.getByRole('tab', {name:'Source', exact:true}).click();
  await page.getByText('KNOWN', {exact:true}).waitFor();
  await page.getByRole('tab', {name:'Consent', exact:true}).click();
  await page.getByText('Indexer', {exact:true}).first().waitFor();
  await page.getByRole('tab', {name:'Queue', exact:true}).click();
  await page.screenshot({path:'artifacts/browser-desktop.jpg', quality:88});
  await page.getByRole('button', {name:'Connect wallet', exact:true}).click();
  await page.getByRole('button', {name:/Free Studio session/}).click();
  const address = page.getByTestId('wallet-address');
  await address.waitFor(wait);
  assert.match(await address.innerText(), /^0x[0-9a-fA-F]{40}$/);
  await page.getByRole('button', {name:'Done', exact:true}).click();
  await page.getByRole('link', {name:'Transactions', exact:true}).click();
  await page.getByRole('link', {name:/Verify live/}).first().click();
  await page.getByText('Verified through the real RPC.', {exact:true}).waitFor(wait);
  const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(origin);
  await mobile.getByText('Shared inventory refresh', {exact:true}).first().waitFor(wait);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.getByRole('button', {name:'Toggle navigation'}).click();
  await mobile.getByRole('link', {name:'New plan', exact:true}).click();
  await mobile.locator('#plan-title').waitFor();
  await mobile.locator('#plan-title').fill('Mobile draft validation');
  await mobile.reload();
  assert.equal(await mobile.locator('#plan-title').inputValue(), 'Mobile draft validation');
  await mobile.goto(origin + '#/');
  await mobile.getByText('Shared inventory refresh', {exact:true}).first().waitFor(wait);
  await mobile.screenshot({path:'artifacts/browser-mobile.jpg', quality:88, fullPage:true});
  assert.deepEqual(errors, []);
  await writeFile('artifacts/browser-result.json', JSON.stringify({
    origin, observedAt:new Date().toISOString(), state:'COMMITTED', reads:'latest-final',
    sessionWalletConnected:true, receiptReverified:true, mobileDraftPersisted:true, pageErrors:errors
  }, null, 2) + '\n');
  console.log('Live browser readback, receipt recheck, session connection and mobile navigation passed.');
} finally {
  await browser.close();
}
