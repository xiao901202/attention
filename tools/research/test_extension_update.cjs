// Verify release upgrade behavior against the actual worker; no browser/user storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const out = path.resolve(process.env.ANNOTATION_TEST_OUT || 'tmp/annotation-ui-20260909-v2');
const listeners = {};
const writes = [];
const event = name => ({ addListener: callback => { listeners[name] = callback; } });
const chrome = {
  runtime: { onMessage: event('message'), onInstalled: event('installed') },
  tabs: { onActivated: event('activated'), onRemoved: event('removed'), onUpdated: event('updated') },
  windows: { onFocusChanged: event('focus') },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  storage: {
    local: { set: values => writes.push({ store: 'local', values }) },
    sync: { set: values => writes.push({ store: 'sync', values }) },
  },
};
vm.runInNewContext(fs.readFileSync('extension/background/background.js', 'utf8'), { chrome, console: { log() {} } });
const results = [];
for (const reason of ['update', 'chrome_update']) {
  listeners.installed({ reason, previousVersion: '3.0.0' });
  assert.deepEqual(writes, [], `${reason} must not reset saved recording or preferences`);
  results.push(`${reason} preserves recording metadata and preferences`);
}
listeners.installed({ reason: 'install' });
assert.equal(writes.length, 2);
assert.equal(writes.find(w => w.store === 'sync').values.enabled, true);
assert.equal(writes.find(w => w.store === 'local').values.hasRecordingData, false);
results.push('fresh install still initializes defaults');
const manifest = JSON.parse(fs.readFileSync('extension/manifest.json'));
assert.equal(manifest.version, '3.1.0');
const entry = fs.readFileSync('extension/annotation/dist/index.html', 'utf8');
for (const match of entry.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)) {
  assert(fs.existsSync(path.join('extension/annotation/dist', match[1])));
}
results.push('release manifest and built annotation assets resolve');
for (const file of ['extension/recorder/recorder.js', 'extension/annotation/annotation.js', 'extension/annotation/src/vlm/vlm-client.js', 'extension/annotation/src/vlm/llm-client.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/apiKey:\s*(['"])[^'"\r\n]+\1/.test(source), `${file}: embedded API credential`);
}
assert(/os\.environ\.get\("VLM_API_KEY",\s*""\)/.test(fs.readFileSync('chat_template.py', 'utf8')));
results.push('legacy configuration has no embedded credential defaults');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'extension-update-results.json'), JSON.stringify({ results, mocked_extension_api: true, real_browser_upgrade_tested: false }, null, 2));
console.log(results.map(name => `PASS ${name}`).join('\n'));
