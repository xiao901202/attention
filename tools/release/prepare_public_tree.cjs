// Prepare (but never push) an explicit code-only Git tree from committed HEAD.
// The normal index, working files and local research history are not changed.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const staging = path.join(root, 'tmp', 'public-code-release');
fs.mkdirSync(staging, { recursive: true });
const env = { ...process.env, GIT_INDEX_FILE: path.join(staging, `index-${process.pid}`) };
function git(args, input) { return cp.execFileSync('git', args, { cwd: root, env, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
const files = new Set(['.gitattributes', 'package.json', 'package-lock.json', 'tsconfig.json', 'chat_template.py', 'demo.html', 'recorder.html', 'test-simulation.html']);
const testFiles = new Set(['tools/research/test_annotation_ui.cjs', 'tools/research/test_annotation_media.cjs', 'tools/research/test_extension_update.cjs', 'tools/research/fixtures/review-items.json']);
function allowed(name) { return files.has(name) || testFiles.has(name) || ['extension/', 'src/', 'tools/release/'].some(prefix => name.startsWith(prefix)); }
git(['read-tree', '--empty']);
const entries = git(['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean).map(line => {
  const [metadata, name] = line.split('\t'); const [mode, type, hash] = metadata.split(' ');
  return { mode, type, hash, name };
}).filter(entry => allowed(entry.name));
for (const entry of entries) {
  if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error(`Unsupported release entry: ${entry.name}`);
  if (/\.(js|jsx|ts|py|json|html|md|cjs)$/.test(entry.name)) {
    const content = git(['cat-file', 'blob', entry.hash]);
    if (/\bsk-[A-Za-z0-9_-]{16,}/.test(content)) throw new Error(`Credential pattern in ${entry.name}`);
  }
}
for (const [name, source] of [['README.md', 'tools/release/public-readme.md'], ['.gitignore', 'tools/release/public.gitignore']]) {
  const content = git(['show', `HEAD:${source}`]);
  entries.push({ mode: '100644', type: 'blob', hash: git(['hash-object', '-w', '--stdin'], content).trim(), name });
}
git(['update-index', '-z', '--index-info'], entries.map(e => `${e.mode} ${e.hash}\t${e.name}\0`).join(''));
const tree = git(['write-tree']).trim();
const manifest = { source_commit: git(['rev-parse', 'HEAD']).trim(), tree, file_count: entries.length, paths: entries.map(e => e.name).sort(), exclusions: ['private research directory', 'all output documents and screenshots', 'AGENTS.md', 'CLAUDE.md', 'original attachments', 'prior Git history'], pushed: false };
fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.unlinkSync(env.GIT_INDEX_FILE);
console.log(JSON.stringify(manifest, null, 2));
