const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
const COMMENT_MIN_LENGTH = 100;
const COMMENT_MAX_LENGTH = 200;

const VISUAL_DETAIL_TERMS = [
  "葉",
  "茎",
  "枝",
  "花",
  "つぼみ",
  "蕾",
  "実",
  "新芽",
  "芽",
  "株",
  "株元",
  "先端",
  "色",
  "緑",
  "赤",
  "黄",
  "白",
  "紫",
  "濃く",
  "薄く",
  "ふくらみ",
  "厚み",
  "張り",
  "つや",
  "艶",
  "立ち上がり",
  "広がり",
  "密度",
  "高さ",
  "伸び",
  "光",
  "影",
  "明るさ",
  "暗さ",
  "開き",
  "重なり",
  "増え",
  "揃い",
  "色づき",
  "濃淡",
  "輪郭",
  "姿",
  "上向き",
  "下向き",
];

const GENERIC_PATTERNS = [
  "様子が伝わります",
  "変化が見て取れます",
  "状態が見て取れます",
  "記録です",
  "一枚です",
  "写真です",
  "内容です",
  "場面です",
  "姿です",
  "葉の重なりや向きに差があり",
  "輪郭に動きが出ていて",
  "動きが一枚の中にはっきり出ています",
  "大きな動きだけでなく",
  "色や形の変化が重なり",
];

const AVOID_REPEATED_EXPRESSIONS = [
  "葉の重なりや向きに差があり",
  "輪郭に動きが出ていて",
  "動きが一枚の中にはっきり出ています",
  "大きな動きだけでなく",
  "色や形の変化が重なり",
];

const LEGACY_AI_MEMO_PATTERNS = [
  "動きが一枚の中にはっきり出ています",
  "葉の向きや株の広がりからも、生育の勢いが感じられる段階です",
  "前回の印象と比べると、見どころが少し増えてきたように見えます",
  "大きな動きだけでなく、小さな違いも拾えているので次の比較につながる一枚です",
  "色や形の変化が重なり、季節の進み方まで伝わってくる記録です",
];

const CONTEXT_CUE_RULES = [
  { tag: "pruned", pattern: /剪定|切り戻し|刈り込み/ },
  { tag: "staked", pattern: /支柱|誘引/ },
  { tag: "sown", pattern: /種まき|播種/ },
  { tag: "sprout", pattern: /発芽|芽吹き|新芽|芽が出/ },
  { tag: "bud", pattern: /つぼみ|蕾/ },
  { tag: "bloom", pattern: /開花|咲|花が/ },
  { tag: "fruit", pattern: /実|莢|さや/ },
  { tag: "color", pattern: /色づ|紅葉|黄ば|赤み|色が/ },
  { tag: "spread", pattern: /広が|伸び|立ち上が|込み合|茂/ },
];

const ENDING_FAMILY_RULES = [
  { label: "ています調", pattern: /ています$/ },
  { label: "ました調", pattern: /ました$/ },
  { label: "そうです調", pattern: /そうです$/ },
  { label: "ようです調", pattern: /ようです$/ },
  { label: "になります調", pattern: /になります$/ },
  { label: "なっています調", pattern: /なっています$/ },
];

const NATURALNESS_RISK_PATTERNS = [
  { label: "見えます", pattern: /見えます|見えてきます|見えてきました/ },
  { label: "伝わります", pattern: /伝わります|伝わってきます/ },
  { label: "感じられます", pattern: /感じられます/ },
  { label: "追いやすい", pattern: /追いやすくなっています|追いやすくなりそうです|追いやすい/ },
  { label: "整う", pattern: /整ってきています|整ってきました|整いはじめています/ },
  { label: "段階です", pattern: /段階です/ },
  { label: "場面です", pattern: /場面です/ },
  { label: "印象です", pattern: /印象です/ },
];

const INCOMPLETE_SENTENCE_ENDINGS = [
  /(?:から|まで|より|だけ|ほど|など|の|を|に|へ|で|と|や|な)$/u,
  /(?:小さな|大きな|淡い|細かな|鮮やかな)$/u,
  /(?:濃淡|先に|株元|花茎|輪郭|まとまり|広がり|立ち上がり|光|影|姿)$/u,
  /(?:開き|伸び|増え|揺れ|重なり|立ち上がり|色づき)$/u,
  /(?:細い花|小さな花|星|蕾|つぼみ)$/u,
];

const USER_INSTRUCTION_STOP_TERMS = {
  "ください": true,
  "下さい": true,
  "ほしい": true,
  "欲しい": true,
  "見て": true,
  "見たい": true,
  "中心": true,
  "注目": true,
  "意識": true,
  "踏まえ": true,
  "踏まえて": true,
  "補足": true,
  "メモ": true,
  "コメント": true,
  "説明": true,
  "解説": true,
  "日本語": true,
  "自然": true,
  "写真": true,
  "詳しく": true,
  "なるべく": true,
  "できるだけ": true,
  "ちゃんと": true,
  "内容": true,
  "こと": true,
  "もの": true,
  "ところ": true,
  "よう": true,
  "感じ": true,
  "印象": true,
  "視点": true,
  "観点": true,
  "要望": true,
  "指示": true,
};

const USER_INSTRUCTION_COMPARISON_TERMS = {
  "前回": true,
  "今回": true,
  "比較": true,
  "違い": true,
  "変化": true,
  "成長": true,
};

const META_COMMENTARY_PATTERN =
  /アピール|ユーザー|指示|要望|コメント|メモ|入力|本文|文章|設計図|ボタン|フォーム|投稿|アップロード|サイト|プロフィール/u;

const INTERNAL_BRIDGE_PATTERNS = [
  /に目を向けると/u,
  /手がかりにしながら/u,
  /見どころが自然に浮かび上がってきます/u,
  /押さえたい見どころ/u,
  /説明しやすい/u,
  /組み立てやすい/u,
  /コメントとして/u,
  /本文/u,
  /言葉へ起こしやすい/u,
  /読み応えが出ます/u,
  /どこを見比べると/u,
];

const TIMELINE_COMPARISON_PATTERN =
  /前回|前より|前の記録|前後の記録|比較用|時系列|次の記録と比べ|並べたとき/u;

const LIKELY_COMPLETE_SENTENCE_ENDINGS = [
  /(?:です|ます|でした|ました|でしょう|そうです|ようです)$/u,
  /(?:ている|てきた|てきました|てきます|ているようです)$/u,
  /(?:ある|いる|なる|した|している|してきた)$/u,
  /(?:見える|見えた|伝わる|感じる|比べられそう|読み取れる)$/u,
  /(?:咲いています|開いています|伸びています|広がっています)$/u,
];

function normalizePlantNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(function (name) {
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

function stripEmbeddedImageMarkup(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/<\/?image\b[^>]*>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/!\[[^\]]*]\((?:[^()\\]|\\.)*\)/g, " ")
    .replace(/!\[[^\]]*]/g, " ")
    .replace(/\[([^\]]+)]\((?:[^()\\]|\\.)*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, " ")
    .replace(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?/gi, " ");
}

function containsEmbeddedImageMarkup(text) {
  return /!\[[^\]]*]\((?:[^()\\]|\\.)*\)/.test(String(text || "")) ||
    /!\[[^\]]*]/.test(String(text || "")) ||
    /<\/?image\b[^>]*>/i.test(String(text || "")) ||
    /<img\b[^>]*>/i.test(String(text || "")) ||
    /data:image\/[A-Za-z0-9.+-]+;base64,/i.test(String(text || "")) ||
    /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?/i.test(String(text || ""));
}

function sanitizeMemoForAi(value) {
  var text = stripEmbeddedImageMarkup(typeof value === "string" ? value : "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  if (/^[?？]{20,}$/.test(text)) return "";

  var hit = 0;
  for (var i = 0; i < LEGACY_AI_MEMO_PATTERNS.length; i++) {
    if (text.indexOf(LEGACY_AI_MEMO_PATTERNS[i]) !== -1) hit += 1;
  }
  if (hit >= 2) return "";

  var fragmentCount = countLikelySentenceFragments(text);
  if (fragmentCount >= 2) return "";
  if (fragmentCount >= 1 && splitSentences(text).length >= 3) return "";
  if (hasRepetitiveSentenceLeads(text)) return "";

  return text;
}

function toCurrentPhotoOnlyContext(context) {
  var source = context && typeof context === "object" ? context : {};
  return Object.assign({}, source, {
    previousRecordedDate: "",
    previousNote: "",
    previousPhotoMemo: "",
  });
}

function getGeminiModel(env) {
  var source = env || process.env;
  if (typeof source.GEMINI_MODEL === "string" && source.GEMINI_MODEL.trim()) {
    return source.GEMINI_MODEL.trim();
  }
  if (
    typeof source.GEMINI_PHOTO_COMMENT_MODEL === "string" &&
    source.GEMINI_PHOTO_COMMENT_MODEL.trim()
  ) {
    return source.GEMINI_PHOTO_COMMENT_MODEL.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

const STYLE_PROFILES = [
  {
    id: "detail_focus",
    label: "細部観察型",
    promptLines: [
      "今回は細部観察型で書いてください。葉先、茎元、つぼみ、色の差、重なりなど、近いところの変化から書き始めてください。",
      "書き出しは株全体の説明よりも、まず目に入る一点の特徴をつかむ形にしてください。",
      "締めでは、その小さな特徴が株全体の印象をどう支えているかを短く触れてください。",
    ],
    example:
      "例: 葉先の緑がいっそう濃く見え、先端のやわらかな伸びが写真でもはっきり分かります。株元には新しい芽の動きも重なり、近くで見るほど見どころの多さが目に入ります。細かな伸びが重なり、この株の勢いが画面いっぱいに広がっています。",
  },
  {
    id: "shape_balance",
    label: "株姿観察型",
    promptLines: [
      "今回は株姿観察型で書いてください。高さ、広がり、向き、密度、株全体のまとまりを主役にしてください。",
      "1文目で全体の形、2文目で葉や枝の重なり方、最後にバランスの変化へ触れてください。",
      "細部だけで終わらず、写真全体を見たときの印象が浮かぶようにしてください。",
    ],
    example:
      "例: 株全体が外側へゆったり広がり、輪郭にゆとりのある姿として目に入ります。葉の重なりに厚みが出て、中央から外側へ向かうまとまりも自然です。草姿の収まりがよく、この株らしい見映えが静かに浮かびます。",
  },
  {
    id: "season_transition",
    label: "季節感観察型",
    promptLines: [
      "今回は季節感観察型で書いてください。芽吹き、ふくらみ、花や実の気配、色の違いなど、写真から感じ取れる季節感を意識してください。",
      "いま目に入るやわらかさや明るさが伝わるように、季節の手触りを自然ににじませてください。",
      "最後は、その写真に残っている季節らしい表情を軽くまとめて締めてください。",
    ],
    example:
      "例: つぼみのふくらみがそろい、花へ向かうやわらかな気配が写真にもにじみます。葉色にも明るさが混じり、株全体に軽やかな表情が広がっています。淡い揺らぎが重なり、その時期らしい魅力がやさしく立ち上がります。",
  },
  {
    id: "focus_story",
    label: "見どころ整理型",
    promptLines: [
      "今回は見どころ整理型で書いてください。いま目立つ部分と支えている部分を分けて、写真の中の見どころを整理してください。",
      "写真の一部だけで終わらず、主役になる部分と周囲の関係まで見える書き方にしてください。",
      "最後は、この一枚の印象が自然に残る短いまとめで締めてください。",
    ],
    example:
      "例: 先端に目が向く華やかさがありつつ、株元の葉の重なりが全体の印象をしっかり支えています。明るく見える部分と落ち着いた部分の差があることで、写真の中に奥行きが生まれています。この一枚だけでも、その株らしい表情がくっきり浮かびます。",
  },
];

function stableContextSeed(context) {
  var parts = [];
  if (context && context.areaLabel) parts.push(String(context.areaLabel));
  if (context && context.recordedDate) parts.push(String(context.recordedDate));
  if (context && context.photoIndex != null) parts.push(String(context.photoIndex));
  if (context && context.photoCount != null) parts.push(String(context.photoCount));
  if (context && Array.isArray(context.plantNames)) parts.push(normalizePlantNames(context.plantNames).join("|"));
  if (context && context.currentPhotoMemo) {
    var currentMemo = sanitizeMemoForAi(context.currentPhotoMemo);
    if (currentMemo) parts.push(currentMemo);
  }
  if (context && context.userInstruction) {
    var userInstruction = sanitizeMemoForAi(context.userInstruction);
    if (userInstruction) parts.push(userInstruction);
  }
  if (context && context.note) parts.push(String(context.note));
  var source = parts.join("|") || "default";
  var seed = 0;
  for (var i = 0; i < source.length; i++) {
    seed = (seed * 33 + source.charCodeAt(i)) % 2147483647;
  }
  return seed;
}

function pickStyleProfile(context) {
  var seed = stableContextSeed(context);
  return STYLE_PROFILES[seed % STYLE_PROFILES.length];
}

function rotateBySeed(values, seed) {
  var list = Array.isArray(values) ? values.slice() : [];
  if (!list.length) return [];
  var offset = seed % list.length;
  return list.slice(offset).concat(list.slice(0, offset));
}

function takeSeeded(values, seed, count) {
  return rotateBySeed(values, seed).slice(0, Math.max(0, count || 0));
}

function pushUniqueSegments(target, values) {
  if (!Array.isArray(target) || !Array.isArray(values)) return target;
  var seen = {};
  target.forEach(function (item) {
    var key = stripSentenceTail(item);
    if (key) seen[key] = true;
  });
  values.forEach(function (item) {
    var text = stripSentenceTail(item);
    if (!text || seen[text]) return;
    seen[text] = true;
    target.push(text + "。");
  });
  return target;
}

function primaryPlantLabel(context) {
  var plants = normalizePlantNames(context && context.plantNames);
  return plants.length ? plants[0] : "";
}

function combinedPlantLabel(context) {
  var plants = normalizePlantNames(context && context.plantNames);
  return plants.length ? plants.join("、") : "";
}

function extractContextCueTags(context) {
  var source = [
    context && context.note ? String(context.note) : "",
    context && context.currentPhotoMemo ? sanitizeMemoForAi(context.currentPhotoMemo) : "",
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "",
  ].join(" ");
  var tags = [];
  for (var i = 0; i < CONTEXT_CUE_RULES.length; i++) {
    if (CONTEXT_CUE_RULES[i].pattern.test(source)) {
      tags.push(CONTEXT_CUE_RULES[i].tag);
    }
  }
  return tags;
}

function buildObservationSegments(context, profile, seed) {
  var plantLabel = primaryPlantLabel(context) || combinedPlantLabel(context) || "この植栽";
  var areaLabel = context && context.areaLabel ? String(context.areaLabel).trim() : "この場所";
  var photoIndex =
    context && context.photoIndex != null ? Number(context.photoIndex) || 0 : 0;
  var openings;
  var followups;

  switch (profile && profile.id) {
    case "detail_focus":
      openings = [
        plantLabel + "では葉先と株元の動きが別々に見え、近くで追うほど変化の置き場所がつかみやすく映ります。",
        "葉の重なり方と色の深まりが細部に出ていて、見返すたびに新しい手がかりが見つかります。",
        "細かな凹凸や向きのずれまで拾えており、" + plantLabel + "の変化が面ではなく点でも読める状態です。",
      ];
      followups = [
        "先端の伸びと株元の込み具合に差があり、同じ株の中でも今よく動いている部分がはっきりしています。",
        "葉先の反り方や重なりの厚みまで見えていて、どこに勢いが残っているかを細かく追えます。",
        "小さな差がいくつも残っているので、近くで見るほど細部の表情が増して見えます。",
      ];
      break;
    case "shape_balance":
      openings = [
        plantLabel + "は外へ広がる輪郭が整いはじめ、株姿そのものに変化の手応えが出ています。",
        "立ち上がる部分と横へ逃がす部分が分かれてきて、" + plantLabel + "らしい形が見え始めています。",
        "遠目にも形の芯が感じられ、葉や枝の増え方が株全体の印象を支えています。",
      ];
      followups = [
        "高さと横への張りの釣り合いが見え、画面の中で株全体のまとまりがつかみやすく映ります。",
        "輪郭の外側だけでなく中心の密度も整い、写真全体で見たときの座りが良く見えます。",
        "外へ広がる線と立ち上がる線がぶつからず、草姿の向きが素直に読めます。",
      ];
      break;
    case "season_transition":
      openings = [
        "色の濃淡やふくらみ方に季節感がにじみ、" + plantLabel + "がやわらかな表情を見せていることが見て取れます。",
        areaLabel + "の空気の中でも" + plantLabel + "らしい明るさが分かりやすく、その時期ならではの表情が素直に残っています。",
        "芽や葉の見え方に差があり、" + plantLabel + "のやわらかさと落ち着きが同じ画面で見えてきます。",
      ];
      followups = [
        "やわらかな部分と落ち着いた部分が同時に見え、季節の気配が自然ににじみます。",
        "色の差だけでなくふくらみの出方にも違いがあり、その場の空気感まで写真から感じ取れます。",
        "淡い揺らぎが残っていて、やわらかな魅力がそのまま写っています。",
      ];
      break;
    default:
      openings = [
        plantLabel + "で目に入る場所が増え、主役になる部分と支える部分の両方が写真の中ではっきり見えています。",
        plantLabel + "の細かな動きだけでなく、全体にどう広がっているかまで拾えていて、見どころが整理しやすくなっています。",
        plantLabel + "の勢いが点ではなく面で広がり、写真全体から株の表情が素直に立ち上がります。",
      ];
      followups = [
        plantLabel + "の見え方が整理され、どこに視線が集まるのかを自然につかめます。",
        "輪郭の収まり方に迷いがなく、変化の中心がどこにあるかを素直に読み取れる状態です。",
        "断片ではなくひとまとまりとして眺められるため、株全体の印象が自然に入ってきます。",
      ];
      break;
  }

  return takeSeeded(openings, seed + plantLabel.length * 11 + photoIndex * 7, 1).concat(
    takeSeeded(followups, seed + areaLabel.length * 13 + photoIndex * 17, 1)
  );
}

function buildClosingSegments(context, profile, seed) {
  var plants = normalizePlantNames(context && context.plantNames);
  var label = plants.length ? plants.join("、") : "この植栽";
  var closings = [
    "派手さだけでなく確かな動きも写っていて、" + label + "の今の状態が気持ちよく目に入ります。",
    "この一枚だけでも見どころが整理されており、記録としての手応えがしっかり残っています。",
    "周囲とのバランスも含めて今の状態が残っており、その場の空気までふっと浮かびます。",
    "細かな差が積み重なって見え、近くで眺めるほどこの株の表情がぐっと豊かに立ち上がります。",
  ];

  if (profile && profile.id === "focus_story") {
    closings.push(
      "主役になる部分が明快でありながら周囲とのつながりも残っていて、一枚の写真として読み応えがあります。"
    );
  }

  return takeSeeded(closings, seed + 23, 2);
}

function buildRewriteAwayPrompt(context, draft, previousMemo) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の写真コメントを書き直してください。",
    "意味や観察対象は保ちつつ、前のコメントと同じ言い回しや文の並びを避けてください。",
    "特に、前のコメントに近い語順、同じ書き出し、同じ締め方は使わないでください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い見立てや印象の整理を書く構成にしてください。",
    "既存コメントの意味は大きく外さず、表現だけを新しくしてください。",
    "避けたい表現例: " + AVOID_REPEATED_EXPRESSIONS.join(" / "),
    "前のコメント: " + String(previousMemo || "").slice(0, 500),
    "書き直し前の案: " + String(draft || "").slice(0, 500),
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, context);
  lines.push(profile.example);

  return lines.concat(buildContextLines(context)).concat(["返答は書き直したコメント本文だけにしてください。"]).join("\n");
}

function buildJapaneseNaturalnessPrompt(context, draft, reason) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の写真コメントを、日本語として自然で読みやすい文章に整えてください。",
    "意味や観察内容はできるだけ保ちつつ、不自然な言い回し、同じ型の繰り返し、ぎこちない助詞のつながりを直してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "文ごとに少しずつ視点を変え、同じ言い回しや同じ締め方を続けないでください。",
    "写真から読める観察、別の見どころ、軽い見立ての順が無理なくつながるようにしてください。",
    "『見えます』『伝わります』『感じられます』『整ってきています』『追いやすくなっています』のような説明調の言い回しを続けないでください。",
    "『〜に目を向けると』『見どころが自然に浮かび上がってきます』『説明しやすい』のような、書き方の説明を本文に残さないでください。",
    "不自然さの指摘: " + reason,
    "下書き: " + String(draft || "").slice(0, 500),
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, context);

  return lines.concat(buildContextLines(context)).concat(["返答は整えたコメント本文だけにしてください。"]).join("\n");
}

function buildJapaneseProofreadPrompt(context, draft, reason) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の写真コメントを最終校正してください。",
    "意味や観察内容は変えすぎず、日本語として自然で読みやすい文章に整えてください。",
    "送り仮名、助詞、漢字の使い分け、語尾のつながり、読点の位置、不自然な誤変換を必ず点検してください。",
    "機械的な説明文にならないようにしつつ、日本語として引っかかる箇所はすべて直してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "文ごとに少しずつ視点を変え、同じ言い回しや同じ締め方を続けないでください。",
    "『見えます』『伝わります』『感じられます』『整ってきています』『追いやすくなっています』のような説明調の言い回しを続けないでください。",
    "『〜に目を向けると』『見どころが自然に浮かび上がってきます』『説明しやすい』のような、書き方の説明を本文に残さないでください。",
    "校正の注意点: " + (reason || "送り仮名・助詞・漢字表記も含めて最終確認してください。"),
    "下書き: " + String(draft || "").slice(0, 500),
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, context);

  return lines.concat(buildContextLines(context)).concat(["返答は校正後のコメント本文だけにしてください。"]).join("\n");
}

function buildJapaneseQualityReviewPrompt(context, draft) {
  var lines = [
    "次の写真コメントを校閲者として最終点検してください。",
    "送り仮名、助詞、漢字の使い分け、文が途中で切れていないか、同じ言い回しの繰り返しがないか、日本語として自然かを厳しく確認してください。",
    "『ウッドデッキの鉢から伸びた細い花茎の先に、星。』『淡いピンクから。』のような、文として成立していない断片は不可です。",
    "『花色に目を向けると、見どころが自然に浮かび上がってきます』『コメントとしてまとめやすい』のような、書き方の説明が混ざる文も不可です。",
    "問題があれば、意味を保ったまま自然な日本語に直した完成文を返してください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "返答は必ず次のJSONだけにしてください。",
    '{"ok":true,"issues":[],"revisedComment":"ここに完成文"}',
    "ok は修正不要なら true、修正が必要なら false にしてください。",
    "issues には短い指摘を配列で入れてください。",
    "revisedComment には必ず完成文を入れてください。修正不要でも、そのまま完成文を入れてください。",
    "下書き: " + String(draft || "").slice(0, 500),
  ];
  return lines.concat(buildContextLines(context)).join("\n");
}

function buildObservationPlanPrompt(context) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var focusSummary = summarizeUserInstructionFocus(safeContext);
  var lines = [
    "次の写真について、まずコメント用の観察設計図を作ってください。",
    "まだ完成コメントは書かないでください。",
    "対象は今回の1枚だけです。写っている内容だけを、その場で見たように説明してください。",
    "ユーザーが見てほしい点がある場合は、その意図をくみ取りつつ、写真の中で確認できる観察へ置き換えてください。",
    "返答は必ず次のJSONだけにしてください。",
    '{"requestedViewpoint":"見てほしい点を写真の観察に置き換えた短い説明","observations":["観察1","観察2"],"closingAngle":"最後に触れたい見どころや読み取りを短く"}',
    "requestedViewpoint は20文字以上60文字以下にしてください。",
    "observations は2件以上4件以下にしてください。",
    "observations には、色、形、向き、広がり、株元、先端、花、葉、茎など、写真で実際に見て言えることだけを書いてください。",
    "closingAngle には、最後の一文で触れたい変化や見どころのまとめを短く書いてください。",
    "内部メモ向けの言い方ではなく、あとで本文に直しやすい短い観察文にしてください。",
    "アピール、コメント、メモ、ユーザー指示の説明など、写真そのものではないメタ表現は入れないでください。",
    "『〜に目を向けると』『見どころが自然に浮かび上がってきます』『説明しやすい』のような、書き方の説明も禁止です。",
  ];
  if (focusSummary) {
    lines.push("とくに「" + focusSummary + "」をどう写真の観察へ置き換えるかをはっきり整理してください。");
  }
  return lines.concat(buildContextLines(safeContext)).join("\n");
}

function buildObservationPlanRepairPrompt(context, rawPlanText, reason) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var lines = [
    "次の観察設計図は不適切だったので、写真コメント用の設計図として作り直してください。",
    "まだ完成コメントは書かないでください。",
    "対象は今回の1枚だけです。写っている内容だけを、その場で見たように説明してください。",
    "不適切だった理由: " + String(reason || "").slice(0, 160),
    "設計図には、アピール、コメント、メモ、ユーザー指示の説明などのメタ表現を入れないでください。",
    "色、形、向き、広がり、光、影、株元、先端など、写真の中で本当に見えることだけで組み立ててください。",
    "『〜に目を向けると』『見どころが自然に浮かび上がってきます』『説明しやすい』のような橋渡し表現も入れないでください。",
    "返答は必ず次のJSONだけにしてください。",
    '{"requestedViewpoint":"見てほしい点を写真の観察に置き換えた短い説明","observations":["観察1","観察2"],"closingAngle":"最後に触れたい見どころや読み取りを短く"}',
    "直前の不適切な設計図: " + String(rawPlanText || "").slice(0, 500),
  ];
  return lines.concat(buildContextLines(safeContext)).join("\n");
}

function validateObservationPlanField(text, context, requireVisualDetail) {
  var value = stripSentenceTail(sanitizeMemoForAi(text));
  if (!value) return "項目が空です。";
  if (containsMetaCommentaryTerm(value)) return "メタ表現が混ざっています。";
  if (containsInternalBridgePhrasing(value)) return "書き方の説明が混ざっています。";
  if (containsTimelineComparisonPhrasing(value)) return "今回の写真だけを対象にした観察へ置き換えてください。";
  if (isLikelySentenceFragment(value + "。")) return "文が断片的です。";
  if (requireVisualDetail && !containsVisualDetail(value, context || {})) {
    return "写真から分かる具体的な観察になっていません。";
  }
  return "";
}

function validateObservationPlan(plan, context) {
  if (!plan || typeof plan !== "object") return "設計図のJSONを解釈できませんでした。";
  var viewpointError = validateObservationPlanField(plan.requestedViewpoint, context, true);
  if (viewpointError) return "requestedViewpoint: " + viewpointError;

  var observations = Array.isArray(plan.observations) ? plan.observations : [];
  if (observations.length < 2) return "observations が不足しています。";
  for (var i = 0; i < observations.length; i++) {
    var observationError = validateObservationPlanField(observations[i], context, true);
    if (observationError) return "observations[" + String(i) + "]: " + observationError;
  }

  if (plan.closingAngle) {
    var closingError = validateObservationPlanField(plan.closingAngle, context, false);
    if (closingError) return "closingAngle: " + closingError;
  }

  return "";
}

function buildCommentFromObservationPlanPrompt(context, plan) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var profile = pickStyleProfile(safeContext);
  var lines = [
    "次の観察設計図をもとに、植栽記録サイトの写真メモを1つ作成してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "コメントは100文字以上200文字以下、2〜4文にしてください。",
    "対象は今回の1枚だけです。写っている内容だけを、その場で見たように説明してください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い見立てや印象の整理を書く構成にしてください。",
    "設計図の requestedViewpoint は説明文としてそのまま書かず、写真の見どころとして自然に織り込んでください。",
    "observations にある観察は最低2つ以上、本文に自然に反映してください。",
    "closingAngle は締めの一文で生かしてください。",
    "内部向けの橋渡し表現や、ユーザーの指示文の引用はしないでください。",
    "『〜に目を向けると』『見どころが自然に浮かび上がってきます』『説明しやすい』のような、書き方の説明は禁止です。",
    "今回の文体の軸: " + profile.label,
    "見てほしい点の解釈: " + String(plan && plan.requestedViewpoint ? plan.requestedViewpoint : "").slice(0, 120),
  ];
  var observations = plan && Array.isArray(plan.observations) ? plan.observations : [];
  observations.slice(0, 4).forEach(function (item, index) {
    lines.push("観察" + String(index + 1) + ": " + String(item || "").slice(0, 120));
  });
  lines.push("締めの方向: " + String(plan && plan.closingAngle ? plan.closingAngle : "").slice(0, 120));
  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, safeContext);
  lines.push(profile.example);
  return lines.concat(buildContextLines(safeContext)).concat(["返答はコメント本文だけにしてください。"]).join("\n");
}

function extractGeminiText(data) {
  if (!data || !Array.isArray(data.candidates)) return "";
  for (var i = 0; i < data.candidates.length; i++) {
    var candidate = data.candidates[i];
    var content = candidate && candidate.content;
    var parts = content && Array.isArray(content.parts) ? content.parts : [];
    var texts = [];
    for (var j = 0; j < parts.length; j++) {
      if (parts[j] && typeof parts[j].text === "string" && parts[j].text.trim()) {
        texts.push(parts[j].text.trim());
      }
    }
    if (texts.length) return texts.join("\n").trim();
  }
  return "";
}

function extractJsonObjectText(text) {
  var source = String(text || "").trim();
  if (!source) return "";
  source = source.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  var start = source.indexOf("{");
  var end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "";
  return source.slice(start, end + 1);
}

function parseQualityReview(text) {
  var raw = extractJsonObjectText(text);
  if (!raw) {
    var plain = normalizeComment(text);
    if (!plain) return null;
    return {
      ok: false,
      issues: ["review_format_invalid"],
      revisedComment: plain,
    };
  }
  try {
    var parsed = JSON.parse(raw);
    return {
      ok: parsed && parsed.ok === true,
      issues:
        parsed && Array.isArray(parsed.issues)
          ? parsed.issues
              .map(function (item) {
                return typeof item === "string" ? item.trim() : "";
              })
              .filter(Boolean)
              .slice(0, 6)
          : [],
      revisedComment:
        parsed && typeof parsed.revisedComment === "string"
          ? parsed.revisedComment.trim()
          : normalizeComment(text),
    };
  } catch (_err) {
    var fallback = normalizeComment(text);
    if (!fallback) return null;
    return {
      ok: false,
      issues: ["review_json_parse_failed"],
      revisedComment: fallback,
    };
  }
}

function parseObservationPlan(text) {
  var raw = extractJsonObjectText(text);
  if (!raw) return null;

  try {
    var parsed = JSON.parse(raw);
    var requestedViewpoint =
      parsed && typeof parsed.requestedViewpoint === "string"
        ? sanitizeMemoForAi(parsed.requestedViewpoint).slice(0, 120)
        : "";
    var observations =
      parsed && Array.isArray(parsed.observations)
        ? parsed.observations
            .map(function (item) {
              return stripSentenceTail(sanitizeMemoForAi(item)).slice(0, 120);
            })
            .filter(Boolean)
            .slice(0, 4)
        : [];
    var closingAngle =
      parsed && typeof parsed.closingAngle === "string"
        ? stripSentenceTail(sanitizeMemoForAi(parsed.closingAngle)).slice(0, 120)
        : "";

    if (observations.length < 2) return null;
    if (!requestedViewpoint && !closingAngle) return null;

    return {
      requestedViewpoint: requestedViewpoint,
      observations: observations,
      closingAngle: closingAngle,
    };
  } catch (_err) {
    return null;
  }
}

function normalizeComment(text) {
  var out = stripEmbeddedImageMarkup(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/^[\s>*#\-0-9.)]+/, "")
    .replace(/[「」"'`]/g, "")
    .trim();

  out = out.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();

  if (out.length > COMMENT_MAX_LENGTH) {
    var cut = out.slice(0, COMMENT_MAX_LENGTH);
    var lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    out = lastStop >= COMMENT_MIN_LENGTH - 1 ? cut.slice(0, lastStop + 1) : cut.trim();
  }

  if (out && !/[。！？]$/.test(out)) out += "。";
  return out;
}

function splitSentences(text) {
  var matches = String(text || "").match(/[^。！？]+[。！？]?/g);
  return (matches || [])
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
}

function stripSentenceTail(text) {
  return String(text || "")
    .replace(/[。！？]+$/g, "")
    .trim();
}

function uniqueSentences(text) {
  var seen = {};
  return splitSentences(text).filter(function (sentence) {
    var key = stripSentenceTail(sentence);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function polishComment(text) {
  var out = normalizeComment(text);
  if (!out) return out;

  var sentences = uniqueSentences(out);
  out = normalizeComment(sentences.join(""));
  return out;
}

function appendSentence(base, sentence) {
  var left = stripSentenceTail(base);
  var right = stripSentenceTail(sentence);
  if (!right) return normalizeComment(left);
  if (!left) return normalizeComment(right);
  if (left.indexOf(right) !== -1) return normalizeComment(left);
  return normalizeComment(left + "。" + right);
}

function expandCommentToMinimum(comment, context) {
  var out = polishComment(comment);
  var segments = buildFallbackSegments(context);

  if (!out) {
    out = segments.shift() || "";
  }

  while (out.length < COMMENT_MIN_LENGTH && segments.length) {
    out = appendSentence(out, segments.shift());
  }

  if (out.length < COMMENT_MIN_LENGTH) {
    out = appendSentence(out, "葉や株の動きが重なり、画面の中で株の勢いが自然に読み取れます。");
  }

  return polishComment(out);
}

function buildLengthSafetyNetSegments(context) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var areaText = safeContext && safeContext.areaLabel ? String(safeContext.areaLabel).trim() : "";
  var plants = normalizePlantNames(safeContext && safeContext.plantNames);
  var seed = stableContextSeed(safeContext);
  var profile = pickStyleProfile(safeContext);
  var segments = [];

  if (plants.length) {
    pushUniqueSegments(
      segments,
      takeSeeded(
        [
          plants.join("、") + "のまとまりと抜ける部分の差が見えやすく、どこに勢いが集まっているかを画面の中でつかみやすくなっています。",
          "近い部分だけでなく株全体の収まりまで見えるため、" + plants.join("、") + "の見どころを落ち着いて整理しやすくなっています。",
          plants.join("、") + "の見え方に奥行きがあり、動きが一方向ではなく面として広がっています。",
        ],
        seed + 19,
        2
      )
    );
  } else if (areaText) {
    pushUniqueSegments(
      segments,
      takeSeeded(
        [
          areaText + "の空気感も含めて写っていて、近い部分だけでなく周囲とのバランスまで一緒に見渡せます。",
          areaText + "の中でどこに視線が集まるかが分かりやすく、全体のまとまりが自然に頭へ入ってきます。",
          areaText + "の光や背景との関係まで見えており、その場の雰囲気ごと記録できています。",
        ],
        seed + 23,
        2
      )
    );
  }

  pushUniqueSegments(
    segments,
    buildCueSegments(safeContext, seed + 29).concat(buildClosingSegments(safeContext, profile, seed + 31))
  );

  return segments;
}

function expandCommentToMinimumRobust(comment, context) {
  var out = expandCommentToMinimum(comment, context);
  var segments = buildLengthSafetyNetSegments(context);
  var guard = 0;

  while (out.length < COMMENT_MIN_LENGTH && segments.length && guard < 16) {
    out = appendSentence(out, segments.shift());
    guard += 1;
  }

  if (out.length < COMMENT_MIN_LENGTH) {
    out = appendSentence(out, "全体のまとまりと細かな違いの両方が見えており、この株の今の表情をしっかり受け取れます。");
  }

  if (out.length < COMMENT_MIN_LENGTH) {
    out = appendSentence(out, "見える範囲だけでも見どころが十分にあり、あとで読み返してもその場の雰囲気を思い出しやすくなっています。");
  }

  return polishComment(out);
}

function countMatches(text, regex) {
  var matches = String(text || "").match(regex);
  return matches ? matches.length : 0;
}

function containsVisualDetail(text, context) {
  var source = String(text || "");
  for (var i = 0; i < VISUAL_DETAIL_TERMS.length; i++) {
    if (source.indexOf(VISUAL_DETAIL_TERMS[i]) !== -1) return true;
  }

  var plants = normalizePlantNames(context && context.plantNames);
  for (var j = 0; j < plants.length; j++) {
    if (plants[j] && source.indexOf(plants[j]) !== -1) return true;
  }

  return false;
}

function hasTooManyGenericPhrases(text) {
  var hit = 0;
  for (var i = 0; i < GENERIC_PATTERNS.length; i++) {
    if (String(text || "").indexOf(GENERIC_PATTERNS[i]) !== -1) hit += 1;
  }
  return hit >= 2;
}

function hasRepeatedPlantSentenceStart(text, context) {
  var plants = normalizePlantNames(context && context.plantNames);
  if (!plants.length) return false;
  var sentences = splitSentences(text);
  var count = 0;
  for (var i = 0; i < sentences.length; i++) {
    var sentence = stripSentenceTail(sentences[i]);
    for (var j = 0; j < plants.length; j++) {
      if (sentence.indexOf(plants[j]) === 0) {
        count += 1;
        break;
      }
    }
  }
  return count >= 2;
}

function isLikelySentenceFragment(sentence) {
  var text = stripSentenceTail(sentence);
  if (!text) return false;
  for (var i = 0; i < LIKELY_COMPLETE_SENTENCE_ENDINGS.length; i++) {
    if (LIKELY_COMPLETE_SENTENCE_ENDINGS[i].test(text)) return false;
  }
  if (/[、，,]\s*$/.test(text)) return true;
  for (var j = 0; j < INCOMPLETE_SENTENCE_ENDINGS.length; j++) {
    if (INCOMPLETE_SENTENCE_ENDINGS[j].test(text)) return true;
  }
  return false;
}

function countLikelySentenceFragments(text) {
  var sentences = splitSentences(text);
  var count = 0;
  for (var i = 0; i < sentences.length; i++) {
    if (isLikelySentenceFragment(sentences[i])) count += 1;
  }
  return count;
}

function hasRepetitiveSentenceLeads(text) {
  var sentences = splitSentences(text);
  var seen = {};
  for (var i = 0; i < sentences.length; i++) {
    var lead = stripSentenceTail(sentences[i]).replace(/^(この|その|今回は|写真では)/, "").slice(0, 8);
    if (!lead || lead.length < 5) continue;
    seen[lead] = (seen[lead] || 0) + 1;
  }
  return Object.keys(seen).some(function (lead) {
    return seen[lead] >= 3;
  });
}

function getJapaneseNaturalnessError(comment, context) {
  var text = String(comment || "").trim();
  if (!text) return "日本語の点検対象となる本文が空です。";
  if (containsEmbeddedImageMarkup(text)) return "画像埋め込み用のコードが混ざっており、コメントとして不自然です。";
  if (/[�]/.test(text)) return "文字化けが含まれています。";
  if (/[?？]{6,}/.test(text)) return "記号が連続しており、文章として崩れています。";

  var sentences = splitSentences(text);
  if (!sentences.length) return "文として区切れません。";

  var repeatedEndings = {};
  for (var i = 0; i < sentences.length; i++) {
    var sentence = stripSentenceTail(sentences[i]);
    if (!sentence) continue;
    var tail = sentence.slice(-6);
    repeatedEndings[tail] = (repeatedEndings[tail] || 0) + 1;
  }
  var repeatedEndingMax = 0;
  Object.keys(repeatedEndings).forEach(function (tail) {
    if (repeatedEndings[tail] > repeatedEndingMax) repeatedEndingMax = repeatedEndings[tail];
  });
  if (repeatedEndingMax >= 3) {
    return "文末の調子が単調で、同じ締め方が続いています。";
  }

  var familyHits = {};
  for (var j = 0; j < sentences.length; j++) {
    var normalizedSentence = stripSentenceTail(sentences[j]);
    for (var k = 0; k < ENDING_FAMILY_RULES.length; k++) {
      if (ENDING_FAMILY_RULES[k].pattern.test(normalizedSentence)) {
        familyHits[ENDING_FAMILY_RULES[k].label] =
          (familyHits[ENDING_FAMILY_RULES[k].label] || 0) + 1;
      }
    }
  }
  var repeatedFamily = Object.keys(familyHits).find(function (label) {
    return familyHits[label] >= 3;
  });
  if (repeatedFamily) {
    return "文末が" + repeatedFamily + "に寄りすぎていて、文章の調子が単調です。";
  }

  var riskCounts = {};
  for (var m = 0; m < sentences.length; m++) {
    var sentenceText = stripSentenceTail(sentences[m]);
    for (var n = 0; n < NATURALNESS_RISK_PATTERNS.length; n++) {
      if (NATURALNESS_RISK_PATTERNS[n].pattern.test(sentenceText)) {
        riskCounts[NATURALNESS_RISK_PATTERNS[n].label] =
          (riskCounts[NATURALNESS_RISK_PATTERNS[n].label] || 0) + 1;
      }
    }
  }
  var riskLabels = Object.keys(riskCounts);
  var repeatedRisk = riskLabels.find(function (label) {
    return riskCounts[label] >= 2;
  });
  var totalRiskHits = riskLabels.reduce(function (sum, label) {
    return sum + riskCounts[label];
  }, 0);
  if (repeatedRisk || totalRiskHits >= 3) {
    return "説明調の定型表現が多く、日本語が硬く単調です。";
  }

  if (containsInternalBridgePhrasing(text)) {
    return "写真の説明より、書き方の説明に寄った文が混ざっています。";
  }

  var currentPhotoMemo =
    context && context.currentPhotoMemo ? sanitizeMemoForAi(context.currentPhotoMemo) : "";
  if (currentPhotoMemo && currentPhotoMemo === text) {
    return "既存メモの言い直しに留まり、新しい文章として整っていません。";
  }

  if (hasRepeatedPlantSentenceStart(text, context)) {
    return "同じ植栽名から始まる文が続き、日本語の流れが単調です。";
  }

  var fragmentCount = countLikelySentenceFragments(text);
  if (fragmentCount >= 2) {
    return "文が途中で切れたような言い回しが多く、文章として成立していません。";
  }
  if (fragmentCount >= 1 && splitSentences(text).length >= 3) {
    return "一部の文が断片的で、日本語として不自然です。";
  }

  if (hasRepetitiveSentenceLeads(text)) {
    return "文頭の言い回しが繰り返され、説明が不自然に感じられます。";
  }

  return "";
}

function shouldReplaceMemoWithFallback(comment, context) {
  var text = typeof comment === "string" ? comment.trim() : "";
  var safeContext = Object.assign({}, context || {}, {
    currentPhotoMemo: "",
  });
  if (!text) return true;
  return !!(getValidationError(text, safeContext) || getJapaneseNaturalnessError(text, safeContext));
}

function normalizeForMemoSimilarity(value) {
  return String(value || "")
    .replace(/[。、，,\s・「」『』（）()［］\[\]【】…・:：;；'"!?！？]/g, "")
    .trim();
}

function isMemoTooSimilar(sourceMemo, candidateMemo) {
  var left = normalizeForMemoSimilarity(sourceMemo);
  var right = normalizeForMemoSimilarity(candidateMemo);
  if (!left || !right) return false;
  if (left === right) return true;

  var minLen = Math.min(left.length, right.length);
  var commonPrefix = 0;
  while (commonPrefix < minLen && left.charAt(commonPrefix) === right.charAt(commonPrefix)) {
    commonPrefix += 1;
  }
  if (commonPrefix >= 24) return true;

  var commonLength = 0;
  for (var i = 0; i < left.length; i++) {
    if (right.indexOf(left.slice(i, i + 12)) !== -1) {
      commonLength += 12;
      i += 11;
    }
  }
  return commonLength >= 36;
}

function buildFallbackGrowthPhotoComment(context) {
  var safeContext = Object.assign({}, toCurrentPhotoOnlyContext(context), {
    currentPhotoMemo: "",
  });
  var profile = pickStyleProfile(safeContext);
  var plantLabel = primaryPlantLabel(safeContext) || combinedPlantLabel(safeContext) || "この植栽";
  var areaLabel = safeContext && safeContext.areaLabel ? String(safeContext.areaLabel).trim() : "";
  var locationPrefix = areaLabel ? areaLabel + "で育つ" : "";
  var comment = "";

  if (profile && profile.id === "detail_focus") {
    comment =
      locationPrefix +
      plantLabel +
      "は葉の重なり方と先端の伸びが読み取りやすく、写真の中で今よく動いている部分がつかみやすく映ります。" +
      "株元の込み具合や色の重なりも見やすく、細部から全体までこの株の表情を素直に味わえます。";
  } else if (profile && profile.id === "shape_balance") {
    comment =
      locationPrefix +
      plantLabel +
      "は株の広がりと茎葉の向きがそろって見え、全体の姿から今の調子が落ち着いて分かります。" +
      "輪郭のまとまりと色の出方も追いやすく、写真全体からその株らしい佇まいがくっきり浮かびます。";
  } else if (profile && profile.id === "season_transition") {
    comment =
      locationPrefix +
      plantLabel +
      "は色の差と葉先の動きが画面の中で拾いやすく、やわらかな季節感が静かににじみます。" +
      "株元から先端までの見え方にもまとまりがあり、その時期らしい表情がしっかり映っています。";
  } else {
    comment =
      locationPrefix +
      plantLabel +
      "は先端の伸びと株元の込み具合に差があり、写真の中で視線が集まる場所がはっきり見えてきます。" +
      "葉の重なりや色の出方にも奥行きがあり、どこにこの株らしさが出ているかを自然に追っていけます。";
  }

  comment = expandCommentToMinimumRobust(comment, safeContext);
  var validationError = getValidationError(comment, safeContext);
  var naturalnessError = getJapaneseNaturalnessError(comment, safeContext);
  if (validationError || naturalnessError) {
    comment = expandCommentToMinimumRobust("", safeContext);
    validationError = getValidationError(comment, safeContext);
    naturalnessError = getJapaneseNaturalnessError(comment, safeContext);
  }
  if (validationError) {
    throw new Error(validationError);
  }
  if (naturalnessError) {
    throw new Error(naturalnessError);
  }
  return comment;
}

async function readGeminiErrorPayload(res) {
  try {
    return await res.json();
  } catch (e) {
    return {};
  }
}

function detectGeminiReason(payload) {
  var details =
    payload &&
    payload.error &&
    Array.isArray(payload.error.details)
      ? payload.error.details
      : [];
  for (var i = 0; i < details.length; i++) {
    var reason = details[i] && details[i].reason ? String(details[i].reason) : "";
    if (reason) return reason;
  }
  return "";
}

function makeGeminiError(code, detail, status, extra) {
  var err = new Error(detail || code);
  err.code = code;
  err.status = status || 500;
  if (extra && typeof extra === "object") {
    Object.keys(extra).forEach(function (key) {
      err[key] = extra[key];
    });
  }
  return err;
}

async function requestGeminiRaw(opts, promptText, requestOptions) {
  var env = opts.env || process.env;
  var model = getGeminiModel(env);
  var apiKey = opts.apiKey || env.GEMINI_API_KEY;
  var requestOpts = requestOptions || {};
  var parts = [
    {
      text: promptText,
    },
    {
      text: "1枚目が今回の写真です。",
    },
    {
      inline_data: {
        mime_type: opts.imageMimeType,
        data: opts.imageBase64,
      },
    },
  ];

  var response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: parts,
          },
        ],
        generationConfig: {
          temperature:
            typeof requestOpts.temperature === "number" ? requestOpts.temperature : 0.68,
          maxOutputTokens:
            typeof requestOpts.maxOutputTokens === "number" ? requestOpts.maxOutputTokens : 420,
        },
        store: false,
      }),
      signal: opts.signal,
    }
  );

  if (!response.ok) {
    var payload = await readGeminiErrorPayload(response);
    var reason = detectGeminiReason(payload);
    var message =
      payload && payload.error && typeof payload.error.message === "string"
        ? payload.error.message
        : "";

    if (reason === "API_KEY_INVALID" || message.indexOf("API key not valid") !== -1) {
      throw makeGeminiError(
        "gemini_request_failed",
        "GEMINI_API_KEY が無効です。Google AI Studio で発行した有効な Gemini API キーに更新してください。",
        500,
        { reason: reason }
      );
    }

    if (message.indexOf("reported as leaked") !== -1) {
      throw makeGeminiError(
        "gemini_request_failed",
        "現在の Gemini API キーは利用停止されています。Google AI Studio で新しいキーを発行して差し替えてください。",
        500,
        { reason: reason }
      );
    }

    throw makeGeminiError(
      "gemini_request_failed",
      message || "Gemini API の呼び出しに失敗しました。",
      502,
      { reason: reason }
    );
  }

  var data = await response.json();
  return {
    model: model,
    text: extractGeminiText(data),
  };
}

async function requestGeminiComment(opts, promptText, requestOptions) {
  var response = await requestGeminiRaw(opts, promptText, requestOptions);
  return {
    model: response.model,
    comment: polishComment(response.text),
  };
}

async function requestGeminiObservationPlan(opts, context) {
  var safeContext = context || {};
  var response = await requestGeminiRaw(
    opts,
    buildObservationPlanPrompt(safeContext),
    {
      temperature: 0.18,
      maxOutputTokens: 360,
    }
  );
  var plan = parseObservationPlan(response.text);
  var validationError = validateObservationPlan(plan, safeContext);

  if (validationError) {
    response = await requestGeminiRaw(
      opts,
      buildObservationPlanRepairPrompt(safeContext, response.text, validationError),
      {
        temperature: 0.12,
        maxOutputTokens: 360,
      }
    );
    plan = parseObservationPlan(response.text);
    validationError = validateObservationPlan(plan, safeContext);
  }

  return {
    model: response.model,
    plan: validationError ? null : plan,
  };
}

async function reviewJapaneseCommentQuality(opts, context, draft) {
  var response = await requestGeminiRaw(
    opts,
    buildJapaneseQualityReviewPrompt(context, draft),
    {
      temperature: 0.1,
      maxOutputTokens: 360,
    }
  );
  var parsed = parseQualityReview(response.text);
  if (!parsed) {
    return {
      ok: false,
      issues: ["review_response_empty"],
      revisedComment: polishComment(draft),
      reviewFailed: true,
    };
  }
  return {
    ok: parsed.ok,
    issues: parsed.issues,
    revisedComment: polishComment(parsed.revisedComment || draft),
    reviewFailed:
      parsed.issues &&
      parsed.issues.some(function (issue) {
        return issue === "review_format_invalid" || issue === "review_json_parse_failed";
      }),
  };
}

function stabilizeAcceptedComment(comment, context) {
  var safeContext = context || {};
  var out = polishComment(comment);
  var validationError = getValidationError(out, safeContext);
  var naturalnessError = getJapaneseNaturalnessError(out, safeContext);

  if (validationError) {
    out = expandCommentToMinimumRobust(out, safeContext);
    validationError = getValidationError(out, safeContext);
    naturalnessError = getJapaneseNaturalnessError(out, safeContext);
  }

  if (validationError || naturalnessError) {
    try {
      out = buildFallbackGrowthPhotoComment(safeContext);
      validationError = getValidationError(out, safeContext);
      naturalnessError = getJapaneseNaturalnessError(out, safeContext);
    } catch (_err) {
      // Fall through and let the caller surface the original validation error.
    }
  }

  return {
    comment: out,
    validationError: validationError,
    naturalnessError: naturalnessError,
  };
}

async function generateGrowthPhotoComment(options) {
  var opts = options || {};
  var env = opts.env || process.env;
  var apiKey = opts.apiKey || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw makeGeminiError("gemini_unavailable", "GEMINI_API_KEY が設定されていません。", 503);
  }

  var imageBase64 =
    typeof opts.imageBase64 === "string" && opts.imageBase64.trim()
      ? opts.imageBase64.trim()
      : "";
  if (!imageBase64) {
    throw makeGeminiError("missing_image_base64", "imageBase64 がありません。", 400);
  }

  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, typeof opts.timeoutMs === "number" ? opts.timeoutMs : 25000);

  try {
    var safeContext = toCurrentPhotoOnlyContext(opts.context || {});
    var requestOpts = {
      env: env,
      apiKey: apiKey,
      imageBase64: imageBase64,
      imageMimeType:
        typeof opts.imageMimeType === "string" && opts.imageMimeType.trim()
          ? opts.imageMimeType.trim()
          : "image/jpeg",
      signal: opts.signal || controller.signal,
    };

    var structuredPlan = null;
    var userInstruction =
      safeContext && safeContext.userInstruction ? sanitizeMemoForAi(safeContext.userInstruction) : "";
    if (userInstruction) {
      var planResult = await requestGeminiObservationPlan(requestOpts, safeContext);
      structuredPlan = planResult && planResult.plan ? planResult.plan : null;
    }

    var initialPrompt = structuredPlan
      ? buildCommentFromObservationPlanPrompt(safeContext, structuredPlan)
      : buildPrompt(safeContext);
    var result = await requestGeminiComment(requestOpts, initialPrompt, {
      temperature: structuredPlan ? 0.38 : 0.68,
      maxOutputTokens: 420,
    });
    var validationError = getValidationError(result.comment, safeContext);
    var naturalnessError = getJapaneseNaturalnessError(result.comment, safeContext);

    if (validationError) {
      result = await requestGeminiComment(
        requestOpts,
        buildRepairPrompt(safeContext, result.comment, validationError),
        {
          temperature: 0.24,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);
      validationError = getValidationError(result.comment, safeContext);
      naturalnessError = getJapaneseNaturalnessError(result.comment, safeContext);
    }

    if (validationError) {
      result.comment = expandCommentToMinimumRobust(result.comment, safeContext);
      validationError = getValidationError(result.comment, safeContext);
      naturalnessError = getJapaneseNaturalnessError(result.comment, safeContext);
    }

    if (!validationError && naturalnessError) {
      result = await requestGeminiComment(
        requestOpts,
        buildJapaneseNaturalnessPrompt(safeContext, result.comment, naturalnessError),
        {
          temperature: 0.22,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);
      validationError = getValidationError(result.comment, safeContext);
      naturalnessError = getJapaneseNaturalnessError(result.comment, safeContext);
    }

    if (!validationError && naturalnessError) {
      result.comment = expandCommentToMinimumRobust(result.comment, safeContext);
      validationError = getValidationError(result.comment, safeContext);
      naturalnessError = getJapaneseNaturalnessError(result.comment, safeContext);
    }

    result = await requestGeminiComment(
      requestOpts,
      buildJapaneseProofreadPrompt(
        safeContext,
        result.comment,
        naturalnessError || validationError || ""
      ),
      {
        temperature: 0.12,
        maxOutputTokens: 420,
      }
    );
    var stabilized = stabilizeAcceptedComment(result.comment, safeContext);
    result.comment = stabilized.comment;
    validationError = stabilized.validationError;
    naturalnessError = stabilized.naturalnessError;

    var proofreadComment = result.comment;
    var proofreadValidationError = validationError;
    var proofreadNaturalnessError = naturalnessError;

    var qualityReview = await reviewJapaneseCommentQuality(
      requestOpts,
      safeContext,
      result.comment
    );

    var reviewedComment = polishComment(qualityReview.revisedComment || result.comment);
    var reviewedValidationError = getValidationError(reviewedComment, safeContext);
    var reviewedNaturalnessError = getJapaneseNaturalnessError(reviewedComment, safeContext);

    if (!reviewedValidationError && !reviewedNaturalnessError) {
      result.comment = reviewedComment;
      validationError = "";
      naturalnessError = "";
    } else {
      result.comment = proofreadComment;
      validationError = proofreadValidationError;
      naturalnessError = proofreadNaturalnessError;
    }

    var rewriteBaseMemo =
      typeof opts.forceRewriteAgainstMemo === "string" ? opts.forceRewriteAgainstMemo.trim() : "";
    if (opts.forceFreshRewrite && rewriteBaseMemo && isMemoTooSimilar(rewriteBaseMemo, result.comment)) {
      result = await requestGeminiComment(
        requestOpts,
        buildRewriteAwayPrompt(safeContext, result.comment, rewriteBaseMemo),
        {
          temperature: 0.42,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);

      result = await requestGeminiComment(
        requestOpts,
        buildJapaneseProofreadPrompt(
          safeContext,
          result.comment,
          "前のコメントと似た言い回しにならないように整えてください。"
        ),
        {
          temperature: 0.12,
          maxOutputTokens: 420,
        }
      );
      var rewritten = stabilizeAcceptedComment(result.comment, safeContext);
      result.comment = rewritten.comment;
      validationError = rewritten.validationError;
      naturalnessError = rewritten.naturalnessError;
    }

    if (validationError) {
      throw makeGeminiError("gemini_invalid_comment", validationError, 502);
    }

    if (naturalnessError) {
      throw makeGeminiError("gemini_unnatural_japanese", naturalnessError, 502);
    }

    return {
      ok: true,
      model: result.model,
      comment: result.comment,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildCueSegments(context, seed) {
  var tags = extractContextCueTags(context);
  var noteText = context && context.note ? normalizeComment(String(context.note).slice(0, 80)) : "";
  var currentPhotoMemo =
    context && context.currentPhotoMemo
      ? normalizeComment(sanitizeMemoForAi(context.currentPhotoMemo).slice(0, 80))
      : "";
  var userInstruction =
    context && context.userInstruction
      ? normalizeComment(sanitizeMemoForAi(context.userInstruction).slice(0, 80))
      : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var label = plants.length ? plants.join("、") : "この植栽";
  var focusSegments = buildUserInstructionCueSegments(context);
  var segments = [];

  if (tags.indexOf("pruned") !== -1) {
    segments.push("切り戻しや剪定のあとらしい輪郭が見えており、切り口と新しい伸びの対比を拾いやすい状態です。");
  }
  if (tags.indexOf("staked") !== -1) {
    segments.push("支柱や誘引を意識した形が見え、横へ流れやすい部分を整えながら支えている様子が読み取れます。");
  }
  if (tags.indexOf("sown") !== -1) {
    segments.push("種まき直後らしい細かな立ち上がりがあり、やわらかな芽の気配が画面の中に細かく散っています。");
  }
  if (tags.indexOf("sprout") !== -1) {
    segments.push("新芽が主役になり始めていて、やわらかな部分と芯になる部分の差を拾いやすくなっています。");
  }
  if (tags.indexOf("bud") !== -1) {
    segments.push("つぼみの張りや数にも目が向き、ふくらみの段階らしい緊張感がそのまま画面に張りつめています。");
  }
  if (tags.indexOf("bloom") !== -1) {
    segments.push("花の開き方や色の差があり、一輪ごとの差まで含めて見どころがよく立っています。");
  }
  if (tags.indexOf("fruit") !== -1) {
    segments.push("実や種の見え方が画面に出てきていて、その株らしいまとまりがよりくっきり浮かびます。");
  }
  if (tags.indexOf("color") !== -1) {
    segments.push("色の差がまとまりの中で分かり、育つ" + label + "でも読み取り方に幅があることが自然に分かります。");
  }
  if (tags.indexOf("spread") !== -1) {
    segments.push("葉が重なり立ち上がりが横方向にも広がっていて、全体にゆるやかなうねりが生まれています。");
  }
  if (plants.length > 1) {
    segments.push("複数の植栽が同じ画面に入り、伸び方や色の出方の違いまで一度に見渡せます。");
  }
  if (noteText && noteText.length >= 8) {
    segments.push("記録メモで触れている見どころと重なる部分が写っており、画面の中で注目点をつかみやすい配置です。");
  }
  if (currentPhotoMemo && currentPhotoMemo.length >= 8) {
    segments.push("輪郭や色の差として目に入りやすい部分があり、写真の中で注目点をつかみやすい構図です。");
  }
  if (userInstruction && userInstruction.length >= 4) {
    if (!focusSegments.length) {
      focusSegments.push("画面の中で目立つ部分と落ち着いた部分の差があり、視線が集まる場所が自然に定まります。");
    }
  }

  return focusSegments.concat(takeSeeded(segments, seed + 11, 2)).slice(0, 3);
}

function buildContextLines(context) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var lines = [];
  var dateText = safeContext && safeContext.recordedDate ? String(safeContext.recordedDate).trim() : "";
  var areaText = safeContext && safeContext.areaLabel ? String(safeContext.areaLabel).trim() : "";
  var plants = normalizePlantNames(safeContext && safeContext.plantNames);
  var noteText = safeContext && safeContext.note ? String(safeContext.note).trim() : "";
  var currentPhotoMemo =
    safeContext && safeContext.currentPhotoMemo ? sanitizeMemoForAi(safeContext.currentPhotoMemo) : "";
  var userInstruction =
    safeContext && safeContext.userInstruction ? sanitizeMemoForAi(safeContext.userInstruction) : "";
  var photoIndex =
    safeContext && safeContext.photoIndex != null ? String(safeContext.photoIndex).trim() : "";
  var photoCount =
    safeContext && safeContext.photoCount != null ? String(safeContext.photoCount).trim() : "";

  if (dateText) lines.push("記録日: " + dateText);
  if (areaText) lines.push("エリア: " + areaText);
  if (plants.length) lines.push("植栽: " + plants.join("、"));
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 800));
  if (currentPhotoMemo) {
    lines.push("既存の写真メモ（意図を引き継ぎ、語句はそのまま写さない）: " + currentPhotoMemo.slice(0, 800));
  }
  if (userInstruction) {
    var focusSummary = summarizeUserInstructionFocus(safeContext);
    if (focusSummary) {
      lines.push("見てほしい観点の要約: " + focusSummary);
    } else {
      lines.push("見てほしい点は、語句を写さず意図だけ拾い、写真で確認できる観察へ置き換えて扱うこと。");
    }
  }
  if (photoIndex) {
    lines.push("写真番号: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : ""));
  }
  return lines;
}

function appendUserInstructionGuidance(lines, context) {
  var userInstruction =
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  if (!userInstruction) return;
  var focusSummary = summarizeUserInstructionFocus(context);
  lines.push(
    "ユーザーが見てほしい点があるときは、その意図をできるだけ本文へ反映しつつ、写真の中で確かめられる根拠と結びつけて具体的に書いてください。"
  );
  lines.push(
    "要望の文をなぞるのではなく、そこで求められている着眼点を写真の観察に言い換えてください。"
  );
  lines.push(
    "最終的には、指示の説明ではなく、写真そのものの見どころとして自然に読めるコメントに整えてください。"
  );
  lines.push(
    "要望の語句や文をそのまま引用したり、少し言い換えただけの文を作ったりせず、意図を読み取って写真の観察へ展開してください。"
  );
  lines.push(
    "入力が短い断片でも、そのまま掲載するのではなく、何を気にしているのかを推測して自然な日本語のコメントに組み直してください。"
  );
  if (focusSummary) {
    lines.push(
      "とくに「" +
        focusSummary +
        "」のような観点は、本文のどこかで自然な観察として触れてください。"
    );
  }
}

function buildPrompt(context) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var profile = pickStyleProfile(safeContext);

  var lines = [
    "次の写真について、植栽記録サイトの写真メモを1つ作成してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "コメントは100文字以上200文字以下、2〜4文にしてください。",
    "対象は今回の1枚だけです。写っている内容だけを、その場で見たように説明してください。",
    "1文目では、写真から目に入る具体的な観察を書いてください。色、数、高さ、広がり、向き、ふくらみ、葉や花や実の状態などに触れてください。",
    "2文目では、別の観察点や全体のバランスを書いてください。1文目の言い換えではなく、違う見どころを足してください。",
    "最後の1文では、軽い見立てや印象の整理を書いてください。断定しすぎず、写真と記録文脈から読める範囲にしてください。",
    "同じ植栽名を文頭に続けて並べず、文ごとに視点の切り口を変えてください。",
    "避けたい表現例: " + AVOID_REPEATED_EXPRESSIONS.join(" / "),
    "既存の写真メモがある場合は、その意図、観点、固有名詞を引き継ぎつつ、文章そのものは写真の観察として自然に組み直してください。",
    "既存メモや入力メモの語句をそのまま抜き出したり、少し言い換えただけの文章にしたりしないでください。",
    "『様子が伝わります』『記録です』『写真です』のような無難な締め方だけで終わらせないでください。",
    "薄い感想ではなく、写真を見た人が情景を思い浮かべられる程度の具体性を入れてください。",
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, safeContext);
  lines.push(profile.example);
  lines.push("渡される画像は今回の写真だけと考え、現在見えている内容に集中してください。");

  return lines.concat(buildContextLines(safeContext)).concat(["返答はコメント本文だけにしてください。"]).join("\n");
}

function buildRepairPrompt(context, draft, reason) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var profile = pickStyleProfile(safeContext);
  var lines = [
    "次の下書きを修正して、植栽記録サイトの写真メモとして完成させてください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "対象は今回の1枚だけです。写っている内容だけを、その場で見たように説明してください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い見立てや印象の整理を書く構成にしてください。",
    "毎回同じ書き出しや締めを避けてください。今回の写真に合う観察の入口を選び、前のコメントの型をなぞらないでください。",
    "避けたい表現例: " + AVOID_REPEATED_EXPRESSIONS.join(" / "),
    "『様子が伝わります』『記録です』のような定型句だけで終わらせないでください。",
    "既存の写真メモがある場合は、その意図、観点、固有名詞を引き継ぎつつ、文章そのものは写真の観察として自然に組み直してください。",
    "既存メモや入力メモの語句をそのまま抜き出したり、少し言い換えただけの文章にしたりしないでください。",
    "今回の文体の軸: " + profile.label,
    "下書きの問題: " + reason,
    "下書き: " + String(draft || "").slice(0, 500),
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, safeContext);
  lines.push(profile.example);

  return lines.concat(buildContextLines(safeContext)).concat(["返答は修正後のコメント本文だけにしてください。"]).join("\n");
}

function buildFallbackSegments(context) {
  var safeContext = toCurrentPhotoOnlyContext(context);
  var segments = [];
  var seed = stableContextSeed(safeContext);
  var profile = pickStyleProfile(safeContext);
  var observations = buildObservationSegments(safeContext, profile, seed);
  var cues = buildCueSegments(safeContext, seed);
  var closings = buildClosingSegments(safeContext, profile, seed);

  pushUniqueSegments(segments, observations.slice(0, 1));
  pushUniqueSegments(segments, cues.slice(0, 1));
  pushUniqueSegments(segments, closings.slice(0, 1));
  pushUniqueSegments(segments, observations.slice(1, 2));
  pushUniqueSegments(segments, cues.slice(1, 2));
  pushUniqueSegments(segments, closings.slice(1, 2));
  return segments;
}

function hasDirectSourcePhraseEcho(sourceMemo, candidateMemo) {
  var source = sanitizeMemoForAi(sourceMemo);
  var candidate = normalizeComment(candidateMemo);
  if (!source || !candidate) return false;

  var normalizedSource = normalizeComment(source);
  var sourceBody = stripSentenceTail(normalizedSource);
  if (sourceBody.length >= 18 && candidate.indexOf(sourceBody) !== -1) {
    return true;
  }

  var sourceSentences = splitSentences(normalizedSource)
    .map(function (sentence) {
      return stripSentenceTail(sentence);
    })
    .filter(function (sentence) {
      return sentence.length >= 14;
    });
  for (var i = 0; i < sourceSentences.length; i++) {
    if (candidate.indexOf(sourceSentences[i]) !== -1) return true;
  }

  return normalizedSource.length >= 20 && isMemoTooSimilar(normalizedSource, candidate);
}

function containsMetaCommentaryTerm(text) {
  return META_COMMENTARY_PATTERN.test(String(text || ""));
}

function containsInternalBridgePhrasing(text) {
  var source = String(text || "");
  for (var i = 0; i < INTERNAL_BRIDGE_PATTERNS.length; i++) {
    if (INTERNAL_BRIDGE_PATTERNS[i].test(source)) return true;
  }
  return false;
}

function containsTimelineComparisonPhrasing(text) {
  return TIMELINE_COMPARISON_PATTERN.test(String(text || ""));
}

function extractUserInstructionFocusTerms(value) {
  var text = sanitizeMemoForAi(value);
  if (!text) return [];

  var source = text
    .replace(/見てほしい|見たい|見てもらいたい|見てください|見て下さい|踏まえて|を踏まえて|について|に注目して|注目して|意識して|中心に|中心で|なるべく|できるだけ|ちゃんと/g, " ")
    .replace(/前回と比べて|前回とくらべて|前回と比較して|前回より|今回|前回|比較|違い|変化|成長|比べて|くらべて/g, " ")
    .replace(/[、。,\s/／・]+/g, " ")
    .replace(/[()（）「」『』"'`]/g, " ")
    .replace(/[をはがにでへともやの]/g, " ")
    .trim();
  if (!source) return [];

  var rawTerms = source.match(/[A-Za-z0-9]{2,}|[一-龠々ぁ-んァ-ヶー]{2,12}/g) || [];
  var terms = [];
  var seen = {};

  for (var i = 0; i < rawTerms.length; i++) {
    var term = rawTerms[i]
      .replace(/^(その|この|あの|より|まで)+/g, "")
      .replace(/(です|ます|でした|ました|したい|して|され|いる|ある|ない|たい|そう|よう)$/g, "")
      .trim();
    if (!term || term.length < 2) continue;
    if (USER_INSTRUCTION_STOP_TERMS[term]) continue;
    if (/^(それ|ここ|そこ|あれ|これ|どこ|いま|今|あと|ため)$/u.test(term)) continue;
    if (seen[term]) continue;
    seen[term] = true;
    terms.push(term);
  }

  terms.sort(function (left, right) {
    return right.length - left.length;
  });
  return terms.slice(0, 4);
}

function getUserInstructionFocusTerms(context) {
  return extractUserInstructionFocusTerms(context && context.userInstruction).filter(function (term) {
    return (
      !containsMetaCommentaryTerm(term) &&
      !USER_INSTRUCTION_COMPARISON_TERMS[term] &&
      containsVisualDetail(term, context || {})
    );
  });
}

function summarizeUserInstructionFocus(context) {
  var terms = getUserInstructionFocusTerms(context);
  return terms.length ? terms.slice(0, 3).join("、") : "";
}

function pickPrimaryUserInstructionFocus(terms) {
  var list = Array.isArray(terms) ? terms : [];
  return list.length ? list[0] : "";
}

function buildUserInstructionCueSegments(context) {
  var terms = getUserInstructionFocusTerms(context);
  if (!terms.length) return [];

  var primary = pickPrimaryUserInstructionFocus(terms);
  var secondary = "";
  for (var i = 0; i < terms.length; i++) {
    if (terms[i] !== primary) {
      secondary = terms[i];
      break;
    }
  }

  var segments = [];
  if (primary && secondary) {
    segments.push(primary + "と" + secondary + "の差が同じ画面で拾いやすく、その重なりが今回の印象を支えています。");
    segments.push(primary + "に加えて" + secondary + "にも動きがあり、変化が一か所に偏らず広がって見えます。");
  } else if (primary) {
    segments.push(primary + "の出方が写真の中ではっきりしており、その差が全体の表情を決めています。");
    segments.push(primary + "の見え方に変化が集まり、周りとの違いまで一緒に見えてきます。");
  }

  return segments;
}

function hasUserInstructionFocusReflection(comment, context) {
  var text = normalizeComment(comment);
  var terms = getUserInstructionFocusTerms(context);
  if (!text || !terms.length) return true;

  for (var i = 0; i < terms.length; i++) {
    if (text.indexOf(terms[i]) !== -1) return true;
  }
  return false;
}

function getValidationError(comment, context) {
  var text = String(comment || "").trim();
  if (!text) return "コメントが空です。";
  if (containsEmbeddedImageMarkup(text)) return "画像埋め込み用のコードが混ざっています。";
  if (text.length < COMMENT_MIN_LENGTH) return "100文字未満で短すぎます。";
  if (text.length > COMMENT_MAX_LENGTH) return "200文字を超えて長すぎます。";

  var japaneseCount = countMatches(text, /[ぁ-んァ-ヶー一-龠々。]/g);
  if (japaneseCount < 30) return "日本語の情報量が足りません。";

  var latinCount = countMatches(text, /[A-Za-z]/g);
  if (latinCount > Math.max(2, Math.floor(text.length * 0.05))) {
    return "英語やローマ字が多すぎます。";
  }

  if (splitSentences(text).length < 2) {
    return "文章数が少なく、観察や補足の層が足りません。";
  }

  if (
    /(補足メモ|ユーザー|見てほしい点|入力メモ|写真メモ|記録メモ|指示|要望|気になっている見方)/.test(text) ||
    containsMetaCommentaryTerm(text) ||
    containsInternalBridgePhrasing(text)
  ) {
    return "内部向けの説明語が混ざっています。読み手に向けた自然なコメントへ書き直してください。";
  }

  if (containsTimelineComparisonPhrasing(text)) {
    return "今回の写真に写っている内容だけで説明してください。";
  }

  var noteText = context && context.note ? sanitizeMemoForAi(context.note) : "";
  if (noteText && noteText.length >= 20 && hasDirectSourcePhraseEcho(noteText, text)) {
    return "記録メモの文章をほぼそのまま写しています。意図を踏まえて、写真の観察として書き直してください。";
  }

  var userInstruction = context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  if (userInstruction && userInstruction.length >= 12 && hasDirectSourcePhraseEcho(userInstruction, text)) {
    return "ユーザーの要望文をほぼそのまま写しています。意図だけをくみ取り、写真の観察として書き直してください。";
  }
  if (userInstruction && !hasUserInstructionFocusReflection(text, context)) {
    return "ユーザーが見てほしい観点が本文に反映されていません。写真の観察として自然に織り込んでください。";
  }

  var currentPhotoMemo =
    context && context.currentPhotoMemo ? sanitizeMemoForAi(context.currentPhotoMemo) : "";
  if (currentPhotoMemo) {
    var memoTokens =
      currentPhotoMemo.match(/[A-Za-z0-9]{2,}|[ァ-ヶー]{2,}|[一-龠々]{2,}/g) || [];
    var importantTokens = memoTokens.filter(function (token) {
      return token.length >= 2;
    });
    if (importantTokens.length) {
      var overlap = importantTokens.some(function (token) {
        return text.indexOf(token) !== -1;
      });
      if (!overlap) return "既存の写真メモの要点が消えています。";
    }
  }

  if (!containsVisualDetail(text, context)) {
    return "写真から読み取れる具体的な観察が足りません。";
  }

  if (hasTooManyGenericPhrases(text)) {
    return "定型句が多く、写真ごとの差が薄くなっています。";
  }

  return "";
}

module.exports = {
  buildFallbackGrowthPhotoComment,
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  DEFAULT_GEMINI_MODEL,
  buildGrowthPhotoCommentPrompt: buildPrompt,
  expandCommentToMinimum: expandCommentToMinimumRobust,
  generateGrowthPhotoComment,
  getGeminiModel,
  getJapaneseNaturalnessError,
  getValidationError,
  isMemoTooSimilar,
  normalizeComment,
  normalizePlantNames,
  pickStyleProfile,
  polishComment,
  shouldReplaceMemoWithFallback,
  stableContextSeed,
};
