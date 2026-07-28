// 毎朝の提案メール本文を組み立てる。
//   node scripts/daily-brief.mjs > brief.html
//
// ダッシュボードと同じエンジンを同じ日付シードで動かすので、
// メールに書かれた内容と画面の内容は必ず一致する。

import { generateDailyPlan, jstDateKey } from '../sns/engine.js';

const dateKey = process.env.BRIEF_DATE || jstDateKey();
const plan = generateDailyPlan(dateKey);

// リンク先。vars.DASHBOARD_URL が未設定でも GitHub Pages の既定URLに落とす。
// （Pages が未公開ならリンクは 404 になるが、リンク自体を欠落させるよりは辿れる）
function resolveDashboardUrl() {
  const explicit = (process.env.DASHBOARD_URL || '').trim();
  if (explicit) return explicit;
  const repo = process.env.GITHUB_REPOSITORY || '';
  const [owner, name] = repo.split('/');
  if (owner && name) return `https://${owner}.github.io/${name}/sns/`;
  return '';
}
const dashboardUrl = resolveDashboardUrl();

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const jpDate = (() => {
  const [y, m, d] = dateKey.split('-');
  const w = '日月火水木金土'[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
  return `${y}年${Number(m)}月${Number(d)}日（${w}）`;
})();

const cards = plan.posts
  .map((p) => {
    const platform = p.platform === 'ig' ? 'Instagram フィード' : 'X';
    const mode = p.image.mode === 'composite' ? '写真＋文字合成' : '写真そのまま';
    const overlay = p.image.overlay
      ? `<div style="margin:8px 0;padding:10px 12px;background:#f4f6f8;border-radius:8px;font-size:13px">
           <b>画像に載せる文字：</b>${esc(p.image.overlay.big || '')}${p.image.overlay.sub ? ' ／ ' + esc(p.image.overlay.sub) : ''}
         </div>`
      : '';
    const comp = p.compliance.ok
      ? '<span style="color:#1a7f4b">薬機法・景表法チェック：問題なし</span>'
      : `<span style="color:#c62828">要修正 ${p.compliance.blocks.length}件</span>`;

    return `
    <div style="border:1px solid #e2e6ea;border-radius:12px;padding:18px;margin-bottom:16px;background:#fff">
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px">${esc(platform)}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:10px">
        ${esc(p.axisLabel)}　/　${esc(p.skuLabel)}　/　${esc(mode)}
      </div>
      ${overlay}
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.8;margin:10px 0;color:#111">${esc(p.caption)}</pre>
      <div style="font-size:12px;color:#3b82f6;word-break:break-all">${esc(p.hashtags.join(' '))}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:10px">${esc(p.charCount)}文字 ／ ${comp}</div>
    </div>`;
  })
  .join('');

const html = `<!DOCTYPE html>
<html lang="ja"><body style="margin:0;padding:24px;background:#f7f8fa;font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:#111">
  <div style="max-width:680px;margin:0 auto">
    <h1 style="font-size:18px;margin:0 0 4px">PROTEIN MONSTER｜${esc(jpDate)}の投稿案</h1>
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px">
      Instagram と X の提案が1本ずつ出ています。画像の選択・文面の修正・書き出しはダッシュボードから行ってください。
    </p>
    ${dashboardUrl ? `<p style="margin:0 0 20px"><a href="${esc(dashboardUrl)}" style="display:inline-block;background:#111;color:#d7ff3e;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">ダッシュボードを開く</a></p>` : ''}
    ${cards}
    <p style="font-size:11px;color:#9ca3af;margin-top:24px">
      この提案は日付をシードに自動生成されています。ダッシュボードを同じ日付で開けば、まったく同じ内容が表示されます。<br>
      画像の実体はダッシュボードを開いた端末のブラウザ内に保存されているため、このメールには添付されません。
    </p>
  </div>
</body></html>`;

process.stdout.write(html);
