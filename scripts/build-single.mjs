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

// 出力形式。
//   blob    … 各モジュールを Blob URL に戻して import する（既定・GitHub Pages 用）
//   classic … モジュールを1つのスコープに畳んで、ただの <script> にする
// Apps Script はページを独自のサンドボックスで配信するため、blob: からの
// モジュール読み込みが通る保証がない。そちら向けには classic を使う。
const fmtArg = process.argv.indexOf('--format');
const FORMAT = fmtArg > -1 ? process.argv[fmtArg + 1] : 'blob';
if (!['blob', 'classic'].includes(FORMAT)) throw new Error(`未知の --format: ${FORMAT}`);

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

/* ---------------- classic 形式：モジュールを1つのスコープに畳む ----------------
   ES モジュールが使えない環境（Apps Script のサンドボックスなど）向け。
   import / export の行だけを機械的に書き換え、それ以外のコードには触らない。 */

/** 1モジュールを「呼ぶと exports を返す関数」の本体へ変換する */
function toClassicFactory(modPath, code) {
  const exported = new Map(); // 公開名 → モジュール内の識別子
  let body = code;

  // import * as ns from 'X'
  body = body.replace(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+'__MOD__(.+?)__'\s*;?/g,
    (_m, ns, dep) => `const ${ns} = __req(${JSON.stringify(dep)});`);

  // import { a, b as c } from 'X'   （複数行にまたがる書き方も拾う）
  body = body.replace(/import\s*\{([\s\S]*?)\}\s*from\s+'__MOD__(.+?)__'\s*;?/g, (_m, names, dep) => {
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const as = n.split(/\s+as\s+/);
      return as.length === 2 ? `${as[0].trim()}: ${as[1].trim()}` : n;
    });
    return `const { ${binds.join(', ')} } = __req(${JSON.stringify(dep)});`;
  });

  // 副作用だけの import 'X'
  body = body.replace(/import\s+'__MOD__(.+?)__'\s*;?/g,
    (_m, dep) => `__req(${JSON.stringify(dep)});`);

  // 動的 import('X') は、既に読み込み済みのモジュールを Promise で返すだけにする
  body = body.replace(/import\s*\(\s*'__MOD__(.+?)__'\s*\)/g,
    (_m, dep) => `Promise.resolve(__req(${JSON.stringify(dep)}))`);

  // export { a, b as c };
  body = body.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_m, names) => {
    for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) {
      const as = n.split(/\s+as\s+/);
      if (as.length === 2) exported.set(as[1].trim(), as[0].trim());
      else exported.set(n, n);
    }
    return '';
  });

  // export const / let / var / function / async function / class
  body = body.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    (_m, kind, name) => {
      exported.set(name, name);
      return `${kind} ${name}`;
    });

  // 行コメントに URL を書くと、Apps Script の配信処理（document.write）が
  // SyntaxError で止まり、スクリプトが丸ごと実行されなくなる。ここで弾く。
  const urlComment = body.split('\n').find((l) => /^\s*\/\/.*:\/\//.test(l));
  if (urlComment) {
    throw new Error(`${modPath}: 行コメントに URL があります（Apps Script で読み込めなくなります）: ${urlComment.trim().slice(0, 60)}`);
  }

  if (/^\s*export\s/m.test(body)) {
    throw new Error(`${modPath}: 変換できない export が残っています`);
  }
  if (/^\s*import\s/m.test(body)) {
    throw new Error(`${modPath}: 変換できない import が残っています`);
  }

  const ret = [...exported.entries()].map(([name, local]) => `    ${JSON.stringify(name)}: ${local}`).join(',\n');
  return { body, ret, names: [...exported.keys()] };
}

/** <script> の中の JS 文字列として安全に埋める */
function embed(value) {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const srcObject = `{\n${order.map((p) => `  ${embed(p)}: ${embed(sources.get(p))}`).join(',\n')}\n}`;

const HEADER = `/* このファイルは scripts/build-single.mjs が生成しています。直接編集しないでください。
   直すのは sns/ の中の元ファイルで、そのあと build-single.mjs を回してください。 */`;

// 変換後の本体。書き出し前の検証で、これが欠けずに入っているかを確かめる。
const classicBodies = new Map();

/** classic：全モジュールを1つの <script> に畳む */
function buildClassicLoader() {
  const factories = order.map((p) => {
    const { body, ret } = toClassicFactory(p, sources.get(p));
    classicBodies.set(p, body);
    return `__def(${JSON.stringify(p)}, function (__req) {\n${body}\n  return {\n${ret}\n  };\n});`;
  });

  return `<script>
${HEADER}
(function () {
  'use strict';
  var __factories = {}, __cache = {};
  function __def(name, fn) { __factories[name] = fn; }
  function __req(name) {
    if (__cache[name]) return __cache[name];
    var fn = __factories[name];
    if (!fn) throw new Error('モジュールがありません: ' + name);
    // 循環参照に備えて、実行前に器を登録しておく
    var exports = __cache[name] = {};
    var real = fn(__req);
    for (var k in real) exports[k] = real[k];
    return exports;
  }
  try {
${factories.join('\n')}
    __req(${JSON.stringify(ENTRY)});
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="notice danger" style="margin:16px">読み込みに失敗しました。<pre style="white-space:pre-wrap">' +
        String(err && err.stack ? err.stack : err).replace(/[&<]/g, function (c) { return c === '&' ? '&amp;' : '&lt;'; }) +
        '</pre></div>'
    );
  }
})();
</script>`;
}

const blobLoader = `<script type="module">
${HEADER}
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

/* ---------------- 版の印 ----------------
   どのファイルを見ているのかを画面から判別できるようにする。
   JavaScript が動かない状態でも見えるよう、HTML に直接書き込む。 */
const stampArg = process.argv.indexOf('--stamp');
const STAMP = stampArg > -1 ? process.argv[stampArg + 1] : new Date().toISOString().slice(0, 16).replace('T', ' ');
const subTag = /<p class="brand-sub">([^<]*)<\/p>/;
if (!subTag.test(out)) throw new Error('index.html に brand-sub が見つかりません');
out = out.replace(subTag, () =>
  `<p class="brand-sub">PROTEIN MONSTER / SOVA<span class="build-stamp">版 ${STAMP}（${FORMAT}）</span></p>`);

// 差し込みは必ず関数で行う。文字列を渡すと $$ や $& が置換の特殊記法として
// 解釈され、埋め込むコードが黙って書き換わる（app.js の `const $$` が
// `const $` になり、構文エラーになった）。
const cssTag = /<link rel="stylesheet" href="\.\/style\.css">/;
if (!cssTag.test(out)) throw new Error('index.html に style.css の link が見つかりません');
out = out.replace(cssTag, () => `<style>\n${css}\n</style>`);

const scriptTag = /<script type="module" src="\.\/app\.js"><\/script>/;
if (!scriptTag.test(out)) throw new Error('index.html に app.js の script が見つかりません');
const loader = FORMAT === 'classic' ? buildClassicLoader() : blobLoader;
out = out.replace(scriptTag, () => loader);

// 外部ファイルへの参照が残っていないか確かめる（残っていたら1ファイルで完結しない）
const leftover = [...out.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
if (leftover.length) throw new Error(`外部ファイルの参照が残っています: ${leftover.join(', ')}`);

/* ---------------- 埋め込んだコードが1バイトも変わっていないか確かめる ----------------
   埋め込みの途中でコードが黙って書き換わると、原因の分かりにくい構文エラーになる。
   書き出す前に、出力からソースを取り出し直して元と突き合わせる。 */
if (FORMAT === 'blob') {
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

// classic は import/export 行を書き換えるので1バイト一致では検証できない。
// 代わりに、全モジュールの本体が出力に含まれているかを行単位で確かめる。
if (FORMAT === 'classic') {
  for (const p of order) {
    const lines = (classicBodies.get(p) || '').split('\n').filter((l) => l.trim().length > 20);
    if (!lines.length) throw new Error(`検証に失敗: ${p} の本体が空です`);
    const missing = lines.filter((l) => !out.includes(l));
    if (missing.length) {
      throw new Error(`検証に失敗: ${p} の ${missing.length}行が出力に見当たりません（例: ${missing[0].trim().slice(0, 50)}）`);
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`${OUT} を書き出しました（${kb}KB / モジュール ${order.length}本 / 形式 ${FORMAT}）`);
console.log(`読み込み順: ${order.join(' → ')}`);
