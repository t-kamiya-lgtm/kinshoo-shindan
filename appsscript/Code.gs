/**
 * PROTEIN MONSTER｜SNS投稿ダッシュボード（共有版のサーバー側）
 *
 * Google Apps Script のウェブアプリとして配信し、ログインした会社メンバー全員で
 * 同じデータを見るためのファイル。画面（Index.html）はこのスクリプトが返す。
 *
 * 【デプロイ設定】ここを間違えると共有になりません。
 *   次のユーザーとして実行: 自分（このスクリプトの所有者）
 *   アクセスできるユーザー: 組織内の全員
 *
 * 「自分として実行」にするのは、データの置き場所（スプレッドシートと画像フォルダ）を
 * 全員で1つに揃えるためです。「アクセスしているユーザーとして実行」にすると、
 * 各自の個人ドライブに別々の置き場所が作られてしまい、共有になりません。
 * 同じ組織のメンバーであれば、この設定でも誰がアクセスしているかは分かるので、
 * 更新者の記録は残ります。
 *
 * データの置き場所は初回アクセス時に自動で作られます。事前準備は不要です。
 *   マイドライブ/PROTEIN MONSTER SNS/
 *     ├ SNSダッシュボード共有データ （スプレッドシート）
 *     └ images/                      （取り込んだ写真）
 */

var ROOT_FOLDER_NAME = 'PROTEIN MONSTER SNS';
var SHEET_FILE_NAME = 'SNSダッシュボード共有データ';
var IMAGE_FOLDER_NAME = 'images';
var DOC_SHEET = 'docs';

/* ============================ 画面の配信 ============================ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('PROTEIN MONSTER｜SNS投稿ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================ 置き場所 ============================ */

function getRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('rootFolderId');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 消された場合は作り直す */ }
  }
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('rootFolderId', folder.getId());
  return folder;
}

function getImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('imageFolderId');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 作り直す */ }
  }
  var root = getRootFolder_();
  var it = root.getFoldersByName(IMAGE_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : root.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('imageFolderId', folder.getId());
  return folder;
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('spreadsheetId');
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    var root = getRootFolder_();
    var it = root.getFilesByName(SHEET_FILE_NAME);
    if (it.hasNext()) {
      ss = SpreadsheetApp.open(it.next());
    } else {
      ss = SpreadsheetApp.create(SHEET_FILE_NAME);
      // 作られた直後はマイドライブ直下なので、置き場所へ移す
      var file = DriveApp.getFileById(ss.getId());
      root.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    }
    props.setProperty('spreadsheetId', ss.getId());
  }
  var sheet = ss.getSheetByName(DOC_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DOC_SHEET);
    sheet.appendRow(['name', 'json', 'updatedAt', 'updatedBy']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ============================ 誰が使っているか ============================ */

function currentUser_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  return { email: email, name: email ? email.split('@')[0] : '' };
}

/* ============================ 書類の読み書き ============================ */

/** 起動時に、利用者と全書類をまとめて返す（往復を1回で済ませる） */
function apiBootstrap() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var docs = {};
  for (var i = 1; i < values.length; i++) {
    var name = values[i][0];
    if (!name) continue;
    try {
      docs[name] = JSON.parse(values[i][1] || 'null');
    } catch (e) {
      // 壊れた行は無視する。読めない1件で全体を止めない。
    }
  }
  return { user: currentUser_(), docs: docs };
}

/**
 * 書類をまとめて保存する。
 * @param {Array<{name: string, json: string}>} batch
 */
function apiPutDocs(batch) {
  if (!batch || !batch.length) return { saved: 0 };

  // 同じ行を2人が同時に書くと崩れるので、書き込みは1人ずつ通す
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var rowOf = {};
    for (var i = 1; i < values.length; i++) {
      if (values[i][0]) rowOf[values[i][0]] = i + 1;
    }

    var user = currentUser_();
    var stamp = new Date();
    var appended = [];
    for (var j = 0; j < batch.length; j++) {
      var item = batch[j];
      var row = [item.name, item.json, stamp, user.email];
      if (rowOf[item.name]) {
        sheet.getRange(rowOf[item.name], 1, 1, 4).setValues([row]);
      } else {
        appended.push(row);
      }
    }
    if (appended.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, 4).setValues(appended);
    }
    return { saved: batch.length };
  } finally {
    lock.releaseLock();
  }
}

/* ============================ 画像 ============================ */

function apiListImages() {
  var folder = getImageFolder_();
  var it = folder.getFiles();
  var out = [];
  while (it.hasNext()) {
    var f = it.next();
    out.push({
      id: f.getId(),
      key: f.getName(),
      name: f.getName(),
      type: f.getMimeType(),
      size: f.getSize(),
      modified: f.getLastUpdated().toISOString()
    });
  }
  out.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  return out;
}

function apiGetImage(id) {
  var blob = DriveApp.getFileById(id).getBlob();
  return { base64: Utilities.base64Encode(blob.getBytes()), type: blob.getContentType() };
}

/** 同じ名前が既にあれば中身を差し替える（ライブラリ側で重複確認を済ませている） */
function apiPutImage(name, type, base64) {
  var folder = getImageFolder_();
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, type || 'image/jpeg', name);

  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var existing = it.next();
    existing.setTrashed(true);
  }
  var file = folder.createFile(blob);
  return { id: file.getId(), key: file.getName(), size: file.getSize(), type: file.getMimeType() };
}

function apiDeleteImage(id) {
  DriveApp.getFileById(id).setTrashed(true);
  return { deleted: id };
}

/* ============================ 動作確認用 ============================ */

/**
 * エディタから手で実行して、置き場所が作られるか・書き込めるかを確かめる。
 * 実行ログに置き場所の URL が出る。
 */
function setupCheck() {
  var sheet = getSheet_();
  var images = getImageFolder_();
  apiPutDocs([{ name: '__setupCheck', json: JSON.stringify({ at: new Date().toISOString() }) }]);
  var boot = apiBootstrap();
  Logger.log('利用者: %s', boot.user.email || '(取得できず)');
  Logger.log('スプレッドシート: %s', sheet.getParent().getUrl());
  Logger.log('画像フォルダ: %s', 'https://drive.google.com/drive/folders/' + images.getId());
  Logger.log('書類の数: %s', Object.keys(boot.docs).length);
  return boot;
}
