const {
  DEFAULT_GEMINI_MODEL,
  getGeminiModel,
  shouldReplaceMemoWithFallback,
} = require("./growth-photo-ai");

const MAX_TIMELINE_IMAGES = 8;
const MAX_TIMELINE_RECORDS = 18;
const AREA_SUMMARY_MIN_CHARS = 40;
const AREA_SUMMARY_MAX_CHARS = 110;
const AREA_BODY_MIN_CHARS = 220;
const AREA_BODY_MAX_CHARS = 900;
const AREA_PARAGRAPH_MIN_CHARS = 40;
const AREA_OBSERVATION_BANNED_PATTERNS = [
  "前回の印象と比べると",
  "見どころが少し増えてきたように見えます",
  "色や形の変化が重なり",
  "季節の進み方まで伝わってくる記録",
  "葉や株の動きが重なり",
  "生育の流れが自然に読み取れる段階です",
];

function stripEmbeddedImageMarkup(value) {
  return String(value || "")
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

function normalizePlainText(value, maxLength) {
  var text = stripEmbeddedImageMarkup(value)
    .replace(/\u3000/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  if (typeof maxLength === "number" && maxLength > 0) {
    text = text.slice(0, maxLength);
  }
  return text;
}

function normalizeBodyText(value) {
  return stripEmbeddedImageMarkup(value)
    .split(/\n{2,}/)
    .map(function (part) {
      return part
        .split(/\n+/)
        .map(function (line) {
          return line.trim();
        })
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function pickEvenlySpacedItems(items, maxCount) {
  var list = Array.isArray(items) ? items.slice() : [];
  if (!list.length) return [];
  if (!maxCount || list.length <= maxCount) return list;
  if (maxCount === 1) return [list[list.length - 1]];

  var picked = [];
  var used = {};
  for (var i = 0; i < maxCount; i++) {
    var rawIndex = Math.round((i * (list.length - 1)) / (maxCount - 1));
    if (used[rawIndex]) continue;
    used[rawIndex] = true;
    picked.push(list[rawIndex]);
  }

  if (!picked.length) {
    picked.push(list[0]);
  }
  if (picked[picked.length - 1] !== list[list.length - 1]) {
    picked[picked.length - 1] = list[list.length - 1];
  }
  return picked;
}

function buildTimelineLines(records) {
  var list = pickEvenlySpacedItems(records, MAX_TIMELINE_RECORDS);
  return list.map(function (record, index) {
    var parts = [];
    parts.push("記録" + String(index + 1) + ": " + normalizePlainText(record.recordedDate, 40));
    if (record.photoCount) {
      parts.push("写真" + String(record.photoCount) + "枚");
    }
    if (record.note) {
      parts.push("記録メモ: " + normalizePlainText(record.note, 220));
    }
    if (record.photoMemos && record.photoMemos.length) {
      parts.push("写真メモ: " + record.photoMemos.map(function (memo) {
        return normalizePlainText(memo, 120);
      }).join(" / "));
    }
    return parts.join(" | ");
  });
}

function collapseInlineWhitespace(text) {
  return String(text || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitJapaneseSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？])/)
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
}

function ensureSentenceEnding(text) {
  var value = String(text || "").trim();
  if (!value) return "";
  if (/[。！？]$/.test(value)) return value;
  var sentences = splitJapaneseSentences(value);
  if (sentences.length) {
    return sentences.join("");
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

function isCaptionLikeParagraph(text) {
  var value = collapseInlineWhitespace(text);
  if (!value) return true;
  if (/^\d{4}-\d{2}-\d{2}\s*の.*写真です。?$/.test(value)) return true;
  if (/^記録\d+\s*:\s*\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/^(?:写真|画像)メモ[:：]/.test(value)) return true;
  return false;
}

function sanitizeAreaObservationText(value, options) {
  var opts = options || {};
  var text = collapseInlineWhitespace(normalizePlainText(value, 220));
  if (!text) return "";
  if (isCaptionLikeParagraph(text)) return "";
  if (!opts.allowShort && /^[^。！？]{1,18}$/.test(text)) return "";
  if (/は、丸。|から、\d{4}-\d{2}-\d{2}には/.test(text)) return "";
  if (AREA_OBSERVATION_BANNED_PATTERNS.some(function (pattern) { return text.indexOf(pattern) !== -1; })) {
    return "";
  }
  if (
    !opts.allowShort &&
    shouldReplaceMemoWithFallback(text, {
      currentPhotoMemo: "",
      previousPhotoMemo: "",
      note: "",
      areaLabel: "",
      plantName: "",
    })
  ) {
    return "";
  }
  return text;
}

function stripAreaLabels(text) {
  return String(text || "")
    .replace(/^(?:summary|body|概要|本文|説明)\s*[:：]\s*/i, "")
    .trim();
}

function normalizeGeneratedAreaSummary(text, options) {
  var parsed = parseAreaDescriptionResponse(text);
  var source = parsed && parsed.summary ? parsed.summary : text;
  var cleaned = stripAreaLabels(normalizePlainText(source, 1000));
  cleaned = collapseInlineWhitespace(cleaned);
  if (!cleaned) {
    cleaned = buildFallbackAreaSummary(options);
  }
  var firstSentence = splitJapaneseSentences(cleaned)[0] || cleaned;
  var summary = firstSentence.trim();
  if (summary.length > AREA_SUMMARY_MAX_CHARS) {
    summary = trimToCompleteSentences(summary, AREA_SUMMARY_MAX_CHARS);
  }
  if (summary.length < AREA_SUMMARY_MIN_CHARS) {
    summary = buildFallbackAreaSummary(options);
  }
  return collapseInlineWhitespace(summary);
}

function normalizeGeneratedAreaBody(text, options) {
  var parsed = parseAreaDescriptionResponse(text);
  var source = parsed && parsed.body ? parsed.body : text;
  var normalized = normalizeBodyText(stripAreaLabels(source));
  var blocks = splitParagraphBlocks(normalized)
    .map(function (block) {
      return trimToCompleteSentences(collapseInlineWhitespace(block), 320);
    })
    .filter(function (block) {
      return block && !isCaptionLikeParagraph(block);
    });

  if (blocks.length < 2) {
    var sentences = splitJapaneseSentences(normalized)
      .map(function (sentence) {
        return trimToCompleteSentences(sentence, 180);
      })
      .filter(function (sentence) {
        return sentence && !isCaptionLikeParagraph(sentence);
      });
    if (sentences.length >= 3) {
      blocks = [
        sentences.slice(0, 2).join(""),
        sentences.slice(2, 4).join("") || sentences.slice(2).join(""),
        sentences.slice(4).join("") || "",
      ].filter(Boolean);
    }
  }

  if (blocks.length < 2) {
    return "";
  }

  var body = blocks.join("\n\n").trim();
  if (body.length > AREA_BODY_MAX_CHARS) {
    body = blocks
      .map(function (block) {
        return trimToCompleteSentences(block, 260);
      })
      .join("\n\n")
      .trim();
  }
  if (!isValidAreaBody(body)) {
    return "";
  }
  return body;
}

function isValidAreaSummary(summary) {
  var value = collapseInlineWhitespace(summary);
  return (
    value.length >= AREA_SUMMARY_MIN_CHARS &&
    value.length <= AREA_SUMMARY_MAX_CHARS &&
    !/^\s*["'{]/.test(value) &&
    !/\\n/.test(value) &&
    /[。！？]$/.test(value)
  );
}

function isValidAreaBody(body) {
  var value = String(body || "").trim();
  if (!value || value.length < AREA_BODY_MIN_CHARS || value.length > AREA_BODY_MAX_CHARS) return false;
  if (/^\s*["'{]/.test(value) || /\\n/.test(value)) return false;
  var blocks = splitParagraphBlocks(value);
  if (blocks.length < 2) return false;
  return blocks.every(function (block) {
    var collapsed = collapseInlineWhitespace(block);
    return (
      collapsed.length >= AREA_PARAGRAPH_MIN_CHARS &&
      /[。！？]$/.test(collapsed) &&
      !isCaptionLikeParagraph(collapsed)
    );
  });
}

function latestObservation(records) {
  var list = Array.isArray(records) ? records : [];
  for (var i = list.length - 1; i >= 0; i--) {
    var record = list[i];
    var note = sanitizeAreaObservationText(record && record.note, { allowShort: true });
    if (note) return note;
    if (record && Array.isArray(record.photoMemos)) {
      for (var j = 0; j < record.photoMemos.length; j++) {
        var memo = sanitizeAreaObservationText(record.photoMemos[j], { allowShort: false });
        if (memo) return memo;
      }
    }
  }
  return "";
}

function earliestObservation(records) {
  var list = Array.isArray(records) ? records : [];
  for (var i = 0; i < list.length; i++) {
    var record = list[i];
    var note = sanitizeAreaObservationText(record && record.note, { allowShort: true });
    if (note) return note;
    if (record && Array.isArray(record.photoMemos)) {
      for (var j = 0; j < record.photoMemos.length; j++) {
        var memo = sanitizeAreaObservationText(record.photoMemos[j], { allowShort: false });
        if (memo) return memo;
      }
    }
  }
  return "";
}

function buildFallbackAreaSummary(options) {
  var areaLabel = normalizePlainText(options && options.areaLabel, 120) || "このエリア";
  var records = Array.isArray(options && options.timelineRecords) ? options.timelineRecords : [];
  var latest = latestObservation(records) || "季節ごとの表情";
  return trimToCompleteSentences(
    areaLabel + "では、" + latest + "を軸に、季節ごとの変化を楽しめる景色が少しずつ育っています。",
    AREA_SUMMARY_MAX_CHARS
  );
}

function buildFallbackAreaBody(options) {
  var areaLabel = normalizePlainText(options && options.areaLabel, 120) || "このエリア";
  var records = Array.isArray(options && options.timelineRecords) ? options.timelineRecords : [];
  var firstRecord = records[0] || null;
  var lastRecord = records[records.length - 1] || null;
  var firstDate = normalizePlainText(firstRecord && firstRecord.recordedDate, 40) || "記録の初期";
  var lastDate = normalizePlainText(lastRecord && lastRecord.recordedDate, 40) || "最近";
  var firstObs = earliestObservation(records) || "まだ静かな表情";
  var lastObs = latestObservation(records) || "季節の変化が見える様子";

  var paragraph1 = ensureSentenceEnding(
    areaLabel +
      "では、植え込みや鉢まわりの景色が季節に合わせて少しずつ表情を変えていきます。" +
      "今の記録では、" +
      lastObs +
      "が主役になっていて、入口まわりを明るく見せるこの場所らしい景色がまとまってきました。"
  );
  var paragraph2 = ensureSentenceEnding(
    firstDate +
      "ごろの" +
      firstObs +
      "から、" +
      lastDate +
      "には" +
      lastObs +
      "へと景色が移ってきました。" +
      "写真を並べると、葉の量や花の広がり、足元のにぎわいが順に増えて、季節が進むごとに入口の印象が整ってきたことがよく分かります。"
  );
  var paragraph3 = ensureSentenceEnding(
    areaLabel +
      "の記録は、単発の写真として見るより、時間を重ねながら景色を育てていく流れとして読むと魅力が伝わります。" +
      "その時期ごとの主役がどこにあるかを意識しながら見比べると、この場所をどう見せたいかまで自然に伝わってきます。"
  );

  return [paragraph1, paragraph2, paragraph3].join("\n\n");
}

function buildAreaSummaryPrompt(options) {
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の時系列写真メモをもとに、エリア紹介の概要だけを書いてください。",
    "対象エリア: " + areaLabel,
    "1段落、1〜2文、40〜110文字でまとめてください。",
    "写真の時系列から見えている今の見どころと変化の方向が伝わる要約にしてください。",
    "他人事の解説ではなく、この場所の魅力を主体的に紹介する語り口にしてください。",
    "『〜の写真です』『〜ように見えます』『前回の印象と比べると』のような写真コメント風の言い回しは禁止です。",
    "日付の列挙、写真キャプション風の文、引用符、JSON、箇条書きは禁止です。",
  ];
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }
  return lines.join("\n");
}

function buildAreaBodyPrompt(options) {
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var lines = [
    "次の時系列写真メモをもとに、エリア紹介の本文だけを書いてください。",
    "対象エリア: " + areaLabel,
    "出力は2〜3段落、全体で220〜900文字にしてください。",
    "1段落目では、今の景色やこのエリアの役割を、こちらが魅力を紹介するつもりで書いてください。",
    "2段落目では、写真を見比べて分かる季節の移り変わりや景色の変化を、主体的に案内する説明文として書いてください。",
    "3段落目を入れる場合は、この場所の記録を通して見えてくる流れや見どころを、読み手に勧めるようにまとめてください。",
    "『〜の写真です』『〜ように見えます』『前回の印象と比べると』のような写真コメント風の言い回しは禁止です。",
    "日付だけの文や『2026-04-10 のエリア写真です。』のようなキャプション文は禁止です。",
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

function buildAreaSummaryRepairPrompt(rawText) {
  return [
    "次の文章をエリア紹介の短い概要に整えてください。",
    "1段落、1〜2文、40〜110文字にしてください。",
    "この場所の魅力を主体的に紹介する文にしてください。",
    "『〜ように見えます』『前回の印象と比べると』のような写真コメント風の言い回しは禁止です。",
    "日付の列挙や写真キャプション風の文は禁止です。",
    "引用符、JSON、箇条書きは禁止です。",
    "元の文章: " + String(rawText || "").slice(0, 4000),
  ].join("\n");
}

function buildAreaBodyRepairPrompt(rawText) {
  return [
    "次の文章をエリア紹介の本文として読みやすく整えてください。",
    "2〜3段落、全体で220〜900文字にしてください。",
    "景色の紹介、時系列の変化、この場所の見どころが伝わる説明にしてください。",
    "他人事の解説ではなく、この場所の魅力を主体的に紹介する語り口にしてください。",
    "『〜ように見えます』『前回の印象と比べると』のような写真コメント風の言い回しは禁止です。",
    "日付だけの文や写真キャプション風の文は禁止です。",
    "引用符、JSON、箇条書きは禁止です。",
    "元の文章: " + String(rawText || "").slice(0, 5000),
  ].join("\n");
}

function buildAreaDescriptionPrompt(options) {
  var areaLabel = normalizePlainText(options.areaLabel, 120) || "このエリア";
  var summaryDraft = normalizePlainText(options.currentSummary, 500);
  var bodyDraft = normalizeBodyText(options.currentBody).slice(0, 2000);
  var timelineLines = buildTimelineLines(options.timelineRecords || []);
  var firstDate = normalizePlainText(options.firstRecordedDate, 40);
  var lastDate = normalizePlainText(options.lastRecordedDate, 40);

  var lines = [
    "次の時系列写真と記録メモをもとに、園芸記録サイトのエリア説明文を作成してください。",
    "対象エリア: " + areaLabel,
    "概要(summary)は1〜2文、60〜160文字程度で、このエリアの現在の見どころと変遷の要点をまとめてください。",
    "本文(body)は3〜5段落、合計250〜900文字程度で、古い記録から新しい記録への変化が自然に読める説明にしてください。",
    "本文では、時系列の流れが分かるように、必要な箇所だけ日付や時期に軽く触れてください。箇条書きにはしないでください。",
    "写真から読み取れる範囲と記録メモの内容だけを使い、見えていない事実は作らないでください。",
    "花や葉、株姿、背景の変化、手入れの痕跡など、写真に表れている変遷を中心に書いてください。",
    "既存の下書きがある場合は参考にしてかまいませんが、写真の流れに合うよう必要なら書き直してください。",
    "返答は必ず次のJSONだけにしてください。",
    '{"summary":"ここに概要","body":"ここに本文"}',
  ];

  if (firstDate || lastDate) {
    lines.push(
      "記録期間: " +
        (firstDate || "不明") +
        " から " +
        (lastDate || "不明")
    );
  }
  if (summaryDraft) {
    lines.push("現在の概要下書き: " + summaryDraft);
  }
  if (bodyDraft) {
    lines.push("現在の本文下書き: " + bodyDraft.slice(0, 1200));
  }
  if (timelineLines.length) {
    lines.push("時系列メモ:");
    timelineLines.forEach(function (line) {
      lines.push("- " + line);
    });
  }

  return lines.join("\n");
}

function buildAreaDescriptionRepairPrompt(rawText) {
  return [
    "次の返答を、必ずJSONだけに整形してください。",
    '必要なキーは "summary" と "body" です。',
    "summary は1〜2文、body は段落を空行で区切った本文にしてください。",
    "返答は必ず次のJSONだけにしてください。",
    '{"summary":"ここに概要","body":"ここに本文"}',
    "元の返答: " + String(rawText || "").slice(0, 5000),
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

function parseAreaDescriptionResponse(text) {
  var raw = extractJsonObjectText(text);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    var summary = normalizePlainText(parsed && parsed.summary, 4000);
    var body = normalizeBodyText(parsed && parsed.body).slice(0, 100000);
    if (!summary || !body) return null;
    return {
      summary: summary,
      body: body,
    };
  } catch (err) {
    return null;
  }
}

async function requestAreaDescriptionRaw(opts, promptText, imageEntries, requestOptions) {
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
      text: (entry && entry.label ? String(entry.label) : "参考画像" + String(index + 1)) + "です。",
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
            typeof requestOpts.temperature === "number" ? requestOpts.temperature : 0.35,
          maxOutputTokens:
            typeof requestOpts.maxOutputTokens === "number" ? requestOpts.maxOutputTokens : 1400,
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

async function generateAreaDescription(options) {
  var opts = options || {};
  var timelineRecords = Array.isArray(opts.timelineRecords) ? opts.timelineRecords.slice() : [];
  var imageEntries = Array.isArray(opts.imageEntries) ? opts.imageEntries.slice() : [];
  if (!timelineRecords.length || !imageEntries.length) {
    throw new Error("エリア説明に使える写真付き記録がありません。");
  }

  var prompt = buildAreaDescriptionPrompt(opts);
  var response = await requestAreaDescriptionRaw(opts, prompt, imageEntries, {
    temperature: 0.34,
    maxOutputTokens: 1400,
  });

  var parsed = parseAreaDescriptionResponse(response.text);
  if (!parsed) {
    response = await requestAreaDescriptionRaw(opts, buildAreaDescriptionRepairPrompt(response.text), imageEntries, {
      temperature: 0.1,
      maxOutputTokens: 1400,
    });
    parsed = parseAreaDescriptionResponse(response.text);
  }

  if (!parsed) {
    throw new Error("AIがエリア説明を正しく組み立てられませんでした。");
  }

  return {
    ok: true,
    model: response.model,
    summary: parsed.summary,
    body: parsed.body,
  };
}

async function generateAreaDescriptionV2(options) {
  var opts = options || {};
  var timelineRecords = Array.isArray(opts.timelineRecords) ? opts.timelineRecords.slice() : [];
  var imageEntries = Array.isArray(opts.imageEntries) ? opts.imageEntries.slice() : [];
  if (!timelineRecords.length || !imageEntries.length) {
    throw new Error("エリア説明に使える写真つき記録がありません。");
  }

  var summaryResponse = await requestAreaDescriptionRaw(opts, buildAreaSummaryPrompt(opts), imageEntries, {
    temperature: 0.28,
    maxOutputTokens: 260,
  });
  var summary = normalizeGeneratedAreaSummary(summaryResponse.text, opts);
  if (!isValidAreaSummary(summary)) {
    summaryResponse = await requestAreaDescriptionRaw(
      opts,
      buildAreaSummaryRepairPrompt(summaryResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 260,
      }
    );
    summary = normalizeGeneratedAreaSummary(summaryResponse.text, opts);
  }
  if (!isValidAreaSummary(summary)) {
    summary = buildFallbackAreaSummary(opts);
  }
  if (!isValidAreaSummary(summary)) {
    throw new Error("AIがエリア概要を短くまとめられませんでした。");
  }

  var bodyResponse = await requestAreaDescriptionRaw(opts, buildAreaBodyPrompt(opts), imageEntries, {
    temperature: 0.26,
    maxOutputTokens: 1400,
  });
  var body = normalizeGeneratedAreaBody(bodyResponse.text, opts);
  if (!isValidAreaBody(body)) {
    bodyResponse = await requestAreaDescriptionRaw(
      opts,
      buildAreaBodyRepairPrompt(bodyResponse.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 1400,
      }
    );
    body = normalizeGeneratedAreaBody(bodyResponse.text, opts);
  }
  if (!isValidAreaBody(body)) {
    body = buildFallbackAreaBody(opts);
  }
  if (!isValidAreaBody(body)) {
    throw new Error("AIがエリア説明を読みやすく組み立てられませんでした。");
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
  buildAreaDescriptionPrompt,
  buildAreaSummaryPrompt,
  buildAreaBodyPrompt,
  buildFallbackAreaBody,
  buildFallbackAreaSummary,
  generateAreaDescription: generateAreaDescriptionV2,
  isValidAreaBody,
  isValidAreaSummary,
  normalizeGeneratedAreaBody,
  normalizeGeneratedAreaSummary,
  normalizeBodyText,
  normalizePlainText,
  parseAreaDescriptionResponse,
  pickEvenlySpacedItems,
};
