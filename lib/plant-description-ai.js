const { DEFAULT_GEMINI_MODEL, getGeminiModel } = require("./growth-photo-ai");
const areaDescriptionAi = require("./area-description-ai");

const MAX_TIMELINE_IMAGES = 8;
const MAX_TIMELINE_RECORDS = 18;
const TITLE_MIN_CHARS = 10;
const TITLE_MAX_CHARS = 48;
const BODY_SECTION_MAX_CHARS = 260;
const BODY_SECTION_MIN_CHARS = 55;
const BODY_MAX_CHARS = 900;
const BODY_SECTION_SPECS = [
  {
    key: "general",
    header: "【一般的な特徴】",
    labelPattern: /^(?:【?\s*(?:一般的な特徴|特徴|基本の特徴|魅力)\s*】?[:：]?\s*)/i,
    promptInstruction:
      "この植栽の一般的な特徴と魅力を、初めて読む人にも分かるように2〜3文、80〜220文字で説明してください。",
    repairInstruction:
      "一般的な特徴の段落として、魅力と見どころが伝わる2〜3文の説明へ整えてください。",
  },
  {
    key: "care",
    header: "【季節ごとの手入れ】",
    labelPattern: /^(?:【?\s*(?:季節ごとの手入れ|季節の手入れ|手入れ|管理のポイント)\s*】?[:：]?\s*)/i,
    promptInstruction:
      "春夏秋冬の流れが自然に入るように、この植栽の手入れ方法を2〜4文、90〜240文字でまとめてください。",
    repairInstruction:
      "季節ごとの手入れ段落として、春夏秋冬の扱いが分かる2〜4文へ整えてください。",
  },
  {
    key: "story",
    header: "【この場所での変遷】",
    labelPattern: /^(?:【?\s*(?:この場所での変遷|時系列の変化|この場所でのストーリー|時系列ストーリー|変遷)\s*】?[:：]?\s*)/i,
    promptInstruction:
      "この場所での時系列写真をもとに、どう育ち方が変わってきたかを2〜4文、90〜240文字で紹介してください。",
    repairInstruction:
      "この場所での変遷段落として、時系列の変化が読み取れる2〜4文へ整えてください。",
  },
];

function normalizePlainText(value, maxLength) {
  return areaDescriptionAi.normalizePlainText(value, maxLength);
}

function normalizeBodyText(value) {
  return areaDescriptionAi.normalizeBodyText(value);
}

function pickEvenlySpacedItems(items, maxCount) {
  return areaDescriptionAi.pickEvenlySpacedItems(items, maxCount);
}

function buildTimelineLines(records) {
  return pickEvenlySpacedItems(records, MAX_TIMELINE_RECORDS).map(function (record, index) {
    var parts = [];
    parts.push("記録" + String(index + 1) + ": " + normalizePlainText(record.recordedDate, 40));
    if (record.photoCount) {
      parts.push("写真" + String(record.photoCount) + "枚");
    }
    if (record.note) {
      parts.push("記録メモ: " + normalizePlainText(record.note, 220));
    }
    if (record.recordPlants && record.recordPlants.length) {
      parts.push(
        "同じ記録の植栽: " +
          record.recordPlants.map(function (name) {
            return normalizePlainText(name, 60);
          }).join(" / ")
      );
    }
    if (record.photoMemos && record.photoMemos.length) {
      parts.push(
        "写真メモ: " +
          record.photoMemos
            .map(function (memo) {
              return normalizePlainText(memo, 120);
            })
            .join(" / ")
      );
    }
    return parts.join(" | ");
  });
}

function collapseInlineWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u3000/g, " ")
    .trim();
}

function ensureSentenceEnding(text) {
  var value = String(text || "").trim();
  if (!value) return "";
  if (/[。！？]$/.test(value)) return value;
  var lastStop = Math.max(value.lastIndexOf("。"), value.lastIndexOf("！"), value.lastIndexOf("？"));
  if (lastStop >= Math.max(0, value.length - 24)) {
    return value.slice(0, lastStop + 1).trim();
  }
  return value + "。";
}

function trimToCompleteSentences(text, maxLength) {
  var value = collapseInlineWhitespace(text);
  if (!value) return "";
  if (!maxLength || value.length <= maxLength) {
    return ensureSentenceEnding(value);
  }
  var sentences = splitJapaneseSentences(value);
  var trimmed = "";
  for (var i = 0; i < sentences.length; i++) {
    var next = trimmed ? trimmed + sentences[i] : sentences[i];
    if (next.length > maxLength) break;
    trimmed = next;
  }
  if (trimmed) {
    return ensureSentenceEnding(trimmed);
  }
  var head = value.slice(0, maxLength);
  var lastStop = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"));
  if (lastStop >= Math.max(18, Math.floor(maxLength * 0.45))) {
    return head.slice(0, lastStop + 1).trim();
  }
  return ensureSentenceEnding(head.trim());
}

function splitParagraphBlocks(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map(function (block) {
      return block.trim();
    })
    .filter(Boolean);
}

function stripKnownSectionLabel(text, spec) {
  if (!spec || !spec.labelPattern) return String(text || "").trim();
  return String(text || "").replace(spec.labelPattern, "").trim();
}

function normalizePlantBodyParagraph(text, maxLength) {
  var cleaned = sanitizeDescriptionSection(text);
  cleaned = collapseInlineWhitespace(cleaned);
  cleaned = trimToCompleteSentences(cleaned, maxLength || BODY_SECTION_MAX_CHARS);
  return cleaned;
}

function normalizeGeneratedPlantTitle(text, options) {
  var cleaned = sanitizeDescriptionSection(text)
    .replace(/^(?:タイトル|title|概要|summary)\s*[:：]\s*/i, "");
  cleaned = collapseInlineWhitespace(cleaned);
  if (!cleaned) {
    var plantName = normalizePlainText(options && options.plantName, 120) || "植栽";
    var areaLabel = normalizePlainText(options && options.areaLabel, 120);
    cleaned = areaLabel ? areaLabel + "の" + plantName : plantName;
  }

  var firstLine = cleaned.split(/\n+/)[0].trim();
  var firstSentence = splitJapaneseSentences(firstLine)[0] || firstLine;
  var title = stripWrappingQuotes(firstSentence)
    .replace(/[。！？]+$/g, "")
    .trim();

  if (title.length > TITLE_MAX_CHARS) {
    title = title.slice(0, TITLE_MAX_CHARS).trim();
  }
  if (title.length < TITLE_MIN_CHARS) {
    var plant = normalizePlainText(options && options.plantName, 120) || "植栽";
    var area = normalizePlainText(options && options.areaLabel, 120);
    title = area ? area + "で育つ" + plant : plant + "の記録";
  }
  return collapseInlineWhitespace(title);
}

function isValidTitle(title) {
  var value = collapseInlineWhitespace(title);
  return (
    value.length >= TITLE_MIN_CHARS &&
    value.length <= TITLE_MAX_CHARS &&
    value.indexOf("\n") === -1 &&
    !containsRawJsonLikeKeys(value) &&
    !/^(?:【|概要[:：]|summary[:：]|タイトル[:：]|title[:：])/i.test(value) &&
    !/^["']/.test(value)
  );
}

function isValidPlantSection(sectionText) {
  var value = collapseInlineWhitespace(sectionText);
  return (
    value.length >= BODY_SECTION_MIN_CHARS &&
    value.length <= BODY_SECTION_MAX_CHARS &&
    !containsRawJsonLikeKeys(value) &&
    !/^["']/.test(value) &&
    /[。！？]$/.test(value)
  );
}

function buildPlantBodyFromSections(sections) {
  var blocks = BODY_SECTION_SPECS.map(function (spec) {
    var content = sections && sections[spec.key] ? String(sections[spec.key]).trim() : "";
    if (!content) return "";
    return spec.header + "\n" + content;
  });
  if (blocks.some(function (block) { return !block; })) return "";
  return blocks.join("\n\n").trim();
}

function extractPlantSectionContent(body, spec) {
  var value = String(body || "").trim();
  if (!value || !spec) return "";
  var re = new RegExp(
    spec.header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n([\\s\\S]*?)(?=(?:\\n\\n【)|$)"
  );
  var match = value.match(re);
  if (!match || !match[1]) return "";
  return collapseInlineWhitespace(match[1]);
}

function extractPlantSectionsFromBody(body) {
  var sections = {};
  BODY_SECTION_SPECS.forEach(function (spec) {
    sections[spec.key] = extractPlantSectionContent(body, spec);
  });
  return sections;
}

function firstNonEmptyObservation(record) {
  if (!record) return "";
  if (Array.isArray(record.photoMemos)) {
    for (var i = 0; i < record.photoMemos.length; i++) {
      var memo = normalizePlainText(record.photoMemos[i], 140);
      if (memo) return memo;
    }
  }
  return normalizePlainText(record.note, 140);
}

function buildFallbackPlantTitle(options) {
  var plantName = normalizePlainText(options && options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options && options.areaLabel, 120);
  var title = areaLabel ? areaLabel + "で育つ" + plantName : plantName + "の育ち";
  if (title.length > TITLE_MAX_CHARS) {
    title = title.slice(0, TITLE_MAX_CHARS).trim();
  }
  if (title.length < TITLE_MIN_CHARS) {
    title = plantName + "の育ち";
  }
  return collapseInlineWhitespace(title);
}

function buildFallbackPlantSection(spec, options) {
  var plantName = normalizePlainText(options && options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options && options.areaLabel, 120) || "この場所";
  var records = Array.isArray(options && options.timelineRecords) ? options.timelineRecords : [];
  var firstRecord = records[0] || null;
  var lastRecord = records[records.length - 1] || null;
  var firstObservation = firstNonEmptyObservation(firstRecord);
  var lastObservation = firstNonEmptyObservation(lastRecord);
  var firstDate = normalizePlainText(firstRecord && firstRecord.recordedDate, 40);
  var lastDate = normalizePlainText(lastRecord && lastRecord.recordedDate, 40);

  if (spec.key === "general") {
    return (
      plantName +
      "は、季節の移ろいに合わせて表情を変えながら育つ植栽です。" +
      areaLabel +
      "の記録では、" +
      (lastObservation || "葉や枝ぶりの変化") +
      "が見どころとして表れ、株全体のまとまりや勢いも追いやすくなっています。" +
      "写真を重ねると、この場所の環境になじみながら少しずつ姿を整えてきた様子が伝わります。"
    );
  }
  if (spec.key === "care") {
    return (
      plantName +
      "は、季節ごとの負担に合わせて水分量や枝葉の整理を調整すると育ち方が安定します。" +
      "春は芽吹きに合わせて乾きすぎを防ぎ、夏は蒸れや傷んだ枝葉を早めに整えると株の負担を抑えやすくなります。" +
      "秋から冬にかけては休みに向かう枝ぶりを見ながら混み合う部分を軽く整理し、次の季節へ備えるのが基本です。"
    );
  }
  return (
    areaLabel +
    "での" +
    plantName +
    "の記録をたどると、" +
    (firstDate || "記録の初期") +
    "ごろの" +
    (firstObservation || "落ち着いた株姿") +
    "から、" +
    (lastDate || "最近") +
    "には" +
    (lastObservation || "葉や枝ぶりの広がり") +
    "へと移り変わってきました。" +
    "写真を見比べると、株の広がりや葉の付き方にこの場所ならではの変化が積み重なっていることが分かります。" +
    plantName +
    "が周囲の環境に合わせて少しずつ姿を整えてきた流れが、この記録の読みどころです。"
  );
}

function buildPlantBodyWithFallback(text, options) {
  var normalized = normalizeGeneratedPlantBody(text);
  var sections = extractPlantSectionsFromBody(normalized);
  var completed = {};

  BODY_SECTION_SPECS.forEach(function (spec) {
    var content = sections[spec.key] || "";
    if (!isValidPlantSection(content)) {
      content = normalizePlantBodyParagraph(buildFallbackPlantSection(spec, options), BODY_SECTION_MAX_CHARS);
    }
    completed[spec.key] = content;
  });

  var body = buildPlantBodyFromSections(completed);
  if (isValidBody(body)) {
    return body;
  }

  var hardFallback = {};
  BODY_SECTION_SPECS.forEach(function (spec) {
    hardFallback[spec.key] = normalizePlantBodyParagraph(
      buildFallbackPlantSection(spec, options),
      BODY_SECTION_MAX_CHARS
    );
  });
  return buildPlantBodyFromSections(hardFallback);
}

function normalizeGeneratedPlantSummary(text, fallbackBody) {
  var title = normalizeGeneratedPlantTitle(text, {});
  if (!isValidTitle(title) && fallbackBody) {
    title = trimToCompleteSentences(buildSummaryFromBody(fallbackBody), TITLE_MAX_CHARS)
      .replace(/[。！？]+$/g, "")
      .trim();
  }
  return collapseInlineWhitespace(title);
}

function buildPlantTitlePrompt(options) {
  var plantName = normalizePlainText(options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の活動記録をもとに、植栽ページのタイトルだけを書いてください。",
    "対象植栽: " + plantName,
    "エリア: " + areaLabel,
    "10〜48文字の短いタイトルにしてください。",
    "句点で終わる説明文ではなく、見出しとして読みやすい一行にしてください。",
    "引用符、見出しラベル、JSON、箇条書きは禁止です。",
  ];
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }
  return lines.join("\n");
}

function buildPlantTitleRepairPrompt(rawText) {
  return [
    "次の文章を、植栽ページの短いタイトルに整えてください。",
    "10〜48文字、一行、引用符なし、見出しとして自然な言い回しにしてください。",
    "元の文章: " + String(rawText || "").slice(0, 3000),
  ].join("\n");
}

function buildPlantSectionPrompt(spec, options) {
  var plantName = normalizePlainText(options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の活動記録をもとに、植栽ページの一部だけを書いてください。",
    "対象植栽: " + plantName,
    "エリア: " + areaLabel,
    spec.promptInstruction,
    "出力は段落本文だけにして、見出し・引用符・JSON・箇条書きは出さないでください。",
  ];
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }
  return lines.join("\n");
}

function buildPlantSectionRepairPrompt(spec, rawText) {
  return [
    "次の文章を植栽ページ用の段落へ整えてください。",
    spec.repairInstruction,
    "80〜240文字の読みやすい段落にしてください。",
    "見出し・引用符・JSON・箇条書きは禁止です。",
    "元の文章: " + String(rawText || "").slice(0, 4000),
  ].join("\n");
}

function normalizeGeneratedPlantBody(text) {
  var source = decodeJsonLikeString(text);
  source = stripJsonLikeWrapperNoise(source);
  if (!source) return "";

  var paragraphs = String(source)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map(function (block) {
      return sanitizeDescriptionSection(block);
    })
    .filter(Boolean);
  if (!paragraphs.length) {
    paragraphs = splitJapaneseSentences(source)
      .map(function (sentence) {
        return sanitizeDescriptionSection(sentence);
      })
      .filter(Boolean);
  }

  var assigned = {};
  var unassigned = [];

  paragraphs.forEach(function (paragraph) {
    var matchedSpec = null;
    for (var i = 0; i < BODY_SECTION_SPECS.length; i++) {
      if (BODY_SECTION_SPECS[i].labelPattern.test(paragraph)) {
        matchedSpec = BODY_SECTION_SPECS[i];
        break;
      }
    }
    if (matchedSpec && !assigned[matchedSpec.key]) {
      assigned[matchedSpec.key] = normalizePlantBodyParagraph(
        stripKnownSectionLabel(paragraph, matchedSpec),
        BODY_SECTION_MAX_CHARS
      );
      return;
    }
    unassigned.push(paragraph);
  });

  BODY_SECTION_SPECS.forEach(function (spec, index) {
    if (assigned[spec.key]) return;
    if (!unassigned.length) return;
    if (index === BODY_SECTION_SPECS.length - 1) {
      assigned[spec.key] = normalizePlantBodyParagraph(unassigned.join("\n\n"), BODY_SECTION_MAX_CHARS);
      unassigned = [];
      return;
    }
    assigned[spec.key] = normalizePlantBodyParagraph(unassigned.shift(), BODY_SECTION_MAX_CHARS);
  });

  var sections = BODY_SECTION_SPECS.map(function (spec) {
    var content = assigned[spec.key] || "";
    if (!content || content.length < BODY_SECTION_MIN_CHARS) return "";
    return spec.header + "\n" + content;
  });

  if (sections.some(function (section) { return !section; })) {
    return "";
  }

  var body = sections.join("\n\n").trim();
  if (body.length > BODY_MAX_CHARS) {
    body = sections
      .map(function (section) {
        var parts = section.split("\n");
        var header = parts.shift();
        var content = trimToCompleteSentences(parts.join(" ").trim(), Math.min(220, BODY_SECTION_MAX_CHARS));
        return header + "\n" + content;
      })
      .join("\n\n")
      .trim();
  }
  return body;
}

function isValidBody(body) {
  var value = String(body || "").trim();
  if (!value || value.length > BODY_MAX_CHARS) return false;
  if (!/[。！？]$/.test(value)) return false;
  if (containsRawJsonLikeKeys(value) || /^"/.test(value)) return false;
  return BODY_SECTION_SPECS.every(function (spec) {
    var re = new RegExp(spec.header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\n([\\s\\S]*?)(?=(?:\\n\\n【)|$)");
    var match = value.match(re);
    return !!(match && collapseInlineWhitespace(match[1]).length >= BODY_SECTION_MIN_CHARS && /[。！？]$/.test(match[1].trim()));
  });
}

function buildPlantSummaryPrompt(options) {
  var plantName = normalizePlainText(options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の活動記録をもとに、植栽ページの概要だけを書いてください。",
    "対象植栽: " + plantName,
    "エリア: " + areaLabel,
    "出力は1段落、1〜2文、45〜110文字にしてください。",
    "内容は、この植栽の今の見どころと、この場所で育つ中で見えている特徴を短くまとめてください。",
    "一般説明を長く広げず、導入として読みやすい概要にしてください。",
    "引用符、見出し、JSON、箇条書き、コードブロックは禁止です。",
  ];
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }
  return lines.join("\n");
}

function buildPlantBodyPrompt(options) {
  var plantName = normalizePlainText(options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の活動記録をもとに、植栽ページの詳細メモだけを書いてください。",
    "対象植栽: " + plantName,
    "エリア: " + areaLabel,
    "出力は必ず次の3段落だけにしてください。段落の間は空行を1つ入れてください。",
    "1段落目は `【一般的な特徴】` で始め、この植栽の魅力や見どころを2〜3文で説明してください。",
    "2段落目は `【季節ごとの手入れ】` で始め、春夏秋冬を意識した手入れを2〜3文で、実用的かつ読みやすくまとめてください。",
    "3段落目は `【この場所での変遷】` で始め、この場所での時系列の変化を2〜3文で紹介してください。",
    "全体で420〜900文字程度にしてください。",
    "どの段落も途中で切らず、必ず句点で終えてください。",
    "引用符、JSON、箇条書き、コードブロックは禁止です。",
  ];
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }
  return lines.join("\n");
}

function buildPlantSummaryRepairPrompt(rawText) {
  return [
    "次の文章を、植栽ページの概要として短く整えてください。",
    "1段落、1〜2文、45〜110文字にしてください。",
    "引用符、見出し、JSONは禁止です。",
    "元の文章: " + String(rawText || "").slice(0, 4000),
  ].join("\n");
}

function buildPlantBodyRepairPrompt(rawText) {
  return [
    "次の文章を、植栽ページの詳細メモとして読みやすく組み直してください。",
    "必ず `【一般的な特徴】` `【季節ごとの手入れ】` `【この場所での変遷】` の3段落にしてください。",
    "各段落は2〜3文、段落の間は空行1つ、全体は420〜900文字程度にしてください。",
    "引用符、JSON、コードブロックは禁止です。",
    "元の文章: " + String(rawText || "").slice(0, 5000),
  ].join("\n");
}

function buildPlantDescriptionPrompt(options) {
  var plantName = normalizePlainText(options.plantName, 120) || "この植栽";
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var summaryDraft = normalizePlainText(options.currentSummary, 500);
  var bodyDraft = normalizeBodyText(options.currentBody).slice(0, 2400);
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var firstDate = normalizePlainText(options.firstRecordedDate, 40);
  var lastDate = normalizePlainText(options.lastRecordedDate, 40);

  var lines = [
    "次の写真つき活動記録と時系列メモをもとに、植栽ページ用の説明文を作成してください。",
    "対象植栽: " + plantName,
    "エリア: " + areaLabel,
    "summary は1〜2文、40〜160文字程度で、この植栽の今の見どころと育ち方の特徴が伝わるようにしてください。",
    "body は3〜6段落、350〜1100文字程度で、次の3部構成をこの順番で守ってください。",
    "第1部では、この植栽の一般的な特徴、魅力、見どころを、初めて読む人にも分かるように自然な説明文で書いてください。",
    "第2部では、春・夏・秋・冬の季節ごとの手入れ方法を、この植栽に合う実用的な内容としてまとめてください。水やり、剪定、花後の扱い、日当たり、蒸れ対策など、写真に写る特徴ともつながる内容にしてください。",
    "第3部では、この場所で育っているこの植栽が、時系列写真の中でどう変わってきたかをストーリーとして紹介してください。",
    "本文を読むと、一般説明 → 季節ごとの手入れ → この植栽の時系列ストーリー、の順番が自然に伝わるようにしてください。",
    "葉・花・株姿・色の移り変わり、季節による変化、途中で見えてきた特徴を、時系列の流れと結びつけて説明してください。",
    "写真で確かめられないことは断定せず、見えている様子や変化を中心に書いてください。",
    "既存の下書きがあっても引きずられすぎず、記録写真から読み取れる変化を主役にしてください。",
    "箇条書きではなく、植栽ページにそのまま載せられる落ち着いた説明文にしてください。",
    "応答は次のJSONだけにしてください。",
    '{"summary":"ここに概要","body":"ここに本文"}',
  ];

  if (firstDate || lastDate) {
    lines.push(
      "記録期間: " + (firstDate || "不明") + " から " + (lastDate || "不明")
    );
  }
  if (summaryDraft) {
    lines.push("現在の概要案: " + summaryDraft);
  }
  if (bodyDraft) {
    lines.push("現在の本文案: " + bodyDraft.slice(0, 1200));
  }
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }

  return lines.join("\n");
}

function buildPlantDescriptionRepairPrompt(rawText) {
  return [
    "次の出力を、必ずJSONだけに整形してください。",
    '使うキーは "summary" と "body" です。',
    "summary は1〜2文、body は 一般説明 → 季節ごとの手入れ → 時系列ストーリー の順を保った日本語の説明文にしてください。",
    "応答は次のJSONだけにしてください。",
    '{"summary":"ここに概要","body":"ここに本文"}',
    "元の出力: " + String(rawText || "").slice(0, 5000),
  ].join("\n");
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
  var fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  var start = source.indexOf("{");
  var end = source.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return source.slice(start, end + 1).trim();
  }
  return source;
}

function decodeJsonLikeString(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function stripWrappingQuotes(text) {
  var value = String(text || "").trim();
  var previous = "";
  while (value && value !== previous) {
    previous = value;
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) {
      value = value.slice(1, -1).trim();
      continue;
    }
    if (value[0] === '"' || value[0] === "'") {
      value = value.slice(1).trim();
      continue;
    }
    if (value[value.length - 1] === '"' || value[value.length - 1] === "'") {
      value = value.slice(0, -1).trim();
    }
  }
  return value;
}

function sanitizeDescriptionSection(value) {
  var text = decodeJsonLikeString(value);
  text = stripJsonLikeWrapperNoise(text);
  if (!text) return "";

  var normalizedLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(function (line) {
      var cleaned = stripWrappingQuotes(line);
      cleaned = cleaned.replace(/^[,，]\s*/, "").replace(/\s*[,，]\s*$/, "").trim();
      return cleaned;
    })
    .filter(Boolean);

  return normalizedLines.join("\n").trim();
}

function extractJsonLikeField(text, fieldName) {
  var source = String(text || "");
  if (!source) return "";

  var escapedField = String(fieldName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var marker = '"' + fieldName + '"';
  var fieldRe = new RegExp('"' + escapedField + '"\\s*:\\s*"', "i");
  var match = source.match(fieldRe);
  if (!match || typeof match.index !== "number") return "";

  var start = match.index + match[0].length;
  var result = "";
  var escaping = false;
  for (var i = start; i < source.length; i++) {
    var ch = source[i];
    if (escaping) {
      result += "\\" + ch;
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (ch === '"') {
      var rest = source.slice(i + 1);
      if (new RegExp("^\\s*(?:,\\s*" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "|\\}|$)").test(rest)) {
        break;
      }
      result += ch;
      continue;
    }
    result += ch;
  }

  return decodeJsonLikeString(result);
}

function stripJsonLikeWrapperNoise(text) {
  return String(text || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/^\s*\{\s*/, "")
    .replace(/\s*\}\s*$/, "")
    .replace(/^\s*"?(?:summary|body|概要|本文)"?\s*:\s*/gim, "")
    .replace(/,\s*"?(?:summary|body|概要|本文)"?\s*:\s*/gim, "\n")
    .trim();
}

function containsRawJsonLikeKeys(text) {
  var source = String(text || "");
  return /(^|\s)\{\s*"summary"\s*:|"\s*summary"\s*:|"\s*body"\s*:/.test(source);
}

function splitJapaneseSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？])/)
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
}

function buildSummaryFromBody(body) {
  var sentences = splitJapaneseSentences(body);
  if (!sentences.length) {
    return normalizePlainText(body, 160);
  }
  var summary = "";
  for (var i = 0; i < sentences.length; i++) {
    var next = summary ? summary + sentences[i] : sentences[i];
    if (next.length > 160 && summary) break;
    summary = next;
    if (summary.length >= 60 && i >= 1) break;
  }
  return normalizePlainText(summary, 160);
}

function extractLabeledSection(text, labels) {
  var source = String(text || "");
  for (var i = 0; i < labels.length; i++) {
    var escaped = labels[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp(
      "(?:^|\\n)\\s*(?:" + escaped + ")\\s*[:：]\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:summary|body|概要|本文)\\s*[:：])|$)",
      "i"
    );
    var match = source.match(re);
    if (match && match[1]) {
      var value = match[1].trim();
      if (value) return value;
    }
  }
  return "";
}

function parsePlantDescriptionNonJson(text) {
  var source = stripJsonLikeWrapperNoise(text);
  if (!source) return null;

  var labeledSummary = extractLabeledSection(source, ["summary", "概要"]);
  var labeledBody = extractLabeledSection(source, ["body", "本文"]);
  if (labeledSummary || labeledBody) {
    var summaryFromLabels = normalizePlainText(sanitizeDescriptionSection(labeledSummary), 4000);
    var bodyFromLabels = normalizeBodyText(sanitizeDescriptionSection(labeledBody)).slice(0, 100000);
    if (!summaryFromLabels && bodyFromLabels) {
      summaryFromLabels = buildSummaryFromBody(bodyFromLabels);
    }
    if (summaryFromLabels && bodyFromLabels) {
      return {
        summary: summaryFromLabels,
        body: bodyFromLabels,
      };
    }
  }

  var plain = normalizeBodyText(sanitizeDescriptionSection(source))
    .replace(/^(?:summary|概要|body|本文)\s*[:：]\s*/gim, "")
    .replace(/^[-*・]\s*/gm, "")
    .trim();
  if (!plain || plain.length < 80 || containsRawJsonLikeKeys(plain)) return null;

  var summary = buildSummaryFromBody(plain);
  if (!summary) return null;
  return {
    summary: summary,
    body: plain.slice(0, 100000),
  };
}

function parsePlantDescriptionResponse(text) {
  var raw = extractJsonObjectText(text);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    var summary = normalizePlainText(sanitizeDescriptionSection(parsed && parsed.summary), 4000);
    var body = normalizeBodyText(sanitizeDescriptionSection(parsed && parsed.body)).slice(0, 100000);
    if (!summary || !body) return null;
    return {
      summary: summary,
      body: body,
    };
  } catch (err) {
    var jsonLikeSummary = normalizePlainText(sanitizeDescriptionSection(extractJsonLikeField(raw, "summary")), 4000);
    var jsonLikeBody = normalizeBodyText(sanitizeDescriptionSection(extractJsonLikeField(raw, "body"))).slice(0, 100000);
    if (!jsonLikeSummary) {
      jsonLikeSummary = normalizePlainText(sanitizeDescriptionSection(extractJsonLikeField(text, "summary")), 4000);
    }
    if (!jsonLikeBody) {
      jsonLikeBody = normalizeBodyText(sanitizeDescriptionSection(extractJsonLikeField(text, "body"))).slice(0, 100000);
    }
    if (!jsonLikeSummary && jsonLikeBody) {
      jsonLikeSummary = buildSummaryFromBody(jsonLikeBody);
    }
    if (jsonLikeSummary && jsonLikeBody && !containsRawJsonLikeKeys(jsonLikeSummary) && !containsRawJsonLikeKeys(jsonLikeBody)) {
      return {
        summary: jsonLikeSummary,
        body: jsonLikeBody,
      };
    }
    return parsePlantDescriptionNonJson(text);
  }
}

function getPlantDescriptionModel(env) {
  var source = env || process.env;
  if (
    typeof source.GEMINI_PLANT_DESCRIPTION_MODEL === "string" &&
    source.GEMINI_PLANT_DESCRIPTION_MODEL.trim()
  ) {
    return source.GEMINI_PLANT_DESCRIPTION_MODEL.trim();
  }
  return getGeminiModel(source) || DEFAULT_GEMINI_MODEL;
}

async function requestPlantDescriptionRaw(opts, promptText, imageEntries, requestOptions) {
  var env = opts.env || process.env;
  var model = getPlantDescriptionModel(env);
  var apiKey = opts.apiKey || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません。");
  }

  var requestOpts = requestOptions || {};
  var parts = [{ text: promptText }];
  (Array.isArray(imageEntries) ? imageEntries : []).forEach(function (entry, index) {
    parts.push({
      text: (entry && entry.label ? String(entry.label) : "参考写真 " + String(index + 1)) + "です。",
    });
    parts.push({
      inline_data: {
        mime_type:
          entry && entry.imageMimeType ? String(entry.imageMimeType) : "image/jpeg",
        data: entry && entry.imageBase64 ? String(entry.imageBase64) : "",
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
            typeof requestOpts.temperature === "number" ? requestOpts.temperature : 0.32,
          maxOutputTokens:
            typeof requestOpts.maxOutputTokens === "number" ? requestOpts.maxOutputTokens : 1500,
        },
        store: false,
      }),
      signal: opts.signal,
    }
  );

  if (!response.ok) {
    var errorText = "";
    try {
      var payload = await response.json();
      errorText =
        payload && payload.error && typeof payload.error.message === "string"
          ? payload.error.message
          : "";
    } catch (err) {
      errorText = "";
    }
    throw new Error(errorText || "Gemini API の呼び出しに失敗しました。");
  }

  var data = await response.json();
  return {
    model: model,
    text: extractGeminiText(data),
  };
}

async function generatePlantDescription(options) {
  var opts = options || {};
  var timelineRecords = Array.isArray(opts.timelineRecords) ? opts.timelineRecords.slice() : [];
  var imageEntries = Array.isArray(opts.imageEntries) ? opts.imageEntries.slice() : [];
  if (!timelineRecords.length || !imageEntries.length) {
    throw new Error("植栽説明に使える写真つき記録がありません。");
  }

  var titleResponse = await requestPlantDescriptionRaw(opts, buildPlantTitlePrompt(opts), imageEntries, {
    temperature: 0.32,
    maxOutputTokens: 180,
  });
  var title = normalizeGeneratedPlantTitle(titleResponse.text, opts);
  if (!isValidTitle(title)) {
    titleResponse = await requestPlantDescriptionRaw(
      opts,
      buildPlantTitleRepairPrompt(titleResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 180,
      }
    );
    title = normalizeGeneratedPlantTitle(titleResponse.text, opts);
  }
  var sections = {};
  var lastModel = titleResponse.model;
  for (var i = 0; i < BODY_SECTION_SPECS.length; i++) {
    var spec = BODY_SECTION_SPECS[i];
    var sectionResponse = await requestPlantDescriptionRaw(
      opts,
      buildPlantSectionPrompt(spec, opts),
      imageEntries,
      {
        temperature: 0.28,
        maxOutputTokens: 420,
      }
    );
    lastModel = sectionResponse.model || lastModel;
    var sectionText = normalizePlantBodyParagraph(sectionResponse.text, BODY_SECTION_MAX_CHARS);
    if (!isValidPlantSection(sectionText)) {
      sectionResponse = await requestPlantDescriptionRaw(
        opts,
        buildPlantSectionRepairPrompt(spec, sectionResponse.text),
        imageEntries,
        {
          temperature: 0.08,
          maxOutputTokens: 420,
        }
      );
      lastModel = sectionResponse.model || lastModel;
      sectionText = normalizePlantBodyParagraph(sectionResponse.text, BODY_SECTION_MAX_CHARS);
    }
    if (!isValidPlantSection(sectionText)) {
      throw new Error("AIが「" + spec.header.replace(/[【】]/g, "") + "」を読みやすく組み立てられませんでした。");
    }
    sections[spec.key] = sectionText;
  }

  var body = buildPlantBodyFromSections(sections);
  if (!isValidBody(body)) {
    throw new Error("AIが読みやすい植栽説明を組み立てられませんでした。");
  }
  if (!isValidTitle(title)) {
    title = normalizeGeneratedPlantTitle("", {
      plantName: opts.plantName,
      areaLabel: opts.areaLabel,
    });
  }
  if (!isValidTitle(title)) {
    throw new Error("AIが短いタイトルを正しく組み立てられませんでした。");
  }

  return {
    ok: true,
    model: lastModel,
    summary: title,
    body: body,
  };
}

async function generatePlantDescriptionV2(options) {
  var opts = options || {};
  var timelineRecords = Array.isArray(opts.timelineRecords) ? opts.timelineRecords.slice() : [];
  var imageEntries = Array.isArray(opts.imageEntries) ? opts.imageEntries.slice() : [];
  if (!timelineRecords.length || !imageEntries.length) {
    throw new Error("植栽説明に使える写真つき記録がありません。");
  }

  var titleResponse = await requestPlantDescriptionRaw(opts, buildPlantTitlePrompt(opts), imageEntries, {
    temperature: 0.32,
    maxOutputTokens: 180,
  });
  var title = normalizeGeneratedPlantTitle(titleResponse.text, opts);
  if (!isValidTitle(title)) {
    titleResponse = await requestPlantDescriptionRaw(
      opts,
      buildPlantTitleRepairPrompt(titleResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 180,
      }
    );
    title = normalizeGeneratedPlantTitle(titleResponse.text, opts);
  }
  if (!isValidTitle(title)) {
    title = buildFallbackPlantTitle(opts);
  }
  if (!isValidTitle(title)) {
    throw new Error("AIが短いタイトルを組み立てられませんでした。");
  }

  var bodyResponse = await requestPlantDescriptionRaw(opts, buildPlantBodyPrompt(opts), imageEntries, {
    temperature: 0.24,
    maxOutputTokens: 1200,
  });
  var lastModel = bodyResponse.model || titleResponse.model;
  var body = buildPlantBodyWithFallback(bodyResponse.text, opts);
  if (!isValidBody(body)) {
    bodyResponse = await requestPlantDescriptionRaw(
      opts,
      buildPlantBodyRepairPrompt(bodyResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 1200,
      }
    );
    lastModel = bodyResponse.model || lastModel;
    body = buildPlantBodyWithFallback(bodyResponse.text, opts);
  }
  if (!isValidBody(body)) {
    body = buildPlantBodyWithFallback("", opts);
  }
  if (!isValidBody(body)) {
    throw new Error("AIが植栽説明を読みやすく組み立てられませんでした。");
  }

  return {
    ok: true,
    model: lastModel,
    summary: title,
    body: body,
  };
}

module.exports = {
  MAX_TIMELINE_IMAGES,
  MAX_TIMELINE_RECORDS,
  buildPlantDescriptionPrompt,
  buildPlantBodyPrompt,
  buildPlantBodyFromSections,
  buildPlantBodyWithFallback,
  buildPlantSummaryPrompt,
  buildPlantTitlePrompt,
  generatePlantDescription: generatePlantDescriptionV2,
  getPlantDescriptionModel,
  normalizeGeneratedPlantBody,
  normalizeGeneratedPlantSummary,
  normalizeGeneratedPlantTitle,
  normalizeBodyText,
  normalizePlainText,
  parsePlantDescriptionResponse,
  pickEvenlySpacedItems,
};
