const { DEFAULT_GEMINI_MODEL, getGeminiModel } = require("./growth-photo-ai");
const areaDescriptionAi = require("./area-description-ai");

const MAX_TIMELINE_IMAGES = 8;
const MAX_TIMELINE_RECORDS = 18;
const SUMMARY_MIN_CHARS = 45;
const SUMMARY_MAX_CHARS = 110;
const BODY_SECTION_MAX_CHARS = 260;
const BODY_SECTION_MIN_CHARS = 40;
const BODY_MAX_CHARS = 900;
const BODY_SECTION_SPECS = [
  {
    key: "general",
    header: "【一般的な特徴】",
    labelPattern: /^(?:【?\s*(?:一般的な特徴|特徴|基本の特徴|魅力)\s*】?[:：]?\s*)/i,
  },
  {
    key: "care",
    header: "【季節ごとの手入れ】",
    labelPattern: /^(?:【?\s*(?:季節ごとの手入れ|季節の手入れ|手入れ|管理のポイント)\s*】?[:：]?\s*)/i,
  },
  {
    key: "story",
    header: "【この場所での変遷】",
    labelPattern: /^(?:【?\s*(?:この場所での変遷|時系列の変化|この場所でのストーリー|時系列ストーリー|変遷)\s*】?[:：]?\s*)/i,
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

function isValidSummary(summary) {
  var value = collapseInlineWhitespace(summary);
  return (
    value.length >= SUMMARY_MIN_CHARS &&
    value.length <= SUMMARY_MAX_CHARS &&
    value.indexOf("\n") === -1 &&
    !containsRawJsonLikeKeys(value) &&
    !/^(?:【|概要[:：]|summary[:：])/i.test(value) &&
    /[。！？]$/.test(value)
  );
}

function normalizeGeneratedPlantSummary(text, fallbackBody) {
  var cleaned = sanitizeDescriptionSection(text);
  cleaned = cleaned.replace(/^(?:概要|summary|タイトル)\s*[:：]\s*/i, "");
  cleaned = collapseInlineWhitespace(cleaned);
  var sentences = splitJapaneseSentences(cleaned);
  var summary = "";
  for (var i = 0; i < sentences.length; i++) {
    var next = summary ? summary + sentences[i] : sentences[i];
    if (next.length > SUMMARY_MAX_CHARS && summary) break;
    summary = next;
    if (summary.length >= SUMMARY_MIN_CHARS && i >= 0) break;
  }
  summary = ensureSentenceEnding(summary || cleaned);
  if (summary.length > SUMMARY_MAX_CHARS && fallbackBody) {
    summary = trimToCompleteSentences(buildSummaryFromBody(fallbackBody), SUMMARY_MAX_CHARS);
  } else if (summary.length > SUMMARY_MAX_CHARS) {
    summary = trimToCompleteSentences(summary, SUMMARY_MAX_CHARS);
  }
  if (summary.length < SUMMARY_MIN_CHARS && fallbackBody) {
    summary = trimToCompleteSentences(buildSummaryFromBody(fallbackBody), SUMMARY_MAX_CHARS);
  }
  return collapseInlineWhitespace(summary);
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

async function requestPlantDescriptionRaw(opts, promptText, imageEntries, requestOptions) {
  var env = opts.env || process.env;
  var model = getGeminiModel(env) || DEFAULT_GEMINI_MODEL;
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

  var summaryResponse = await requestPlantDescriptionRaw(opts, buildPlantSummaryPrompt(opts), imageEntries, {
    temperature: 0.32,
    maxOutputTokens: 240,
  });
  var summary = normalizeGeneratedPlantSummary(summaryResponse.text, "");
  if (!isValidSummary(summary)) {
    summaryResponse = await requestPlantDescriptionRaw(
      opts,
      buildPlantSummaryRepairPrompt(summaryResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 240,
      }
    );
    summary = normalizeGeneratedPlantSummary(summaryResponse.text, "");
  }

  var bodyResponse = await requestPlantDescriptionRaw(opts, buildPlantBodyPrompt(opts), imageEntries, {
    temperature: 0.28,
    maxOutputTokens: 1200,
  });
  var body = normalizeGeneratedPlantBody(bodyResponse.text);
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
    body = normalizeGeneratedPlantBody(bodyResponse.text);
  }

  if (!isValidBody(body)) {
    throw new Error("AIが読みやすい植栽説明を組み立てられませんでした。");
  }
  if (!isValidSummary(summary)) {
    summary = normalizeGeneratedPlantSummary("", body);
  }
  if (!isValidSummary(summary)) {
    throw new Error("AIが短い概要を正しく組み立てられませんでした。");
  }

  return {
    ok: true,
    model: bodyResponse.model || summaryResponse.model,
    summary: summary,
    body: body,
  };
}

module.exports = {
  MAX_TIMELINE_IMAGES,
  MAX_TIMELINE_RECORDS,
  buildPlantDescriptionPrompt,
  buildPlantBodyPrompt,
  buildPlantSummaryPrompt,
  generatePlantDescription,
  normalizeGeneratedPlantBody,
  normalizeGeneratedPlantSummary,
  normalizeBodyText,
  normalizePlainText,
  parsePlantDescriptionResponse,
  pickEvenlySpacedItems,
};
