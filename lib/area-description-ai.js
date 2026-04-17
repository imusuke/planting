const { DEFAULT_GEMINI_MODEL, getGeminiModel } = require("./growth-photo-ai");

const MAX_TIMELINE_IMAGES = 8;
const MAX_TIMELINE_RECORDS = 18;

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

module.exports = {
  MAX_TIMELINE_IMAGES,
  MAX_TIMELINE_RECORDS,
  buildAreaDescriptionPrompt,
  generateAreaDescription,
  normalizeBodyText,
  normalizePlainText,
  parseAreaDescriptionResponse,
  pickEvenlySpacedItems,
};
