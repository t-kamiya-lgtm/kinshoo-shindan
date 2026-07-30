// 投稿案の生成エンジン
//
// ブラウザ（ダッシュボード）と Node（毎朝のメール通知）の両方から読み込む。
// 日付をシードにした決定的な乱数を使うので、同じ日付なら誰がどこで実行しても
// まったく同じ提案になる。メール本文とダッシュボードの表示が食い違わないのはこのため。

import { PRODUCTS, COMMON } from './data/products.js';
import {
  AXES, HOOKS, BODIES, BODIES_X, CLOSINGS, CLOSINGS_X,
  ALLERGY_NOTE, HASHTAGS, OVERLAYS
} from './data/copy.js';
import { checkCompliance } from './compliance.js';

/* -------------------------- 決定的乱数 -------------------------- */

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 */
export function makeRng(seedStr) {
  let a = hashString(seedStr);
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function pickMany(rng, arr, count) {
  const pool = [...arr];
  const out = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

/* -------------------------- 日付ユーティリティ -------------------------- */

/** JST の YYYY-MM-DD。ローテーションはこれを基準にする。 */
export function jstDateKey(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

function dayIndex(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/* -------------------------- ハッシュタグ -------------------------- */

export function buildHashtags(rng, { sku, axis, platform }) {
  if (platform === 'x') {
    // X は本文が主役。タグは2〜3個に絞る。
    const base = ['#プロテインモンスター'];
    const extra = pickMany(rng, HASHTAGS.byAxis[axis], 2);
    return [...base, ...extra];
  }
  // Instagram は 20 個前後。core → SKU → 軸 の順で埋める。
  const tags = [...HASHTAGS.core, ...HASHTAGS.bySku[sku]];
  const axisTags = pickMany(rng, HASHTAGS.byAxis[axis], HASHTAGS.byAxis[axis].length);
  const otherAxes = AXES.filter((a) => a.id !== axis);
  const spice = pickMany(rng, otherAxes.flatMap((a) => HASHTAGS.byAxis[a.id]), 4);
  const merged = [];
  for (const t of [...tags, ...axisTags, ...spice]) {
    if (!merged.includes(t)) merged.push(t);
    if (merged.length >= 20) break;
  }
  return merged;
}

/* -------------------------- キャプション -------------------------- */

function buildCaption(rng, { product, axis, platform }) {
  const p = product;
  const n = p.nutrition;
  const hook = pick(rng, HOOKS[axis])(p, n);
  const bodyBlocks = BODIES[axis](p, n, COMMON);

  if (platform === 'x') {
    // 日本語主体の投稿として 140 字前後に収める。本文は専用の1行版を使う。
    const closing = pick(rng, CLOSINGS_X);
    const body = pick(rng, BODIES_X[axis](p, n));
    return [hook, '', body, '', closing].join('\n');
  }

  const closing = pick(rng, CLOSINGS);
  const parts = [hook, '', bodyBlocks.join('\n\n'), '', closing, '', ALLERGY_NOTE, COMMON.disclaimers.nutrition];
  return parts.join('\n');
}

/* -------------------------- 画像プラン -------------------------- */

/**
 * 画像の使い方を決める。
 * mode 'composite' = 写真にコピーを合成 / 'raw' = 写真そのまま
 * 実際にどのファイルを使うかは、ダッシュボード側が画像ライブラリのタグと
 * このプランの好みタグを突き合わせて決める（library.js の pickImage）。
 */
function buildImagePlan(rng, { product, axis, platform }) {
  const mode = rng() < 0.5 ? 'composite' : 'raw';
  // 文字は「そのまま」の案でも用意しておく。ダッシュボードで「文字を載せる」に
  // 切り替えたときに、載せる文字が無いと何も起きないため。
  const overlay = pick(rng, OVERLAYS[axis])(product, product.nutrition);

  // 軸ごとに相性のよい被写体
  const preferScene = {
    workout: ['cooked', 'raw', 'package'],
    diet: ['cooked', 'lifestyle', 'package'],
    time: ['cooking', 'cooked', 'lifestyle'],
    trust: ['raw', 'package', 'ingredient']
  }[axis];

  return {
    mode,
    overlay,
    // 書き出し比率はダッシュボードの設定で決める（投稿ごとに個別変更も可）。
    preferScene,
    preferSku: product.id,
    // 合成する場合、文字を置く側に余白のある写真を優先する
    preferSpace: overlay.template === 'stat' ? 'space-bottom' : 'space-top'
  };
}

/* -------------------------- 1件の投稿案 -------------------------- */

/**
 * @param {boolean} sync true なら媒体をシードに含めない。
 *   こうすると Instagram と X で 訴求軸・SKU・フック・画像の文字が一致し、
 *   「同じ投稿の媒体別バージョン」になる。false なら媒体ごとに独立して振る。
 */
function buildProposal(dateKey, platform, variant = 0, salt = 0, sync = true) {
  const seed = sync
    ? `${dateKey}|${variant}|${salt}`
    : `${dateKey}|${platform}|${variant}|${salt}`;
  const rng = makeRng(seed);

  // 軸は日ごとにローテーション。variant を足して、別案は別の軸になるようにする。
  const axis = AXES[(dayIndex(dateKey) + variant) % AXES.length].id;
  const axisDef = AXES.find((a) => a.id === axis);

  // SKU は軸の相性を7割、残り3割はランダム。どちらか一方に特化させる。
  let skuId;
  if (axisDef.skuBias && rng() < 0.7) skuId = axisDef.skuBias;
  else skuId = rng() < 0.5 ? 'monster' : 'sova';
  const product = PRODUCTS[skuId];

  // 画像プランを先に決めるのは、乱数の消費順を媒体間でそろえるため。
  // キャプションは媒体で長さが違い、引く回数も変わるので、後ろに置く。
  const image = buildImagePlan(rng, { product, axis, platform });
  const caption = buildCaption(rng, { product, axis, platform });
  const hashtags = buildHashtags(rng, { sku: skuId, axis, platform });

  const fullText = platform === 'ig'
    ? `${caption}\n\n${hashtags.join(' ')}`
    : `${caption}\n\n${hashtags.join(' ')}`;

  return {
    id: `${dateKey}-${platform}-${variant}`,
    dateKey,
    platform,          // 'ig' | 'x'
    variant,
    axis,
    axisLabel: axisDef.label,
    sku: skuId,
    skuLabel: product.nameJa,
    caption,
    hashtags,
    fullText,
    charCount: [...fullText].length,
    image,
    compliance: checkCompliance(fullText)
  };
}

/**
 * その日の提案一式。
 * Instagram 1本 + X 1本を既定とし、それぞれ別案を variant で出せる。
 */
export function generateDailyPlan(dateKey = jstDateKey(), variants = { ig: 0, x: 0 }, opts = {}) {
  const sync = opts.sync !== false; // 既定は「そろえる」
  const ig = buildProposal(dateKey, 'ig', variants.ig || 0, 0, sync);
  let x = buildProposal(dateKey, 'x', variants.x || 0, 0, sync);

  // 独立生成のときだけ、2本が同じ書き出しになるのを避ける。
  // そろえる設定では一致しているのが正しい状態なので何もしない。
  if (!sync) {
    const firstLine = (p) => p.caption.split('\n')[0];
    for (let salt = 1; salt <= 8 && firstLine(x) === firstLine(ig); salt++) {
      x = buildProposal(dateKey, 'x', variants.x || 0, salt, false);
    }
  }

  return { dateKey, sync, generatedAt: new Date().toISOString(), posts: [ig, x] };
}

export { buildProposal, AXES, PRODUCTS };
