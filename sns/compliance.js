// 薬機法（医薬品医療機器等法）・景品表示法チェッカー
//
// 本品は「食品」であり、機能性表示食品・特定保健用食品の届出はない前提。
// したがって、身体の構造・機能への影響や疾病の治療・予防を想起させる表現は使えない。
// ここは生成側と手入力側の両方に効く最後の関門で、level:'block' が1件でも残ると
// ダッシュボードの投稿ボタンは押せない。

export const LEVEL = { BLOCK: 'block', WARN: 'warn' };

// --- 薬機法：食品で標榜できない効能効果 ---------------------------------
const YAKKI_RULES = [
  {
    id: 'yakki-slim',
    level: LEVEL.BLOCK,
    law: '薬機法',
    pattern: /痩せ|やせる|ヤセ|激やせ|脂肪燃焼|燃焼させ|脂肪が落ち|体脂肪が減|減量できる|ダイエット効果|痩身/,
    reason: '食品で痩身・脂肪燃焼の効果を標榜すると医薬品的効能効果とみなされます。',
    fix: '「主食置き換え」「1食あたり◯kcal」など、事実としての栄養設計・食シーンの表現に置き換えてください。'
  },
  {
    id: 'yakki-muscle',
    level: LEVEL.BLOCK,
    law: '薬機法',
    pattern: /筋肉がつく|筋肉が増え|筋肥大|バルクアップできる|筋力アップ|筋力が上が|マッチョになれ/,
    reason: '身体の組織を増強する効果の標榜は医薬品的効能効果にあたります。',
    fix: '「トレーニング後のタンパク質補給に」など、摂取シーンの表現にとどめてください。'
  },
  {
    id: 'yakki-disease',
    level: LEVEL.BLOCK,
    law: '薬機法',
    pattern: /治る|治療|改善する|予防でき|効果がある|効く|症状|病気|生活習慣病|糖尿|血糖値|血圧|コレステロール|中性脂肪|肝機能|貧血/,
    reason: '疾病の治療・予防や身体機能への影響を示す表現は使えません。',
    fix: 'その主張自体を削除してください。数値の事実（栄養成分値）に置き換えるのが安全です。'
  },
  {
    id: 'yakki-function',
    level: LEVEL.BLOCK,
    law: '薬機法',
    pattern: /免疫力|代謝が上が|代謝アップ|基礎代謝を|デトックス|老廃物|腸内環境を整え|整腸|便秘|疲労回復|疲れが取れ|むくみ|美肌|肌がきれい|アンチエイジング|若返り|老化を防/,
    reason: '身体の機能に対する作用の標榜は、機能性表示等の届出がない食品では認められません。',
    fix: '削除するか、原材料・成分の事実の記載にとどめてください。'
  },
  {
    id: 'yakki-digest',
    level: LEVEL.WARN,
    law: '薬機法',
    pattern: /胃腸に(?:優|やさ)しく|消化を助け|消化酵素が豊富|吸収を高め/,
    reason: '消化・吸収など体内の働きへの作用を示す表現は、食品では避けるのが安全です。',
    fix: '素材の一般的な説明にとどめるか、削除してください（例：「ネバネバ食材の長芋をプラス」）。'
  },
  {
    id: 'yakki-health',
    level: LEVEL.WARN,
    law: '薬機法',
    pattern: /健康になる|健康維持に|body\s*make|ボディメイクできる|体質が変わ/,
    reason: '健康効果を約束する表現と受け取られる可能性があります。',
    fix: '「健康的な食生活の一部として」等、断定を避けた表現に調整してください。'
  },
  {
    id: 'yakki-testimonial',
    level: LEVEL.WARN,
    law: '薬機法',
    pattern: /飲み続けたら|食べ続けたら|(\d+)\s*(kg|キロ)\s*(減|落ち|痩)|変化を実感|効果を実感/,
    reason: '体験談の形をとっていても、効果効能の暗示は同様に規制対象です。',
    fix: '結果を示す体験談は避け、味・食べやすさ・調理のしやすさの感想にとどめてください。'
  }
];

// --- 景品表示法：優良誤認・有利誤認 -------------------------------------
const KEIHYO_RULES = [
  {
    id: 'keihyo-no1',
    level: LEVEL.BLOCK,
    law: '景表法',
    pattern: /No\.?\s*1|ナンバーワン|日本一|世界一|業界初|世界初|日本初|唯一の|最高の|最強|一番|トップクラス/i,
    reason: 'No.1・最上級表現は、調査に基づく合理的根拠と出典の明示がなければ優良誤認となります。',
    fix: '根拠と調査主体・時点を併記できないなら削除してください。'
  },
  {
    id: 'keihyo-absolute',
    level: LEVEL.BLOCK,
    law: '景表法',
    pattern: /必ず|絶対に|誰でも必ず|100[%％]|確実に|保証します|永久に/,
    reason: '例外なく効果が得られるかのような断定は、合理的根拠を欠く表示になります。',
    fix: '断定を外し、事実の記述に置き換えてください。'
  },
  {
    id: 'keihyo-only',
    level: LEVEL.WARN,
    law: '景表法',
    pattern: /食べるだけで|置き換えるだけで|これだけで|飲むだけで/,
    reason: 'それだけで結果が出るかのような表現は、優良誤認につながります。',
    fix: '「食事のバランスの中で」等、前提条件を添えてください。'
  },
  {
    id: 'keihyo-price',
    level: LEVEL.WARN,
    law: '景表法',
    pattern: /通常価格|定価|[0-9,]+円\s*→|\d+\s*[%％]\s*OFF|半額|最安/,
    reason: '価格・割引の訴求は二重価格表示の規制対象です。比較対照価格の根拠と期間の明示が必要です。',
    fix: '販売期間・比較対象価格の根拠を確認のうえ、必要な注記を追加してください。'
  },
  {
    id: 'keihyo-comparison',
    level: LEVEL.WARN,
    law: '景表法',
    pattern: /より多い|より少な|比べて|約半分|上回る|勝る/,
    reason: '比較広告には、比較対象・調査主体・出典の明示が必要です。',
    fix: '注記（※当社調べ／※日本食品標準成分表2021年版（八訂）より）が本文に含まれているか確認してください。'
  },
  {
    id: 'keihyo-sugarfree',
    level: LEVEL.BLOCK,
    law: '景表法・食品表示基準',
    pattern: /糖質ゼロ|糖質0|無糖|カロリーゼロ|ノンカロリー|糖質オフ(?!.*比)/,
    reason: '強調表示には食品表示基準の基準値と、比較対象の明示が必要です。本品の値では該当しません。',
    fix: '「糖質11.9g（1食あたり）」のように実数値で表現してください。'
  }
];

// --- プラットフォーム要件 -----------------------------------------------
const PLATFORM_RULES = [
  {
    id: 'pr-disclosure',
    level: LEVEL.WARN,
    law: 'ステマ規制',
    pattern: /^(?![\s\S]*(#PR|#pr|＃PR|#プロモーション|#広告))[\s\S]*$/,
    reason:
      '事業者アカウントからの自社商品投稿は通常ステマ規制の対象外ですが、第三者の投稿の再掲・タイアップの場合は「#PR」等の明示が必要です。',
    fix: 'タイアップ投稿なら #PR を追加してください。自社アカウントの通常投稿であればこの警告は無視して構いません。',
    optional: true // 既定では無効。設定でオンにできる。
  }
];

export const ALL_RULES = [...YAKKI_RULES, ...KEIHYO_RULES, ...PLATFORM_RULES];

/**
 * キャプション全文（ハッシュタグ含む）を検査する。
 * @param {string} text
 * @param {{includeOptional?: boolean}} opts
 * @returns {{ok: boolean, blocks: Array, warns: Array, findings: Array}}
 */
export function checkCompliance(text, opts = {}) {
  const findings = [];
  const src = String(text || '');

  for (const rule of ALL_RULES) {
    if (rule.optional && !opts.includeOptional) continue;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    let m;
    const seen = new Set();
    while ((m = re.exec(src)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      findings.push({
        ruleId: rule.id,
        level: rule.level,
        law: rule.law,
        matched: m[0],
        index: m.index,
        reason: rule.reason,
        fix: rule.fix
      });
    }
  }

  // 比較表現があるのに出典注記がない場合は BLOCK に格上げする
  const hasComparison = findings.some((f) => f.ruleId === 'keihyo-comparison');
  const hasSource = /※.*(当社調べ|日本食品標準成分表)/.test(src);
  if (hasComparison && !hasSource) {
    for (const f of findings) {
      if (f.ruleId === 'keihyo-comparison') {
        f.level = LEVEL.BLOCK;
        f.reason = '比較表現がありますが、出典・調査主体の注記が本文に見当たりません。';
      }
    }
  }

  const blocks = findings.filter((f) => f.level === LEVEL.BLOCK);
  const warns = findings.filter((f) => f.level === LEVEL.WARN);
  return { ok: blocks.length === 0, blocks, warns, findings };
}

/** 画像に載せる短文（合成テキスト）用。文字数が短いぶん厳しめに見る。 */
export function checkImageText(text) {
  return checkCompliance(text, { includeOptional: false });
}
