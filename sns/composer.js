// 投稿画像の合成
//
// 写真をアスペクト比に合わせて中央クロップし、必要ならコピーを重ねる。
// フォントは Web フォントの読み込み完了を待ってから描く（待たないと英数字だけ別書体になる）。

export const ASPECTS = {
  '1:1': { w: 1080, h: 1080, label: '正方形 1:1' },
  '4:5': { w: 1080, h: 1350, label: '縦 4:5（Instagram推奨）' },
  '16:9': { w: 1200, h: 675, label: '横 16:9（X推奨）' }
};

const FONT_STACK = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';

let fontsReady = null;
export function ensureFonts() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load(`700 100px "Noto Sans JP"`),
        document.fonts.load(`500 40px "Noto Sans JP"`),
        document.fonts.load(`400 30px "Noto Sans JP"`)
      ]);
      await document.fonts.ready;
    } catch {
      /* フォントが読めなくても既定書体で描く */
    }
  })();
  return fontsReady;
}

/** Blob から ImageBitmap（Safari 用に <img> フォールバック付き） */
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

function drawCover(ctx, img, W, H, focus = 0.5) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (W - dw) / 2;
  // 縦方向は focus（0=上寄せ 1=下寄せ）で調整。料理写真は少し上を残したい。
  const dy = (H - dh) * focus;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 折り返し。日本語は単語境界がないので1文字ずつ測る。 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

function scrim(ctx, W, H, from, to, color = '0,0,0') {
  const g = ctx.createLinearGradient(0, from * H, 0, to * H);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(0.5, `rgba(${color},0.55)`);
  g.addColorStop(1, `rgba(${color},0.82)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.min(from, to) * H, W, Math.abs(to - from) * H);
}

/**
 * 投稿画像を描画する。
 * @param {HTMLCanvasElement} canvas
 * @param {ImageBitmap|HTMLImageElement} img
 * @param {object} opts { aspect, overlay, accent, focus, watermark }
 */
export async function render(canvas, img, opts = {}) {
  await ensureFonts();
  const { aspect = '4:5', overlay = null, accent = '#D7FF3E', focus = 0.5 } = opts;
  const { w: W, h: H } = ASPECTS[aspect] || ASPECTS['4:5'];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  if (img) drawCover(ctx, img, W, H, focus);

  if (!overlay) return canvas;

  const pad = Math.round(W * 0.075);
  ctx.textBaseline = 'top';

  if (overlay.layout === 'stat') {
    scrim(ctx, W, H, 0.45, 1.0);
    const bigSize = Math.round(W * 0.24);
    ctx.font = `700 ${bigSize}px ${FONT_STACK}`;
    ctx.fillStyle = accent;
    const bigY = H - pad - bigSize * 1.9;
    ctx.fillText(overlay.big, pad, bigY);

    ctx.font = `500 ${Math.round(W * 0.045)}px ${FONT_STACK}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(overlay.label || '', pad + 6, bigY + bigSize * 1.15);

    if (overlay.sub) {
      ctx.font = `400 ${Math.round(W * 0.036)}px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(overlay.sub, pad + 6, H - pad - Math.round(W * 0.05));
    }
  }

  if (overlay.layout === 'hook') {
    scrim(ctx, W, H, 0.4, 1.0);
    const size = Math.round(W * 0.085);
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    const lines = wrapText(ctx, overlay.big, W - pad * 2);
    const subSize = Math.round(W * 0.036);
    const blockH = lines.length * size * 1.42 + (overlay.sub ? subSize * 2.2 : 0);
    let y = H - pad - blockH;

    // アクセントの縦線
    ctx.fillStyle = accent;
    ctx.fillRect(pad, y + size * 0.18, Math.round(W * 0.012), lines.length * size * 1.42 - size * 0.3);

    const textX = pad + Math.round(W * 0.045);
    ctx.fillStyle = '#ffffff';
    for (const line of lines) {
      ctx.fillText(line, textX, y);
      y += size * 1.42;
    }
    if (overlay.sub) {
      ctx.font = `400 ${subSize}px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(overlay.sub, textX, y + subSize * 0.5);
    }
  }

  if (overlay.layout === 'spec') {
    const items = overlay.items || [];
    const panelH = Math.round(H * 0.06 + items.length * W * 0.105 + W * 0.09);
    const panelY = H - pad - panelH;
    ctx.fillStyle = 'rgba(12,12,12,0.78)';
    roundRect(ctx, pad * 0.6, panelY, W - pad * 1.2, panelH, Math.round(W * 0.03));
    ctx.fill();

    let y = panelY + Math.round(W * 0.05);
    const rowH = Math.round(W * 0.105);
    const kSize = Math.round(W * 0.042);
    const vSize = Math.round(W * 0.072);
    for (const it of items) {
      ctx.font = `500 ${kSize}px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(it.k, pad, y + (vSize - kSize) * 0.75);

      ctx.font = `700 ${vSize}px ${FONT_STACK}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'right';
      ctx.fillText(it.v, W - pad, y);
      ctx.textAlign = 'left';

      y += rowH;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, y - rowH * 0.12);
      ctx.lineTo(W - pad, y - rowH * 0.12);
      ctx.stroke();
    }
    if (overlay.sub) {
      ctx.font = `400 ${Math.round(W * 0.033)}px ${FONT_STACK}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(overlay.sub, pad, y + Math.round(W * 0.005));
    }
  }

  return canvas;
}

export function toBlob(canvas, type = 'image/jpeg', quality = 0.92) {
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
