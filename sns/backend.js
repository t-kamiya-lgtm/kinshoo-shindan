// 保存先の切り替え
//
// このダッシュボードは2つの置き方をする。
//
//   端末モード … GitHub Pages などで開いたとき。データはそのブラウザの中だけ。
//   共有モード … Google Apps Script のウェブアプリとして開いたとき。
//                データは会社の Google ドライブ／スプレッドシートに置かれ、
//                ログインしたメンバー全員が同じものを見る。
//
// 判定は「google.script.run があるかどうか」だけ。Apps Script が配信した
// ページの中でしか存在しないので、これで確実に分かれる。
//
// 保存の考え方：画面の操作は同期のまま（localStorage を手元の控えとして使い続ける）、
// サーバーへの書き込みだけを裏でまとめて送る。こうすると操作の手応えが変わらない。
// 同じ書類を2人が同時に直した場合は、あとに保存したほうが残る（後勝ち）。

export const isShared =
  typeof google !== 'undefined' && google.script && typeof google.script.run === 'object';

// サーバーからの返事を待つ上限。これを超えたら「返ってこない」と分かるようにする。
// 上限を設けないと、応答が来ないときに画面が空のまま止まり、原因が何も分からない。
const CALL_TIMEOUT_MS = 30000;

/** google.script.run を Promise で扱う */
function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    if (!isShared) return reject(new Error('共有モードではありません'));
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`サーバー（${fn}）から ${CALL_TIMEOUT_MS / 1000} 秒以内に応答がありませんでした`));
    }, CALL_TIMEOUT_MS);
    const done = (fn2) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn2(value);
    };
    try {
      google.script.run.withSuccessHandler(done(resolve)).withFailureHandler(done(reject))[fn](...args);
    } catch (err) {
      done(reject)(err);
    }
  });
}

let me = null;
/** ログイン中のメンバー。共有モードでないときは null。 */
export function currentUser() {
  return me;
}

/* --------------------------- 書類（タグ・編集・ログなど） --------------------------- */

const docs = new Map(); // name → 値（オブジェクト）

/** 起動時に一式読み込む。共有モードでないときは何もしない。 */
export async function init() {
  if (!isShared) return { shared: false };
  const boot = await call('apiBootstrap');
  me = boot.user;
  for (const [name, value] of Object.entries(boot.docs || {})) docs.set(name, value);
  return { shared: true, user: me, names: [...docs.keys()] };
}

/** 共有側に保存されている値。無ければ undefined。 */
export function getDoc(name) {
  return docs.get(name);
}

// 書き込みは 800ms まとめてから送る。文字を打つたびに往復させない。
const pending = new Map();
let flushTimer = null;
let inFlight = 0;
const listeners = new Set();

/** 保存状況が変わったら呼ばれる（'saving' | 'saved' | 'error'） */
export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(state, detail) {
  for (const fn of listeners) {
    try { fn(state, detail); } catch { /* 通知先の失敗で保存を止めない */ }
  }
}

export function putDoc(name, value) {
  if (!isShared) return;
  docs.set(name, value);
  pending.set(name, value);
  emit('saving');
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 800);
}

async function flush() {
  if (!pending.size) return;
  const batch = [...pending.entries()].map(([name, value]) => ({ name, json: JSON.stringify(value) }));
  pending.clear();
  inFlight++;
  try {
    await call('apiPutDocs', batch);
    if (--inFlight === 0 && !pending.size) emit('saved');
  } catch (err) {
    inFlight--;
    console.error('共有データの保存に失敗しました:', err);
    // 取りこぼさないよう積み直す。次の保存でまとめて送られる。
    for (const { name } of batch) if (!pending.has(name)) pending.set(name, docs.get(name));
    emit('error', err);
  }
}

/** 画面を閉じる前に、書き残しを送り切る */
export function flushNow() {
  clearTimeout(flushTimer);
  return flush();
}

/** 他の人の更新を取り込む */
export async function pull() {
  if (!isShared) return false;
  const boot = await call('apiBootstrap');
  me = boot.user;
  docs.clear();
  for (const [name, value] of Object.entries(boot.docs || {})) docs.set(name, value);
  return true;
}

/* --------------------------- 画像 --------------------------- */

export function listImages() {
  return call('apiListImages');
}

export async function fetchImage(id) {
  const res = await call('apiGetImage', id);
  const bin = atob(res.base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: res.type || 'image/jpeg' });
}

/** Blob を base64 にして送る。Apps Script は文字列しか受け取れない。 */
export async function uploadImage(name, blob) {
  const base64 = await blobToBase64(blob);
  return call('apiPutImage', name, blob.type || 'image/jpeg', base64);
}

export function deleteImage(id) {
  return call('apiDeleteImage', id);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
