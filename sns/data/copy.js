// キャプション素材ライブラリ
//
// すべての文面は薬機法・景表法チェッカー（compliance.js）を通過する前提で書いている。
// 追記する際は「効果・効能を語らない／事実と食シーンだけを語る」を守ること。
// 数値は必ず products.js から差し込み、ここにベタ書きしない。
//
// 【誰に向けて書くか】
// これから頑張る人ではなく、もう頑張っている人。たんぱく質を意識した食事を
// すでに続けていて、その手段を増やしたい・変えたいと思っている人に向けて書く。
//
// 【言い方の決めごと】
// 1. 肯定形で書く。「鶏むねがつらい」「シェイカーが面倒」といった問題提起はしない。
//    素材写真は麺しかなく、困りごとの絵を出せないため、絵と文が噛み合わなくなる。
//    困りごとは解決した側だけを言う（例：「おかずを増やさずに、たんぱく質31.7g」）。
// 2. 立場を2つ持つ（STANCES）。同じ軸でも日によって語り口が変わる。
//    change … 摂り方そのものを新しくする（飲むから、食べるへ）
//    add    … いまの習慣に足す（シェイクの日と、麺の日）
// 3. 数値は先頭に置かない。食シーンを言ったあとの答えとして出す。

/** 語り口。同じ軸でも、この2つで言い方を変える。 */
export const STANCES = [
  { id: 'change', label: '変える／超える', desc: 'たんぱく質の摂り方そのものを新しくする' },
  { id: 'add', label: 'プラスする', desc: 'いまの習慣に、選択肢として足す' }
];

/** 訴求軸。毎朝ローテーションする。 */
export const AXES = [
  {
    id: 'eat',
    label: '食べるプロテイン',
    desc: 'シェイクとは別の、食事としての摂り方',
    skuBias: 'monster'
  },
  {
    id: 'staple',
    label: '主食で摂る',
    desc: 'おかずを積み増さずに1日の合計を変える',
    skuBias: null
  },
  {
    id: 'meal',
    label: '麺のある食事管理',
    desc: '数える日でも麺を選べるという食シーン',
    skuBias: null
  },
  {
    id: 'daily',
    label: '毎日のものだから',
    desc: '原材料と製造。長く食べるための設計',
    skuBias: null
  }
];

/* ------------------------------------------------------------------ *
 * 書き出し（1行目）。軸 × 立場 で持つ。
 * ------------------------------------------------------------------ */
export const HOOKS = {
  eat: {
    change: [
      (p, n) => `飲むから、食べるへ。`,
      (p, n) => `新しいプロテインは、麺のかたちをしている。`,
      (p, n) => `プロテインを、食事にする。`,
      (p, n) => `たんぱく質${n.protein}g。これ、麺です。`,
      (p, n) => `粉ではなく、麺で摂るという方法。`
    ],
    add: [
      (p, n) => `シェイクの日と、麺の日。`,
      (p, n) => `いつものプロテインに、麺という選択肢を。`,
      (p, n) => `今日のたんぱく質は、昼の麺から。`,
      (p, n) => `プロテインの、もうひとつのかたち。`,
      (p, n) => `飲む日もあれば、食べる日もある。`
    ]
  },
  staple: {
    change: [
      (p, n) => `たんぱく質は、主食から摂る。`,
      (p, n) => `主食が変われば、1日の合計が変わる。`,
      (p, n) => `おかずを増やさずに、たんぱく質${n.protein}g。`,
      (p, n) => `主食で摂るという、新しい発想。`,
      (p, n) => `${p.category}が、主食になりました。`
    ],
    add: [
      (p, n) => `いつもの一食を、この麺に。`,
      (p, n) => `主食を変えるだけで、${n.protein}g。`,
      (p, n) => `今日の昼を、たんぱく質の時間に。`,
      (p, n) => `ごはんの日、パスタの日、そしてこの麺の日。`,
      (p, n) => `一食ぶんの主食に、たんぱく質${n.protein}g。`
    ]
  },
  meal: {
    change: [
      (p, n) => `食事管理に、麺という選択肢を。`,
      (p, n) => `麺を選べる食事管理へ。`,
      (p, n) => `1食${n.kcal}kcal。麺のまま。`,
      (p, n) => `数えながら、麺を食べる。`,
      (p, n) => `麺を、計算に入れられる日。`
    ],
    add: [
      (p, n) => `今日は麺にしよう、と言える日。`,
      (p, n) => `食べたいものに、麺を戻す。`,
      (p, n) => `麺の日を、増やしていく。`,
      (p, n) => `カウントする日の、うれしい一杯。`,
      (p, n) => `献立に、麺が戻ってきました。`
    ]
  },
  daily: {
    change: [
      (p, n) => `原材料は、${p.ingredients.split('、')[0]}から。`,
      (p, n) => `毎日のものだから、中身は全部書きます。`,
      (p, n) => `シンプルな原材料で、麺をつくる。`,
      (p, n) => `つくる場所から、選びました。`
    ],
    add: [
      (p, n) => `続けるものだから、素材で選ぶ。`,
      (p, n) => `毎日の一食に、置いておけるもの。`,
      (p, n) => `長く食べるための、原材料設計。`,
      (p, n) => `主食にするなら、ここまで見たい。`
    ]
  }
};

/* ------------------------------------------------------------------ *
 * 本文（Instagram）。軸 × 立場。
 * 数値は必ず「食シーンを言ったあと」に置く。
 * ------------------------------------------------------------------ */
export const BODIES = {
  eat: {
    change: (p, n, c) => [
      `${p.nameJa}は、ゆでて食べる${p.category}。たんぱく質を「食事」として摂る方法です。`,
      `1食（${p.servingG}g）でたんぱく質${n.protein}g。粉も水も計らず、鍋で${p.boilMin}分ゆでるだけ。`,
      `ゆであがりは約${p.cookedWeightG}g、${n.kcal}kcal。丼に移せば、そのまま一食になります。`
    ],
    add: (p, n, c) => [
      `飲む日と、食べる日。たんぱく質の摂り方を、その日の気分で選べます。`,
      `${p.nameJa}は1食（${p.servingG}g）でたんぱく質${n.protein}g、${n.kcal}kcal。ゆで時間は${p.boilMin}分。`,
      `いつものプロテインに、麺という選択肢を足すだけです。`
    ]
  },
  staple: {
    change: (p, n, c) => [
      `この麺は、主食のほうにたんぱく質が入っています。おかずではなく、主食で摂るという考え方です。`,
      `1食（${p.servingG}g）でたんぱく質${n.protein}g。おかずを積み増さなくても、その日の合計は変わります。`,
      `ゆで時間は${p.boilMin}分、ゆであがりは約${p.cookedWeightG}g。脂質${n.fat}g、糖質${n.sugar}g、${n.kcal}kcalです。`
    ],
    add: (p, n, c) => [
      `いつもの主食を、この麺に替えられる日をつくる。それだけの使い方です。`,
      `1食（${p.servingG}g）あたり ${n.kcal}kcal／たんぱく質${n.protein}g／脂質${n.fat}g／糖質${n.sugar}g／食物繊維${n.fiber}g。`,
      `${p.nameJa}は${p.category}。ゆで時間${p.boilMin}分、ゆであがり約${p.cookedWeightG}gで、食べごたえのある量です。`
    ]
  },
  meal: {
    change: (p, n, c) => [
      `食事を数えている日でも、麺はそのまま数に入れられます。献立に、麺という選択肢を。`,
      `1食（${p.servingG}g）で${n.kcal}kcal、たんぱく質${n.protein}g、糖質${n.sugar}g、食物繊維${n.fiber}g。`,
      `ゆでて、好きな味付けで。麺のまま、その日の一食として組み込めます。`
    ],
    add: (p, n, c) => [
      `「今日は麺にしよう」と言える日を、献立に増やすための一杯です。`,
      `${p.nameJa}は1食${n.kcal}kcal、たんぱく質${n.protein}g。ゆであがり約${p.cookedWeightG}gあります。`,
      `${p.recipes.map((r) => `・${r.name}（${r.note}）`).join('\n')}`,
      `どれも鍋ひとつ、ゆで時間は${p.boilMin}分です。`
    ]
  },
  daily: {
    change: (p, n, c) => [
      `毎日の主食にするものなので、中身はそのままお見せします。原材料は「${p.ingredients}」。`,
      `${c.freeFrom.join('・')}は使っていません。製造は${c.certifications.map((x) => x.code).join('・')}を取得した工場です。`,
      `1食（${p.servingG}g）あたりたんぱく質${n.protein}g／${n.kcal}kcal／糖質${n.sugar}g。`
    ],
    add: (p, n, c) => [
      `続けるものは、素材で選びたい。${p.nameJa}の原材料は「${p.ingredients}」です。`,
      `${c.freeFrom.join('・')}は不使用。日本人スタッフが品質を管理しています。`,
      `1食（${p.servingG}g）でたんぱく質${n.protein}g、${n.kcal}kcal。ゆで時間は${p.boilMin}分です。`
    ]
  }
};

/* ------------------------------------------------------------------ *
 * 締め。押しつけず、次の行動だけ置く。
 * ------------------------------------------------------------------ */
export const CLOSINGS = [
  `新しいプロテインのかたちを、プロフィールのリンクから。`,
  `気になる方は、プロフィールのリンクから商品ページへ。`,
  `詳しいスペックはプロフィールのリンクからご覧ください。`,
  `どのアレンジが気になりますか？コメントで教えてください。`,
  `保存しておくと、次の献立で迷いません。`
];

export const CLOSINGS_X = [
  `詳細はプロフィールのリンクから。`,
  `スペックの詳細はプロフィールのリンクへ。`,
  `気になった方はプロフィールのリンクをどうぞ。`
];
/* ------------------------------------------------------------------ *
 * 注意喚起（アレルギー）。全投稿の末尾に必ず入れる。
 * ------------------------------------------------------------------ */
export const ALLERGY_NOTE =
  '※本品製造工場では、そば・大豆を含む製品を生産しています。豆類にアレルギーのある方はご注意ください。';

/* ------------------------------------------------------------------ *
 * ハッシュタグ。core は必ず入る。軸別・SKU別を足して規定数まで埋める。
 * ------------------------------------------------------------------ */
export const HASHTAGS = {
  core: ['#プロテインモンスター', '#PROTEINMONSTER', '#高タンパク麺', '#タンパク質'],
  bySku: {
    monster: ['#プロテインパスタ', '#えんどう豆プロテイン', '#ピープロテイン', '#高たんぱく'],
    sova: ['#プロテインそば', '#そば', '#蕎麦', '#和食']
  },
  byAxis: {
    eat: [
      '#プロテイン', '#たんぱく質補給', '#食べるプロテイン', '#筋トレ飯',
      '#ジム飯', '#workout', '#筋トレ女子', '#筋トレ男子', '#ボディメイク'
    ],
    staple: [
      '#主食置き換え', '#置き換え', '#高たんぱく質', '#PFCバランス',
      '#たんぱく質しっかり', '#食事改善', '#食生活', '#healthyfood', '#food'
    ],
    meal: [
      '#低糖質', '#低カロリー', '#カロリー計算', '#麺活', '#おうちごはん',
      '#ランチ', '#今日のごはん', '#献立', '#料理好きな人と繋がりたい'
    ],
    daily: [
      '#無添加', '#食の安全', '#原材料', '#植物性たんぱく質', '#プラントベース',
      '#えんどう豆', '#丁寧な暮らし', '#毎日の食事', '#素材で選ぶ'
    ]
  },
  // X は3個までに絞る
  xPreferred: ['#プロテインモンスター', '#高タンパク麺', '#食べるプロテイン', '#低糖質', '#主食置き換え']
};

/* ------------------------------------------------------------------ *
 * 画像に載せる文字（合成モード用）。
 *
 * 実際の @protein.monster_official の投稿デザインに合わせた3つの型。
 *   template 'stat' … オレンジ帯の上に極太数字。数値訴求。
 *   template 'hook' … 見出し2行。コピー訴求。
 *   template 'band' … 上下の黒帯。パッケージ的な統一感。
 *
 * フィールド:
 *   eyebrow … オレンジの角丸ラベル（前置き）
 *   lead    … stat のとき、数字の上に置く小見出し
 *   big     … 主役の文字（stat では数値、hook/band では見出し）
 *   suffix  … stat のとき、数字の下に置く後置き
 *   sub     … 小さい方の説明
 *   chips   … 下部に並べるスペック
 * ------------------------------------------------------------------ */

/** スペックのチップ。数値は products.js から差し込む。 */
const chips = (p, n) => [
  { k: 'たんぱく質', v: `${n.protein}g` },
  { k: '食物繊維', v: `${n.fiber}g` },
  { k: '糖質', v: `${n.sugar}g` }
];

export const OVERLAYS = {
  eat: {
    change: [
      (p, n) => ({
        template: 'hook',
        eyebrow: '食べるプロテイン',
        big: '飲むから、\n食べるへ。',
        sub: `${p.nameJa}／ゆで時間${p.boilMin}分`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: '食べるプロテイン',
        lead: '一食に たんぱく質',
        big: `${n.protein}g`,
        suffix: 'これ、麺です。',
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: `1食${p.servingG}gあたり`,
        big: 'プロテインを、\n食事にする。',
        sub: `鍋で${p.boilMin}分ゆでるだけ。${p.nameJa}`,
        chips: chips(p, n)
      })
    ],
    add: [
      (p, n) => ({
        template: 'hook',
        eyebrow: 'もうひとつのプロテイン',
        big: 'シェイクの日と、\n麺の日。',
        sub: `${p.nameJa}／1食たんぱく質${n.protein}g`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: 'いつもの習慣に',
        big: '麺という、\n選択肢を。',
        sub: `ゆで時間${p.boilMin}分／${n.kcal}kcal`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: '今日のたんぱく質',
        lead: '昼の一杯で',
        big: `${n.protein}g`,
        suffix: '摂れました。',
        chips: chips(p, n)
      })
    ]
  },

  staple: {
    change: [
      (p, n) => ({
        template: 'hook',
        eyebrow: '主食で摂るという発想',
        big: 'たんぱく質は、\n主食から。',
        sub: `${p.nameJa}／1食${p.servingG}g`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: 'おかずを増やさずに',
        lead: '主食だけで たんぱく質',
        big: `${n.protein}g`,
        suffix: '積み増し不要。',
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: `1食${p.servingG}gあたり`,
        big: '主食が変われば、\n合計が変わる。',
        sub: `${n.kcal}kcal・たんぱく質${n.protein}g・糖質${n.sugar}g`,
        chips: chips(p, n)
      })
    ],
    add: [
      (p, n) => ({
        template: 'hook',
        eyebrow: '今日の主食に',
        big: 'いつもの一食を、\nこの麺に。',
        sub: `${p.nameJa}／${n.kcal}kcal`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: '主食を変えるだけで',
        lead: '一食に たんぱく質',
        big: `${n.protein}g`,
        suffix: `ゆで時間${p.boilMin}分。`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: '献立の選択肢に',
        big: 'ごはんの日、\nこの麺の日。',
        sub: `${p.nameJa}／ゆであがり約${p.cookedWeightG}g`,
        chips: chips(p, n)
      })
    ]
  },

  meal: {
    change: [
      (p, n) => ({
        template: 'stat',
        eyebrow: '麺のある食事管理',
        lead: '1食あたり',
        big: `${n.kcal}`,
        suffix: 'kcal。麺のまま。',
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'hook',
        eyebrow: '数える日の主食',
        big: '麺を選べる、\n食事管理へ。',
        sub: `${p.nameJa}／1食${n.kcal}kcal`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: `1食${p.servingG}gあたり`,
        big: '数えながら、\n麺を食べる。',
        sub: `${n.kcal}kcal・たんぱく質${n.protein}g・糖質${n.sugar}g`,
        chips: chips(p, n)
      })
    ],
    add: [
      (p, n) => ({
        template: 'hook',
        eyebrow: '今日の献立に',
        big: '今日は麺にしよう、\nと言える日。',
        sub: `${p.nameJa}／ゆで時間${p.boilMin}分`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: '鍋ひとつでできる',
        big: `${p.recipes[0].name}`,
        sub: `${p.recipes[0].note}／ゆで時間${p.boilMin}分`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: '麺の日を増やす',
        lead: '一食に たんぱく質',
        big: `${n.protein}g`,
        suffix: `ゆであがり約${p.cookedWeightG}g。`,
        chips: chips(p, n)
      })
    ]
  },

  daily: {
    change: [
      (p, n) => ({
        template: 'band',
        eyebrow: '原材料はシンプルに',
        big: '中身は、\n全部書きます。',
        sub: `${p.nameJa}／${p.category}`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: '国際認証取得工場で製造',
        big: 'つくる場所から、\n選びました。',
        sub: 'FSSC22000・BRC・FDA の基準を満たした工場',
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'hook',
        eyebrow: '毎日のものだから',
        big: 'シンプルな\n原材料で。',
        sub: `原材料は${p.ingredients.split('、')[0]}から／${p.nameJa}`,
        chips: chips(p, n)
      })
    ],
    add: [
      (p, n) => ({
        template: 'hook',
        eyebrow: '続けるものだから',
        big: '素材で、\n選ぶ。',
        sub: `${p.nameJa}／${p.category}`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'band',
        eyebrow: '長く食べるために',
        big: '毎日の一食に、\n置いておけるもの。',
        sub: `保存料・着色料・人工甘味料は不使用`,
        chips: chips(p, n)
      }),
      (p, n) => ({
        template: 'stat',
        eyebrow: '主食にするなら',
        lead: '一食に たんぱく質',
        big: `${n.protein}g`,
        suffix: '国際認証取得工場で製造。',
        chips: chips(p, n)
      })
    ]
  }
};

/* ------------------------------------------------------------------ *
 * X 用の短いボディ。Instagram の BODIES は長すぎるため専用に持つ。
 * ------------------------------------------------------------------ */
export const BODIES_X = {
  eat: {
    change: (p, n) => [
      `ゆでて食べる${p.category}です。1食（${p.servingG}g）でたんぱく質${n.protein}g、${n.kcal}kcal。`,
      `粉も水も計らず、鍋で${p.boilMin}分。1食たんぱく質${n.protein}gです。`,
      `たんぱく質${n.protein}g・脂質${n.fat}g・糖質${n.sugar}g。1食（${p.servingG}g）あたりの分析値です。`
    ],
    add: (p, n) => [
      `飲む日と、食べる日を分ける。1食でたんぱく質${n.protein}g、ゆで時間${p.boilMin}分。`,
      `いつものプロテインに、麺という選択肢を。1食${n.kcal}kcal、たんぱく質${n.protein}g。`,
      `ゆであがり約${p.cookedWeightG}g。${n.kcal}kcalで、そのまま一食になります。`
    ]
  },
  staple: {
    change: (p, n) => [
      `おかずを積み増さずに、主食だけでたんぱく質${n.protein}g（1食あたり）。`,
      `主食が変われば1日の合計が変わります。1食${n.kcal}kcal、たんぱく質${n.protein}g。`,
      `ゆで時間${p.boilMin}分、ゆであがりは約${p.cookedWeightG}g。${n.kcal}kcalです。`
    ],
    add: (p, n) => [
      `いつもの一食をこの麺に。1食${n.kcal}kcal／たんぱく質${n.protein}g／糖質${n.sugar}g。`,
      `主食を変えるだけで、たんぱく質${n.protein}g。ゆで時間は${p.boilMin}分です。`,
      `ごはんの日、パスタの日、この麺の日。1食${n.kcal}kcal、ゆであがり約${p.cookedWeightG}g。`
    ]
  },
  meal: {
    change: (p, n) => [
      `1食${n.kcal}kcal／たんぱく質${n.protein}g／糖質${n.sugar}g。麺のまま数に入れられます。`,
      `数えながら麺を食べる。${n.kcal}kcalでたんぱく質${n.protein}g、食物繊維${n.fiber}gです。`,
      `ゆであがり約${p.cookedWeightG}gで${n.kcal}kcal。その日の一食として組み込めます。`
    ],
    add: (p, n) => [
      `今日は麺にしよう、と言える日に。1食${n.kcal}kcal、たんぱく質${n.protein}gです。`,
      `おすすめは${p.recipes[0].name}（${p.recipes[0].note}）。鍋ひとつ、ゆで時間${p.boilMin}分。`,
      `${p.recipes[1].name}も${p.recipes[2].name}も鍋ひとつ。1食たんぱく質${n.protein}gです。`
    ]
  },
  daily: {
    change: (p, n) => [
      `保存料・香料・人工甘味料・着色料は不使用。1食たんぱく質${n.protein}gです。`,
      `製造はFSSC22000・BRC・FDA取得工場。1食でたんぱく質${n.protein}gです。`,
      `原材料はシンプルに。1食（${p.servingG}g）で${n.kcal}kcal、たんぱく質${n.protein}g。`
    ],
    add: (p, n) => [
      `続けるものは素材で選ぶ。原材料はシンプルに、1食たんぱく質${n.protein}gです。`,
      `毎日の一食に置いておけるものを。${n.kcal}kcal、たんぱく質${n.protein}g、糖質${n.sugar}g。`,
      `主食にするなら中身まで。保存料・着色料・人工甘味料は使っていません。`
    ]
  }
};
