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
  "開き",
  "重なり",
  "増え",
  "揃い",
  "色づき",
  "上向き",
  "下向き",
];

const GENERIC_PATTERNS = [
  "様子が伝わります",
  "変化が見て取れます",
  "状態が見て取れます",
  "記録です",
  "一枚です",
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
  /(?:濃淡|先に|株元|花茎|輪郭|まとまり|広がり|立ち上がり)$/u,
  /(?:開き|伸び|増え|揺れ|重なり|立ち上がり|色づき)$/u,
  /(?:細い花|小さな花|星|蕾|つぼみ)$/u,
];

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

function normalizeReferenceImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(function (item) {
      var imageBase64 =
        item && typeof item.imageBase64 === "string" ? item.imageBase64.trim() : "";
      if (!imageBase64) return null;
      return {
        label: item && typeof item.label === "string" ? item.label.trim() : "",
        imageBase64: imageBase64,
        imageMimeType:
          item && typeof item.imageMimeType === "string" && item.imageMimeType.trim()
            ? item.imageMimeType.trim()
            : "image/jpeg",
      };
    })
    .filter(Boolean)
    .slice(0, 2);
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
      "締めでは、その小さな変化が株全体の勢いにどうつながるかを短く触れてください。",
    ],
    example:
      "例: 葉先の緑がいっそう濃くなり、先端のやわらかな伸びが写真でもはっきり見えます。株元には新しい芽の動きも重なり、近くで見るほど変化の多さが伝わってきます。細かな伸びが積み重なって、全体の生育が一段進んだ印象です。",
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
      "例: 株全体が外側へゆったり広がり、前より輪郭が大きく見える姿になってきました。葉の重なりに厚みが出て、中央から外側へ向かう流れも自然につながっています。草姿のまとまりが増し、この先さらに見映えが整っていきそうな段階です。",
  },
  {
    id: "season_transition",
    label: "季節感観察型",
    promptLines: [
      "今回は季節感観察型で書いてください。芽吹き、ふくらみ、花や実の段階、色の移り変わりなど時期の進み方を意識してください。",
      "今どの段階にいるかが伝わるように、季節の手触りを自然ににじませてください。",
      "最後は次の変化を期待させる軽い見立てで締めてください。",
    ],
    example:
      "例: つぼみのふくらみがそろってきて、花へ向かう切り替わりの時期に入ったことが写真からも伝わります。葉色にもやわらかな明るさが混じり、季節の進みにつれて株全体の表情が少しずつ変わってきました。次の記録では開き始めた姿が見えてきそうです。",
  },
  {
    id: "comparison_story",
    label: "比較観察型",
    promptLines: [
      "今回は比較観察型で書いてください。前回との差分や、同じ株の中での変化の方向を明確にしてください。",
      "比較は1か所か2か所に絞り、伸びた、増えた、締まった、色が深まったなど、見比べて言える変化だけを書いてください。",
      "最後は、変化の流れがどちらへ向かっているかを短くまとめてください。",
    ],
    example:
      "例: 前回より葉の枚数が増え、外側へ広がる幅にも余裕が出てきました。中心部の込み具合がほどよく厚くなり、株全体の見え方がひと回りしっかりしてきた印象です。成長の勢いが途切れず、その流れがはっきり続いている段階だと感じられます。",
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
    context && context.previousPhotoMemo ? sanitizeMemoForAi(context.previousPhotoMemo) : "",
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
        plantLabel + "では葉先と株元の動きが別々に見え、近くで追うほど変化の置き場所がつかみやすい場面です。",
        "葉の重なり方と色の深まりが細部に出ていて、写真を見返したときの手がかりが多い一枚になっています。",
        "細かな凹凸や向きのずれまで拾えており、" + plantLabel + "の変化が面ではなく点でも読める状態です。",
      ];
      followups = [
        "先端の伸びと株元の込み具合に差があり、同じ株の中でも今よく動いている部分がはっきりしています。",
        "葉先の反り方や重なりの厚みまで見えていて、どこに勢いが残っているかを細かく追いやすくなっています。",
        "小さな差がいくつも残っているので、次回の写真と比べたときに細部の更新まで拾えそうです。",
      ];
      break;
    case "shape_balance":
      openings = [
        plantLabel + "は外へ広がる輪郭が整いはじめ、株姿そのものに変化の手応えが出ています。",
        "立ち上がる部分と横へ逃がす部分が分かれてきて、" + plantLabel + "らしい形が見え始めています。",
        "遠目にも形の芯が感じられ、葉や枝の増え方が株全体の印象へつながっている段階です。",
      ];
      followups = [
        "高さと横への張りが前より釣り合って見え、画面の中で株全体のまとまりがつかみやすくなっています。",
        "輪郭の外側だけでなく中心の密度も整ってきて、写真全体で見たときの座りが良くなっています。",
        "外へ広がる線と立ち上がる線がぶつからず、草姿の方向性が少しずつ固まってきた印象です。",
      ];
      break;
    case "season_transition":
      openings = [
        "色の濃淡やふくらみ方に季節の進みがにじみ、" + plantLabel + "が次の段階へ寄りつつあることが見て取れます。",
        areaLabel + "の空気の中でも" + plantLabel + "の季節の進み方がわかりやすく、前後の記録とつなげやすい場面です。",
        "芽や葉の見え方に移り変わりが出ていて、" + plantLabel + "の時間の進み方が素直に残っています。",
      ];
      followups = [
        "やわらかな部分と落ち着いた部分が同時に見え、今が切り替わりの時期らしい表情になっています。",
        "色の変化だけでなくふくらみの出方にも差があり、次の段階が近づいていることを写真から感じ取れます。",
        "今だけの途中らしさが残っていて、前後の記録をつなぐ役目を持った一枚として読めます。",
      ];
      break;
    default:
      openings = [
        "前回と比べると" + plantLabel + "で目に入る場所が増え、変化の向きが前よりはっきりしてきました。",
        "前の記録では気づきにくかった部分まで今回の写真では拾え、" + plantLabel + "の動きが一段見比べやすくなっています。",
        "見比べると" + plantLabel + "の勢いが点ではなく面で伝わり、変化の筋道が前より読みやすくなっています。",
      ];
      followups = [
        plantLabel + "の見え方が前回より整理され、どこが伸びてどこが落ち着いたかを追いやすくなっています。",
        "前より輪郭の収まり方に迷いがなく、変化の中心がどこにあるかを素直に読み取れるようになっています。",
        "前回は断片的だった変化が今回はひとつの流れとして見え、見比べたときの納得感が増しています。",
      ];
      break;
  }

  return takeSeeded(openings, seed + plantLabel.length * 11 + photoIndex * 7, 1).concat(
    takeSeeded(followups, seed + areaLabel.length * 13 + photoIndex * 17, 1)
  );
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
  var segments = [];

  if (tags.indexOf("pruned") !== -1) {
    segments.push("切り戻しや剪定のあとらしい輪郭が残っており、ここからどこが戻ってくるかを追う材料がしっかり写っています。");
  }
  if (tags.indexOf("staked") !== -1) {
    segments.push("支柱や誘引を意識した整え方が見え、伸び方を支えながら観察している段階だと伝わってきます。");
  }
  if (tags.indexOf("sown") !== -1) {
    segments.push("種まき直後らしい静かな区切りがあり、この先どこから芽がそろうかを待つ時間ごと記録できています。");
  }
  if (tags.indexOf("sprout") !== -1) {
    segments.push("新芽が主役になり始めていて、次にどの部分が伸びの中心になるかを想像しやすい場面です。");
  }
  if (tags.indexOf("bud") !== -1) {
    segments.push("つぼみの張りや数にも目が向き、開く直前の緊張感が少しずつ高まっているように見えます。");
  }
  if (tags.indexOf("bloom") !== -1) {
    segments.push("花の開き方や向きに個体差があり、見頃へ向かう途中ならではの揺らぎがよく出ています。");
  }
  if (tags.indexOf("fruit") !== -1) {
    segments.push("実や莢の見え方が前面に出てきていて、生育の重点が次の段階へ移っていることが感じられます。");
  }
  if (tags.indexOf("color") !== -1) {
    segments.push("色の差がひと目でわかり、同じ" + label + "でも進み方に幅があることが自然に伝わってきます。");
  }
  if (tags.indexOf("spread") !== -1) {
    segments.push("広がり方と立ち上がり方が同時に変わっていて、株全体のリズムが少し切り替わってきたようです。");
  }
  if (plants.length > 1) {
    segments.push("複数の植栽が同じ画面に収まり、それぞれの伸び方や見せ場の違いまで読み取りやすくなっています。");
  }
  if (noteText && noteText.length >= 8) {
    segments.push("記録メモにある「" + stripSentenceTail(noteText) + "」ともつながり、作業や気づきの意図が写真側からも追えます。");
  }
  if (currentPhotoMemo && currentPhotoMemo.length >= 8) {
    segments.push("写真メモに残した「" + stripSentenceTail(currentPhotoMemo) + "」の着眼点が、そのまま画面の中でも確かめやすい内容です。");
  }
  if (userInstruction && userInstruction.length >= 4) {
    segments.push("補足メモで気にしている「" + stripSentenceTail(userInstruction) + "」の視点でも見どころを追いやすい写真です。");
  }

  return takeSeeded(segments, seed + 11, 2);
}

function buildComparisonSegments(context, seed) {
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo
      ? normalizeComment(sanitizeMemoForAi(context.previousPhotoMemo).slice(0, 80))
      : "";
  var segments = [];

  if (previousPhotoMemo) {
    segments.push("前回メモにある「" + stripSentenceTail(previousPhotoMemo) + "」とつなげて読むと、今回はその先の変化がもう少し具体的に見えてきます。");
  }
  if (previousDateText) {
    segments.push(previousDateText + "の記録よりも輪郭や込み具合の変化が拾いやすく、育ち方の流れを落ち着いて追える段階です。");
    segments.push(previousDateText + "の時点では目立たなかった部分まで今回の写真では見えてきて、変化が一段整理されてきた印象です。");
  }
  return takeSeeded(segments, seed + 17, 1);
}

function buildClosingSegments(context, profile, seed) {
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var label = plants.length ? plants.join("、") : "この植栽";
  var closings = [
    "派手さよりも確かな前進が写っていて、" + label + "の流れを落ち着いて追える材料になっています。",
    "この一枚だけでも次にどこを見比べたいかが自然に浮かび、記録としての厚みが残っています。",
    "周囲とのバランスも含めて今の状態が残っており、あとで見返したときにも変化の理由を思い出しやすそうです。",
    "いまは細かな差が積み重なる時期らしく、次の写真と並べたときに伸び方の筋道がさらに読みやすくなりそうです。",
  ];

  if (profile && profile.id === "comparison_story") {
    closings.push("見比べる前提で眺めても変化の芯がぶれず、この先の流れまで無理なく想像できる記録になっています。");
  }
  if (photoIndex) {
    closings.push(
      "同じ記録の" +
        photoIndex +
        (photoCount
          ? "枚目としても、" + photoCount + "枚の中でどこに注目した写真なのかがわかりやすく残っています。"
          : "枚目としても、その日の中で切り取りたい場面が明確に見える内容です。")
    );
  }

  return takeSeeded(closings, seed + 23, 2);
}

function buildContextLines(context) {
  var lines = [];
  var dateText = context && context.recordedDate ? String(context.recordedDate).trim() : "";
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var noteText = context && context.note ? String(context.note).trim() : "";
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? sanitizeMemoForAi(context.currentPhotoMemo) : "";
  var userInstruction =
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var previousNoteText =
    context && context.previousNote ? String(context.previousNote).trim() : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo ? sanitizeMemoForAi(context.previousPhotoMemo) : "";
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";

  if (dateText) lines.push("記録日: " + dateText);
  if (areaText) lines.push("エリア: " + areaText);
  if (plants.length) lines.push("植栽: " + plants.join("、"));
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 800));
  if (currentPhotoMemo) lines.push("既存の写真メモ: " + currentPhotoMemo.slice(0, 800));
  if (userInstruction) lines.push("ユーザーからの補足メモ: " + userInstruction.slice(0, 800));
  if (previousDateText) lines.push("前回記録日: " + previousDateText);
  if (previousNoteText) lines.push("前回の記録メモ: " + previousNoteText.slice(0, 500));
  if (previousPhotoMemo) lines.push("前回写真メモ: " + previousPhotoMemo.slice(0, 500));
  if (photoIndex) {
    lines.push(
      "写真番号: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : "")
    );
  }
  return lines;
}

function appendUserInstructionGuidance(lines, context) {
  var userInstruction =
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  if (!userInstruction) return;
  lines.push(
    "ユーザーからの補足メモがあるときは、その内容を踏まえつつ、写真の中で確かめられる根拠と結びつけて具体的に書いてください。"
  );
  lines.push(
    "補足メモをそのまま言い換えるだけで終わらせず、写真に写っている様子や変化を解説する形にしてください。"
  );
  lines.push(
    "補足メモに含まれる着眼点や疑問を踏まえながら、最終的には写真そのものの説明として読めるコメントに整えてください。"
  );
}

function buildPrompt(context) {
  var hasPrevious = !!(
    (context && context.previousRecordedDate) ||
    (context && context.previousPhotoMemo) ||
    (context && context.previousNote)
  );
  var profile = pickStyleProfile(context);

  var lines = [
    "次の写真について、植栽記録サイトの写真メモを1つ作成してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "コメントは100文字以上200文字以下、2〜4文にしてください。",
    "1文目では、写真から目に入る具体的な観察を書いてください。色、数、高さ、広がり、向き、ふくらみ、葉や花や実の状態などに触れてください。",
    "2文目では、別の観察点や全体のバランスを書いてください。1文目の言い換えではなく、違う見どころを足してください。",
    "最後の1文では、見てわかる範囲で軽い考察や変化を書いてください。推測しすぎず、写真と記録文脈から読み取れる範囲だけにしてください。",
    "毎回同じ書き出しや締めを避けてください。今回の写真に合う観察の入口を選び、前回と違う切り口で書いてください。",
    "同じ植栽名を文頭に続けて並べず、文ごとに視点の切り口を変えてください。",
    "避けたい表現例: " + AVOID_REPEATED_EXPRESSIONS.join(" / "),
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "『様子が伝わります』『記録です』『写真です』のような無難な締め方だけで終わらせないでください。",
    "薄い感想ではなく、写真を見た人が情景を思い浮かべられる程度の具体性を入れてください。",
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, context);
  lines.push(profile.example);

  lines.push("1枚目は今回の写真です。");
  if (hasPrevious) {
    lines.push("比較用の前回写真も渡されている場合があります。見比べて、前回より進んだ点や変わった点がはっきり見えるときだけ自然に触れてください。");
    lines.push("差が読み取りにくい場合は、無理に比較や考察を書かないでください。");
  } else {
    lines.push("今回は比較用の前回写真がない前提で、現在の様子を中心に書いてください。");
  }

  return lines.concat(buildContextLines(context)).concat(["返答はコメント本文だけにしてください。"]).join("\n");
}

function buildRepairPrompt(context, draft, reason) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の下書きを修正して、植栽記録サイトの写真メモとして完成させてください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い考察や変化を書く構成にしてください。",
    "毎回同じ書き出しや締めを避けてください。今回の写真に合う観察の入口を選び、前のコメントの型をなぞらないでください。",
    "同じ植栽名を文頭に続けて並べず、文ごとに視点の切り口を変えてください。",
    "避けたい表現例: " + AVOID_REPEATED_EXPRESSIONS.join(" / "),
    "『様子が伝わります』『記録です』のような定型句だけで終わらせないでください。",
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "今回の文体の軸: " + profile.label,
    "下書きの問題: " + reason,
    "下書き: " + String(draft || "").slice(0, 500),
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  appendUserInstructionGuidance(lines, context);
  lines.push(profile.example);

  return lines.concat(buildContextLines(context)).concat(["返答は修正後のコメント本文だけにしてください。"]).join("\n");
}

function buildRewriteAwayPrompt(context, draft, previousMemo) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の写真コメントを書き直してください。",
    "意味や観察対象は保ちつつ、前のコメントと同じ言い回しや文の並びを避けてください。",
    "特に、前のコメントに近い語順、同じ書き出し、同じ締め方は使わないでください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い考察や変化を書く構成にしてください。",
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
    "写真から読める観察、別の見どころ、軽い考察の順が無理なくつながるようにしてください。",
    "『見えます』『伝わります』『感じられます』『整ってきています』『追いやすくなっています』のような説明調の言い回しを続けないでください。",
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

function buildFallbackSegments(context) {
  var segments = [];
  var seed = stableContextSeed(context);
  var profile = pickStyleProfile(context);
  var currentPhotoMemo =
    context && context.currentPhotoMemo
      ? normalizeComment(sanitizeMemoForAi(context.currentPhotoMemo))
      : "";
  var observations = buildObservationSegments(context, profile, seed);
  var cues = buildCueSegments(context, seed);
  var comparisons = buildComparisonSegments(context, seed);
  var closings = buildClosingSegments(context, profile, seed);

  if (currentPhotoMemo) pushUniqueSegments(segments, [currentPhotoMemo]);
  pushUniqueSegments(segments, observations.slice(0, 1));
  pushUniqueSegments(segments, cues.slice(0, 1));
  pushUniqueSegments(segments, comparisons.slice(0, 1));
  pushUniqueSegments(segments, closings.slice(0, 1));
  pushUniqueSegments(segments, observations.slice(1, 2));
  pushUniqueSegments(segments, cues.slice(1, 2));
  pushUniqueSegments(segments, closings.slice(1, 2));
  return segments;
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
    out = appendSentence(out, "葉や株の動きが重なり、生育の流れが自然に読み取れる段階です。");
  }

  return polishComment(out);
}

function buildLengthSafetyNetSegments(context) {
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var seed = stableContextSeed(context);
  var profile = pickStyleProfile(context);
  var segments = [];

  if (plants.length) {
    pushUniqueSegments(
      segments,
      takeSeeded(
        [
          plants.join("、") + "のまとまりと抜ける部分の差が見えやすく、どこに生育の勢いが集まっているかを追いやすい写真です。",
          "近い部分だけでなく株全体の収まりまで見えるため、" + plants.join("、") + "の育ち方をあとで比較するときの軸になります。",
          plants.join("、") + "の見え方に奥行きが出てきており、変化が一方向ではなく面で広がっている印象です。",
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
          areaText + "の空気感も含めて写っていて、近い部分の変化だけでなく周囲とのバランスまで追いやすい一枚です。",
          areaText + "の中でどこに視線が集まるかが分かりやすく、全体のまとまりを思い出しやすい写真です。",
          areaText + "の光や背景との関係まで見えており、その場の雰囲気ごと記録できています。",
        ],
        seed + 23,
        2
      )
    );
  }

  pushUniqueSegments(
    segments,
    buildCueSegments(context, seed + 29).concat(buildClosingSegments(context, profile, seed + 31))
  );

  if (photoIndex) {
    pushUniqueSegments(segments, [
      "同じ記録の" +
        photoIndex +
        (photoCount
          ? "枚目として見ても、" + photoCount + "枚の流れの中で位置づけがわかりやすい写真です。"
          : "枚目として見ても、記録全体の流れの中で役割がはっきりしています。"),
    ]);
  }

  if (previousDateText) {
    pushUniqueSegments(segments, [
      previousDateText +
        "の記録と見比べると、今回のほうが葉や株の動きにまとまりが出ており、育ち方の変化を落ち着いて追えます。",
    ]);
  }

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
    out = appendSentence(out, "全体のまとまりと細かな変化の両方が見えており、次の記録と比べる材料がしっかり残る場面です。");
  }

  if (out.length < COMMENT_MIN_LENGTH) {
    out = appendSentence(out, "見える範囲だけでも変化の筋道が追いやすく、あとで読み返しても状況を思い出しやすい一枚です。");
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

function getValidationError(comment, context) {
  var text = String(comment || "").trim();
  if (!text) return "コメントが空です。";
  if (containsEmbeddedImageMarkup(text)) return "画像埋め込み用のコードが混ざっています。";
  if (text.length < COMMENT_MIN_LENGTH) return "100文字未満で短すぎます。";
  if (text.length > COMMENT_MAX_LENGTH) return "200文字を超えて長すぎます。";

  var japaneseCount = countMatches(text, /[ぁ-んァ-ヶ一-龠々]/g);
  if (japaneseCount < 30) return "日本語の情報量が少なすぎます。";

  var latinCount = countMatches(text, /[A-Za-z]/g);
  if (latinCount > Math.max(2, Math.floor(text.length * 0.05))) {
    return "英語やローマ字が多すぎます。";
  }

  if (splitSentences(text).length < 2) {
    return "文章が短く、観察や考察の層が足りません。";
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
    return "定型的な表現が多すぎます。";
  }

  if (hasRepeatedPlantSentenceStart(text, context)) {
    return "同じ植栽名から始まる文が続き、文章の変化が乏しくなっています。";
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
  var safeContext = Object.assign({}, context || {}, {
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
      "は葉の重なり方と先端の伸びが読み取りやすく、写真の中で今よく動いている部分がつかみやすい一枚です。" +
      "株元の込み具合や色の重なりも見比べやすく、次にどこを追うと変化が分かるかまで自然に想像できます。";
  } else if (profile && profile.id === "shape_balance") {
    comment =
      locationPrefix +
      plantLabel +
      "は株の広がりと茎葉の向きがそろって見え、全体の姿から今の調子を落ち着いて読み取れる一枚です。" +
      "輪郭のまとまりと色の出方も追いやすく、次回はどの部分が前に出るかを見比べたくなります。";
  } else if (profile && profile.id === "season_transition") {
    comment =
      locationPrefix +
      plantLabel +
      "は色の移り変わりと葉先の動きが画面の中で拾いやすく、季節の進み方が静かに伝わる一枚です。" +
      "株元から先端までの変化も追いやすく、次にどこが濃くなるかを見比べる手がかりが残ります。";
  } else {
    comment =
      locationPrefix +
      plantLabel +
      "は先端の伸びと株元の込み具合に差があり、前回と並べたときに変化の軸がつかみやすい一枚です。" +
      "葉の重なりや色の出方も見比べやすく、どの部分が次に動くかを自然に追っていけます。";
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

  var referenceImages = normalizeReferenceImages(opts.referenceImages);
  referenceImages.forEach(function (image, index) {
    parts.push({
      text: (image.label || "比較用画像" + String(index + 1)) + "です。",
    });
    parts.push({
      inline_data: {
        mime_type: image.imageMimeType,
        data: image.imageBase64,
      },
    });
  });

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
    var requestOpts = {
      env: env,
      apiKey: apiKey,
      imageBase64: imageBase64,
      imageMimeType:
        typeof opts.imageMimeType === "string" && opts.imageMimeType.trim()
          ? opts.imageMimeType.trim()
          : "image/jpeg",
      referenceImages: normalizeReferenceImages(opts.referenceImages),
      signal: opts.signal || controller.signal,
    };

    var result = await requestGeminiComment(requestOpts, buildPrompt(opts.context || {}), {
      temperature: 0.68,
      maxOutputTokens: 420,
    });
    var validationError = getValidationError(result.comment, opts.context || {});
    var naturalnessError = getJapaneseNaturalnessError(result.comment, opts.context || {});

    if (validationError) {
      result = await requestGeminiComment(
        requestOpts,
        buildRepairPrompt(opts.context || {}, result.comment, validationError),
        {
          temperature: 0.24,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);
      validationError = getValidationError(result.comment, opts.context || {});
      naturalnessError = getJapaneseNaturalnessError(result.comment, opts.context || {});
    }

    if (validationError) {
      result.comment = expandCommentToMinimumRobust(result.comment, opts.context || {});
      validationError = getValidationError(result.comment, opts.context || {});
      naturalnessError = getJapaneseNaturalnessError(result.comment, opts.context || {});
    }

    if (!validationError && naturalnessError) {
      result = await requestGeminiComment(
        requestOpts,
        buildJapaneseNaturalnessPrompt(opts.context || {}, result.comment, naturalnessError),
        {
          temperature: 0.22,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);
      validationError = getValidationError(result.comment, opts.context || {});
      naturalnessError = getJapaneseNaturalnessError(result.comment, opts.context || {});
    }

    if (!validationError && naturalnessError) {
      result.comment = expandCommentToMinimumRobust(result.comment, opts.context || {});
      validationError = getValidationError(result.comment, opts.context || {});
      naturalnessError = getJapaneseNaturalnessError(result.comment, opts.context || {});
    }

    result = await requestGeminiComment(
      requestOpts,
      buildJapaneseProofreadPrompt(
        opts.context || {},
        result.comment,
        naturalnessError || validationError || ""
      ),
      {
        temperature: 0.12,
        maxOutputTokens: 420,
      }
    );
    var stabilized = stabilizeAcceptedComment(result.comment, opts.context || {});
    result.comment = stabilized.comment;
    validationError = stabilized.validationError;
    naturalnessError = stabilized.naturalnessError;

    var proofreadComment = result.comment;
    var proofreadValidationError = validationError;
    var proofreadNaturalnessError = naturalnessError;

    var qualityReview = await reviewJapaneseCommentQuality(
      requestOpts,
      opts.context || {},
      result.comment
    );

    var reviewedComment = polishComment(qualityReview.revisedComment || result.comment);
    var reviewedValidationError = getValidationError(reviewedComment, opts.context || {});
    var reviewedNaturalnessError = getJapaneseNaturalnessError(reviewedComment, opts.context || {});

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
        buildRewriteAwayPrompt(opts.context || {}, result.comment, rewriteBaseMemo),
        {
          temperature: 0.42,
          maxOutputTokens: 420,
        }
      );
      result.comment = polishComment(result.comment);

      result = await requestGeminiComment(
        requestOpts,
        buildJapaneseProofreadPrompt(
          opts.context || {},
          result.comment,
          "前のコメントと似た言い回しにならないように整えてください。"
        ),
        {
          temperature: 0.12,
          maxOutputTokens: 420,
        }
      );
      var rewritten = stabilizeAcceptedComment(result.comment, opts.context || {});
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
  var segments = [];

  if (tags.indexOf("pruned") !== -1) {
    segments.push("切り戻しや剪定のあとらしい輪郭が見えており、ここからどこが伸びてくるかを追う視点がしっかり立っています。");
  }
  if (tags.indexOf("staked") !== -1) {
    segments.push("支柱や誘引を意識した形が見え、横へ流れやすい部分を整えながら育てている様子が伝わります。");
  }
  if (tags.indexOf("sown") !== -1) {
    segments.push("種まき直後らしい細かな立ち上がりがあり、この先どこが芽吹きそうかを待つ記録として効いています。");
  }
  if (tags.indexOf("sprout") !== -1) {
    segments.push("新芽が主役になり始めていて、次にどの部分が伸びてくるかを想像しやすい場面です。");
  }
  if (tags.indexOf("bud") !== -1) {
    segments.push("つぼみの張りや数にも目が向き、開花へ向かう途中の温度感が少しずつ見えてくるように思えます。");
  }
  if (tags.indexOf("bloom") !== -1) {
    segments.push("花の開き方や色の差があり、一輪ごとの差まで含めて見どころがよく立っています。");
  }
  if (tags.indexOf("fruit") !== -1) {
    segments.push("実や種の見え方が画面に出てきていて、成長の流れが次の段階へ移ったことが感じられます。");
  }
  if (tags.indexOf("color") !== -1) {
    segments.push("色の差がまとまりの中で分かり、育つ" + label + "でも読み取り方に幅があることが自然に伝わります。");
  }
  if (tags.indexOf("spread") !== -1) {
    segments.push("葉が重なり立ち上がりが横方向にも広がっていて、全体のリズムが少し変わってきたようです。");
  }
  if (plants.length > 1) {
    segments.push("複数の植栽が一緒に写る場面では、それぞれの見え方の違いまで拾うと読み応えが出ます。");
  }
  if (noteText && noteText.length >= 8) {
    segments.push("記録メモで触れていた作業や気づきの意図を、写真の見た目から自然にたどりやすい場面です。");
  }
  if (currentPhotoMemo && currentPhotoMemo.length >= 8) {
    segments.push("既存メモで注目していた点を踏まえつつ、今回は写真の中で確認できる色や形の変化として言い直しやすい内容です。");
  }
  if (userInstruction && userInstruction.length >= 4) {
    segments.push("補足メモで示された見方を手がかりにしながら、実際に写っている見どころへ自然につなげて説明しやすい写真です。");
  }

  return takeSeeded(segments, seed + 11, 2);
}

function buildComparisonSegments(context, seed) {
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo
      ? normalizeComment(sanitizeMemoForAi(context.previousPhotoMemo).slice(0, 80))
      : "";
  var segments = [];

  if (previousPhotoMemo) {
    segments.push("前回メモで注目していた点と見比べると、今回はその先の変化や広がりを写真からつかみやすくなっています。");
  }
  if (previousDateText) {
    segments.push(previousDateText + "の記録よりも視線が向く場所が増え、変化の流れを追いやすい写真です。");
    segments.push(previousDateText + "の時点では控えめだった印象まで今回の写真では見えてきて、成長の整理がしやすい一枚です。");
  }
  return takeSeeded(segments, seed + 17, 1);
}

function buildContextLines(context) {
  var lines = [];
  var dateText = context && context.recordedDate ? String(context.recordedDate).trim() : "";
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var noteText = context && context.note ? String(context.note).trim() : "";
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? sanitizeMemoForAi(context.currentPhotoMemo) : "";
  var userInstruction =
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var previousNoteText =
    context && context.previousNote ? String(context.previousNote).trim() : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo ? sanitizeMemoForAi(context.previousPhotoMemo) : "";
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";

  if (dateText) lines.push("記録日: " + dateText);
  if (areaText) lines.push("エリア: " + areaText);
  if (plants.length) lines.push("植栽: " + plants.join("、"));
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 800));
  if (currentPhotoMemo) {
    lines.push("既存の写真メモ（意図を引き継ぎ、語句はそのまま写さない）: " + currentPhotoMemo.slice(0, 800));
  }
  if (userInstruction) {
    lines.push("ユーザーからの補足メモ（語句は写さず意図だけ拾う）: " + userInstruction.slice(0, 800));
  }
  if (previousDateText) lines.push("前回記録日: " + previousDateText);
  if (previousNoteText) lines.push("前回の記録メモ: " + previousNoteText.slice(0, 500));
  if (previousPhotoMemo) lines.push("前回写真メモ: " + previousPhotoMemo.slice(0, 500));
  if (photoIndex) {
    lines.push("写真番号: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : ""));
  }
  return lines;
}

function appendUserInstructionGuidance(lines, context) {
  var userInstruction =
    context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  if (!userInstruction) return;
  lines.push(
    "ユーザーからの補足メモがあるときは、その内容を踏まえつつ、写真の中で確かめられる根拠と結びつけて具体的に書いてください。"
  );
  lines.push(
    "補足メモをそのまま言い換えるだけで終わらせず、写真に写っている様子や変化を解説する形にしてください。"
  );
  lines.push(
    "補足メモに含まれる着眼点や疑問を踏まえながら、最終的には写真そのものの説明として読めるコメントに整えてください。"
  );
  lines.push(
    "補足メモの語句や文をそのまま引用したり、少し言い換えただけの文を作ったりせず、意図を読み取って写真の観察へ展開してください。"
  );
  lines.push(
    "補足メモが短い断片でも、そのまま掲載するのではなく、何を気にしているのかを推測して自然な日本語のコメントに組み直してください。"
  );
}

function buildPrompt(context) {
  var hasPrevious = !!(
    (context && context.previousRecordedDate) ||
    (context && context.previousPhotoMemo) ||
    (context && context.previousNote)
  );
  var profile = pickStyleProfile(context);

  var lines = [
    "次の写真について、植栽記録サイトの写真メモを1つ作成してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "コメントは100文字以上200文字以下、2〜4文にしてください。",
    "1文目では、写真から目に入る具体的な観察を書いてください。色、数、高さ、広がり、向き、ふくらみ、葉や花や実の状態などに触れてください。",
    "2文目では、別の観察点や全体のバランスを書いてください。1文目の言い換えではなく、違う見どころを足してください。",
    "最後の1文では、軽い考察や変化の読み取りを書いてください。断定しすぎず、写真と記録文脈から読める範囲にしてください。",
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
  appendUserInstructionGuidance(lines, context);
  lines.push(profile.example);

  lines.push("1枚目は今回の写真です。");
  if (hasPrevious) {
    lines.push("比較用の前回写真も渡されている場合があります。見比べて、前回より進んだ点や変わった点がはっきり見えるときだけ自然に触れてください。");
    lines.push("前回写真が見づらい場合は、無理に比較や時間差を書かないでください。");
  } else {
    lines.push("今回は比較用の前回写真がない前提で、現在の特徴を中心に書いてください。");
  }

  return lines.concat(buildContextLines(context)).concat(["返答はコメント本文だけにしてください。"]).join("\n");
}

function buildRepairPrompt(context, draft, reason) {
  var profile = pickStyleProfile(context);
  var lines = [
    "次の下書きを修正して、植栽記録サイトの写真メモとして完成させてください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は100文字以上200文字以下、2〜4文にしてください。",
    "1文目では写真から見える具体的な観察、2文目では別の観察点、最後の1文では軽い考察や変化を書く構成にしてください。",
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
  appendUserInstructionGuidance(lines, context);
  lines.push(profile.example);

  return lines.concat(buildContextLines(context)).concat(["返答は修正後のコメント本文だけにしてください。"]).join("\n");
}

function buildFallbackSegments(context) {
  var segments = [];
  var seed = stableContextSeed(context);
  var profile = pickStyleProfile(context);
  var observations = buildObservationSegments(context, profile, seed);
  var cues = buildCueSegments(context, seed);
  var comparisons = buildComparisonSegments(context, seed);
  var closings = buildClosingSegments(context, profile, seed);

  pushUniqueSegments(segments, observations.slice(0, 1));
  pushUniqueSegments(segments, cues.slice(0, 1));
  pushUniqueSegments(segments, comparisons.slice(0, 1));
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

  var noteText = context && context.note ? sanitizeMemoForAi(context.note) : "";
  if (noteText && noteText.length >= 20 && hasDirectSourcePhraseEcho(noteText, text)) {
    return "記録メモの文章をほぼそのまま写しています。意図を踏まえて、写真の観察として書き直してください。";
  }

  var userInstruction = context && context.userInstruction ? sanitizeMemoForAi(context.userInstruction) : "";
  if (userInstruction && userInstruction.length >= 12 && hasDirectSourcePhraseEcho(userInstruction, text)) {
    return "補足メモの文章をほぼそのまま写しています。意図だけをくみ取り、写真の観察として書き直してください。";
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
  normalizeReferenceImages,
  pickStyleProfile,
  polishComment,
  shouldReplaceMemoWithFallback,
  stableContextSeed,
};
