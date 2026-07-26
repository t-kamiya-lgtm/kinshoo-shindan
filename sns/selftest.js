// 生成エンジンの自己診断。
//   node sns/selftest.js
// 365日 × 変奏4通り × 2媒体を総当たりし、
//   1) 薬機法・景表法チェッカーに引っかかる文面が生成されないこと
//   2) X の文字数が上限に収まること
// を確認する。素材ライブラリ（copy.js）を編集したら必ず実行すること。

import { generateDailyPlan, jstDateKey } from './engine.js';

const X_LIMIT = 280;        // X の全角換算上限（日本語は1文字2カウントだが、ここでは安全側で文字数で見る）
const X_SAFE_CHARS = 135;   // 日本語主体の投稿として安全な文字数
const IG_LIMIT = 2200;

let errors = 0;
let warnCount = 0;
const seenAxes = new Set();
const seenSkus = new Set();
let compositeCount = 0;
let rawCount = 0;
let total = 0;

const start = new Date('2026-01-01T00:00:00Z');
for (let d = 0; d < 365; d++) {
  const dateKey = jstDateKey(new Date(start.getTime() + d * 86400000));
  for (let v = 0; v < 4; v++) {
    const plan = generateDailyPlan(dateKey, { ig: v, x: v });
    for (const post of plan.posts) {
      total++;
      seenAxes.add(post.axis);
      seenSkus.add(post.sku);
      if (post.image.mode === 'composite') compositeCount++; else rawCount++;

      if (!post.compliance.ok) {
        errors++;
        console.error(`\n[NG] ${post.id} (${post.axisLabel} / ${post.skuLabel})`);
        for (const b of post.compliance.blocks) {
          console.error(`   ${b.law}: 「${b.matched}」 — ${b.reason}`);
        }
        console.error('   ---');
        console.error('   ' + post.fullText.replace(/\n/g, '\n   '));
      }
      warnCount += post.compliance.warns.length;

      if (post.platform === 'x' && post.charCount > X_SAFE_CHARS) {
        errors++;
        console.error(`\n[長さ超過] ${post.id}: ${post.charCount}字 > ${X_SAFE_CHARS}字`);
        console.error('   ' + post.fullText.replace(/\n/g, '\n   '));
      }
      if (post.platform === 'ig' && post.charCount > IG_LIMIT) {
        errors++;
        console.error(`\n[長さ超過] ${post.id}: ${post.charCount}字 > ${IG_LIMIT}字`);
      }
      if (post.platform === 'ig' && post.hashtags.length > 30) {
        errors++;
        console.error(`\n[タグ超過] ${post.id}: ${post.hashtags.length}個`);
      }
      // 画像に載せる文字も検査対象
      if (post.image.overlay) {
        const ov = post.image.overlay;
        const t = [ov.big, ov.label, ov.sub, ...(ov.items || []).map((i) => `${i.k}${i.v}`)]
          .filter(Boolean).join(' ');
        const r = (await import('./compliance.js')).checkCompliance(t);
        if (!r.ok) {
          errors++;
          console.error(`\n[画像文字NG] ${post.id}: ${t}`);
          r.blocks.forEach((b) => console.error(`   ${b.law}: 「${b.matched}」`));
        }
      }
    }
  }
}

console.log(`\n検査した投稿案: ${total}件`);
console.log(`使われた訴求軸: ${[...seenAxes].join(', ')}`);
console.log(`使われたSKU: ${[...seenSkus].join(', ')}`);
console.log(`画像モード: 合成 ${compositeCount}件 / そのまま ${rawCount}件`);
console.log(`警告（要確認）: 延べ ${warnCount}件`);
console.log(errors === 0 ? '\n✅ 法令チェック・文字数チェックともに問題なし' : `\n❌ ${errors}件の問題`);
process.exit(errors === 0 ? 0 : 1);
