// 画像ライブラリ（ブラウザ内ストック）
//
// 画像の実体は IndexedDB に Blob のまま保存する。localStorage では容量が足りない。
// Drive から直接読まないのは、canvas に描いた瞬間タイントして書き出せなくなるため。
// 一度ドラッグ＆ドロップすれば、以後はブラウザを閉じても残る。

import { IMAGE_CATALOG, TAG_VOCAB } from './data/images.js';
import * as backend from './backend.js';

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

/** 画像として扱えるファイルだけに絞る */
function imageFilesOnly(fileList) {
  return [...fileList].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
}

/** ライブラリに登録されるときのキー（カタログに一致すればカタログ側の名前） */
function keyFor(file) {
  const cat = CATALOG_BY_NORM.get(normalizeName(file.name));
  return cat ? cat.file : file.name;
}

/**
 * 取り込む前に、既にあるものと名前がぶつかるファイルを洗い出す。
 * 黙って上書きすると元の画像が失われるので、必ずこれを先に通す。
 * @returns {{duplicates: Array<{file: File, key: string, existing: object}>, fresh: File[], skipped: number}}
 */
export async function inspectFiles(fileList) {
  const files = imageFilesOnly(fileList);
  const stored = await listStored();
  const byKey = new Map(stored.map((s) => [s.key, s]));

  const duplicates = [];
  const fresh = [];
  const seenInBatch = new Set();
  for (const file of files) {
    const key = keyFor(file);
    const existing = byKey.get(key);
    // 同じ選択の中に同名が2つある場合も重複として扱う
    if (existing || seenInBatch.has(key)) {
      duplicates.push({ file, key, existing: existing || null });
    } else {
      fresh.push(file);
    }
    seenInBatch.add(key);
  }
  return { duplicates, fresh, skipped: fileList.length - files.length };
}

/**
 * File[] を取り込む。カタログ外のファイルも受け入れる（追加素材として登録）。
 * @param {FileList|File[]} fileList
 * @param {{overwrite?: boolean, onProgress?: (done: number, total: number, name: string) => void}} opts
 *   overwrite が false のときは同名を飛ばす。
 *   共有モードでは1枚ずつ Drive へ送るため時間がかかる。onProgress で進み具合を返す。
 */
export async function importFiles(fileList, opts = {}) {
  const overwrite = opts.overwrite !== false;
  const result = { added: 0, matched: 0, skipped: 0, overwritten: 0, skippedDup: [], extras: [] };
  const files = imageFilesOnly(fileList);
  result.skipped = fileList.length - files.length;

  const stored = await listStored();
  const existingKeys = new Set(stored.map((s) => s.key));

  for (const file of files) {
    const norm = normalizeName(file.name);
    const cat = CATALOG_BY_NORM.get(norm);
    const key = cat ? cat.file : file.name;

    if (existingKeys.has(key)) {
      if (!overwrite) {
        result.skippedDup.push(key);
        continue;
      }
      result.overwritten++;
    }

    const blob = file.slice(0, file.size, file.type || 'image/jpeg');
    if (backend.isShared) {
      await backend.uploadImage(key, blob);
    } else {
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
    }
    existingKeys.add(key);
    result.added++;
    if (cat) result.matched++;
    else result.extras.push(file.name);
    if (opts.onProgress) opts.onProgress(result.added + result.skippedDup.length, files.length, file.name);
  }
  return result;
}

// 共有モードの一覧は Drive から取る。実体（Blob）は使うときに取りに行き、
// 一度取ったら IndexedDB に控える（毎回ダウンロードすると重いため）。
let remoteIndex = new Map(); // key → Drive のファイル情報

async function listLocal() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function listStored() {
  if (backend.isShared) {
    const files = await backend.listImages();
    remoteIndex = new Map(files.map((f) => [f.key, f]));
    // ロゴは素材写真ではないので、一覧・自動選択の対象から外す
    return files.filter((f) => !RESERVED.has(f.key));
  }
  // 控え（__cache__…）は素材ではないので混ぜない
  return (await listLocal()).filter((r) => !RESERVED.has(r.key) && !r.key.startsWith('__cache__'));
}

/**
 * 画像の実体を返す。共有モードでは初回だけ Drive から取り、以後は端末の控えを使う。
 * 控えのキーに更新時刻を含めるので、誰かが差し替えれば自動で取り直される。
 */
export async function blobOf(item) {
  if (!item) return null;
  if (item.blob) return item.blob;
  if (!backend.isShared || !item.id) return null;

  const cacheKey = `__cache__${item.id}__${item.modified || ''}`;
  const cached = await getRaw(cacheKey);
  if (cached && cached.blob) return cached.blob;

  const blob = await backend.fetchImage(item.id);
  try {
    await tx('readwrite', (store) => store.put({ key: cacheKey, blob, cachedAt: Date.now() }));
  } catch {
    /* 控えを作れなくても表示はできる */
  }
  return blob;
}

/* --------------------------- ブランドロゴ --------------------------- */
//
// ロゴは描き起こさず、支給されたファイルをそのまま使う。
// 写真の上に置く白抜き用と、明るい背景に置く濃い色用の2枚を持てる。
// 1枚しか登録がなければ、その1枚を両方に使う。

export const LOGO_SLOTS = {
  onPhoto: '写真・暗い背景に置くロゴ（白抜き）',
  onLight: '明るい背景に置くロゴ（濃い色）'
};

const LOGO_KEYS = { onPhoto: '__logo_on_photo__', onLight: '__logo_on_light__' };
const RESERVED = new Set(Object.values(LOGO_KEYS));

export async function saveLogo(slot, file) {
  const key = LOGO_KEYS[slot];
  if (!key) throw new Error(`不明なロゴ枠: ${slot}`);
  const blob = file.slice(0, file.size, file.type || 'image/png');
  if (backend.isShared) {
    await backend.uploadImage(key, blob);
    remoteIndex.clear(); // 次の一覧取得で読み直す
    return;
  }
  await tx('readwrite', (store) =>
    store.put({ key, name: file.name, type: file.type || 'image/png', size: file.size, importedAt: Date.now(), blob })
  );
}

export async function getLogo(slot) {
  const key = LOGO_KEYS[slot];
  if (!key) return null;
  const rec = await getImage(key);
  if (!rec) return null;
  return rec.blob ? rec : { ...rec, blob: await blobOf(rec) };
}

export async function removeLogo(slot) {
  const key = LOGO_KEYS[slot];
  if (key) await removeImage(key);
}

/** 2枠ぶんまとめて読む。片方しかなければ、あるほうで埋める。 */
export async function loadLogos() {
  const [onPhoto, onLight] = await Promise.all([getLogo('onPhoto'), getLogo('onLight')]);
  return { onPhoto: onPhoto || onLight, onLight: onLight || onPhoto, hasOnPhoto: !!onPhoto, hasOnLight: !!onLight };
}

/** IndexedDB から素のレコードを読む（控えの取り出しにも使う） */
function getRaw(key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

export async function getImage(key) {
  if (backend.isShared) {
    if (!remoteIndex.size) await listStored();
    const meta = remoteIndex.get(key);
    if (!meta) return null;
    return { ...meta, blob: await blobOf(meta) };
  }
  return getRaw(key);
}

export async function removeImage(key) {
  if (backend.isShared) {
    if (!remoteIndex.size) await listStored();
    const meta = remoteIndex.get(key);
    if (meta) {
      await backend.deleteImage(meta.id);
      remoteIndex.delete(key);
    }
    return;
  }
  return tx('readwrite', (store) => store.delete(key));
}

/** 素材写真だけを消す。登録したロゴは残す（取り込み直しのたびに上げ直すのは手間なので）。 */
export async function clearAll() {
  const all = await listStored();
  for (const item of all) await removeImage(item.key);
}

/* --------------------------- タグ --------------------------- */

export function loadTags() {
  if (backend.isShared) return backend.getDoc(TAGS_KEY) || {};
  try {
    return JSON.parse(localStorage.getItem(TAGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveTags(tags) {
  if (backend.isShared) {
    backend.putDoc(TAGS_KEY, tags);
    return;
  }
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
