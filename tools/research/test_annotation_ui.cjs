// Isolated local browser checks. No real recordings, participant data, or external services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.ANNOTATION_TEST_URL || 'http://127.0.0.1:5174';
const out = path.resolve(process.env.ANNOTATION_TEST_OUT || 'tmp/annotation-ui-20260909-v2');
fs.mkdirSync(out, { recursive: true });
const results = [];
const errors = [];
const external = [];
// Frozen display wording, independent of the app module. The fixture was
// checked against the design draft and contains no participant/research records.
const expectedItems = require('./fixtures/review-items.json');
let browser;
async function check(name, test) { await test(); results.push({ name, passed: true }); console.log('PASS', name); }
async function saved(page) { await page.locator('.save-indicator.saved').waitFor(); }
async function dbRead(page, store = 'reviewSessions') {
  return page.evaluate(storeName => new Promise((resolve, reject) => {
    const req = indexedDB.open('AttentionQuadrantDB');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(storeName); const read = tx.objectStore(storeName).getAll(); tx.oncomplete = () => { db.close(); resolve(read.result); }; tx.onabort = () => reject(tx.error); };
  }), store);
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true, animations: 'disabled' }); }
async function next(page) { await page.getByRole('button', { name: '下一題', exact: true }).click(); }
async function failWrites(page, enabled) {
  await page.evaluate(fail => {
    window.failReviewWrites = fail;
    if (window.reviewWriteFaultInstalled) return;
    window.reviewWriteFaultInstalled = true;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite' && [].concat(args[0]).includes('reviewSessions')) {
        const getStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = getStore(name); const put = store.put.bind(store);
          store.put = (...putArgs) => { const request = put(...putArgs); request.addEventListener('success', () => { if (window.failReviewWrites) tx.abort(); }); return request; };
          return store;
        };
      }
      return tx;
    };
  }, enabled);
}

(async () => {
  const exe = [playwright.chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
  browser = await playwright.chromium.launch({ executablePath: exe, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(base)) { external.push(url); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`${base}/fixture`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated fixture</title>' }));
  await page.goto(`${base}/fixture`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('AttentionQuadrantDB', 3);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('annotations', { keyPath: 'annotation_id' }); db.createObjectStore('sessions', { keyPath: 'session_id' }); db.createObjectStore('recordings', { keyPath: 'id' }); };
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(['sessions', 'annotations'], 'readwrite'); tx.objectStore('sessions').put({ session_id: 'legacy-fixture', timestamp: '2026-01-01', segments: [] }); tx.objectStore('annotations').put({ annotation_id: 'legacy-fixture', label: { computed_quadrant: 'Q1' } }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
  }));
  await page.goto(base);
  await check('Empty browser shows explicit demo entry; no fabricated recording', async () => { await page.getByRole('button', { name: /先試用操作示例/ }).waitFor(); });
  await page.getByRole('button', { name: /先試用操作示例/ }).click();
  await page.getByRole('button', { name: /開始確認第一段/ }).waitFor();
  await screenshot(page, '01-introduction');
  await check('Non-destructive v3 to v4 migration preserves both legacy stores', async () => {
    assert.equal((await dbRead(page, 'sessions'))[0].session_id, 'legacy-fixture');
    assert.equal((await dbRead(page, 'annotations'))[0].label.computed_quadrant, 'Q1');
  });
  await page.getByRole('button', { name: /開始確認第一段/ }).click();
  await check('Activity gate requires an explicit answer', async () => { assert(await page.getByRole('button', { name: '繼續', exact: true }).isDisabled()); });
  await screenshot(page, '02-activity-gate');
  await page.getByRole('radio', { name: '有閱讀這則內容', exact: true }).check();
  await page.getByRole('radio', { name: '能回想當時的情況', exact: true }).check();
  await page.getByRole('button', { name: /開始回答/ }).click();
  await check('Selecting an answer does not auto-advance', async () => {
    assert.equal(await page.locator('h1').innerText(), expectedItems[0].text);
    // The rendered scale and the declared scale drifted apart once already:
    // scale_points said 7 while nothing read it. Pin the rendered count here.
    assert.equal(await page.locator('.rating-option').count(), 5);
    await page.getByRole('radio', { name: '3', exact: true }).check();
    await page.waitForTimeout(400);
    assert.match(await page.locator('.question-step').innerText(), /第 1 \/ 8 題/);
  });
  await saved(page);
  await screenshot(page, '03-desktop-question');
  await check('Reload resumes the same item and selected answer', async () => {
    await page.reload(); await page.getByRole('radio', { name: '3', exact: true }).waitFor();
    assert(await page.getByRole('radio', { name: '3', exact: true }).isChecked());
  });
  await next(page);
  await check('Question navigation moves focus to the heading', async () => { assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H1'); });
  await page.getByRole('radio', { name: '2', exact: true }).check();
  await page.getByRole('button', { name: '上一題' }).click();
  await check('Back navigation preserves the original answer', async () => { assert(await page.getByRole('radio', { name: '3', exact: true }).isChecked()); });

  await check('Reduced motion and responsive widths have no page overflow', async () => {
    assert.equal(await page.locator('.panel-content').evaluate(el => getComputedStyle(el).animationName), 'none');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      if (width === 390) await screenshot(page, '04-mobile-question');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('checkbox', { name: '減少動畫' }).check();
    assert.equal(await page.locator('.panel-content').evaluate(el => getComputedStyle(el).animationName), 'none');
  });

  await check('Request success followed by transaction abort is reported as failure; retry saves latest draft', async () => {
    await saved(page);
    await failWrites(page, true);
    await page.getByRole('radio', { name: '4', exact: true }).check();
    await page.getByRole('button', { name: '重試儲存' }).waitFor();
    assert.equal(await page.locator('.save-indicator.saved').count(), 0);
    assert.equal((await dbRead(page))[0].drafts[0].answers.X08.value, 3);
    await screenshot(page, '05-save-error');
    await page.evaluate(() => { window.failReviewWrites = false; });
    await page.getByRole('button', { name: '重試儲存' }).click(); await saved(page);
    assert.equal((await dbRead(page))[0].drafts[0].answers.X08.value, 4);
  });
  await check('A concurrent writer is not silently overwritten, including retry', async () => {
    await page.evaluate(() => new Promise(resolve => {
      const open = indexedDB.open('AttentionQuadrantDB'); open.onsuccess = () => {
        const db = open.result; const tx = db.transaction('reviewSessions', 'readwrite'); const store = tx.objectStore('reviewSessions');
        const read = store.getAll(); read.onsuccess = () => { const s = read.result[0]; s.revision += 10; s.drafts[0].answers.X08.value = 5; store.put(s); };
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    await page.getByRole('radio', { name: '2', exact: true }).check();
    await page.getByRole('button', { name: '重試儲存' }).waitFor();
    await page.getByRole('button', { name: '重試儲存' }).click();
    await page.locator('.save-indicator.error').waitFor();
    assert.equal((await dbRead(page))[0].drafts[0].answers.X08.value, 5);
    await page.reload(); await page.getByRole('radio', { name: '5，了解得很多', exact: true }).waitFor();
    assert(await page.getByRole('radio', { name: '5，了解得很多', exact: true }).isChecked());
    await page.getByRole('radio', { name: '4', exact: true }).check(); await saved(page);
  });
  await next(page); await next(page);
  await page.getByRole('radio', { name: '無法回想', exact: true }).check();
  await next(page);
  for (let i = 3; i < 8; i++) {
    await page.getByRole('radio', { name: '4', exact: true }).check();
    if (i < 7) await next(page);
  }
  await page.getByRole('button', { name: /檢查本段答案/ }).click();
  await screenshot(page, '06-check-answers');
  await page.getByRole('button', { name: '修改第 1 題', exact: true }).click();
  assert(await page.getByRole('radio', { name: '4', exact: true }).isChecked());
  for (let i = 0; i < 7; i++) await next(page);
  await page.getByRole('button', { name: /檢查本段答案/ }).click();
  await check('Failed submission stays on this segment; retry advances once after commit', async () => {
    await saved(page);
    await failWrites(page, true);
    await page.getByRole('button', { name: '確認並保存這段' }).click();
    await page.getByRole('button', { name: '重試儲存' }).waitFor();
    assert.match(await page.locator('.workspace-top h2').innerText(), /第 1 段/);
    assert(await page.getByRole('button', { name: '確認並保存這段' }).isDisabled());
    assert(await page.getByRole('button', { name: '暫存並休息' }).isDisabled());
    assert.equal(Object.keys((await dbRead(page))[0].annotations).length, 0);
    await screenshot(page, '10-submit-retry');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載目前草稿' }).click();
    await (await downloadEvent).saveAs(path.join(out, 'unsaved-submission.json'));
    const pending = JSON.parse(fs.readFileSync(path.join(out, 'unsaved-submission.json')));
    assert.equal(pending.annotations[0].outcome, 'answered');
    assert.equal(pending.local_save_state, 'error');
    await page.evaluate(() => { window.failReviewWrites = false; });
    await page.getByRole('button', { name: '重試儲存' }).click(); await saved(page);
    assert.match(await page.locator('.workspace-top h2').innerText(), /第 2 段/);
    const stored = (await dbRead(page))[0];
    assert.equal(stored.cursor.stage, 'gate'); assert.equal(stored.cursor.segment, 1);
    assert.equal(Object.keys(stored.annotations).length, 1);
    assert.equal(await page.getByText('這一段已記錄。', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '確認下一段' }).count(), 0);
    await page.reload(); await page.locator('.workspace-top').waitFor();
    assert.match(await page.locator('.workspace-top h2').innerText(), /第 2 段/);
    await screenshot(page, '11-direct-next-segment');
  });
  await check('All eight fixed items and X endpoints match the discussion PPT draft', async () => {
    const s = (await dbRead(page))[0];
    assert.equal(s.instrument.version, 'draft-20260922.1');
    assert.equal(s.ui_version, 'review-ui-20260922.1');
    // The rendered scale and the declared scale drifted apart once already:
    // scale_points said 7 while nothing read it. Pin both together.
    assert.equal(s.instrument.scale_points, 5);
    assert.equal(expectedItems.length, 8);
    for (const expected of expectedItems) {
      const actual = s.instrument.items.find(item => item.id === expected.id);
      assert.equal(actual.text, expected.text, expected.id);
      if (expected.id.startsWith('X')) { assert.equal(actual.low, expected.low); assert.equal(actual.high, expected.high); }
      else { assert.equal(actual.low, '完全不符合'); assert.equal(actual.high, '完全符合'); }
    }
    const { sha256, ...instrument } = s.instrument;
    assert.equal(sha256, require('node:crypto').createHash('sha256').update(JSON.stringify(instrument)).digest('hex'));
  });
  await check('Versioned item answers preserve missingness and omit legacy scoring', async () => {
    const s = (await dbRead(page))[0];
    assert.equal(s.schema_version, 2); assert.equal(s.collection_mode, 'interface_demo');
    assert.equal(s.eligible_for_primary_analysis, false); assert.equal(s.instrument.sha256.length, 64);
    assert.equal(Object.keys(s.annotations[0].item_answers).length, 8);
    assert.equal(s.annotations[0].item_answers.X10.value, null);
    assert.equal(s.annotations[0].item_answers.X10.missing_reason, 'cannot_recall');
    assert(!('label' in s.annotations[0]));
  });
  await page.getByRole('radio', { name: '片段有誤／不是這則內容' }).check();
  await check('Repeated skip clicks produce one record and advance exactly one segment', async () => {
    await saved(page);
    await page.getByRole('button', { name: /記錄並略過/ }).evaluate(button => { button.click(); button.click(); });
    await saved(page);
    const s = (await dbRead(page))[0];
    assert.equal(Object.keys(s.annotations).length, 2); assert.deepEqual(s.annotations[1].item_answers, {});
    assert.equal(s.cursor.segment, 2); assert.equal(s.cursor.stage, 'gate');
    assert.match(await page.locator('.workspace-top h2').innerText(), /第 3 段/);
  });
  await page.getByRole('button', { name: '暫存並休息' }).click(); await saved(page); await page.reload();
  await check('Pause and refresh resume at the same segment', async () => {
    await page.getByRole('button', { name: '繼續回顧' }).click();
    assert.match(await page.locator('.workspace-top h2').innerText(), /第 3 段/);
  });
  await page.getByRole('radio', { name: '有閱讀這則內容', exact: true }).check();
  await page.getByRole('radio', { name: '無法回想', exact: true }).check();
  await check('Last segment goes directly to one final summary after saving', async () => {
    await page.getByRole('button', { name: /記錄並略過/ }).click(); await saved(page);
    await page.getByRole('heading', { name: '本次回顧已完成。' }).waitFor();
    assert.equal(await page.locator('.completion-panel').count(), 1);
    assert.equal(await page.locator('.completion-house').count(), 0);
    assert.equal(await page.getByRole('button', { name: /完成本次回顧/ }).count(), 0);
    assert.equal((await dbRead(page))[0].cursor.stage, 'done');
  });
  await screenshot(page, '07-completion');
  // A permalink names the author of a post, who is a third party to the study.
  // Plant one in the stored session so the export boundary is actually tested.
  await page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('AttentionQuadrantDB');
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('reviewSessions', 'readwrite');
      const store = tx.objectStore('reviewSessions'); const read = store.getAll();
      read.onsuccess = () => {
        const session = read.result[0];
        session.postTracking = { schema_version: 3, posts: {
          'permalink:abcdef0123456789': { id: 'permalink:abcdef0123456789',
            permalink: 'https://www.facebook.com/some-account-handle/posts/123',
            permalink_form: 'user_posts', identity_quality: 'permalink' } },
          encounters: [], link_events: [], external_visits: [], mouse_samples: [] };
        store.put(session);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload(); await page.getByRole('button', { name: '下載本次紀錄' }).waitFor();
  await check('Completion and JSON export match persisted records', async () => {
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: '下載本次紀錄' }).click();
    const file = await event; const filePath = path.join(out, 'demo-export.json'); await file.saveAs(filePath);
    const data = JSON.parse(fs.readFileSync(filePath));
    assert.equal(Object.keys(data.annotations).length, 3);
    assert.equal(data.legacy_quadrant_scoring_applied, false);
    assert.equal(data.annotations[2].reason, 'cannot_recall');
    // The reviewer's own copy keeps the permalink; the export must not.
    assert.equal(data.permalinks_redacted, true);
    const exported = Object.values(data.postTracking.posts)[0];
    assert.equal(exported.permalink, null, 'export must not carry the author account');
    assert.equal(exported.id, 'permalink:abcdef0123456789', 'the fingerprint identity survives');
    assert(!JSON.stringify(data).includes('some-account-handle'), 'no account handle anywhere in the export');
  });
  await page.getByRole('button', { name: '查看本機紀錄' }).click();
  await page.locator('.history-panel').waitFor();
  await screenshot(page, '08-history');
  await check('Local history retains separate legacy backup', async () => { await page.getByRole('button', { name: '下載舊版備份' }).waitFor(); });
  await check('Opening a historical record survives reload independently of current recording', async () => {
    await page.getByRole('button', { name: '開啟紀錄' }).click();
    await page.waitForURL(url => url.searchParams.has('review'));
    assert(new URL(page.url()).searchParams.has('review'));
    await page.reload(); await page.getByRole('button', { name: '下載本次紀錄' }).waitFor();
    assert.match(await page.locator('.completion-stats').innerText(), /2/);
  });
  await check('Previous draft retains its original questions, answers and downloadable history', async () => {
    // Recreate an old-version snapshot, without changing the current session.
    const previous = structuredClone((await dbRead(page))[0]);
    previous.instrument.version = 'draft-20260909.1';
    previous.instrument.items.filter(i => i.id.startsWith('X')).forEach(i => { i.text = i.id === 'X10' ? '對這個主題的相關資訊：' : '對這個主題：'; });
    const { sha256, ...oldInstrument } = previous.instrument;
    previous.instrument.sha256 = require('node:crypto').createHash('sha256').update(JSON.stringify(oldInstrument)).digest('hex');
    previous.session_id = `review:${previous.recording_id}:${previous.instrument.version}`;
    previous.ui_version = 'review-ui-20260909.1'; previous.cursor.stage = 'segment-done';
    Object.values(previous.annotations).forEach(a => { a.annotation_id = `${previous.session_id}:${a.segment_index}`; a.instrument_version = previous.instrument.version; a.instrument_sha256 = previous.instrument.sha256; });
    await page.evaluate(s => new Promise((resolve, reject) => {
      const open = indexedDB.open('AttentionQuadrantDB'); open.onsuccess = () => {
        const db = open.result; const tx = db.transaction('reviewSessions', 'readwrite'); tx.objectStore('reviewSessions').put(s);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    }), previous);
    await page.goto(`${base}/?demo=1`); await page.getByRole('button', { name: '查看本機紀錄' }).click();
    const oldRow = page.locator('.history-list article').filter({ hasText: 'draft-20260909.1' });
    assert(await oldRow.getByRole('button', { name: '舊版題本' }).isDisabled());
    const event = page.waitForEvent('download'); await oldRow.getByRole('button', { name: '下載紀錄' }).click();
    await (await event).saveAs(path.join(out, 'previous-draft-export.json'));
    const exported = JSON.parse(fs.readFileSync(path.join(out, 'previous-draft-export.json')));
    assert.equal(exported.instrument.sha256, previous.instrument.sha256);
    assert.deepEqual(exported.annotations, previous.annotations);
    assert.deepEqual((await dbRead(page)).find(s => s.session_id === previous.session_id), previous);
    await screenshot(page, '12-versioned-history');
  });
  await check('No unhandled browser errors or external service requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(external, []); });
  await browser.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, results, errors, external, synthetic_data_only: true }, null, 2));
  console.log(`${results.length} checks passed. Artifacts: ${out}`);
})().catch(async error => {
  console.error(error);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors, external, failure: error.stack }, null, 2));
  if (browser) await browser.close(); process.exitCode = 1;
});
