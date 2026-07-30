// ダッシュボード本体
import { generateDailyPlan, jstDateKey, buildProposal } from './engine.js';
import { checkCompliance } from './compliance.js';
import { PRODUCTS, COMMON, COMPARISONS, DATA_NOTES } from './data/products.js';
import { TAG_VOCAB, DRIVE_FOLDER_URL, IMAGE_CATALOG } from './data/images.js';
import * as lib from './library.js';
import * as composer from './composer.js';
import * as recipeArt from './recipe.js';
import { RECIPES, OUTRO, SWIPE_BAR, getRecipe, resolveRecipe } from './data/recipes.js';
import { HASHTAGS } from './data/copy.js';

/* ============================ 状態 ============================ */

const LS = {
  settings: 'pm-sns:settings',
  edits: 'pm-sns:edits',
  log: 'pm-sns:log',
  recipe: 'pm-sns:recipe'
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

const load = (k, fb) => {
  try { return { ...fb, ...JSON.parse(localStorage.getItem(k) || '{}') }; }
  catch { return { ...fb }; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

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
let recipeState = load(LS.recipe, { key: RECIPES[0] ? RECIPES[0].key : null, heroKey: '', captions: {} });
if (!recipeState.captions) recipeState.captions = {};

let dateKey = jstDateKey();
let variants = { ig: 0, x: 0 };
let stored = [];

/* ============================ 小道具 ============================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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

async function renderProposals() {
  const list = $('#proposal-list');
  list.replaceChildren();
  $('#no-images-notice').hidden = stored.length > 0;

  const sync = settings.syncPlatforms;
  const plan = generateDailyPlan(dateKey, variants, { sync });
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

  /* --- ヘッダ --- */
  card.append(
    el('div', { class: 'post-head' },
      el('div', { class: `platform ${post.platform}` }, el('span', { class: 'dot' }), platformLabel),
      el('div', { class: 'chips' },
        el('span', { class: 'chip accent' }, post.axisLabel),
        el('span', { class: 'chip' }, post.skuLabel),
        el('span', { class: 'chip' }, isComposite ? '写真＋文字合成' : '写真そのまま'),
        posted ? el('span', { class: 'chip accent' }, '投稿済み') : null,
        hookDup ? el('span', { class: 'chip dup' }, `書き出し重複（${hookDup.dateKey}）`) : null,
        imageDup ? el('span', { class: 'chip dup' }, `この写真は${Math.round(daysAgo(usage.lastAt))}日前にも使用`) : null,
        sameAsSibling ? el('span', { class: 'chip dup' }, 'もう1本と同じ写真') : null
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
    const bmp = await composer.loadBitmap(imageItem.blob);
    await composer.render(canvas, bmp, {
      aspect,
      overlay: isComposite ? post.image.overlay : null,
      accent: settings.accent
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

  const controls = el('div', { class: 'img-controls' },
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
        }, ...Object.entries(composer.TEMPLATES).map(([k, label]) =>
          el('option', { value: k, selected: k === (overlay.template || 'hook') ? 'selected' : null }, label))),
        el('select', {
          onchange: (e) => patchOverlay({ position: e.target.value })
        }, ...Object.entries(composer.POSITIONS).map(([k, label]) =>
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

  card.append(
    el('div', { class: 'editor' },
      el('label', {}, 'キャプション'), captionArea,
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

/** レシピの写真候補。タグでSKUが一致するものを前に出す。 */
function recipePhotoOptions(recipe) {
  const tags = lib.loadTags();
  const score = (item) => {
    const t = tags[item.key] || [];
    let v = 0;
    if (t.includes(recipe.sku)) v += 3;
    if (t.includes('both')) v += 1;
    if (t.includes('cooked')) v += 2;
    return -v;
  };
  return [...stored].sort((a, b) => score(a) - score(b) || a.key.localeCompare(b.key));
}

async function renderRecipeView() {
  const notice = $('#recipe-notice');
  const slidesBox = $('#recipe-slides');
  const sel = $('#recipe-select');
  const heroSel = $('#recipe-hero');

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
    ...options.map((o) => el('option', {
      value: o.key, selected: o.key === chosenKey ? 'selected' : null
    }, o.key))
  );

  notice.hidden = stored.length > 0;
  if (!stored.length) {
    notice.textContent = '画像ライブラリが空です。①のタイトル画像に写真を使うには、先に画像を取り込んでください。②③④は写真なしでも書き出せます。';
  }

  const heroItem = stored.find((x) => x.key === chosenKey) || null;
  const heroImg = heroItem ? await composer.loadBitmap(heroItem.blob) : null;

  // ④のサムネは、他のレシピのできあがり写真を使う
  const thumbItems = options.filter((o) => o.key !== chosenKey).slice(0, 3);
  const thumbs = [];
  for (const t of thumbItems) thumbs.push(await composer.loadBitmap(t.blob));

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
      heroImg, thumbs, accent: settings.accent, outro: OUTRO, swipeBar: SWIPE_BAR
    });
  }

  // キャプション
  // ハッシュタグはレシピ寄りに。キーで決まるので毎回同じ並びになる。
  const tags = [];
  for (const t of [...HASHTAGS.core, ...HASHTAGS.bySku[recipe.sku],
    ...HASHTAGS.byAxis.time, ...HASHTAGS.byAxis.diet]) {
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
    compBox.replaceChildren();
    const state = r.blocks.length ? 'block' : r.warns.length ? 'warn' : 'ok';
    compBox.append(el('div', { class: `comp-head ${state}` },
      r.blocks.length ? `要修正 ${r.blocks.length}件`
        : r.warns.length ? `要確認 ${r.warns.length}件`
          : '薬機法・景表法チェック：問題なし'));
    for (const f of [...r.blocks, ...r.warns]) {
      compBox.append(el('div', { class: 'comp-item' },
        el('span', { class: 'law' }, `[${f.law}]`),
        el('span', { class: 'matched' }, f.matched),
        ' ' + f.reason,
        el('span', { class: 'fix' }, '→ ' + f.fix)));
    }
    $('#recipe-download').disabled = r.blocks.length > 0;
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
      const url = URL.createObjectURL(r.stored.blob);
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

    for (const [group, label] of [['sku', '商品'], ['scene', 'シーン'], ['space', '文字を載せる余白']]) {
      const tagList = el('div', { class: 'tag-list' });
      for (const t of TAG_VOCAB[group]) {
        tagList.append(el('span', {
          class: `tag ${r.tags.includes(t.id) ? 'on' : ''}`,
          onclick: (ev) => {
            lib.toggleTag(r.file, t.id);
            ev.target.classList.toggle('on');
            renderProposals();
          }
        }, t.label));
      }
      body.append(el('div', { class: 'tag-group' },
        el('div', { class: 'tag-group-label' }, label), tagList));
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

    toast('取り込み中…');
    const r = await lib.importFiles(list, { overwrite });
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

function renderLog() {
  const c = $('#log-content');
  c.replaceChildren();
  if (!postLog.entries.length) {
    c.append(el('div', { class: 'card' }, el('p', { class: 'hint' }, 'まだ投稿記録はありません。')));
    return;
  }
  for (const e of postLog.entries) {
    c.append(el('div', { class: 'card' },
      el('div', { class: 'chips' },
        el('span', { class: 'chip accent' }, e.platform === 'ig' ? 'Instagram' : 'X'),
        el('span', { class: 'chip' }, e.dateKey),
        el('span', { class: 'chip' }, e.axis),
        el('span', { class: 'chip' }, e.sku),
        e.image ? el('span', { class: 'chip' }, e.image) : null),
      el('pre', { class: 'hint', style: 'white-space:pre-wrap;margin-top:10px' }, e.text)
    ));
  }
}

/* ============================ 設定 ============================ */

function renderSettings() {
  $('#accent-input').value = settings.accent;
  $('#ig-aspect').value = settings.igAspect;
  $('#x-aspect').value = settings.xAspect;
  $('#opt-pr').checked = settings.prMode;
  $('#opt-sync').checked = settings.syncPlatforms;
  $('#cron-hint').innerHTML =
    '毎朝 8:00（日本時間）に GitHub Actions が動き、その日の提案の要点をメールで送ります。' +
    '提案そのものは日付をシードに生成されるため、メールとこの画面の内容は必ず一致します。' +
    '送信先や SMTP の設定は <code>.github/workflows/daily-sns-brief.yml</code> と リポジトリの Secrets で管理します。';

  $('#accent-input').onchange = (e) => { settings.accent = e.target.value; save(LS.settings, settings); refresh(); };
  $('#ig-aspect').onchange = (e) => { settings.igAspect = e.target.value; save(LS.settings, settings); refresh(); };
  $('#x-aspect').onchange = (e) => { settings.xAspect = e.target.value; save(LS.settings, settings); refresh(); };
  $('#opt-pr').onchange = (e) => { settings.prMode = e.target.checked; save(LS.settings, settings); refresh(); };
  $('#opt-sync').onchange = (e) => { settings.syncPlatforms = e.target.checked; save(LS.settings, settings); refresh(); };

  $('#btn-export').onclick = () => {
    const data = { settings, edits, log: postLog, tags: lib.loadTags() };
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

async function refresh() {
  await renderProposals();
  await renderLibrary();
  await renderRecipeView();
  renderSpec();
  renderLog();
  renderSettings();
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

async function boot() {
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
  await refresh();
}

boot();
