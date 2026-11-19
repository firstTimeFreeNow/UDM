import assert from 'node:assert/strict';

/** Opens Google's initial screen only. Never enters accounts or completes sign-in. */
export async function runGooglePopupCheck(chromium, baseUrl, launchOptions = {}) {
  const browser = await chromium.launch({ ...launchOptions, headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      let host;
      try { host = new URL(event.blockedURI).hostname; } catch { host = 'non-url'; }
      window.__authCspChecks = (window.__authCspChecks || []).concat({ directive: event.violatedDirective, host });
    }));
    const response = await page.goto(baseUrl);
    const policy = response.headers()['content-security-policy'];
    const scriptPolicy = policy.split(';').find(directive => directive.trim().startsWith('script-src '));
    assert.ok(scriptPolicy.includes('https://apis.google.com'), 'Google auth loader must be allowed');
    await page.waitForFunction(() => !document.querySelector('#google-login').disabled);
    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await page.locator('#google-login').click();
    const popup = await popupPromise;
    await popup.waitForURL(url => url.hostname === 'accounts.google.com', { timeout: 15000 });
    assert.equal(new URL(popup.url()).origin, 'https://accounts.google.com');
    assert.deepEqual(await page.evaluate(() => window.__authCspChecks || []), []);
    return { googlePageReached: true, cspViolations: 0, signInCompleted: false };
  } finally { await browser.close(); }
}
