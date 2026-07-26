// 画像ライブラリ（ブラウザ内ストック）
//
// 画像の実体は IndexedDB に Blob のまま保存する。localStorage では容量が足りない。
// Drive から直接読まないのは、canvas に描いた瞬間タイントして書き出せなくなるため。
// 一度ドラッグ＆ドロップすれば、以後はブラウザを閉じても残る。

import { IMAGE_CATALOG, TAG_VOCAB } from './data/images.js';

const DB_NAME = 'pm-sns';
const DB_VERSION = 1;
const STORE = 'images';
const TAGS_KEY = 'pm-sns:tags';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const out = fn(store);
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
      })
  );
}

/** ファイル名を正規化してカタログと照合する（全角記号や拡張子の大小差を吸収） */
export function normalizeName(name) {
  return String(name)
    .replace(/^.*[\\/]/, '')
    .trim()
    .toLowerCase()
    .replace(/[●○・\s]/g, '');
}

const CATALOG_BY_NORM = new Map(IMAGE_CATALOG.map((c) => [normalizeName(c.file), c]));

/** File[] を取り込む。カタログ外のファイルも受け入れる（追加素材として登録）。 */
export async function importFiles(fileList) {
  const result = { added: 0, matched: 0, skipped: 0, extras: [] };
  const files = [...fileList].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
  result.skipped = fileList.length - files.length;

  for (const file of files) {
    const norm = normalizeName(file.name);
    const cat = CATALOG_BY_NORM.get(norm);
    const key = cat ? cat.file : file.name;
    const blob = file.slice(0, file.size, file.type || 'image/jpeg');
    await tx('readwrite', (store) =>
      store.put({
        key,
        norm,
        name: file.name,
        driveId: cat ? cat.driveId : null,
        size: file.size,
        type: file.type || 'image/jpeg',
        importedAt: Date.now(),
        blob
      })
    );
    result.added++;
    if (cat) result.matched++;
    else result.extras.push(file.name);
  }
  return result;
}

export async function listStored() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getImage(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeImage(key) {
  return tx('readwrite', (store) => store.delete(key));
}

export async function clearAll() {
  return tx('readwrite', (store) => store.clear());
}

/* --------------------------- タグ --------------------------- */

export function loadTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveTags(tags) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

export function getTags(key) {
  return loadTags()[key] || [];
}

export function toggleTag(key, tag) {
  const all = loadTags();
  const cur = new Set(all[key] || []);
  // scene / sku / space は排他ではなく複数可。ただし sku は1つに絞る。
  const skuIds = TAG_VOCAB.sku.map((t) => t.id);
  const spaceIds = TAG_VOCAB.space.map((t) => t.id);
  if (cur.has(tag)) {
    cur.delete(tag);
  } else {
    if (skuIds.includes(tag)) skuIds.forEach((s) => cur.delete(s));
    if (spaceIds.includes(tag)) spaceIds.forEach((s) => cur.delete(s));
    cur.add(tag);
  }
  all[key] = [...cur];
  saveTags(all);
  return all[key];
}

/* --------------------------- 画像の自動選択 --------------------------- */

/**
 * 投稿プランに合う画像をライブラリから選ぶ。
 * タグが付いていればタグで、付いていなければ取込済みの中から決定的に選ぶ。
 * 「毎回同じ写真ばかり」を避けるため、seed で回す。
 *
 * @param {Array} stored listStored() の結果
 * @param {object} plan  engine の image プラン
 * @param {string} seed  決定性のためのシード（通常は post.id）
 * @param {string[]} exclude 除外したいキー（同日に別投稿で使った写真など）
 */
export function pickImage(stored, plan, seed, exclude = []) {
  if (!stored.length) return null;
  const tags = loadTags();
  const pool = stored.filter((s) => !exclude.includes(s.key));
  const usable = pool.length ? pool : stored;

  const scored = usable.map((item) => {
    const t = tags[item.key] || [];
    let score = 0;
    // SKU 一致は強く効かせる。'both' は減点なし。
    if (t.includes(plan.preferSku)) score += 6;
    else if (t.includes('both')) score += 3;
    else if (t.includes('monster') || t.includes('sova')) score -= 4; // 逆のSKUが写っている
    // シーンの相性
    const sceneIdx = plan.preferScene.findIndex((s) => t.includes(s));
    if (sceneIdx >= 0) score += 5 - sceneIdx;
    // 合成なら余白のある写真を優先、そのまま使うなら余白なしでも構わない
    if (plan.mode === 'composite') {
      if (t.includes(plan.preferSpace)) score += 3;
      if (t.includes('space-none')) score -= 5;
    }
    if (t.length === 0) score -= 1; // 未タグはわずかに後ろへ
    return { item, score };
  });

  const max = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === max);
  // 同点の中から seed で決定的に1枚
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return top[h % top.length].item;
}

/** カタログと取込状況を突き合わせた一覧を返す（ライブラリ画面用） */
export async function catalogStatus() {
  const stored = await listStored();
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const tags = loadTags();
  const rows = IMAGE_CATALOG.map((c) => ({
    ...c,
    stored: byKey.get(c.file) || null,
    tags: tags[c.file] || []
  }));
  // カタログにない追加素材
  const extraKeys = stored.filter((s) => !IMAGE_CATALOG.some((c) => c.file === s.key));
  const extras = extraKeys.map((s) => ({
    file: s.key,
    driveId: null,
    shoot: '追加素材',
    viewUrl: null,
    thumbUrl: null,
    stored: s,
    tags: tags[s.key] || []
  }));
  return [...rows, ...extras];
}
