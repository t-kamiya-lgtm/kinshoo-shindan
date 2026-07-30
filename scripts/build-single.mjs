#!/usr/bin/env node
// ダッシュボードを1枚の index.html に固める。
//
// なぜ必要か：GitHub の「Upload files」で16ファイルを手作業で上げ続けると、
// ファイル名と中身が入れ違う事故が起きる（実際に index.html の中身が
// composer.js になり、サイトがソースコードを表示する状態になった）。
// アップロードするファイルが1つなら、その事故は原理的に起きない。
//
// 中身の書き換えはしない。各モジュールのソースをそのまま埋め込み、
// ブラウザ側で Blob URL を作って import し直すだけなので、
// ES モジュールの意味（名前空間・ライブバインディング・循環の扱い）は元のまま。
// ソースを加工しないので、ここが原因で挙動が変わることがない。
//
//   node scripts/build-single.mjs            → sns/dist/index.html
//   node scripts/build-single.mjs --out FILE  出力先を変える

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(HERE, '..', 'sns');
const ENTRY = 'app.js';

const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? process.argv[outArg + 1] : path.join(SRC_DIR, 'dist', 'index.html');

/** './x.js' を、その import を書いた側のパスから見て解決する */
function resolveSpec(fromPath, spec) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
}

// 静的 import と 動的 import() の両方を拾う。相対指定（./ か ../）だけが対象。
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g;

function depsOf(code, selfPath) {
  const out = [];
  for (const m of code.matchAll(SPEC_RE)) out.push(resolveSpec(selfPath, m[3]));
  return out;
}

/* ---------------- モジュールを辿って集める ---------------- */

const sources = new Map(); // path → 書き換え後のソース
const deps = new Map(); // path → 依存パス[]

function collect(modPath) {
  if (sources.has(modPath)) return;
  const abs = path.join(SRC_DIR, modPath);
  if (!fs.existsSync(abs)) throw new Error(`モジュールが見つかりません: ${modPath}`);
  const raw = fs.readFileSync(abs, 'utf8');

  // import 先を、実行時に Blob URL へ差し替えるための目印に置き換える
  const rewritten = raw.replace(SPEC_RE, (_all, pre, q, spec) => `${pre}${q}__MOD__${resolveSpec(modPath, spec)}__${q}`);

  sources.set(modPath, rewritten);
  const d = depsOf(raw, modPath);
  deps.set(modPath, d);
  d.forEach(collect);
}

collect(ENTRY);

/* ---------------- 依存の浅い順に並べる ---------------- */

const order = [];
const state = new Map(); // 'visiting' | 'done'
function visit(p) {
  const s = state.get(p);
  if (s === 'done') return;
  if (s === 'visiting') return; // 循環しても Blob URL の生成順だけの問題なので進める
  state.set(p, 'visiting');
  for (const d of deps.get(p) || []) visit(d);
  state.set(p, 'done');
  order.push(p);
}
visit(ENTRY);

/* ---------------- HTML を組む ---------------- */

const html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC_DIR, 'style.css'), 'utf8');

/** <script> の中の JS 文字列として安全に埋める */
function embed(value) {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const srcObject = `{\n${order.map((p) => `  ${embed(p)}: ${embed(sources.get(p))}`).join(',\n')}\n}`;

const loader = `<script type="module">
/* このファイルは scripts/build-single.mjs が生成しています。直接編集しないでください。
   直すのは sns/ の中の元ファイルで、そのあと build-single.mjs を回してください。 */
const SRC = ${srcObject};
const ORDER = ${embed(order).replace(/","/g, '", "')};
const urls = Object.create(null);
for (const p of ORDER) {
  const code = SRC[p].replace(/__MOD__(.+?)__/g, (_m, dep) => urls[dep] || dep);
  urls[p] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}
try {
  await import(urls[${embed(ENTRY)}]);
} catch (err) {
  console.error(err);
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div class="notice danger" style="margin:16px">読み込みに失敗しました。<pre style="white-space:pre-wrap">' +
      String(err && err.stack ? err.stack : err).replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;')) +
      '</pre></div>'
  );
}
</script>`;

let out = html;

// 差し込みは必ず関数で行う。文字列を渡すと $$ や $& が置換の特殊記法として
// 解釈され、埋め込むコードが黙って書き換わる（app.js の `const $$` が
// `const $` になり、構文エラーになった）。
const cssTag = /<link rel="stylesheet" href="\.\/style\.css">/;
if (!cssTag.test(out)) throw new Error('index.html に style.css の link が見つかりません');
out = out.replace(cssTag, () => `<style>\n${css}\n</style>`);

const scriptTag = /<script type="module" src="\.\/app\.js"><\/script>/;
if (!scriptTag.test(out)) throw new Error('index.html に app.js の script が見つかりません');
out = out.replace(scriptTag, () => loader);

// 外部ファイルへの参照が残っていないか確かめる（残っていたら1ファイルで完結しない）
const leftover = [...out.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
if (leftover.length) throw new Error(`外部ファイルの参照が残っています: ${leftover.join(', ')}`);

/* ---------------- 埋め込んだコードが1バイトも変わっていないか確かめる ----------------
   埋め込みの途中でコードが黙って書き換わると、原因の分かりにくい構文エラーになる。
   書き出す前に、出力からソースを取り出し直して元と突き合わせる。 */
{
  const m = out.match(/\nconst SRC = (\{[\s\S]*?\n\});\nconst ORDER = /);
  if (!m) throw new Error('検証できません: 出力から SRC を取り出せませんでした');
  // 生成したのは自分なので、そのまま JS の値として読み戻す
  const readBack = new Function(`return (${m[1]});`)();
  for (const p of order) {
    if (readBack[p] !== sources.get(p)) {
      throw new Error(`検証に失敗: ${p} の中身が埋め込みの途中で変わっています`);
    }
  }
  if (Object.keys(readBack).length !== order.length) {
    throw new Error('検証に失敗: 埋め込んだモジュールの数が合いません');
  }
  const cssBack = out.match(/<style>\n([\s\S]*?)\n<\/style>/);
  if (!cssBack || cssBack[1] !== css) throw new Error('検証に失敗: CSS の中身が変わっています');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`${OUT} を書き出しました（${kb}KB / モジュール ${order.length}本）`);
console.log(`読み込み順: ${order.join(' → ')}`);
