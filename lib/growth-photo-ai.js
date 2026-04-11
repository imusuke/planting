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
  if (context && context.currentPhotoMemo) parts.push(String(context.currentPhotoMemo));
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

function buildContextLines(context) {
  var lines = [];
  var dateText = context && context.recordedDate ? String(context.recordedDate).trim() : "";
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var noteText = context && context.note ? String(context.note).trim() : "";
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? String(context.currentPhotoMemo).trim() : "";
  var previousDateText =
    context && context.previousRecordedDate ? String(context.previousRecordedDate).trim() : "";
  var previousNoteText =
    context && context.previousNote ? String(context.previousNote).trim() : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo ? String(context.previousPhotoMemo).trim() : "";
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";

  if (dateText) lines.push("記録日: " + dateText);
  if (areaText) lines.push("エリア: " + areaText);
  if (plants.length) lines.push("植栽: " + plants.join("、"));
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 800));
  if (currentPhotoMemo) lines.push("既存の写真メモ: " + currentPhotoMemo.slice(0, 800));
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
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "『様子が伝わります』『記録です』『写真です』のような無難な締め方だけで終わらせないでください。",
    "薄い感想ではなく、写真を見た人が情景を思い浮かべられる程度の具体性を入れてください。",
    "今回の文体の軸: " + profile.label,
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
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
    "『様子が伝わります』『記録です』のような定型句だけで終わらせないでください。",
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "今回の文体の軸: " + profile.label,
    "下書きの問題: " + reason,
    "下書き: " + String(draft || "").slice(0, 500),
  ];

  profile.promptLines.forEach(function (line) {
    lines.push(line);
  });
  lines.push(profile.example);

  return lines.concat(buildContextLines(context)).concat(["返答は修正後のコメント本文だけにしてください。"]).join("\n");
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

function normalizeComment(text) {
  var out = String(text || "")
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

  out = out
    .replace(/様子がよくわかります/g, "様子が伝わります")
    .replace(/状態がよくわかります/g, "状態が伝わります")
    .replace(/成長の変化がよくわかります/g, "成長の変化が見て取れます")
    .replace(/写真です/g, "一枚です")
    .replace(/記録です/g, "記録になっています");

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
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? normalizeComment(String(context.currentPhotoMemo)) : "";
  var noteText = context && context.note ? normalizeComment(String(context.note).slice(0, 90)) : "";
  var previousPhotoMemo =
    context && context.previousPhotoMemo
      ? normalizeComment(String(context.previousPhotoMemo).slice(0, 90))
      : "";
  var plants = normalizePlantNames(context && context.plantNames);

  if (currentPhotoMemo) segments.push(currentPhotoMemo);
  if (noteText) segments.push(noteText);
  if (plants.length) {
    rotateBySeed(
      [
        plants.join("、") + "の動きが一枚の中にはっきり出ています。",
        plants.join("、") + "の葉の重なりや向きに差があり、近くで見るほど変化を拾いやすい場面です。",
        plants.join("、") + "の輪郭に動きが出ていて、株の勢いが画面全体ににじんでいます。",
      ],
      seed
    ).forEach(function (sentence) {
      segments.push(sentence);
    });
  }
  if (previousPhotoMemo) {
    rotateBySeed(
      [
        "前回の印象と比べると、見どころが少し増えてきたように見えます。",
        "前回よりも目に留まる部分が増え、変化の流れがつかみやすくなってきました。",
        "前回の印象を踏まえると、写真の中で拾える動きがひとつ先へ進んだように見えます。",
      ],
      seed + 7
    )
      .slice(0, 1)
      .forEach(function (sentence) {
        segments.push(sentence);
      });
  }
  rotateBySeed(
    [
      "色や形の変化が重なり、季節の進み方まで伝わってくる記録です。",
      "派手な変化だけでなく、あとで見返したときに流れを追いやすい細かな差も残っています。",
      "大きな動きだけでなく、小さな違いも拾えているので次の比較につながる一枚です。",
    ],
    seed + 13
  ).forEach(function (sentence) {
    segments.push(sentence);
  });
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
  var segments = [];

  if (plants.length) {
    rotateBySeed(
      [
        plants.join("、") + "のまとまりや葉の向きの差まで見えやすく、株ごとの動きが一枚の中で自然につながっています。",
        plants.join("、") + "の重なり方や高さの差が拾えていて、画面の中で生育のリズムが感じられます。",
        plants.join("、") + "の見え方に奥行きが出てきており、株の変化が一方向ではなく面で広がっている印象です。",
      ],
      seed + 19
    ).forEach(function (sentence) {
      segments.push(sentence);
    });
  } else if (areaText) {
    rotateBySeed(
      [
        areaText + "の空気感も含めて写っていて、近い部分の変化だけでなく周囲とのバランスまで追いやすい一枚です。",
        areaText + "の中でどこに視線が集まるかが分かりやすく、全体のまとまりを思い出しやすい写真です。",
        areaText + "の光や背景との関係まで見えており、その場の雰囲気ごと記録できています。",
      ],
      seed + 23
    ).forEach(function (sentence) {
      segments.push(sentence);
    });
  }

  rotateBySeed(
    [
      "葉先の向きや株元のまとまりまで見ていくと、その日の生育の勢いが写真の中に素直に表れています。",
      "色の出方や重なり方にも変化があり、前後の記録と比べながら読むと小さな進み方まで拾いやすい場面です。",
      "全体の輪郭が落ち着きつつも新しい動きが残っていて、育ち方の流れを無理なく読み取れる段階に見えます。",
      "輪郭の出方や込み具合の変化まで拾えているので、次回との見比べにも効いてきそうです。",
      "今の段階ならではのまだらな変化が残っていて、成長の途中らしさが伝わる記録です。",
    ],
    seed + 29
  ).forEach(function (sentence) {
    segments.push(sentence);
  });

  if (photoIndex) {
    segments.push(
      "同じ記録の" +
        photoIndex +
        (photoCount
          ? "枚目として見ても、" + photoCount + "枚の流れの中で位置づけがわかりやすい写真です。"
          : "枚目として見ても、記録全体の流れの中で役割がはっきりしています。")
    );
  }

  if (previousDateText) {
    segments.push(
      previousDateText +
        "の記録と見比べると、今回のほうが葉や株の動きにまとまりが出ており、育ち方の変化を落ち着いて追えます。"
    );
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

function getValidationError(comment, context) {
  var text = String(comment || "").trim();
  if (!text) return "コメントが空です。";
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
    context && context.currentPhotoMemo ? String(context.currentPhotoMemo).trim() : "";
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

  return "";
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

async function requestGeminiComment(opts, promptText) {
  var env = opts.env || process.env;
  var model = getGeminiModel(env);
  var apiKey = opts.apiKey || env.GEMINI_API_KEY;
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
          temperature: 0.68,
          maxOutputTokens: 420,
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
    comment: polishComment(extractGeminiText(data)),
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

    var result = await requestGeminiComment(requestOpts, buildPrompt(opts.context || {}));
    var validationError = getValidationError(result.comment, opts.context || {});

    if (validationError) {
      result = await requestGeminiComment(
        requestOpts,
        buildRepairPrompt(opts.context || {}, result.comment, validationError)
      );
      result.comment = polishComment(result.comment);
      validationError = getValidationError(result.comment, opts.context || {});
    }

    if (validationError) {
      result.comment = expandCommentToMinimumRobust(result.comment, opts.context || {});
      validationError = getValidationError(result.comment, opts.context || {});
    }

    if (validationError) {
      throw makeGeminiError("gemini_invalid_comment", validationError, 502);
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

module.exports = {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  DEFAULT_GEMINI_MODEL,
  buildGrowthPhotoCommentPrompt: buildPrompt,
  expandCommentToMinimum: expandCommentToMinimumRobust,
  generateGrowthPhotoComment,
  getGeminiModel,
  normalizeComment,
  normalizePlantNames,
  normalizeReferenceImages,
  pickStyleProfile,
  polishComment,
  stableContextSeed,
};
