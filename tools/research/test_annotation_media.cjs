// Browser fixture with a synthetic canvas recording and mocked extension storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.ANNOTATION_TEST_URL || 'http://127.0.0.1:5174';
const out = path.resolve(process.env.ANNOTATION_TEST_OUT || 'tmp/annotation-ui-20260909-v2');
const results = [];
let browser;
(async () => {
  browser = await pw.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const external = []; const errors = [];
  await context.route('**/*', route => { const url = route.request().url(); if (/^https?:/.test(url) && !url.startsWith(base)) { external.push(url); return route.abort(); } return route.continue(); });
  await context.addInitScript(() => {
    window.chrome = { storage: { local: { get: async () => ({
      hasRecordingData: true, currentRecordingId: 'synthetic-video', recordingSegments: [
        { state: 'READING_FLOW', startTime: 0, endTime: 2500, url: 'https://example.invalid/test' },
      ], recordingData: [{ t: 0, scrollTop: 0, speed: 0 }], recordingMouseData: [{ t: 0, x: 0, y: 0, type: 'click', button: 0 }],
      recordingActualDuration: 3000,
    }) } } };
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.route(`${base}/fixture`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Media fixture</title>' }));
  await page.goto(`${base}/fixture`);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d'); document.body.appendChild(canvas);
    const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = '#e8eee9'; ctx.fillRect(0, 0, 960, 540); ctx.fillStyle = '#243a32'; ctx.font = '32px sans-serif';
      ctx.fillText('SYNTHETIC TEST RECORDING', 80, 180); ctx.fillText(`Frame ${i}`, 80, 250);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    recorder.stop(); await done; stream.getTracks().forEach(t => t.stop());
    const videoBlob = new Blob(chunks, { type: 'video/webm' });
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('BehaviorRecorderDB', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('recordings', { keyPath: 'id' });
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('recordings', 'readwrite'); tx.objectStore('recordings').put({ id: 'synthetic-video', videoBlob }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
    });
  });
  await page.goto(base);
  await page.getByRole('button', { name: /開始確認第一段/ }).click();
  await page.getByRole('button', { name: '播放片段', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert(await page.locator('video').evaluate(v => v.paused && v.currentTime < .1));
  results.push('recording loads without autoplay');
  await page.getByRole('button', { name: '播放片段', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > .3);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  const pausedTime = await page.locator('video').evaluate(v => v.currentTime);
  await page.getByRole('radio', { name: '有閱讀這則內容', exact: true }).check();
  await page.getByRole('radio', { name: '能回想當時的情況', exact: true }).check();
  await page.evaluate(() => { window.originalPlayer = document.querySelector('video'); });
  await page.getByRole('button', { name: /開始回答/ }).click();
  assert(await page.evaluate(t => document.querySelector('video') === window.originalPlayer && document.querySelector('video').paused && Math.abs(document.querySelector('video').currentTime - t) < .1, pausedTime));
  results.push('same paused video and playhead survive page changes');
  await page.getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('button', { name: '播放片段', exact: true }).click();
  await page.getByRole('button', { name: '下一題', exact: true }).click();
  assert(await page.locator('video').evaluate(v => v.paused));
  results.push('question change pauses an actively playing video');
  await page.getByRole('button', { name: '從頭重播' }).click();
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v.paused && v.currentTime >= 2.4; }, null, { timeout: 7000 });
  assert(await page.locator('video').evaluate(v => v.currentTime >= 2.4));
  results.push('playback stops at the segment end without looping');
  await page.getByRole('button', { name: '放大畫面' }).click();
  assert(await page.evaluate(() => document.querySelector('video') === window.originalPlayer));
  await page.getByRole('button', { name: '縮回畫面' }).click();
  await page.locator('.save-indicator.saved').waitFor();
  await page.screenshot({ path: path.join(out, '09-synthetic-video.png'), fullPage: true });
  results.push('manual expansion preserves the single player');
  await page.setViewportSize({ width: 720, height: 900 }); // Same CSS viewport as 1440px at 200% zoom.
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  results.push('video workspace reflows at 720 CSS pixels');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  results.push('no external requests or unhandled errors');
  fs.writeFileSync(path.join(out, 'media-results.json'), JSON.stringify({ results, synthetic_data_only: true, extension_apis_mocked: true }, null, 2));
  console.log(results.map(x => 'PASS ' + x).join('\n'));
  await browser.close();
})().catch(async e => { console.error(e); if (browser) await browser.close(); process.exitCode = 1; });
