const { DEFAULT_GEMINI_MODEL, getGeminiModel } = require("./growth-photo-ai");
const areaDescriptionAi = require("./area-description-ai");

const MAX_TIMELINE_IMAGES = 8;
const MAX_TIMELINE_RECORDS = 18;

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
  var source = String(text || "").trim();
  if (!source) return null;

  var labeledSummary = extractLabeledSection(source, ["summary", "概要"]);
  var labeledBody = extractLabeledSection(source, ["body", "本文"]);
  if (labeledSummary || labeledBody) {
    var summaryFromLabels = normalizePlainText(labeledSummary, 4000);
    var bodyFromLabels = normalizeBodyText(labeledBody).slice(0, 100000);
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

  var plain = normalizeBodyText(source)
    .replace(/^(?:summary|概要|body|本文)\s*[:：]\s*/gim, "")
    .replace(/^[-*・]\s*/gm, "")
    .trim();
  if (!plain || plain.length < 80) return null;

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
    var summary = normalizePlainText(parsed && parsed.summary, 4000);
    var body = normalizeBodyText(parsed && parsed.body).slice(0, 100000);
    if (!summary || !body) return null;
    return {
      summary: summary,
      body: body,
    };
  } catch (err) {
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

  var prompt = buildPlantDescriptionPrompt(opts);
  var response = await requestPlantDescriptionRaw(opts, prompt, imageEntries, {
    temperature: 0.32,
    maxOutputTokens: 1500,
  });

  var parsed = parsePlantDescriptionResponse(response.text);
  if (!parsed) {
    response = await requestPlantDescriptionRaw(
      opts,
      buildPlantDescriptionRepairPrompt(response.text),
      imageEntries,
      {
        temperature: 0.08,
        maxOutputTokens: 1500,
      }
    );
    parsed = parsePlantDescriptionResponse(response.text);
  }

  if (!parsed) {
    throw new Error("AIが植栽説明を正しく組み立てられませんでした。");
  }

  return {
    ok: true,
    model: response.model,
    summary: parsed.summary,
    body: parsed.body,
  };
}

module.exports = {
  MAX_TIMELINE_IMAGES,
  MAX_TIMELINE_RECORDS,
  buildPlantDescriptionPrompt,
  generatePlantDescription,
  normalizeBodyText,
  normalizePlainText,
  parsePlantDescriptionResponse,
  pickEvenlySpacedItems,
};
