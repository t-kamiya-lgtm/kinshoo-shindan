// ダッシュボード本体
import { generateDailyPlan, jstDateKey, buildProposal } from './engine.js';
import { checkCompliance } from './compliance.js';
import { PRODUCTS, COMMON, COMPARISONS, DATA_NOTES } from './data/products.js';
import { TAG_VOCAB, DRIVE_FOLDER_URL, IMAGE_CATALOG } from './data/images.js';
import * as lib from './library.js';
import * as composer from './composer.js';
import { HASHTAGS } from './data/copy.js';
import * as backend from './backend.js';

// レシピ機能は後から読み込む。静的 import にすると、レシピ関連のファイルが
// 1つ欠けただけでモジュール全体が読めず、ダッシュボードが真っ白になってしまう。
let recipeArt = null;
let recipeData = null;
let recipeLoadError = null;

async function loadRecipeModules() {
  try {
    recipeArt = await import('./recipe.js');
    recipeData = await import('./data/recipes.js');
  } catch (err) {
    recipeLoadError = err;
    console.warn('レシピ機能を読み込めませんでした:', err);
  }
}

/* ============================ 状態 ============================ */

const LS = {
  settings: 'pm-sns:settings',
  edits: 'pm-sns:edits',
  log: 'pm-sns:log',
  recipe: 'pm-sns:recipe',
  sku: 'pm-sns:sku'
};

const defaultSettings = {
  accent: '#f0821e', // ブランドのオレンジ
  igAspect: '4:5',
  xAspect: '16:9',
  prMode: false,
  // Instagram と X を「同じ投稿の媒体別バージョン」として作るか。
  // オフにすると、それぞれ独立した内容になる。
  syncPlatforms: true
};

// 共有モード（Apps Script 上）では、共有側にある値を優先して読む。
// 端末モードではこれまで通り localStorage だけを見る。
const load = (k, fb) => {
  if (backend.isShared) {
    const shared = backend.getDoc(k);
    if (shared && typeof shared === 'object') return { ...fb, ...shared };
    return { ...fb };
  }
  try { return { ...fb, ...JSON.parse(localStorage.getItem(k) || '{}') }; }
  catch { return { ...fb }; }
};

const save = (k, v) => {
  if (backend.isShared) {
    backend.putDoc(k, v);
    return;
  }
  localStorage.setItem(k, JSON.stringify(v));
};

/** 共有側から読み直した内容を、画面の状態に取り込む */
function adoptSharedState() {
  settings = { ...defaultSettings, ...load(LS.settings, defaultSettings) };
  edits = load(LS.edits, {});
  postLog = load(LS.log, { entries: [] });
  if (!Array.isArray(postLog.entries)) postLog = { entries: [] };
  recipeState = load(LS.recipe, { key: null, heroKey: '', captions: {} });
  if (!recipeState.captions) recipeState.captions = {};
  skuOverrides = load(LS.sku, {});
}

let settings = load(LS.settings, defaultSettings);
// 初期のアクセントカラーは黄緑だったが、ブランドカラーはオレンジだった。
// 既存の保存値が旧既定値そのままなら、ブランドカラーへ寄せる（自分で変えた色は尊重する）。
if (settings.accent === '#d7ff3e') {
  settings.accent = defaultSettings.accent;
  save(LS.settings, settings);
}
let edits = load(LS.edits, {});
let postLog = load(LS.log, { entries: [] });
if (!Array.isArray(postLog.entries)) postLog = { entries: [] };

// レシピ画面の状態。選んだレシピ・写真・編集したキャプションを覚えておく。
let recipeState = load(LS.recipe, { key: null, heroKey: '', captions: {} });
if (!recipeState.captions) recipeState.captions = {};

let dateKey = jstDateKey();
let variants = { ig: 0, x: 0 };
let stored = [];
// 日付・媒体ごとの SKU 指定。variant を含めないので「別案」を出しても指定は残る。
let skuOverrides = load(LS.sku, {});
// 支給ロゴ。描き起こさず、登録されたファイルをそのまま合成に使う。
let logos = { onPhoto: null, onLight: null, hasOnPhoto: false, hasOnLight: false };

/* ============================ 小道具 ============================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 時間のかかる処理のあいだ出しっぱなしにする表示 */
function showProgress(msg) {
  const el2 = $('#toast');
  el2.textContent = msg;
  el2.hidden = false;
  clearTimeout(el2._t);
  return {
    update(text) { el2.textContent = text; },
    done() { el2.hidden = true; }
  };
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2200);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== false && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('コピーしました');
  }
}

/** 編集済みの内容をマージした投稿案を返す */
function withEdits(post) {
  const e = edits[post.id];
  if (!e) return post;
  const merged = { ...post, image: { ...post.image } };
  if (e.caption !== undefined) merged.caption = e.caption;
  if (e.hashtags !== undefined) merged.hashtags = e.hashtags;
  if (e.mode) merged.image.mode = e.mode;
  if (e.overlay !== undefined) merged.image.overlay = e.overlay;
  if (e.imageKey !== undefined) merged.imageKey = e.imageKey;
  if (e.aspect) merged.image.aspect = e.aspect;
  merged.fullText = `${merged.caption}\n\n${merged.hashtags.join(' ')}`;
  merged.charCount = [...merged.fullText].length;
  merged.compliance = checkCompliance(merged.fullText, { includeOptional: settings.prMode });
  return merged;
}

function patchEdit(postId, patch) {
  edits[postId] = { ...(edits[postId] || {}), ...patch };
  save(LS.edits, edits);
}

/** canvas の中身を別ウインドウで等倍表示する */
async function openFullSize(canvas) {
  const blob = await composer.toBlob(canvas, 'image/png');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    toast('ポップアップがブロックされました。許可してください');
    URL.revokeObjectURL(url);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** 画像に載せる文字を1本の文字列にまとめる（法令チェックにかけるため） */
function overlayText(ov) {
  if (!ov) return '';
  return [ov.eyebrow, ov.lead, ov.big, ov.suffix, ov.sub,
    ...(ov.chips || []).map((c) => `${c.k}${c.v}`)]
    .filter(Boolean).join(' ');
}

/* ============================ 直近の使用状況 ============================ */
//
// 投稿ログを見て「最近使った写真・最近使った書き出し」を避ける。
// これがないと、写真の枚数が少ないうちは同じ絵が短期間で何度も出てしまう。

const RECENT_IMAGE_DAYS = 14;
const RECENT_HOOK_DAYS = 30;

const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

/** 直近に使った画像キー（新しい順） */
function recentImageKeys(days = RECENT_IMAGE_DAYS) {
  return postLog.entries
    .filter((e) => e.image && daysAgo(e.postedAt) <= days)
    .map((e) => e.image);
}

/** 画像ごとの使用回数と最終使用日 */
function imageUsage() {
  const map = new Map();
  for (const e of postLog.entries) {
    if (!e.image) continue;
    const cur = map.get(e.image) || { count: 0, lastAt: null };
    cur.count++;
    if (!cur.lastAt || e.postedAt > cur.lastAt) cur.lastAt = e.postedAt;
    map.set(e.image, cur);
  }
  return map;
}

/** 同じ書き出しを直近に使っていないか */
function recentHookUse(firstLine, days = RECENT_HOOK_DAYS) {
  if (!firstLine) return null;
  return postLog.entries.find(
    (e) => daysAgo(e.postedAt) <= days && e.text.split('\n')[0].trim() === firstLine.trim()
  ) || null;
}

/* ============================ 提案ビュー ============================ */

const X_SAFE = 140;
const IG_MAX = 2200;

/* --- SKU の指定 ---
   投稿は必ずどちらか一方の商品に特化させる。既定は日付から自動で決まるが、
   ここで指定すると、訴求軸・テンプレート・画像プランはそのままに商品だけが
   入れ替わる。指定は日付＋媒体に紐づけるので「別案」を出しても残る。 */

const skuKeyOf = (platform) => `${dateKey}-${platform}`;

function forcedSkus() {
  return { ig: skuOverrides[skuKeyOf('ig')] || null, x: skuOverrides[skuKeyOf('x')] || null };
}

/**
 * SKU を切り替える。本文はその商品の数値で作り直すので、
 * 手で直した本文・タグ・画像の文字が残っていると噛み合わなくなる。
 * 残っている場合だけ確認したうえで捨てる。
 */
function setSku(post, skuId) {
  const sync = settings.syncPlatforms;
  const targets = sync ? ['ig', 'x'] : [post.platform];

  const dirty = targets.some((pf) => {
    const e = edits[`${dateKey}-${pf}-${variants[pf] || 0}`];
    return e && (e.caption !== undefined || e.hashtags !== undefined || e.overlay !== undefined);
  });
  if (dirty && !confirm('手を入れた本文・タグ・画像の文字は、商品に合わせて作り直すため破棄されます。切り替えますか？')) {
    return;
  }

  for (const pf of targets) {
    if (skuId) skuOverrides[skuKeyOf(pf)] = skuId;
    else delete skuOverrides[skuKeyOf(pf)];
    // 商品が変わると本文の数値も写真の相性も変わるので、その媒体の編集内容を戻す
    const id = `${dateKey}-${pf}-${variants[pf] || 0}`;
    if (edits[id]) {
      const { caption, hashtags, overlay, imageKey, ...keep } = edits[id];
      edits[id] = keep;
    }
  }
  save(LS.sku, skuOverrides);
  save(LS.edits, edits);
  refresh();
}

async function renderProposals() {
  const list = $('#proposal-list');
  list.replaceChildren();
  $('#no-images-notice').hidden = stored.length > 0;

  // 支給ロゴが読めていないと、合成画像には文字で組んだ代用が描かれる。
  // 見た目が似ているので気づきにくい。画面ではっきり伝える。
  // 共有版とローカル版でロゴの置き場所が違う（Drive / この端末）ため、
  // 片方で登録しても、もう片方には引き継がれない。
  const logoNotice = $('#no-logo-notice');
  if (logoNotice) {
    logoNotice.hidden = !!logos.onPhoto;
    logoNotice.textContent =
      'ブランドロゴが未登録です。いまは文字で組んだ代用を描いています。'
      + '［設定］タブの「ブランドロゴ」で、白抜きロゴ（背景透過 PNG）を登録してください。'
      + (backend.isShared
        ? 'ロゴは共有データ（Drive）に保存され、メンバー全員に反映されます。'
        : 'ローカル版のロゴはこの端末にだけ保存されます。共有版で使うには、共有版でも登録してください。');
  }

  const sync = settings.syncPlatforms;
  const plan = generateDailyPlan(dateKey, variants, { sync, forceSku: forcedSkus() });
  // 直近に投稿した写真は避ける。候補が尽きた場合は pickImage が全体から
  // 選び直すので、行き止まりにはならない。
  const usedKeys = recentImageKeys();

  // まず両方の画像を確定させる。カード側の「別の写真」が相手と衝突しないよう、
  // 決まった組み合わせを両方のカードに渡す必要がある。
  const assigned = [];
  for (const raw of plan.posts) {
    const post = withEdits(raw);
    let imageItem = null;
    if (post.imageKey) {
      imageItem = stored.find((s) => s.key === post.imageKey) || null;
    } else if (sync && assigned.length && assigned[0].imageItem) {
      // 媒体をそろえる設定では「同じ投稿」なので、写真も1枚目に合わせる。
      imageItem = assigned[0].imageItem;
    }
    if (!imageItem && stored.length) {
      imageItem = lib.pickImage(stored, post.image, post.id, usedKeys);
    }
    if (imageItem && !usedKeys.includes(imageItem.key)) usedKeys.push(imageItem.key);
    assigned.push({ post, imageItem });
  }

  for (const { post, imageItem } of assigned) {
    // そろえる設定では写真の一致は正しい状態なので、重複として扱わない。
    const siblingKeys = sync ? [] : assigned
      .filter((a) => a.post.id !== post.id && a.imageItem)
      .map((a) => a.imageItem.key);
    list.append(buildPostCard(post, imageItem, siblingKeys));
  }
}

function buildPostCard(post, imageItem, siblingKeys = []) {
  const platformLabel = post.platform === 'ig' ? 'Instagram フィード' : 'X';
  const limit = post.platform === 'ig' ? IG_MAX : X_SAFE;
  const isComposite = post.image.mode === 'composite';
  const posted = postLog.entries.find((e) => e.postId === post.id);

  const card = el('div', { class: 'post-card' });

  // 直近に同じ書き出し・同じ写真を使っていないかを見て、注意を出す
  const hookDup = recentHookUse(post.caption.split('\n')[0]);
  const usage = imageUsage().get(imageItem ? imageItem.key : '');
  const imageDup = usage && daysAgo(usage.lastAt) <= RECENT_IMAGE_DAYS;
  const sameAsSibling = imageItem && siblingKeys.includes(imageItem.key);
  const edit = edits[post.id] || {};
  const edited = edit.caption !== undefined || edit.hashtags !== undefined;

  /* --- ヘッダ --- */
  card.append(
    el('div', { class: 'post-head' },
      el('div', { class: `platform ${post.platform}` }, el('span', { class: 'dot' }), platformLabel),
      el('div', { class: 'chips' },
        el('span', { class: 'chip accent' }, post.axisLabel),
        post.audienceLabel ? el('span', { class: 'chip' }, post.audienceLabel) : null,
        post.stanceLabel ? el('span', { class: 'chip' }, post.stanceLabel) : null,
        el('span', { class: 'chip' }, post.skuLabel),
        el('span', { class: 'chip' }, isComposite ? '写真＋文字合成' : '写真そのまま'),
        posted ? el('span', { class: 'chip accent' }, '投稿済み') : null,
        hookDup ? el('span', { class: 'chip dup' }, `書き出し重複（${hookDup.dateKey}）`) : null,
        imageDup ? el('span', { class: 'chip dup' }, `この写真は${Math.round(daysAgo(usage.lastAt))}日前にも使用`) : null,
        sameAsSibling ? el('span', { class: 'chip dup' }, 'もう1本と同じ写真') : null,
        // 本文を手で直していると、生成側の文面を更新しても画面は変わらない。
        // 気づけないと「反映されていない」と見えるので、必ず表示する。
        edited ? el('span', { class: 'chip dup' }, '本文を編集済み') : null,
        // 合成画像にロゴを載せるのに、支給ファイルが読めていない状態。
        isComposite && !logos.onPhoto
          ? el('span', { class: 'chip dup' }, 'ロゴ未登録（代用を描画中）') : null
      )
    )
  );

  /* --- プレビュー --- */
  const canvasBox = el('div', { class: 'canvas-box' });
  const canvas = el('canvas');
  if (imageItem) {
    canvas.classList.add('zoomable');
    canvas.title = 'クリックで別ウインドウに拡大表示';
    canvas.addEventListener('click', () => openFullSize(canvas));
    canvasBox.append(canvas);
  }
  else canvasBox.append(el('div', { class: 'canvas-empty' }, '画像が未取込です。ライブラリに画像を追加してください。'));

  // 既定は設定タブの値。個別に変えたぶんだけ post.image.aspect に残る。
  const aspect = post.image.aspect || (post.platform === 'ig' ? settings.igAspect : settings.xAspect);
  const overlay = post.image.overlay;

  const redraw = async () => {
    if (!imageItem) return;
    const blob = await lib.blobOf(imageItem);
    if (!blob) return;
    const bmp = await composer.loadBitmap(blob);
    await composer.render(canvas, bmp, {
      aspect,
      overlay: isComposite ? post.image.overlay : null,
      accent: settings.accent,
      logo: logos.onPhoto
    });
  };
  redraw();

  const imgSelect = el('select', {
    onchange: (e) => { patchEdit(post.id, { imageKey: e.target.value }); refresh(); }
  },
    ...stored.map((s) => el('option', {
      value: s.key,
      selected: imageItem && s.key === imageItem.key ? 'selected' : null
    }, s.key))
  );
  if (!stored.length) imgSelect.append(el('option', {}, '（画像なし）'));

  /** どちらの商品で作るか。切り替えると本文も画像の文字も作り直される。 */
  function buildSkuPicker() {
    const forced = skuOverrides[skuKeyOf(post.platform)] || null;
    const btn = (id, label) => el('button', {
      class: `btn small ${post.sku === id ? '' : 'ghost'}`,
      onclick: () => setSku(post, id)
    }, label);
    return el('div', { class: 'sku-picker' },
      el('span', { class: 'sku-label' }, '商品'),
      btn('monster', 'モンスター'),
      btn('sova', 'ソバ'),
      forced
        ? el('button', { class: 'btn ghost small', onclick: () => setSku(post, null) }, '自動に戻す')
        : el('span', { class: 'hint' }, '自動（日付で決定）'),
      settings.syncPlatforms
        ? el('span', { class: 'hint' }, '※2媒体そろえる設定のため、両方に反映されます')
        : null
    );
  }

  const controls = el('div', { class: 'img-controls' },
    buildSkuPicker(),
    el('div', { class: 'img-meta' }, imageItem ? imageItem.key : '—'),
    imgSelect,
    el('div', { class: 'row' },
      el('button', {
        class: 'btn ghost small',
        onclick: () => { patchEdit(post.id, { mode: isComposite ? 'raw' : 'composite' }); refresh(); }
      }, isComposite ? '文字なしにする' : '文字を載せる'),
      el('button', {
        class: 'btn ghost small',
        onclick: () => {
          // 同じ条件で別の写真へ。もう1本が使っている写真は飛ばす。
          if (!stored.length) return;
          let i = imageItem ? stored.findIndex((s) => s.key === imageItem.key) : -1;
          for (let step = 1; step <= stored.length; step++) {
            const cand = stored[(i + step + stored.length) % stored.length];
            if (!siblingKeys.includes(cand.key) || stored.length <= 1) {
              patchEdit(post.id, { imageKey: cand.key });
              break;
            }
          }
          refresh();
        }
      }, '別の写真'),
      el('select', {
        onchange: (e) => { patchEdit(post.id, { aspect: e.target.value }); refresh(); }
      }, ...Object.entries(composer.ASPECTS).map(([k, v]) =>
        el('option', { value: k, selected: k === aspect ? 'selected' : null }, v.label)))
    ),
    isComposite && overlay ? buildOverlayEditor() : null
  );

  /** 画像に載せる文字の編集欄。テンプレートごとに使う項目が違う。 */
  function buildOverlayEditor() {
    const patchOverlay = (patch) => {
      const ov = { ...post.image.overlay, ...patch };
      patchEdit(post.id, { overlay: ov });
      post.image.overlay = ov;
      redraw();
      renderOverlayCompliance();
    };

    const field = (key, placeholder, multiline = false) =>
      el(multiline ? 'textarea' : 'input', {
        ...(multiline ? { rows: 2 } : { type: 'text' }),
        placeholder,
        oninput: (e) => patchOverlay({ [key]: e.target.value })
      });

    const withValue = (node, v) => {
      node.value = v ?? '';
      return node;
    };

    const rows = [
      el('div', { class: 'row' },
        el('select', {
          class: 'grow',
          onchange: (e) => patchOverlay({ template: e.target.value })
        }, ...Object.entries(composer.TEMPLATES || { hook: 'コピー主役' }).map(([k, label]) =>
          el('option', { value: k, selected: k === (overlay.template || 'hook') ? 'selected' : null }, label))),
        el('select', {
          onchange: (e) => patchOverlay({ position: e.target.value })
        }, ...Object.entries(composer.POSITIONS || { bottom: '文字を下に置く', top: '文字を上に置く' })
          .map(([k, label]) =>
            el('option', { value: k, selected: k === (overlay.position || 'bottom') ? 'selected' : null }, label))),
        el('button', {
          class: 'btn ghost small',
          onclick: () => {
            // 自動生成の文字に戻す
            const e2 = edits[post.id];
            if (e2) { delete e2.overlay; save(LS.edits, edits); }
            refresh();
          }
        }, '文字を戻す')
      ),
      withValue(field('eyebrow', 'ラベル（オレンジの角丸）'), overlay.eyebrow)
    ];

    if ((overlay.template || 'hook') === 'stat') {
      rows.push(withValue(field('lead', '数字の上の小見出し'), overlay.lead));
      rows.push(withValue(field('big', '数字'), overlay.big));
      rows.push(withValue(field('suffix', '数字の下の文字'), overlay.suffix));
    } else {
      rows.push(withValue(field('big', '見出し（改行できます）', true), overlay.big));
      rows.push(withValue(field('sub', '小さい方の説明'), overlay.sub));
    }

    return el('div', { class: 'overlay-editor' }, ...rows);
  }

  card.append(el('div', { class: 'preview-wrap' }, canvasBox, controls));

  /* --- キャプション編集 --- */
  const captionArea = el('textarea', { rows: post.platform === 'ig' ? 14 : 6 });
  captionArea.value = post.caption;
  const tagsInput = el('input', { type: 'text', value: post.hashtags.join(' ') });
  const counter = el('div', { class: 'counter' });
  const compBox = el('div', { class: 'compliance' });
  const overlayComp = el('div', { class: 'compliance', hidden: true });

  const currentFull = () => `${captionArea.value}\n\n${tagsInput.value.trim()}`;

  function renderCompliance() {
    const text = currentFull();
    const n = [...text].length;
    counter.textContent = `${n} 文字 / 目安 ${limit}（ハッシュタグ ${tagsInput.value.trim().split(/\s+/).filter(Boolean).length}個）`;
    counter.classList.toggle('over', n > limit);

    const r = checkCompliance(text, { includeOptional: settings.prMode });
    compBox.replaceChildren();
    const state = r.blocks.length ? 'block' : r.warns.length ? 'warn' : 'ok';
    const headText = r.blocks.length
      ? `要修正 ${r.blocks.length}件（このままでは投稿できません）`
      : r.warns.length
        ? `要確認 ${r.warns.length}件`
        : '薬機法・景表法チェック：問題なし';
    compBox.append(el('div', { class: `comp-head ${state}` }, headText));
    for (const f of [...r.blocks, ...r.warns]) {
      compBox.append(
        el('div', { class: 'comp-item' },
          el('span', { class: 'law' }, `[${f.law}]`),
          el('span', { class: 'matched' }, f.matched),
          ' ' + f.reason,
          el('span', { class: 'fix' }, '→ ' + f.fix)
        )
      );
    }
    postBtn.disabled = r.blocks.length > 0;
    return r;
  }

  function renderOverlayCompliance() {
    const ov = post.image.overlay;
    if (!isComposite || !ov) { overlayComp.hidden = true; return; }
    const t = overlayText(ov);
    const r = checkCompliance(t);
    overlayComp.replaceChildren();
    if (r.ok && !r.warns.length) { overlayComp.hidden = true; return; }
    overlayComp.hidden = false;
    overlayComp.append(el('div', { class: `comp-head ${r.blocks.length ? 'block' : 'warn'}` }, '画像に載せる文字の指摘'));
    for (const f of [...r.blocks, ...r.warns]) {
      overlayComp.append(el('div', { class: 'comp-item' },
        el('span', { class: 'law' }, `[${f.law}]`), el('span', { class: 'matched' }, f.matched), ' ' + f.reason));
    }
  }

  captionArea.addEventListener('input', () => {
    patchEdit(post.id, { caption: captionArea.value });
    renderCompliance();
  });
  tagsInput.addEventListener('input', () => {
    patchEdit(post.id, { hashtags: tagsInput.value.trim().split(/\s+/).filter(Boolean) });
    renderCompliance();
  });

  /** 手で直した本文・タグを捨てて、生成された文面に戻す */
  const resetCaption = () => {
    if (!confirm('この投稿の本文とハッシュタグを、自動生成された内容に戻します。よろしいですか？')) return;
    const e = edits[post.id];
    if (e) {
      delete e.caption;
      delete e.hashtags;
      if (!Object.keys(e).length) delete edits[post.id];
      save(LS.edits, edits);
    }
    refresh();
  };

  card.append(
    el('div', { class: 'editor' },
      el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' },
        el('label', {}, 'キャプション'),
        edited
          ? el('button', { class: 'btn ghost small', onclick: resetCaption }, '本文を自動生成に戻す')
          : null),
      captionArea,
      el('label', {}, 'ハッシュタグ（スペース区切り）'), tagsInput,
      counter
    ),
    compBox,
    overlayComp
  );

  /* --- アクション --- */
  const postBtn = el('button', {
    class: 'btn',
    onclick: async () => {
      const r = renderCompliance();
      if (r.blocks.length) { toast('法令チェックの指摘を解消してください'); return; }
      if (!confirm(`${platformLabel} に投稿したものとして記録します。\n（画像とキャプションは各アプリに貼り付けてください）`)) return;
      postLog.entries.unshift({
        postId: post.id, dateKey: post.dateKey, platform: post.platform,
        axis: post.axisLabel, sku: post.skuLabel,
        text: currentFull(), image: imageItem ? imageItem.key : null,
        postedAt: new Date().toISOString()
      });
      save(LS.log, postLog);
      toast('投稿ログに記録しました');
      refresh();
    }
  }, posted ? '投稿済み（再記録）' : '投稿する');

  const actions = el('div', { class: 'post-actions' },
    el('button', {
      class: 'btn ghost',
      onclick: () => copyText(currentFull())
    }, 'キャプション＋タグをコピー'),
    el('button', {
      class: 'btn ghost',
      disabled: imageItem ? null : 'disabled',
      onclick: async () => {
        if (!imageItem) return;
        const blob = await composer.toBlob(canvas, 'image/jpeg', 0.92);
        composer.download(blob, `${post.dateKey}_${post.platform}_${post.sku}_${post.axis}.jpg`);
        toast('画像を書き出しました');
      }
    }, '画像をダウンロード'),
    post.platform === 'x'
      ? el('button', {
          class: 'btn ghost',
          onclick: () => {
            const url = 'https://x.com/intent/post?text=' + encodeURIComponent(currentFull());
            window.open(url, '_blank', 'noopener');
            toast('Xの投稿画面を開きました。画像は手動で添付してください');
          }
        }, 'Xの下書きを開く')
      : el('button', {
          class: 'btn ghost',
          onclick: () => {
            window.open('https://www.instagram.com/', '_blank', 'noopener');
            toast('Instagramを開きました。画像を添付し、キャプションを貼り付けてください');
          }
        }, 'Instagramを開く'),
    el('button', {
      class: 'btn ghost',
      onclick: () => {
        variants[post.platform] = (variants[post.platform] + 1) % 4;
        // 別案に切り替えるときは、その案の編集内容だけをリセット対象にする
        refresh();
      }
    }, '別案を出す'),
    el('button', {
      class: 'btn ghost',
      onclick: () => {
        if (!edits[post.id]) { toast('編集はありません'); return; }
        if (!confirm('この案の編集内容を破棄して、自動生成の状態に戻します。')) return;
        delete edits[post.id];
        save(LS.edits, edits);
        refresh();
      }
    }, '編集を破棄'),
    postBtn
  );
  card.append(actions);

  renderCompliance();
  renderOverlayCompliance();
  return card;
}


/* ============================ レシピ投稿 ============================ */

const IG_CAPTION_MAX = 2200;

/**
 * レシピの写真候補。
 * そのレシピを撮った写真だけを返す。別の料理の写真は混ぜない。
 * 一致しなければ空を返し、画面側で「見つからない」と伝える。
 */
function recipePhotoOptions(recipe) {
  if (!recipeData || !recipeData.matchRecipePhotos) return [];
  const tags = lib.loadTags();
  const found = recipeData.matchRecipePhotos(recipe, stored, tags, lib.loadPhotoRecipes());
  // ①のタイトル面に使うのは「できあがり」。材料写真より先に出す。
  const score = (item) => (recipeData.recipePhotoRole(item.key) === 'できあがり' ? -1 : 0);
  return found.sort((a, b) => score(a) - score(b) || a.key.localeCompare(b.key));
}

/** ④のサムネ用に、他のレシピのできあがり写真を集める */
function otherRecipePhotos(currentKey, limit = 3) {
  if (!recipeData || !recipeData.matchRecipePhotos) return [];
  const out = [];
  const tags = lib.loadTags();
  const links = lib.loadPhotoRecipes();
  for (const r of recipeData.RECIPES) {
    if (r.key === currentKey) continue;
    const found = recipeData.matchRecipePhotos(r, stored, tags, links);
    const hit = found.find((x) => recipeData.recipePhotoRole(x.key) === 'できあがり') || found[0];
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * レシピ画面からの写真追加。
 * 写真とレシピは「ファイル名の先頭の番号」で結び付けている。手元のファイル名は
 * 撮影時のまま（_DSC0001.JPG など）のことが多いので、取り込むときに
 * そのレシピの番号へ付け替える。同時に商品タグも付けて、番号が重なる
 * レシピ（04 はモンスターとソバの両方にある）でも取り違えないようにする。
 */
function setupRecipeUpload(recipe, options) {
  const input = $('#recipe-upload');
  const note = $('#recipe-photo-note');
  const skuLabel = recipe.sku === 'monster' ? 'モンスター' : 'ソバ';
  const no = String(recipe.no).padStart(2, '0');
  // 04 のようにモンスターとソバで番号が重なるものは、ファイル名に商品を書く。
  const head = recipe.sku === 'monster' ? 'mon' : 'sova';
  const baseName = `${head}${no}`;

  if (note) {
    note.textContent = options.length
      ? `このレシピの写真 ${options.length}点：${options.map((o) => o.key).join('、')}`
      : `このレシピの写真はまだありません。「このレシピの写真を追加」から選ぶと、${baseName}-1 のように`
        + `商品と番号を付け替えて取り込み、商品タグ（${skuLabel}）も自動で付けます。`;
  }
  if (!input) return;

  input.onchange = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;

    // 既にある枝番の続きから振る。既存の写真を上書きしない。
    // 商品なしの「04-1」も、同じ番号として数に入れる。
    const used = new Set();
    for (const item of stored) {
      const p = recipeData.parsePhotoName(item.key);
      if (p && p.no === recipe.no && p.sub && (!p.sku || p.sku === recipe.sku)) used.add(p.sub);
    }
    let next = 1;
    const renamed = [];
    for (const f of files) {
      while (used.has(next)) next++;
      used.add(next);
      const ext = (f.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
      renamed.push(new File([f], `${baseName}-${next}${ext}`, { type: f.type || 'image/jpeg' }));
    }

    const progress = showProgress('取り込み中…');
    let r;
    try {
      r = await lib.importFiles(renamed, {
        onProgress: (done, total, name) => progress.update(`取り込み中… ${done} / ${total}　${name}`)
      });
    } catch (err) {
      progress.done();
      console.error('レシピ写真の取り込みに失敗しました:', err);
      toast(`取り込みに失敗しました：${err && err.message ? err.message : err}`);
      return;
    }
    progress.done();

    // 商品タグを付ける。これがないと、番号が重なるレシピで紐づけ先が決まらない。
    const tags = lib.loadTags();
    for (const f of renamed) {
      const cur = new Set(tags[f.name] || []);
      cur.delete('monster');
      cur.delete('sova');
      cur.add(recipe.sku);
      // シーンのタグ（できあがり／材料）は写真を見ないと決められないので付けない。
      // 画像ライブラリで付けてください。
      tags[f.name] = [...cur];
    }
    lib.saveTags(tags);

    stored = await lib.listStored();
    await refresh();
    toast(`${r.added}点を ${skuLabel} ${no} の写真として取り込みました（${renamed.map((f) => f.name).join('、')}）`);
  };
}

async function renderRecipeView() {
  const notice = $('#recipe-notice');
  const slidesBox = $('#recipe-slides');
  const sel = $('#recipe-select');
  const heroSel = $('#recipe-hero');
  if (!notice || !slidesBox || !sel || !heroSel) return; // 画面が古い場合

  if (!recipeArt || !recipeData) {
    notice.hidden = false;
    notice.textContent =
      'レシピ機能のファイル（recipe.js / data/recipes.js）が読み込めませんでした。'
      + 'この2つがアップロードされているか確認してください。'
      + (recipeLoadError ? `（${recipeLoadError.message}）` : '');
    slidesBox.replaceChildren();
    return;
  }

  const { RECIPES, OUTRO, SWIPE_BAR, getRecipe, resolveRecipe } = recipeData;

  if (!RECIPES.length) {
    notice.hidden = false;
    notice.textContent = 'レシピがまだ登録されていません。data/recipes.js に原稿を追加してください。';
    slidesBox.replaceChildren();
    return;
  }

  const base = getRecipe(recipeState.key) || RECIPES[0];
  recipeState.key = base.key;
  // ゆで時間を商品表示の「3〜5分」に差し替え、調理時間も換算した状態で扱う。
  // 画像とキャプションが同じ数字を使うよう、ここで一度だけ解決する。
  const product = PRODUCTS[base.sku];
  const recipe = resolveRecipe(base, product);

  // レシピの選択肢
  sel.replaceChildren(...RECIPES.map((r) => el('option', {
    value: r.key,
    selected: r.key === recipe.key ? 'selected' : null
  }, `${r.sku === 'monster' ? 'モンスター' : 'ソバ'} ${String(r.no).padStart(2, '0')}｜${r.label}${r.title.replace(/\n/g, '')}`)));

  // 写真の選択肢
  const options = recipePhotoOptions(recipe);
  const chosenKey = recipeState.heroKey || recipe.photos.hero || (options[0] ? options[0].key : '');
  heroSel.replaceChildren(
    el('option', { value: '' }, options.length ? '（自動：先頭の候補）' : '（画像が未取込です）'),
    ...options.map((o) => {
      const role = recipeData.recipePhotoRole(o.key);
      return el('option', {
        value: o.key, selected: o.key === chosenKey ? 'selected' : null
      }, role ? `${o.key}（${role}）` : o.key);
    })
  );

  // このレシピの写真が見つからないことは、はっきり伝える。
  // 黙って別の料理の写真を出すと、投稿してから気づくことになる。
  if (!stored.length) {
    notice.hidden = false;
    notice.textContent = '画像ライブラリが空です。①のタイトル画像に写真を使うには、先に画像を取り込んでください。②③④は写真なしでも書き出せます。';
  } else if (!options.length) {
    notice.hidden = false;
    notice.textContent =
      `このレシピの写真がライブラリに見つかりません（探した名前：${recipe.photo ? recipe.photo.prefix : '—'}）。`
      + '別の料理の写真は使わない決まりなので、①は写真なしで書き出します。'
      + 'レシピの写真を取り込むか、ファイル名をご確認ください。';
  } else {
    notice.hidden = true;
  }

  const heroItem = stored.find((x) => x.key === chosenKey) || null;
  const heroBlob = heroItem ? await lib.blobOf(heroItem) : null;
  const heroImg = heroBlob ? await composer.loadBitmap(heroBlob) : null;

  // ④のサムネは、他のレシピのできあがり写真を使う（レシピ写真だけ）
  const thumbItems = otherRecipePhotos(recipe.key, 3);
  const thumbs = [];
  for (const t of thumbItems) {
    const tb = await lib.blobOf(t);
    if (tb) thumbs.push(await composer.loadBitmap(tb));
  }

  // 4枚を描く
  slidesBox.replaceChildren();
  const canvases = {};
  for (const [slide, label] of Object.entries(recipeArt.SLIDES)) {
    const canvas = el('canvas');
    canvas.title = 'クリックで別ウインドウに拡大表示';
    canvas.addEventListener('click', () => openFullSize(canvas));
    canvases[slide] = canvas;
    slidesBox.append(el('div', { class: 'recipe-slide' },
      el('div', { class: 'slide-label' }, label), canvas));
    await recipeArt.renderSlide(canvas, slide, recipe, {
      heroImg, thumbs, accent: settings.accent, outro: OUTRO, swipeBar: SWIPE_BAR,
      logo: logos.onLight
    });
  }

  // キャプション
  // ハッシュタグはレシピ寄りに。キーで決まるので毎回同じ並びになる。
  const tags = [];
  for (const t of [...HASHTAGS.core, ...HASHTAGS.bySku[recipe.sku],
    ...HASHTAGS.byAxis.meal, ...HASHTAGS.byAxis.staple]) {
    if (!tags.includes(t)) tags.push(t);
    if (tags.length >= 20) break;
  }
  const generated = recipeArt.buildRecipeCaption(recipe, product, tags);
  const ta = $('#recipe-caption');
  ta.value = recipeState.captions[recipe.key] ?? generated;

  const counter = $('#recipe-counter');
  const compBox = $('#recipe-compliance');

  function renderRecipeCompliance() {
    const text = ta.value;
    const n = [...text].length;
    counter.textContent = `${n} 文字 / 目安 ${IG_CAPTION_MAX}`;
    counter.classList.toggle('over', n > IG_CAPTION_MAX);

    const r = checkCompliance(text, { includeOptional: settings.prMode });

    // 原稿のまま使う判断をした語は「確認済み」として分ける。
    // チェッカー自体は緩めない。緩めると、今後の新しい文面で同じ語が
    // 出てきたときに気づけなくなる。
    const reviewedTerms = (recipe.reviewed && recipe.reviewed.terms) || [];
    const isReviewed = (f) => reviewedTerms.includes(f.matched);
    const blocks = r.blocks.filter((f) => !isReviewed(f));
    const warns = r.warns.filter((f) => !isReviewed(f));
    const reviewed = [...r.blocks, ...r.warns].filter(isReviewed);

    compBox.replaceChildren();
    const state = blocks.length ? 'block' : warns.length ? 'warn' : 'ok';
    compBox.append(el('div', { class: `comp-head ${state}` },
      blocks.length ? `要修正 ${blocks.length}件`
        : warns.length ? `要確認 ${warns.length}件`
          : '薬機法・景表法チェック：問題なし'
      + (reviewed.length ? `（確認済みの表現 ${reviewed.length}件）` : '')));
    for (const f of [...blocks, ...warns]) {
      compBox.append(el('div', { class: 'comp-item' },
        el('span', { class: 'law' }, `[${f.law}]`),
        el('span', { class: 'matched' }, f.matched),
        ' ' + f.reason,
        el('span', { class: 'fix' }, '→ ' + f.fix)));
    }
    for (const f of reviewed) {
      compBox.append(el('div', { class: 'comp-item' },
        el('span', { class: 'law' }, `[${f.law}]`),
        el('span', { class: 'matched' }, f.matched),
        ' ' + f.reason,
        el('span', { class: 'fix' },
          `→ 原稿のまま使う判断です（${recipe.reviewed.by}／${recipe.reviewed.at}）`)));
    }
    $('#recipe-download').disabled = blocks.length > 0;
  }

  ta.oninput = () => {
    recipeState.captions[recipe.key] = ta.value;
    save(LS.recipe, recipeState);
    renderRecipeCompliance();
  };
  renderRecipeCompliance();

  sel.onchange = (e) => {
    recipeState.key = e.target.value;
    recipeState.heroKey = '';
    save(LS.recipe, recipeState);
    renderRecipeView();
  };
  heroSel.onchange = (e) => {
    recipeState.heroKey = e.target.value;
    save(LS.recipe, recipeState);
    renderRecipeView();
  };
  setupRecipeUpload(recipe, options);
  $('#recipe-copy').onclick = () => copyText(ta.value);
  $('#recipe-reset').onclick = () => {
    delete recipeState.captions[recipe.key];
    save(LS.recipe, recipeState);
    renderRecipeView();
  };
  $('#recipe-download').onclick = async () => {
    const order = ['title', 'ingredients', 'steps', 'outro'];
    for (let i = 0; i < order.length; i++) {
      const blob = await composer.toBlob(canvases[order[i]], 'image/jpeg', 0.94);
      composer.download(blob, `${recipe.key}_${i + 1}_${order[i]}.jpg`);
      // 連続ダウンロードはブラウザに嫌われることがあるので、少し間を置く
      await new Promise((res) => setTimeout(res, 350));
    }
    toast('4枚を書き出しました。1→4の順に並べて投稿してください');
  };
}

/* ============================ 画像ライブラリ ============================ */

let libFilter = 'all';

async function renderLibrary() {
  const rows = await lib.catalogStatus();
  const grid = $('#lib-grid');
  grid.replaceChildren();
  const usage = imageUsage();

  const storedCount = rows.filter((r) => r.stored).length;
  const taggedCount = rows.filter((r) => r.stored && r.tags.length).length;
  const unusedCount = rows.filter((r) => r.stored && !usage.has(r.file)).length;
  $('#lib-stats').textContent =
    `カタログ ${IMAGE_CATALOG.length}点／取込済み ${storedCount}点／タグ付き ${taggedCount}点／未使用 ${unusedCount}点`;
  $('#lib-badge').textContent = String(storedCount);

  const filtered = rows.filter((r) => {
    if (libFilter === 'stored') return !!r.stored;
    if (libFilter === 'missing') return !r.stored;
    if (libFilter === 'untagged') return r.stored && r.tags.length === 0;
    if (libFilter === 'unused') return r.stored && !usage.has(r.file);
    return true;
  });

  for (const r of filtered) {
    const thumb = el('div', { class: 'lib-thumb' });
    if (r.stored) {
      const url = URL.createObjectURL(await lib.blobOf(r.stored));
      thumb.append(el('img', { src: url, alt: r.file, loading: 'lazy' }));
    } else if (r.thumbUrl) {
      const img = el('img', { src: r.thumbUrl, alt: r.file, loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.onerror = () => { img.remove(); thumb.append(el('div', {}, 'プレビュー不可')); };
      thumb.append(img);
    } else {
      thumb.append(el('div', {}, '未取込'));
    }
    thumb.append(el('span', { class: `lib-status ${r.stored ? 'stored' : 'missing'}` }, r.stored ? '取込済み' : '未取込'));

    // 使用回数。0回のものが一目でわかるようにして、写真の使い回しを避ける。
    const u = usage.get(r.file);
    if (r.stored) {
      thumb.append(el('span', { class: `lib-uses ${u ? '' : 'unused'}` },
        u ? `${u.count}回使用` : '未使用'));
    }

    const body = el('div', { class: 'lib-body' }, el('div', { class: 'lib-name' }, r.file));

    // どのレシピの写真かを名前の下に出す。番号だけでは何の料理か分からないため。
    // 商品タグを押すと紐づけ先が変わることがあるので、その場で書き直す。
    const recipeLine = el('div', { class: 'lib-recipe-box' });
    const drawRecipeLine = () => {
      recipeLine.replaceChildren();
      if (!recipeData || !recipeData.recipeOfImage) return;
      const tagsNow = lib.getTags(r.file);
      const linked = lib.loadPhotoRecipes()[r.file] || '';
      const parsed = recipeData.parsePhotoName(r.file);
      // 画面で指定されていれば、それがそのままこの写真のレシピ。
      if (linked === 'none') {
        recipeLine.append(el('div', { class: 'lib-recipe' },
          el('span', { class: 'chip' }, 'レシピ写真ではない'),
          ' 指定により、レシピ投稿には使いません'));
        return;
      }
      const rec = linked ? recipeData.getRecipe(linked) : recipeData.recipeOfImage(r.file, tagsNow);
      if (rec) {
        const role = recipeData.recipePhotoRole(r.file);
        recipeLine.append(el('div', { class: 'lib-recipe' },
          el('span', { class: 'chip accent' },
            `${rec.sku === 'monster' ? 'モンスター' : 'ソバ'} ${String(rec.no).padStart(2, '0')}`),
          ` ${rec.title.replace(/\n/g, '')}`,
          role ? el('span', { class: 'lib-role' }, role) : null));
        // 番号が2商品にまたがっていて、ファイル名に商品が書いていない場合は、
        // タグ次第で紐づけ先が変わる。取り違えの元なので、その旨を出す。
        if (!linked && parsed && !parsed.sku && recipeData.isSharedNumber(parsed.no)) {
          const nn = String(parsed.no).padStart(2, '0');
          recipeLine.append(el('div', { class: 'lib-recipe warn' },
            `${nn} はモンスターとソバの両方にある番号です。いまは商品タグで判定しています。`
            + `違う場合は下の商品タグを直すか、ファイル名を mon${nn}-1 のようにしてください。`));
        }
      } else if (parsed) {
        // 番号は付いているのに紐づかない＝商品タグが未設定の可能性が高い
        recipeLine.append(el('div', { class: 'lib-recipe warn' },
          'レシピ番号は読めましたが、商品タグ（モンスター／ソバ）が未設定のため紐づいていません'));
      }
    };
    drawRecipeLine();
    body.append(recipeLine);

    // 商品タグは1つに絞られる（ソバを押すとモンスターが外れる）ので、
    // 押した札だけでなく、このカードの札すべてを付け直す。
    const chips = [];
    const syncChips = () => {
      const now = lib.getTags(r.file);
      for (const c of chips) c.node.classList.toggle('on', now.includes(c.id));
    };
    for (const [group, label] of [['sku', '商品'], ['scene', 'シーン'], ['space', '文字を載せる余白']]) {
      const tagList = el('div', { class: 'tag-list' });
      for (const t of TAG_VOCAB[group]) {
        const node = el('span', {
          class: `tag ${r.tags.includes(t.id) ? 'on' : ''}`,
          onclick: () => {
            lib.toggleTag(r.file, t.id);
            syncChips();
            drawRecipeLine();
            renderProposals();
          }
        }, t.label);
        chips.push({ node, id: t.id });
        tagList.append(node);
      }
      body.append(el('div', { class: 'tag-group' },
        el('div', { class: 'tag-group-label' }, label), tagList));
    }

    // レシピとの紐づけ。ふだんはファイル名で自動判定するが、
    // 名前を変えられない写真もあるので、ここで直接指定できるようにする。
    if (recipeData && recipeData.RECIPES) {
      const cur = lib.loadPhotoRecipes()[r.file] || '';
      const sel = el('select', {
        class: 'lib-recipe-pick',
        onchange: (ev) => {
          lib.setPhotoRecipe(r.file, ev.target.value);
          drawRecipeLine();
          renderProposals();
          toast(ev.target.value
            ? (ev.target.value === 'none' ? 'レシピ写真から外しました' : 'レシピを指定しました')
            : 'ファイル名での自動判定に戻しました');
        }
      },
        el('option', { value: '', selected: cur === '' ? 'selected' : null }, '自動（ファイル名で判定）'),
        el('option', { value: 'none', selected: cur === 'none' ? 'selected' : null }, 'レシピ写真ではない'),
        ...recipeData.RECIPES.map((rec) => el('option', {
          value: rec.key, selected: rec.key === cur ? 'selected' : null
        }, `${rec.sku === 'monster' ? 'モンスター' : 'ソバ'} ${String(rec.no).padStart(2, '0')}｜`
          + `${rec.title.replace(/\n/g, '')}`))
      );
      body.append(el('div', { class: 'tag-group' },
        el('div', { class: 'tag-group-label' }, 'レシピとの紐づけ'), sel));
    }

    if (r.viewUrl) {
      body.append(el('a', { href: r.viewUrl, target: '_blank', rel: 'noopener', class: 'lib-name' }, 'Drive で開く →'));
    }

    grid.append(el('div', { class: 'lib-item' }, thumb, body));
  }
}

/**
 * 重複を知らせて、どうするか選んでもらう。
 * 戻り値は 'overwrite' | 'skip' | 'cancel'。
 */
function askAboutDuplicates(duplicates, freshCount) {
  const back = $('#dup-modal');
  const names = duplicates.map((d) => d.key);
  $('#dup-lead').textContent =
    `選んだファイルのうち ${duplicates.length}点が、すでにライブラリにある画像と同じ名前です`
    + (freshCount ? `（残り ${freshCount}点は新規）。` : '。');
  $('#dup-list').textContent = names.join('\n');
  back.hidden = false;

  return new Promise((resolve) => {
    const done = (choice) => {
      back.hidden = true;
      document.removeEventListener('keydown', onKey);
      resolve(choice);
    };
    const onKey = (e) => { if (e.key === 'Escape') done('cancel'); };
    document.addEventListener('keydown', onKey);
    $('#dup-overwrite').onclick = () => done('overwrite');
    $('#dup-skip').onclick = () => done('skip');
    $('#dup-cancel').onclick = () => done('cancel');
    $('#dup-copy').onclick = () => copyText(names.join('\n'));
    back.onclick = (e) => { if (e.target === back) done('cancel'); };
    $('#dup-overwrite').focus();
  });
}

function setupDropzone() {
  const dz = $('#dropzone');
  $('#dz-note').textContent = backend.isShared
    ? '画像は会社のドライブに保存され、メンバー全員が同じ写真を使えます。'
    : '画像はこの端末のブラウザ内（IndexedDB）に保存されます。どこにもアップロードされません。';
  const onFiles = async (files) => {
    if (!files || !files.length) return;

    // 黙って上書きすると元の画像が消えるので、先に名前の衝突を調べる
    const { duplicates, fresh, skipped } = await lib.inspectFiles(files);
    let overwrite = true;
    let list = files;

    if (duplicates.length) {
      const choice = await askAboutDuplicates(duplicates, fresh.length);
      if (choice === 'cancel') {
        toast('取り込みをやめました');
        return;
      }
      overwrite = choice === 'overwrite';
    }

    // 共有モードでは Drive へ1枚ずつ送るので時間がかかる。
    // 何も出ないと固まったように見えるため、進み具合を出し続ける。
    const progress = showProgress('取り込み中…');
    let r;
    try {
      r = await lib.importFiles(list, {
        overwrite,
        onProgress: (done, total, name) => progress.update(`取り込み中… ${done} / ${total}　${name}`)
      });
    } catch (err) {
      progress.done();
      console.error('取り込みに失敗しました:', err);
      toast(`取り込みに失敗しました：${err && err.message ? err.message : err}`);
      return;
    }
    progress.done();
    stored = await lib.listStored();
    // 取り込んだ画像はレシピ画面の候補にもなるので、画面全体を作り直す。
    await refresh();

    const parts = [`${r.added}点を取り込みました`];
    if (r.matched) parts.push(`カタログ一致 ${r.matched}点`);
    if (r.overwritten) parts.push(`上書き ${r.overwritten}点`);
    if (r.skippedDup.length) parts.push(`同名を飛ばした ${r.skippedDup.length}点`);
    if (skipped) parts.push(`画像以外を除外 ${skipped}点`);
    toast(parts.join(' / '));
  };

  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => onFiles(e.dataTransfer.files));
  $('#file-input').addEventListener('change', async (e) => {
    const input = e.target;
    const files = input.files;
    // 選択を空に戻しておく。そうしないと、同じファイルを選び直したときに
    // change が発火せず、やり直しができない。
    await onFiles(files);
    input.value = '';
  });
}

/* ============================ スペック ============================ */

function renderSpec() {
  const c = $('#spec-content');
  c.replaceChildren();

  for (const p of Object.values(PRODUCTS)) {
    const n = p.nutrition;
    const rows = [
      ['名称', p.category], ['内容量', p.volume], ['原材料名', p.ingredients],
      ['原産国', p.origin], ['ゆで時間', `${p.boilMin}分`], ['ゆであがり目安', `${p.cookedWeightG}g`],
      ['保存方法', p.storage]
    ];
    const nuts = [
      ['エネルギー', `${n.kcal} kcal`], ['たんぱく質', `${n.protein} g`], ['脂質', `${n.fat} g`],
      ['炭水化物', `${n.carb} g`], ['　うち糖質', `${n.sugar} g`], ['　うち食物繊維', `${n.fiber} g`],
      ['食塩相当量', `${n.salt} g`]
    ];
    c.append(el('div', { class: 'card' },
      el('h2', {}, `${p.name}（${p.nameJa}）`),
      el('table', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', {}, v)))),
      el('h3', {}, `栄養成分表示（1食 ${p.servingG}g あたり）`),
      el('table', {}, ...nuts.map(([k, v]) => el('tr', {}, el('th', {}, k), el('td', { class: 'num' }, v)))),
      el('h3', {}, 'アレンジ例'),
      el('div', { class: 'chips' }, ...p.recipes.map((r) => el('span', { class: 'chip' }, `${r.name}｜${r.note}`)))
    ));
  }

  c.append(el('div', { class: 'card' },
    el('h2', {}, '共通情報'),
    el('h3', {}, '不使用'),
    el('div', { class: 'chips' }, ...COMMON.freeFrom.map((f) => el('span', { class: 'chip' }, f))),
    el('h3', {}, '製造工場の認証'),
    el('div', { class: 'chips' }, ...COMMON.certifications.map((x) => el('span', { class: 'chip accent' }, `${x.code}（${x.desc}）`))),
    el('h3', {}, '比較データ（使用時は注記が必須）'),
    el('table', {},
      ...Object.values(COMPARISONS).map((x) => el('tr', {},
        el('th', {}, x.label),
        el('td', {}, x.protein !== undefined ? `たんぱく質 ${x.protein}g` : `糖質 ${x.sugarPer100g}g/100g`),
        el('td', {}, x.source || '—')))),
    el('h3', {}, '注意事項'),
    ...COMMON.cautions.map((x) => el('p', { class: 'hint' }, '・' + x))
  ));

  c.append(el('div', { class: 'card danger' },
    el('h2', {}, '資料上の確認事項'),
    ...DATA_NOTES.map((x) => el('p', { class: 'hint' }, '・' + x)),
    el('p', { class: 'hint' }, `素材フォルダ：`, el('a', { href: DRIVE_FOLDER_URL, target: '_blank', rel: 'noopener' }, DRIVE_FOLDER_URL))
  ));
}

/* ============================ 投稿ログ ============================ */

async function renderLog() {
  const c = $('#log-content');
  c.replaceChildren();
  if (!postLog.entries.length) {
    c.append(el('div', { class: 'card' }, el('p', { class: 'hint' }, 'まだ投稿記録はありません。')));
    return;
  }

  // 同じ写真が何度も出てくるので、1枚につき1回だけ読み込んで URL を使い回す。
  // 共有モードでは1枚ごとに Drive へ取りに行くため、ここを分けないと重い。
  const urls = new Map();
  const urlFor = async (key) => {
    if (!key) return null;
    if (urls.has(key)) return urls.get(key);
    const item = stored.find((s) => s.key === key);
    let url = null;
    try {
      const blob = item ? await lib.blobOf(item) : null;
      if (blob) url = URL.createObjectURL(blob);
    } catch (err) {
      console.error('投稿ログの画像を読み込めませんでした:', key, err);
    }
    urls.set(key, url);
    return url;
  };

  for (const e of postLog.entries) {
    const url = await urlFor(e.image);
    const thumb = el('div', { class: 'log-thumb' });
    if (url) {
      const img = el('img', { src: url, alt: e.image, loading: 'lazy' });
      img.title = e.image + '（クリックで拡大）';
      img.onclick = () => window.open(url, '_blank', 'noopener');
      thumb.append(img);
    } else {
      // 画像を消したあとでもログは残る。無言で空欄にせず、理由がわかるようにする。
      thumb.append(el('div', { class: 'log-thumb-none' },
        e.image ? 'ライブラリにありません' : '画像なし'));
    }

    c.append(el('div', { class: 'card log-entry' },
      thumb,
      el('div', { class: 'log-body' },
        el('div', { class: 'chips' },
          el('span', { class: 'chip accent' }, e.platform === 'ig' ? 'Instagram' : 'X'),
          el('span', { class: 'chip' }, e.dateKey),
          el('span', { class: 'chip' }, e.axis),
          el('span', { class: 'chip' }, e.sku),
          e.image ? el('span', { class: 'chip' }, e.image) : null),
        el('pre', { class: 'hint', style: 'white-space:pre-wrap;margin-top:10px' }, e.text))
    ));
  }
}

/* ============================ 設定 ============================ */

/**
 * ロゴを読み直して、合成に使える形（ビットマップ）にしておく。
 * ファイルは一切加工しない。合成時に縦横比のまま拡縮するだけ。
 */
async function reloadLogos() {
  const rec = await lib.loadLogos();
  const toBitmap = async (r) => (r && r.blob ? composer.loadBitmap(r.blob) : null);
  logos = {
    onPhoto: await toBitmap(rec.onPhoto),
    onLight: await toBitmap(rec.onLight),
    hasOnPhoto: rec.hasOnPhoto,
    hasOnLight: rec.hasOnLight,
    names: { onPhoto: rec.onPhoto ? rec.onPhoto.name : '', onLight: rec.onLight ? rec.onLight.name : '' }
  };
}

/** 設定タブのロゴ登録欄を組む */
function renderLogoSettings() {
  const box = $('#logo-slots');
  box.textContent = '';
  for (const [slot, label] of Object.entries(lib.LOGO_SLOTS)) {
    const has = slot === 'onPhoto' ? logos.hasOnPhoto : logos.hasOnLight;
    const bmp = logos[slot];
    const borrowed = !has && bmp; // もう片方を流用している状態

    const preview = el('div', { class: `logo-preview ${slot}` });
    if (bmp) {
      const c = el('canvas');
      const h = 56;
      c.width = Math.max(1, Math.round((bmp.width / bmp.height) * h));
      c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      preview.append(c);
    } else {
      preview.append(el('span', { class: 'hint' }, '未登録（文字で組んだ代用を描きます）'));
    }

    box.append(el('div', { class: 'logo-slot' },
      el('div', { class: 'logo-slot-head' },
        el('b', {}, label),
        borrowed ? el('span', { class: 'chip' }, 'もう一方を流用中') : null,
        has && bmp ? el('span', { class: 'chip' }, `${bmp.width}×${bmp.height}px`) : null),
      preview,
      el('div', { class: 'row' },
        el('label', { class: 'btn ghost' }, has ? 'ロゴを差し替える' : 'ロゴを登録する',
          el('input', {
            type: 'file', accept: 'image/png,image/svg+xml,image/webp,image/*', hidden: 'hidden',
            onchange: async (e) => {
              const file = e.target.files[0];
              e.target.value = '';
              if (!file) return;
              if (/svg/i.test(file.type)) {
                toast('SVG は canvas に描けないことがあります。PNG（背景透過）をおすすめします');
              }
              await lib.saveLogo(slot, file);
              await reloadLogos();
              toast('ロゴを登録しました');
              await refresh();
            }
          })),
        has ? el('button', {
          class: 'btn ghost',
          onclick: async () => {
            await lib.removeLogo(slot);
            await reloadLogos();
            toast('ロゴを削除しました');
            await refresh();
          }
        }, '削除') : null)
    ));
  }
}

function renderSettings() {
  renderLogoSettings();
  // 保存先の説明は、共有版と端末版で内容が変わる。取り違えると誤解を招く。
  $('#data-note').textContent = backend.isShared
    ? 'タグ・編集内容・投稿ログ・商品指定は、会社のドライブに保存され、メンバー全員で共有されます。'
    : 'タグ・編集内容・投稿ログは、このブラウザにのみ保存されています。';
  $('#accent-input').value = settings.accent;
  $('#ig-aspect').value = settings.igAspect;
  $('#x-aspect').value = settings.xAspect;
  $('#opt-pr').checked = settings.prMode;
  $('#opt-sync').checked = settings.syncPlatforms;
  // 通知メールは運用しない方針。毎朝この画面を開いて確認する。
  $('#cron-hint').innerHTML =
    'メールでの通知は行いません。毎朝この画面を開いてその日の提案をご確認ください。' +
    '提案は日付から決まるため、<b>誰がいつ開いても同じ内容</b>になります。' +
    '前日までの提案を見たいときは、右上の「対象日」で日付を変えてください。';

  $('#accent-input').onchange = (e) => { settings.accent = e.target.value; save(LS.settings, settings); refresh(); };
  $('#ig-aspect').onchange = (e) => { settings.igAspect = e.target.value; save(LS.settings, settings); refresh(); };
  $('#x-aspect').onchange = (e) => { settings.xAspect = e.target.value; save(LS.settings, settings); refresh(); };
  $('#opt-pr').onchange = (e) => { settings.prMode = e.target.checked; save(LS.settings, settings); refresh(); };
  $('#opt-sync').onchange = (e) => { settings.syncPlatforms = e.target.checked; save(LS.settings, settings); refresh(); };

  $('#btn-export').onclick = () => {
    const data = { settings, edits, log: postLog, tags: lib.loadTags(), sku: skuOverrides };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    composer.download(blob, `pm-sns-settings-${jstDateKey()}.json`);
  };
  $('#import-json').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.settings) { settings = { ...defaultSettings, ...data.settings }; save(LS.settings, settings); }
      if (data.edits) { edits = data.edits; save(LS.edits, edits); }
      if (data.log) { postLog = data.log; save(LS.log, postLog); }
      if (data.tags) lib.saveTags(data.tags);
      if (data.sku) { skuOverrides = data.sku; save(LS.sku, skuOverrides); }
      toast('読み込みました');
      refresh();
    } catch { toast('読み込めませんでした'); }
  };
  $('#btn-clear').onclick = async () => {
    if (!confirm('取り込んだ画像をすべて削除します。タグと設定は残ります。')) return;
    await lib.clearAll();
    stored = [];
    refresh();
    toast('画像ライブラリを空にしました');
  };
}

/* ============================ 起動 ============================ */

/**
 * 描画に失敗したとき、原因をその画面の中に出す。
 * コンソールを開いてもらわないと原因が分からない状態が続いたので、
 * エラー本文とスタックを画面に出し、そのままコピーできるようにした。
 */
function showViewError(viewSel, name, err) {
  const view = $(viewSel);
  if (!view) return;
  const detail = [
    `${name} の描画に失敗`,
    `${err && err.name ? err.name : 'Error'}: ${err && err.message ? err.message : String(err)}`,
    err && err.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : ''
  ]
    .filter(Boolean)
    .join('\n');

  let box = $('.view-error', view);
  if (!box) {
    box = el('div', { class: 'view-error notice danger' });
    view.prepend(box);
  }
  box.textContent = '';
  box.append(
    el('p', {}, el('b', {}, `${name} を表示できませんでした。`)),
    el('pre', { class: 'view-error-detail' }, detail),
    el(
      'div',
      { class: 'row' },
      el(
        'button',
        {
          class: 'btn ghost',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(detail);
              toast('エラー内容をコピーしました');
            } catch {
              toast('コピーできませんでした（文字を選んでコピーしてください）');
            }
          }
        },
        'このエラーをコピー'
      ),
      el('button', { class: 'btn ghost', onclick: () => refresh() }, 'もう一度読み込む')
    )
  );
}

function clearViewError(viewSel) {
  const box = $(`${viewSel} .view-error`);
  if (box) box.remove();
}

async function refresh() {
  // どこか1つが失敗しても、残りの画面は描けるようにする。
  const steps = [
    ['今日の提案', '#view-proposals', renderProposals],
    ['画像ライブラリ', '#view-library', renderLibrary],
    ['レシピ投稿', '#view-recipe', renderRecipeView],
    ['スペック', '#view-spec', renderSpec],
    ['投稿ログ', '#view-log', renderLog],
    ['設定', '#view-settings', renderSettings]
  ];
  for (const [name, viewSel, fn] of steps) {
    try {
      await fn();
      clearViewError(viewSel);
    } catch (err) {
      console.error(`${name} の描画に失敗しました:`, err);
      showViewError(viewSel, name, err);
      toast(`${name} の表示に失敗しました（画面のエラー内容をご覧ください）`);
    }
  }
  document.documentElement.style.setProperty('--accent', settings.accent);
}

function setupTabs() {
  $$('#tabs .tab').forEach((tab) => {
    tab.onclick = () => {
      $$('#tabs .tab').forEach((t) => t.classList.remove('active'));
      $$('main .view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      $(`#view-${tab.dataset.view}`).classList.add('active');
    };
  });
  $$('.lib-filters .chip-btn').forEach((b) => {
    b.onclick = () => {
      $$('.lib-filters .chip-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      libFilter = b.dataset.filter;
      renderLibrary();
    };
  });
}

/** 共有モードのとき、上部に利用者名・保存状況・更新ボタンを出す */
function setupSharedBar() {
  if (!backend.isShared) return;
  const user = backend.currentUser();
  const status = el('span', { class: 'save-state', id: 'save-state' }, '共有中');
  backend.onStatus((state) => {
    status.textContent = state === 'saving' ? '保存中…' : state === 'error' ? '保存に失敗' : '保存済み';
    status.classList.toggle('bad', state === 'error');
  });
  $('.topbar-right').prepend(
    el('div', { class: 'share-bar' },
      el('span', { class: 'chip accent' }, '共有版'),
      el('span', { class: 'who' }, user && user.email ? user.email : 'ログイン中'),
      status,
      el('button', {
        class: 'btn ghost', title: '書きかけの変更をいますぐ共有データへ書き込みます',
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          try {
            const r = await backend.flushNow();
            if (!r.ok) {
              const m = r.error && r.error.message ? r.error.message : '通信に失敗しました';
              toast(`保存に失敗しました：${m}（もう一度お試しください）`);
            } else if (r.count === 0) {
              toast('保存済みです（未保存の変更はありません）');
            } else {
              toast('保存しました。ほかのメンバーの画面にも反映されます');
            }
          } finally {
            btn.disabled = false;
          }
        }
      }, '更新を保存'),
      el('button', {
        class: 'btn ghost', title: '他のメンバーの更新を取り込みます',
        onclick: async () => {
          await backend.flushNow();
          await backend.pull();
          adoptSharedState();
          stored = await lib.listStored();
          await reloadLogos();
          await refresh();
          toast('最新の内容を読み込みました');
        }
      }, '最新に更新')
    )
  );
  // 書きかけを残したまま閉じられないようにする
  window.addEventListener('beforeunload', () => { backend.flushNow(); });
}

/**
 * 拾いそこねたエラーを画面に出す。
 * 非同期の処理で失敗すると、これまでは画面が空のまま何も表示されなかった。
 * 原因を毎回コンソールで探すことになるので、その場に出す。
 */
function catchStrayErrors() {
  const show = (label, detail) => {
    const box = document.createElement('div');
    box.className = 'notice danger';
    box.style.margin = '16px';
    box.innerHTML = `<b>${label}</b><pre class="view-error-detail"></pre>`;
    box.querySelector('pre').textContent = detail;
    document.body.prepend(box);
  };
  window.addEventListener('error', (e) => {
    show('読み込み中にエラーが起きました', `${e.message}\n${e.filename || ''}:${e.lineno || ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    show('処理の途中で失敗しました', r && r.stack ? String(r.stack) : String(r && r.message ? r.message : r));
  });
}

async function boot() {
  catchStrayErrors();
  if (backend.isShared) {
    try {
      await backend.init();
      adoptSharedState();
    } catch (err) {
      console.error('共有データを読み込めませんでした:', err);
      const box = document.createElement('div');
      box.className = 'notice danger';
      box.style.margin = '16px';
      box.innerHTML = '<b>共有データを読み込めませんでした。</b><pre class="view-error-detail"></pre>';
      box.querySelector('pre').textContent = err && err.stack ? String(err.stack) : String(err && err.message ? err.message : err);
      document.body.prepend(box);
    }
  }
  setupSharedBar();
  await loadRecipeModules();
  if (recipeData && !recipeState.key && recipeData.RECIPES[0]) {
    recipeState.key = recipeData.RECIPES[0].key;
  }
  setupTabs();
  setupDropzone();
  $('#date-input').value = dateKey;
  $('#date-input').onchange = (e) => { dateKey = e.target.value || jstDateKey(); variants = { ig: 0, x: 0 }; refresh(); };
  $('#btn-today').onclick = () => {
    dateKey = jstDateKey();
    $('#date-input').value = dateKey;
    variants = { ig: 0, x: 0 };
    refresh();
  };
  stored = await lib.listStored();
  try {
    await reloadLogos();
  } catch (err) {
    console.warn('ロゴを読み込めませんでした:', err);
  }
  await refresh();
}

boot();
