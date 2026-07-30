// 商品スペック（出典: PROTEIN MONSTER 商品説明ドキュメント）
// ここが唯一の情報源。キャプション内の数値はすべてこのファイルから差し込まれる。
// 数値を書き換えると、生成される全文面に即反映される。

export const PRODUCTS = {
  monster: {
    id: 'monster',
    name: 'PROTEIN MONSTER',
    nameJa: 'プロテインモンスター',
    shortJa: 'プロテインモンスター',
    category: 'えんどう豆タンパク加工食品',
    kind: 'noodle', // 中華麺・パスタ的に使える麺
    volume: '55g×10袋',
    servingG: 55,
    origin: '中国',
    storage: '直射日光・高温多湿を避け、涼しい場所に保存',
    ingredients: 'えんどう豆タンパク粉、植物性たん白、小麦粉、食塩',
    boilMin: '3〜5',        // 表示用
    boilRange: [3, 5],     // 計算用。レシピの調理時間の換算に使う
    cookedWeightG: 90,
    nutrition: {
      kcal: 201.3,
      protein: 31.7,
      fat: 2.8,
      carb: 12.8,
      sugar: 11.9,
      fiber: 0.9,
      salt: 1.6
    },
    // この SKU 固有の切り口（キャプション生成時のネタ）
    angles: [
      'タンパク質31.7g',
      '糖質11.9g',
      '主原料は黄えんどう豆',
      '主食置き換え',
      'アレンジ自在'
    ],
    recipes: [
      { name: '豆乳担担麺風', note: 'ピリ辛が好きな日に' },
      { name: 'サラダパスタ風', note: 'ランチの置き換えに' },
      { name: '肉玉まぜそば', note: 'がっつり食べたい日に' },
      { name: '塩焼きそば', note: '野菜も一緒に' },
      { name: 'めんつゆだけ', note: '何もしたくない日に' }
    ]
  },

  sova: {
    id: 'sova',
    name: 'PROTEIN MONSTER SOVA',
    nameJa: 'プロテインモンスターソバ',
    shortJa: 'プロテインモンスターソバ',
    category: '干しそば',
    kind: 'soba',
    volume: '50g×10袋',
    servingG: 50,
    origin: '中国',
    storage: '直射日光・高温多湿を避け、涼しい場所に保存',
    ingredients: 'そば粉、小麦たん白、えんどう豆タンパク粉、小麦粉、えんどう豆食物繊維',
    boilMin: '3〜5',        // 表示用
    boilRange: [3, 5],     // 計算用。レシピの調理時間の換算に使う
    cookedWeightG: 150,
    nutrition: {
      kcal: 177,
      protein: 21,
      fat: 2.1,
      carb: 20.2,
      sugar: 17,
      fiber: 3.2,
      salt: 1.2
    },
    angles: [
      'タンパク質21g',
      '食物繊維3.2g',
      'そばとして食べられる',
      'ゆであがり150g',
      '和のアレンジ'
    ],
    recipes: [
      { name: 'ぶっかけそば', note: 'めんつゆと薬味だけで' },
      { name: 'とろろそば', note: 'つるっと食べたい日に' },
      { name: '鶏南蛮そば', note: 'あたたかい一杯が欲しい日に' },
      { name: 'サラダそば', note: '野菜をたっぷりのせて' },
      { name: '焼きそば風', note: 'ソースで香ばしく' }
    ]
  }
};

// 比較データ（出典明記が必須のもの。景表法対策で必ず注記とセットで使う）
export const COMPARISONS = {
  proteinDrink: { label: '飲むプロテイン', protein: 22.5, source: '当社調べ' },
  saladChicken: { label: 'サラダチキン', protein: 24.0, source: '当社調べ' },
  spaghetti: { label: 'スパゲッティ', sugarPer100g: 67.7, source: '日本食品標準成分表2021年版（八訂）' },
  somen: { label: 'そうめん', sugarPer100g: 70.2, source: '日本食品標準成分表2021年版（八訂）' },
  self: { label: '本品', sugarPer100g: 21.6 }
};

// 共通の訴求材料（両SKU共通）
export const COMMON = {
  freeFrom: ['保存料', '酸化防止剤', '香料', '人工甘味料', '着色料'],
  certifications: [
    { code: 'FSSC22000', desc: '食品安全システム認証' },
    { code: 'BRC', desc: '食品安全と品質を保証する国際規格' },
    { code: 'FDA', desc: '米国食品医薬品局で適正と認められた施設' }
  ],
  endorsements: [
    {
      role: 'パーソナルジムトレーナー',
      name: '小林 慎平',
      quote:
        'サプリや健康食品はトレーニング同様、継続が大切です。継続するためには、ストレスや手間なく摂る必要があり、シェイカーで飲むプロテインが苦手な方には、3分で茹でられる主食置き換えの麺は続けやすくて良いですね！'
    },
    {
      role: '管理栄養士',
      name: '山本 理江',
      quote:
        '日本人の食事は、ごはんなどの炭水化物に偏りやすく、タンパク質やビタミンを含む"おかず"が不足しがちです。主食の一部をこの麺に置きかえるだけで、手軽にタンパク質が摂れるのは、良いですね。'
    }
  ],
  cautions: [
    '本品製造工場では、そば・大豆を含む製品を生産しています。',
    '豆類やピーナッツ等にアレルギーのある方はご注意ください。',
    '開封後は封をして保存してください。',
    '黒い点や白い部分がありますが、品質には問題ありません。'
  ],
  // 誤解を招かないための定型注記（キャプション末尾に自動付与）
  disclaimers: {
    nutrition: '※栄養成分値は1食あたりの分析値です。',
    comparison:
      '※糖質量の比較は100gあたり／日本食品標準成分表2021年版（八訂）より（スパゲッティ67.7g・そうめん70.2g／本品21.6g）',
    proteinComparison: '※飲むプロテイン22.5g・サラダチキン24.0gとの比較は当社調べ',
    general: '※本品は食品です。'
  }
};

// 資料上の注意点（ダッシュボードのデータ画面に表示して運用者に確認を促す）
export const DATA_NOTES = [
  'スペック文書の栄養成分表は見出しが「1食55gあたり」ですが、SOVA の内容量は50g×10袋です。SOVA の値は1食50gあたりとして生成しています。相違があればこのファイルの servingG を修正してください。',
  '「31.7g配合」等の数値訴求は分析値の範囲で表示しています。ロットによる幅がある場合は注記の追加を検討してください。'
];
