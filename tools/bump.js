#!/usr/bin/env node
/* ============================================================
 * GameWorld 版本号维护脚本
 * ------------------------------------------------------------
 * 用法：
 *   node tools/bump.js                        只同步日期 + git hash
 *   node tools/bump.js site   <major|minor|patch>
 *   node tools/bump.js sfs    <major|minor|patch>
 *   node tools/bump.js minecraft <major|minor|patch>
 *   node tools/bump.js pvz    <major|minor|patch>
 *
 * 例子：
 *   node tools/bump.js minecraft major    → 方块世界 2.0.0 变 3.0.0
 *   node tools/bump.js site patch         → 网站 1.0.0 变 1.0.1
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'assets', 'version.js');
const TARGETS = ['site', 'sfs', 'minecraft', 'pvz'];
const KINDS = ['major', 'minor', 'patch'];

function git(args, fallback) {
  try {
    return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return fallback;
  }
}

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function bumpVersion(v, kind) {
  const parts = v.split('.').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) {
    throw new Error('版本号格式不对（应为 1.2.3）：' + v);
  }
  if (kind === 'major') { parts[0] += 1; parts[1] = 0; parts[2] = 0; }
  else if (kind === 'minor') { parts[1] += 1; parts[2] = 0; }
  else { parts[2] += 1; }
  return parts.join('.');
}

function readField(src, name) {
  const m = src.match(new RegExp(name + ':\\s*\'([^\']*)\''));
  if (!m) throw new Error('在 version.js 里找不到字段：' + name);
  return m[1];
}

function writeField(src, name, value) {
  const re = new RegExp('(' + name + ':\\s*)\'[^\']*\'');
  if (!re.test(src)) throw new Error('在 version.js 里找不到字段：' + name);
  return src.replace(re, '$1\'' + value + '\'');
}

// ---- 解析参数 ----
const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?---+/, ''));
  process.exit(0);
}

let target = 'site';
let kind = null;
for (const a of args) {
  if (KINDS.includes(a)) kind = a;
  else if (TARGETS.includes(a)) target = a;
  else {
    console.error('❌ 无法识别的参数：' + a);
    console.error('   可选目标：' + TARGETS.join(' / '));
    console.error('   可选类型：' + KINDS.join(' / '));
    process.exit(1);
  }
}
if (target !== 'site' && !kind) {
  console.error('❌ 指定了 ' + target + ' 但没说要加哪种版本，请补上 major / minor / patch');
  process.exit(1);
}

// ---- 读取并修改 ----
let src = fs.readFileSync(FILE, 'utf8');
const before = readField(src, target);

if (kind) {
  const after = bumpVersion(before, kind);
  src = writeField(src, target, after);
  console.log('🔢 ' + target + '：' + before + '  →  ' + after + '   (' + kind + ')');
}

const today = todayStr();
const hash = git('rev-parse --short HEAD', 'unknown');
src = writeField(src, 'updated', today);
src = writeField(src, 'commit', hash);
console.log('📅 updated：' + today);
console.log('🔗 commit ：' + hash);

fs.writeFileSync(FILE, src, 'utf8');
console.log('\n✅ 已写入 assets/version.js');
console.log('   下一步：git add -A && git commit && git push');
