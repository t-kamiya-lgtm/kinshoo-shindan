// レシピ投稿の4枚組を描く
//
// 公式アカウントのレシピ投稿の構成をそのまま再現している。
//   ① タイトル   … できあがり写真＋黒ラベル＋白の大見出し＋下部の誘導帯
//   ② 材料       … オレンジ帯の見出し＋クリーム地に材料表
//   ③ 作り方     … RECIPE の見出し＋調理時間バッジ＋番号つき手順
//   ④ 締め       … 黒地に THANK YOU FOR READING と保存の誘導
//
// 4枚とも 1080×1350（4:5）で書き出す。カルーセルは全枚同じ比率でないと
// トリミングされるため、ここは固定にしている。

import { FONT, BRAND, roundRect, wrap, setTracking, drawCover, ensureFonts, toBlob } from './composer.js';

export const SLIDES = {
  title: '① タイトル',
  ingredients: '② 材料',
  steps: '③ 作り方',
  outro: '④ 保存の誘導'
};

const W = 1080;
const H = 1350;
const CREAM = '#fbe9dc';
const INK = '#1a1a1a';

/* --------------------------- 下請け --------------------------- */

/** 斜体がない書体なので、変形で傾けて描く */
function drawOblique(ctx, text, x, y, skew = -0.18) {
  ctx.save();
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.fillText(text, x - skew * y, y);
  ctx.restore();
}

/** 中央揃えで複数行。戻り値は使った高さ。 */
function centerLines(ctx, lines, cx, top, lh) {
  let y = top;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lh;
  }
  return lines.length * lh;
}

/** 一部だけ色を変えられる1行。中央揃え。 */
function drawSplitLine(ctx, text, accentPart, cx, y, size, baseColor, accentColor) {
  ctx.font = `700 ${size}px ${FONT}`;
  const total = ctx.measureText(text).width;
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  const idx = accentPart ? text.indexOf(accentPart) : -1;
  const parts = idx < 0
    ? [{ t: text, c: baseColor }]
    : [
        { t: text.slice(0, idx), c: baseColor },
        { t: accentPart, c: accentColor },
        { t: text.slice(idx + accentPart.length), c: baseColor }
      ];
  for (const part of parts) {
    if (!part.t) continue;
    ctx.fillStyle = part.c;
    ctx.fillText(part.t, x, y);
    x += ctx.measureText(part.t).width;
  }
  return total;
}

/** PROTEIN / MONSTER を黒地でない場所に置くとき用（黒＋オレンジ） */
function drawLogoDark(ctx, cx, y, size, accent) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `900 ${size}px ${FONT}`;
  setTracking(ctx, size * 0.02);
  ctx.fillStyle = INK;
  ctx.fillText('PROTEIN', cx, y);
  ctx.fillStyle = accent;
  ctx.fillText('MONSTER', cx, y + size * 1.02);
  setTracking(ctx, 0);
}

/* --------------------------- ① タイトル --------------------------- */

function renderTitle(ctx, r, img, accent, swipeBar) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  if (img) drawCover(ctx, img, W, H, 0.58);

  // 上を少しだけ暗くして文字を読ませる
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  g.addColorStop(0, 'rgba(10,10,10,0.5)');
  g.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H * 0.5);

  const cx = W / 2;
  const pad = W * 0.07;

  // 黒の角丸ラベル（一部オレンジ）。ラベルの無い原稿では省く。
  const labelSize = W * 0.046;
  const boxY = H * 0.085;
  let boxH = 0;
  if (r.label) {
    ctx.font = `700 ${labelSize}px ${FONT}`;
    const labelW = ctx.measureText(r.label).width;
    const padX = labelSize * 0.9;
    const padY = labelSize * 0.5;
    const boxW = labelW + padX * 2;
    boxH = labelSize + padY * 2;
    ctx.fillStyle = 'rgba(20,20,20,0.92)';
    roundRect(ctx, cx - boxW / 2, boxY, boxW, boxH, boxH * 0.42);
    ctx.fill();
    ctx.textBaseline = 'top';
    drawSplitLine(ctx, r.label, r.labelAccent, cx, boxY + padY, labelSize, BRAND.white, accent);
  }

  // 大見出し（黒フチ＋白）
  const titleSize = W * 0.085;
  ctx.font = `900 ${titleSize}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  setTracking(ctx, -titleSize * 0.02);
  const lines = wrap(ctx, r.title, W - pad * 2);
  const lh = titleSize * 1.28;
  const top = boxY + boxH + W * 0.045;
  ctx.lineWidth = titleSize * 0.16;
  ctx.strokeStyle = 'rgba(15,15,15,0.85)';
  ctx.lineJoin = 'round';
  let y = top;
  for (const line of lines) { ctx.strokeText(line, cx, y); y += lh; }
  ctx.fillStyle = BRAND.white;
  y = top;
  for (const line of lines) { ctx.fillText(line, cx, y); y += lh; }
  setTracking(ctx, 0);

  // 下部の誘導帯
  const barSize = W * 0.04;
  ctx.font = `700 ${barSize}px ${FONT}`;
  const barW = ctx.measureText(swipeBar).width + barSize * 2.2;
  const barH = barSize * 2.1;
  const barY = H - W * 0.075 - barH;
  ctx.fillStyle = BRAND.white;
  roundRect(ctx, cx - barW / 2, barY, barW, barH, W * 0.008);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(swipeBar, cx, barY + barH / 2);
}

/* --------------------------- ② 材料 --------------------------- */

function renderIngredients(ctx, r, accent) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const pad = W * 0.085;

  // オレンジ帯の見出し
  const titleSize = W * 0.062;
  ctx.font = `900 ${titleSize}px ${FONT}`;
  const titleLines = wrap(ctx, r.title, W - pad * 2);
  const bandH = titleLines.length * titleSize * 1.28 + W * 0.055;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, bandH);
  ctx.fillStyle = BRAND.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  centerLines(ctx, titleLines, cx, W * 0.028, titleSize * 1.28);

  // 「材料/1人前」
  const headSize = W * 0.05;
  const dotR = headSize * 0.5;
  const headY = bandH + W * 0.075;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(pad + dotR, headY + headSize * 0.5, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `900 ${headSize}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('材料/1人前', pad + dotR * 2 + headSize * 0.45, headY);

  // 材料表
  const rowSize = W * 0.042;
  const rowH = rowSize * 2.05;
  let y = headY + headSize + W * 0.055;
  const tableL = pad + W * 0.03;
  const tableR = W - pad;
  for (const item of r.ingredients) {
    // 品目名が長い行だけ、分量とぶつからないところまで文字を縮める
    let size = rowSize;
    for (let i = 0; i < 6; i++) {
      ctx.font = `700 ${size}px ${FONT}`;
      const kw = ctx.measureText(item.k).width;
      ctx.font = `900 ${size}px ${FONT}`;
      const vw = ctx.measureText(item.v).width;
      if (kw + vw + size * 0.8 <= tableR - tableL) break;
      size *= 0.92;
    }

    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.k, tableL, y + rowH * 0.42);

    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(item.v, tableR, y + rowH * 0.42);

    ctx.strokeStyle = 'rgba(240,130,30,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableL, y + rowH * 0.9);
    ctx.lineTo(tableR, y + rowH * 0.9);
    ctx.stroke();
    y += rowH;
  }

  drawLogoDark(ctx, cx, H - W * 0.235, W * 0.072, accent);
}

/* --------------------------- ③ 作り方 --------------------------- */

function renderSteps(ctx, r, accent) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  const pad = W * 0.085;

  // RECIPE
  const recipeSize = W * 0.105;
  ctx.font = `900 ${recipeSize}px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  setTracking(ctx, -recipeSize * 0.02);
  drawOblique(ctx, 'RECIPE', pad, W * 0.075);
  setTracking(ctx, 0);

  // 調理時間バッジ
  const bR = W * 0.088;
  const bcx = W - pad - bR;
  const bcy = W * 0.075 + bR * 0.75;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, W * 0.0025);
  ctx.beginPath();
  ctx.arc(bcx, bcy, bR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 ${W * 0.026}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('調理時間', bcx, bcy - bR * 0.38);
  ctx.font = `700 ${W * 0.026}px ${FONT}`;
  ctx.fillText('約', bcx - bR * 0.42, bcy + bR * 0.28);
  ctx.font = `900 ${W * 0.062}px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(String(r.minutes), bcx + bR * 0.05, bcy + bR * 0.3);
  ctx.font = `700 ${W * 0.026}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText('分', bcx + bR * 0.52, bcy + bR * 0.45);

  // 手順。行数が多いレシピでもはみ出さないよう、必要なぶんだけ縮める。
  const startY = W * 0.29;
  const avail = H - startY - W * 0.075;
  const gutter = W * 0.105;
  let textSize = W * 0.038;
  let numSize = W * 0.072;
  let lh = textSize * 1.55;
  for (let attempt = 0; attempt < 8; attempt++) {
    ctx.font = `700 ${textSize}px ${FONT}`;
    let total = 0;
    for (const step of r.steps) {
      const n = wrap(ctx, step, W - pad - gutter - pad).length;
      total += Math.max(n * lh, numSize * 1.15) + W * 0.038;
    }
    if (total <= avail) break;
    textSize *= 0.92;
    numSize *= 0.92;
    lh = textSize * 1.55;
  }
  let y = startY;
  ctx.textBaseline = 'top';
  for (let i = 0; i < r.steps.length; i++) {
    ctx.font = `700 ${textSize}px ${FONT}`;
    const lines = wrap(ctx, r.steps[i], W - pad - gutter - pad);
    const blockH = lines.length * lh;

    // 番号（傾け）
    ctx.font = `900 ${numSize}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    drawOblique(ctx, String(i + 1), pad, y);

    // 縦罫線
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, W * 0.004);
    ctx.beginPath();
    ctx.moveTo(pad + gutter - W * 0.028, y + textSize * 0.1);
    ctx.lineTo(pad + gutter - W * 0.028, y + Math.max(blockH, numSize * 1.1) - textSize * 0.1);
    ctx.stroke();

    // 本文
    ctx.font = `700 ${textSize}px ${FONT}`;
    ctx.fillStyle = INK;
    let ty = y;
    for (const line of lines) { ctx.fillText(line, pad + gutter, ty); ty += lh; }

    y += Math.max(blockH, numSize * 1.15) + W * 0.038;
  }
}

/* --------------------------- ④ 締め --------------------------- */

function renderOutro(ctx, outro, accent, thumbs = []) {
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const pad = W * 0.075;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `900 ${W * 0.062}px ${FONT}`;
  ctx.fillStyle = accent;
  setTracking(ctx, W * 0.004);
  ctx.fillText(outro.headingEn, cx, W * 0.085);
  setTracking(ctx, 0);

  ctx.font = `700 ${W * 0.044}px ${FONT}`;
  ctx.fillStyle = BRAND.white;
  ctx.fillText(outro.headingJa, cx, W * 0.085 + W * 0.078);

  // オレンジ枠のボックス
  const boxSize = W * 0.036;
  const boxLh = boxSize * 1.75;
  const boxTop = W * 0.245;
  const boxH = outro.box.length * boxLh + W * 0.075;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, W * 0.003);
  ctx.fillStyle = 'rgba(240,130,30,0.14)';
  roundRect(ctx, pad, boxTop, W - pad * 2, boxH, W * 0.022);
  ctx.fill();
  roundRect(ctx, pad, boxTop, W - pad * 2, boxH, W * 0.022);
  ctx.stroke();
  ctx.font = `500 ${boxSize}px ${FONT}`;
  ctx.fillStyle = BRAND.white;
  centerLines(ctx, outro.box, cx, boxTop + W * 0.037, boxLh);

  // 他投稿のサムネ（あれば3枚）
  const tTop = boxTop + boxH + W * 0.06;
  const tW = (W - pad * 2 - W * 0.03 * 2) / 3;
  const tH = thumbs.length ? tW * 1.25 : 0;
  if (thumbs.length) {
    for (let i = 0; i < Math.min(3, thumbs.length); i++) {
      const x = pad + i * (tW + W * 0.03);
      ctx.save();
      roundRect(ctx, x, tTop, tW, tH, W * 0.012);
      ctx.clip();
      const img = thumbs[i];
      const scale = Math.max(tW / img.width, tH / img.height);
      ctx.drawImage(img, x + (tW - img.width * scale) / 2, tTop + (tH - img.height * scale) / 2,
        img.width * scale, img.height * scale);
      ctx.restore();
    }
  }

  // 保存の誘導
  const ctaY = tTop + tH + W * 0.075;
  ctx.font = `700 ${W * 0.04}px ${FONT}`;
  ctx.fillStyle = BRAND.white;
  ctx.textAlign = 'center';
  ctx.fillText(outro.cta, cx - W * 0.045, ctaY);

  // しおりのかたち
  const bw = W * 0.052;
  const bh = bw * 1.35;
  const bx = cx + W * 0.28;
  const by = ctaY - bh * 0.12;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + bw, by);
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx + bw / 2, by + bh * 0.72);
  ctx.lineTo(bx, by + bh);
  ctx.closePath();
  ctx.fill();
}

/* --------------------------- 本体 --------------------------- */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {'title'|'ingredients'|'steps'|'outro'} slide
 * @param {object} recipe
 * @param {object} opts { heroImg, thumbs, accent, outro, swipeBar }
 */
export async function renderSlide(canvas, slide, recipe, opts = {}) {
  await ensureFonts();
  const accent = opts.accent || BRAND.orange;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.save();
  if (slide === 'title') renderTitle(ctx, recipe, opts.heroImg, accent, opts.swipeBar || '');
  else if (slide === 'ingredients') renderIngredients(ctx, recipe, accent);
  else if (slide === 'steps') renderSteps(ctx, recipe, accent);
  else renderOutro(ctx, opts.outro, accent, opts.thumbs || []);
  ctx.restore();
  return canvas;
}

/** レシピ投稿のキャプション。原稿の文言をそのまま使う。 */
export function buildRecipeCaption(recipe, product, hashtags = []) {
  const n = recipe.nutrition;
  const title = recipe.title.replace(/\n/g, '');
  // 原稿によって「炭水化物」と「糖質」のどちらかしか無いので、あるものを書く
  const carbPart = n.carb !== undefined ? `／炭水化物約${n.carb}g`
    : n.sugar !== undefined ? `／糖質約${n.sugar}g` : '';
  const lines = [
    `${recipe.label}${title}`,
    ''
  ];
  if (recipe.summaryLead) lines.push(recipe.summaryLead);
  lines.push(
    recipe.summary,
    '',
    '【材料（1人前）】',
    ...recipe.ingredients.map((i) => `・${i.k}：${i.v}`),
    '',
    `【作り方】調理時間 約${recipe.minutes}分`,
    ...recipe.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    '【1皿あたりの推定値】',
    `エネルギー約${n.kcal}kcal／たんぱく質約${n.protein}g／脂質約${n.fat}g${carbPart}`,
    `※上記は材料から算出した推定値です。麺そのものの分析値は1食（${product.servingG}g）あたり` +
      `たんぱく質${product.nutrition.protein}g、${product.nutrition.kcal}kcalです。`,
    '',
    '※本品製造工場では、そば・大豆を含む製品を生産しています。豆類にアレルギーのある方はご注意ください。'
  );
  if (hashtags.length) lines.push('', hashtags.join(' '));
  return lines.join('\n');
}

export { W as SLIDE_W, H as SLIDE_H };
