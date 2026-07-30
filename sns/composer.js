// 投稿画像の合成
//
// 実際の @protein.monster_official の投稿デザインに合わせている。
//   ・左上にロゴロックアップ（PROTEIN 白 / MONSTER オレンジの2段）
//   ・オレンジの角丸ラベルで前置き
//   ・スペックのチップを横並び
//   ・数値訴求はオレンジの帯に白の極太数字
//   ・写真の上に暗いグラデーションを敷いて文字を読ませる
//
// フォントは Web フォントの読み込み完了を待ってから描く（待たないと別書体で描かれる）。

export const ASPECTS = {
  '4:5': { w: 1080, h: 1350, label: '縦 4:5（Instagram推奨）' },
  '1:1': { w: 1080, h: 1080, label: '正方形 1:1' },
  '16:9': { w: 1200, h: 675, label: '横 16:9（X推奨）' }
};

export const TEMPLATES = {
  stat: '数値主役（大きな数字＋オレンジ帯）',
  hook: 'コピー主役（見出し2行）',
  band: '上下帯（ロゴ帯＋コピー帯）'
};

const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';

// ブランドの基本色。accent は設定で変更できる。
export const BRAND = {
  orange: '#f0821e',
  ink: '#111111',
  white: '#ffffff'
};

let fontsReady = null;
export function ensureFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load('900 120px "Noto Sans JP"'),
        document.fonts.load('700 48px "Noto Sans JP"'),
        document.fonts.load('500 32px "Noto Sans JP"'),
        document.fonts.load('400 28px "Noto Sans JP"')
      ]);
      await document.fonts.ready;
    } catch {
      /* 読めなくても既定書体で描く */
    }
  })();
  return fontsReady;
}

export async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fallthrough */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/* ------------------------- 描画の下請け ------------------------- */

function drawCover(ctx, img, W, H, focus = 0.5) {
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) * focus, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 日本語は単語境界がないので1文字ずつ測って折り返す */
function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    out.push(line);
  }
  return out;
}

/** 下から上へ暗くするグラデーション。写真の上の文字を読ませるため。 */
function scrimBottom(ctx, W, H, fromRatio, strength = 0.86) {
  const top = fromRatio * H;
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, 'rgba(8,8,8,0)');
  g.addColorStop(0.45, `rgba(8,8,8,${strength * 0.62})`);
  g.addColorStop(1, `rgba(8,8,8,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, H - top);
}

function scrimTop(ctx, W, H, toRatio, strength = 0.7) {
  const bottom = toRatio * H;
  const g = ctx.createLinearGradient(0, 0, 0, bottom);
  g.addColorStop(0, `rgba(8,8,8,${strength})`);
  g.addColorStop(1, 'rgba(8,8,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, bottom);
}

function setTracking(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

/** PROTEIN / MONSTER の2段ロゴ。戻り値は占有した高さ。 */
function drawLogo(ctx, x, y, W, accent, scale = 1) {
  const size = W * 0.036 * scale;
  const lh = size * 1.02;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `900 ${size}px ${FONT}`;
  setTracking(ctx, size * 0.02);
  ctx.fillStyle = BRAND.white;
  ctx.fillText('PROTEIN', x, y);
  ctx.fillStyle = accent;
  ctx.fillText('MONSTER', x, y + lh);
  setTracking(ctx, 0);
  return lh * 2;
}

/** オレンジの角丸ラベル。戻り値は占有した高さ。 */
function drawEyebrow(ctx, text, x, y, W, accent) {
  if (!text) return 0;
  const size = W * 0.03;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const padX = size * 0.7;
  const padY = size * 0.42;
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padY * 2;
  ctx.fillStyle = accent;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = BRAND.white;
  ctx.fillText(text, x + padX, y + padY);
  return h;
}

/** スペックのチップを横並び。戻り値は占有した高さ。 */
function drawChips(ctx, chips, x, y, W, maxW, accent) {
  if (!chips || !chips.length) return 0;
  const size = W * 0.031;
  const padX = size * 0.85;
  const padY = size * 0.5;
  const h = size + padY * 2;
  const gap = size * 0.5;

  let cx = x;
  let cy = y;
  let rows = 1;
  for (const chip of chips) {
    const label = chip.k;
    const value = chip.v;
    ctx.font = `500 ${size}px ${FONT}`;
    const lw = ctx.measureText(label + ' ').width;
    ctx.font = `700 ${size}px ${FONT}`;
    const vw = ctx.measureText(value).width;
    const w = lw + vw + padX * 2;

    if (cx > x && cx + w > x + maxW) {
      cx = x;
      cy += h + gap;
      rows++;
    }

    ctx.fillStyle = 'rgba(10,10,10,0.72)';
    roundRect(ctx, cx, cy, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.5, W * 0.0018);
    roundRect(ctx, cx, cy, w, h, h / 2);
    ctx.stroke();

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = `500 ${size}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(label, cx + padX, cy + padY);
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(value, cx + padX + lw, cy + padY);

    cx += w + gap;
  }
  return rows * h + (rows - 1) * gap;
}

/* ------------------------- テンプレート ------------------------- */

function renderStat(ctx, ov, geo, accent) {
  const { W, H, pad } = geo;
  scrimBottom(ctx, W, H, 0.34);
  scrimTop(ctx, W, H, 0.22, 0.55);

  drawLogo(ctx, pad, pad, W, accent);

  // 下から積み上げる
  let bottom = H - pad;

  const chipsH = measureChips(ctx, ov.chips, W, W - pad * 2);
  if (chipsH) {
    drawChips(ctx, ov.chips, pad, bottom - chipsH, W, W - pad * 2, accent);
    bottom -= chipsH + W * 0.035;
  }

  // 「の衝撃を。」のような後置き
  if (ov.suffix) {
    const s = W * 0.048;
    ctx.font = `700 ${s}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = BRAND.white;
    ctx.fillText(ov.suffix, pad, bottom);
    bottom -= s * 1.5;
  }

  // オレンジ帯＋極太数字
  const numSize = W * 0.235;
  ctx.font = `900 ${numSize}px ${FONT}`;
  setTracking(ctx, -numSize * 0.02);
  const numW = ctx.measureText(ov.big || '').width;
  const bandH = numSize * 1.16;
  const bandPad = numSize * 0.11;
  const bandY = bottom - bandH;
  ctx.fillStyle = accent;
  roundRect(ctx, pad, bandY, numW + bandPad * 2, bandH, W * 0.014);
  ctx.fill();
  ctx.fillStyle = BRAND.white;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(ov.big || '', pad + bandPad, bandY + bandH * 0.52);
  setTracking(ctx, 0);
  bottom = bandY - W * 0.022;

  // 数字の上の小見出し
  if (ov.lead) {
    const s = W * 0.058;
    ctx.font = `700 ${s}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const lines = wrap(ctx, ov.lead, W - pad * 2);
    let y = bottom - (lines.length - 1) * s * 1.32;
    ctx.fillStyle = BRAND.white;
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += s * 1.32;
    }
    bottom -= lines.length * s * 1.32;
  }

  if (ov.eyebrow) {
    const s = W * 0.03;
    const h = s + s * 0.84;
    drawEyebrow(ctx, ov.eyebrow, pad, bottom - h - W * 0.02, W, accent);
  }
}

function renderHook(ctx, ov, geo, accent) {
  const { W, H, pad } = geo;
  scrimBottom(ctx, W, H, 0.3);
  scrimTop(ctx, W, H, 0.22, 0.55);

  drawLogo(ctx, pad, pad, W, accent);

  let bottom = H - pad;

  const chipsH = measureChips(ctx, ov.chips, W, W - pad * 2);
  if (chipsH) {
    drawChips(ctx, ov.chips, pad, bottom - chipsH, W, W - pad * 2, accent);
    bottom -= chipsH + W * 0.04;
  }

  if (ov.sub) {
    const s = W * 0.038;
    ctx.font = `500 ${s}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const lines = wrap(ctx, ov.sub, W - pad * 2);
    let y = bottom;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = lines.length - 1; i >= 0; i--) {
      ctx.fillText(lines[i], pad, y);
      y -= s * 1.5;
    }
    bottom -= lines.length * s * 1.5 + W * 0.012;
  }

  // 見出し
  const s = W * 0.092;
  ctx.font = `900 ${s}px ${FONT}`;
  setTracking(ctx, -s * 0.015);
  const lines = wrap(ctx, ov.big, W - pad * 2 - W * 0.04);
  const lh = s * 1.34;
  let y = bottom - (lines.length - 1) * lh;
  const blockTop = y - s * 0.86;

  // 見出しの左にアクセントの縦線
  ctx.fillStyle = accent;
  ctx.fillRect(pad, blockTop + s * 0.18, W * 0.011, lines.length * lh - s * 0.34);

  ctx.fillStyle = BRAND.white;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const line of lines) {
    ctx.fillText(line, pad + W * 0.042, y);
    y += lh;
  }
  setTracking(ctx, 0);

  if (ov.eyebrow) {
    const eh = W * 0.03 + W * 0.03 * 0.84;
    drawEyebrow(ctx, ov.eyebrow, pad, blockTop - eh - W * 0.028, W, accent);
  }
}

function renderBand(ctx, ov, geo, accent) {
  const { W, H, pad } = geo;

  // 上帯：ロゴと前置き
  const topH = W * 0.14;
  ctx.fillStyle = 'rgba(8,8,8,0.9)';
  ctx.fillRect(0, 0, W, topH);
  const logoH = drawLogo(ctx, pad, (topH - W * 0.036 * 2.04) / 2, W, accent);
  if (ov.eyebrow) {
    const s = W * 0.03;
    ctx.font = `700 ${s}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(ov.eyebrow, W - pad, topH / 2);
    ctx.textAlign = 'left';
  }

  // 下帯：見出し・小見出し・チップ
  const headSize = W * 0.062;
  ctx.font = `900 ${headSize}px ${FONT}`;
  const headLines = wrap(ctx, ov.big, W - pad * 2);
  const headLh = headSize * 1.3;
  ctx.font = `500 ${W * 0.034}px ${FONT}`;
  const subLines = ov.sub ? wrap(ctx, ov.sub, W - pad * 2) : [];
  const subLh = W * 0.034 * 1.55;
  const chipsH = measureChips(ctx, ov.chips, W, W - pad * 2);

  const inner = W * 0.042;
  const bandH =
    inner * 2 +
    headLines.length * headLh +
    (subLines.length ? subLines.length * subLh + W * 0.012 : 0) +
    (chipsH ? chipsH + W * 0.03 : 0);
  const bandY = H - bandH;
  ctx.fillStyle = 'rgba(8,8,8,0.9)';
  ctx.fillRect(0, bandY, W, bandH);

  let y = bandY + inner;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `900 ${headSize}px ${FONT}`;
  setTracking(ctx, -headSize * 0.015);
  ctx.fillStyle = BRAND.white;
  for (const line of headLines) {
    ctx.fillText(line, pad, y);
    y += headLh;
  }
  setTracking(ctx, 0);

  if (subLines.length) {
    y += W * 0.012;
    ctx.font = `500 ${W * 0.034}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const line of subLines) {
      ctx.fillText(line, pad, y);
      y += subLh;
    }
  }

  if (chipsH) {
    y += W * 0.03;
    drawChips(ctx, ov.chips, pad, y, W, W - pad * 2, accent);
  }
}

/** チップの占有高さだけを測る（レイアウトを下から積むため） */
function measureChips(ctx, chips, W, maxW) {
  if (!chips || !chips.length) return 0;
  const size = W * 0.031;
  const padX = size * 0.85;
  const h = size + size * 0.5 * 2;
  const gap = size * 0.5;
  let x = 0;
  let rows = 1;
  for (const chip of chips) {
    ctx.font = `500 ${size}px ${FONT}`;
    const lw = ctx.measureText(chip.k + ' ').width;
    ctx.font = `700 ${size}px ${FONT}`;
    const w = lw + ctx.measureText(chip.v).width + padX * 2;
    if (x > 0 && x + w > maxW) {
      x = 0;
      rows++;
    }
    x += w + gap;
  }
  return rows * h + (rows - 1) * gap;
}

/* ------------------------- 本体 ------------------------- */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ImageBitmap|HTMLImageElement} img
 * @param {object} opts { aspect, overlay, accent, focus }
 */
export async function render(canvas, img, opts = {}) {
  await ensureFonts();
  const { aspect = '4:5', overlay = null, accent = BRAND.orange, focus = 0.5 } = opts;
  const { w: W, h: H } = ASPECTS[aspect] || ASPECTS['4:5'];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, W, H);
  if (img) drawCover(ctx, img, W, H, focus);

  if (!overlay) return canvas;

  const geo = { W, H, pad: Math.round(W * 0.062) };
  ctx.save();
  const template = overlay.template || 'hook';
  if (template === 'stat') renderStat(ctx, overlay, geo, accent);
  else if (template === 'band') renderBand(ctx, overlay, geo, accent);
  else renderHook(ctx, overlay, geo, accent);
  ctx.restore();

  return canvas;
}

export function toBlob(canvas, type = 'image/jpeg', quality = 0.94) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
