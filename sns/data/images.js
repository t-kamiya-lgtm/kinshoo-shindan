// Google Drive 素材フォルダのカタログ
// https://drive.google.com/drive/folders/1uXFEWTMOK9SUzummPzaUfwp61pcEpenl
//
// 画像の実体はブラウザの画像ライブラリ（IndexedDB）に保存する。
// Drive から直接読み込まないのは、canvas 合成時に CORS でタイント（書き出し不可）になるため。
// 初回のみダッシュボードの「画像ライブラリ」にフォルダごとドラッグ＆ドロップすれば、
// ファイル名でこのカタログと自動照合され、以後は端末に保持される。

export const DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1uXFEWTMOK9SUzummPzaUfwp61pcEpenl';

// タグの語彙。画像ライブラリ画面でクリック付与する。
// 生成エンジンは scene / sku タグを見て投稿テーマに合う画像を選ぶ。
export const TAG_VOCAB = {
  scene: [
    { id: 'cooked', label: '調理後（盛り付け）' },
    { id: 'raw', label: '乾麺・麺そのもの' },
    { id: 'package', label: 'パッケージ・箱' },
    { id: 'logo', label: 'ロゴ' },
    { id: 'lifestyle', label: '食卓・ライフスタイル' },
    { id: 'ingredient', label: '原材料・素材' },
    { id: 'cooking', label: '調理中（鍋・湯気）' },
    { id: 'person', label: '人物あり' }
  ],
  sku: [
    { id: 'monster', label: 'プロテインモンスター' },
    { id: 'sova', label: 'ソバ' },
    { id: 'both', label: '両方／共通' }
  ],
  // 合成テンプレの相性。文字を載せる余白がどこにあるか。
  space: [
    { id: 'space-top', label: '上に余白' },
    { id: 'space-bottom', label: '下に余白' },
    { id: 'space-none', label: '余白なし（文字なし向き）' }
  ]
};

// Drive 上のファイル一覧（2026-03-30 時点）。
// tags は初期状態では空。ダッシュボードでタグ付けすると localStorage に保存される。
export const IMAGE_CATALOG = [
  { file: '20251111prime_d_042.jpg', driveId: '1d-o6-rtpjpGiyOLaGVajPQHdXEcmEZvp', shoot: '2025-11-11' },
  { file: '20251111prime_d_049.jpg', driveId: '1d8E0KllBGu09pTnjRWZb8RsTUqM9n5bF', shoot: '2025-11-11' },
  { file: '20251111prime_d_058.jpg', driveId: '1ckg8DSZviOxNmjVT9hDIvezt-H38FbFY', shoot: '2025-11-11' },
  { file: '20251111prime_d_063.jpg', driveId: '1sjq2Eag0toq5uDVh9TqXvAItFa6w25Ff', shoot: '2025-11-11' },
  { file: '20251111prime_d_064.jpg', driveId: '1TbhVyRKmoVHlXdKMiTk85q43P443l-Xt', shoot: '2025-11-11' },
  { file: '20251111prime_d_065.jpg', driveId: '1f4wBsl_W-igNwMCIH2M4TKRETceAHgxD', shoot: '2025-11-11' },
  { file: '20251111prime_d_068.jpg', driveId: '1L6JVfqiIhC_2ucC7th0CU-aQaXbU5_zz', shoot: '2025-11-11' },
  { file: '20251111prime_d_078.jpg', driveId: '13b4Q4ie1kMaZlf1Pz4T62pZZ37Qj9Qzt', shoot: '2025-11-11' },
  { file: '20251111prime_d_086.jpg', driveId: '1N8Bed0jdfGAsAGP6mtJnDNHwWYrckutj', shoot: '2025-11-11' },
  { file: '20251111prime_d_123.jpg', driveId: '1sN_Ok82-bCrsLknC2Lbwbt1jONcbVWNL', shoot: '2025-11-11' },
  { file: '20251111prime_d_130.jpg', driveId: '1iPf_Sh254ptlzyqbh6gP8xLlzSKql7Yv', shoot: '2025-11-11' },
  { file: '20251111prime_d_137.jpg', driveId: '1bg_4NafZ3gg2i6I9rWY3klrDGcl17PQH', shoot: '2025-11-11' },
  { file: '20251111prime_d_152.jpg', driveId: '1VsaUGRH6TNrqOC8tmztmMC-CvT5V3Vvw', shoot: '2025-11-11' },
  { file: '20251111prime_d_172.jpg', driveId: '1cES5zRPJoqpoZxFc8K_tOgHF13zMdcmA', shoot: '2025-11-11' },
  { file: '20251111prime_d_231.jpg', driveId: '1ETPEiH2dOTOE_DJEjMUU9DOMp80UeHGn', shoot: '2025-11-11' },
  { file: '20251111prime_d_233.jpg', driveId: '1T2W_oC8iGiPzKbnGYXG4lIzgDkjuN60j', shoot: '2025-11-11' },
  { file: '20251111prime_d_235.jpg', driveId: '1iFCvddpYE_iYVsqCPFKPIPLvBIRwtFKA', shoot: '2025-11-11' },
  { file: '20251111prime_d_239.jpg', driveId: '1u0j_iiOemndoUYMY3r060F_pAo2scSs8', shoot: '2025-11-11' },
  { file: '20251111prime_d_271.jpg', driveId: '1VtDW51UJlC-prH2AxDZxhCf-b28G5WfF', shoot: '2025-11-11' },
  { file: '20251111prime_d_319.jpg', driveId: '1niNHGcwxZ0wv206WEe7X8QcOa1I3w41M', shoot: '2025-11-12' },
  { file: '20251111prime_d_327.jpg', driveId: '1E-BaVhk41L5D9HRppKVI96s0YwQKixG4', shoot: '2025-11-12' },
  { file: '20251111prime_d_335.jpg', driveId: '1B2_Eh7ZsW_kydh2VA_LHGETG03KSC-J1', shoot: '2025-11-12' },
  { file: '20251111prime_d_339.jpg', driveId: '1yF6CPiDPOU33yS0Ny6XWEeyMWJqfsI89', shoot: '2025-11-12' },
  { file: '●prime_d_0539.jpg', driveId: '1Neb8DUnb0OTnQy55nLJi8lDoK17E-Z8B', shoot: '2025-12-04' },
  { file: '●prime_d_0544.jpg', driveId: '1Y0PazuYH3p80j0NAQgWWZl2NibHDsXFI', shoot: '2025-12-04' },
  { file: '●prime_d_0546.jpg', driveId: '1iGeX-buLNVgfbTgfmZnlRSE4SPh0B9y3', shoot: '2025-12-04' },
  { file: '●prime_d_0554.jpg', driveId: '1Ya7V-29eTcIXYf2ZQuHQLeQ7x2DzDaFg', shoot: '2025-12-04' },
  { file: '●prime_d_0559.jpg', driveId: '19xuUsUPzdWrOZlTTY7vUh3iUhicz7S-R', shoot: '2025-12-04' },
  { file: '●prime_d_0562.jpg', driveId: '1O26RBLaclQfWQIpsbu5_8E7jhfvYpVkh', shoot: '2025-12-04' },
  { file: '●prime_d_0963.jpg', driveId: '1dzhSSmAPY7UmWxEPvN3otLYf0xbmXQ6m', shoot: '2025-12-04' },
  { file: '●prime_d_1025.jpg', driveId: '1kj3pcqacj2YWoRGbp-hEnMezW3mV2BM7', shoot: '2025-12-04' },
  { file: '●prime_d_1062.jpg', driveId: '1VbrNAmsmWnqEYv3HiWKxmHgDUMzcc-Cx', shoot: '2025-12-04' },
  { file: '_DSC4998.JPG', driveId: '14QohfZZQ5DotfqdIQ9eTIqiy8Uydxg8Q', shoot: 'その他' },
  { file: '_DSC5006.JPG', driveId: '12ENjPYIm6yZ4Ea8yl3ADnIRiktXyQTVK', shoot: 'その他' }
].map((r) => ({
  ...r,
  id: r.driveId,
  viewUrl: `https://drive.google.com/file/d/${r.driveId}/view`,
  // 参照用サムネイル。Drive の共有設定によっては表示されないため onerror でフォールバックする。
  thumbUrl: `https://drive.google.com/thumbnail?id=${r.driveId}&sz=w400`
}));
