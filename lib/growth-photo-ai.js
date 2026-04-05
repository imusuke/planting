const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";
const COMMENT_MIN_LENGTH = 20;
const COMMENT_MAX_LENGTH = 99;

function normalizePlantNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(function (name) {
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean)
    .slice(0, 12);
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

function buildContextLines(context) {
  var lines = [];
  var dateText = context && context.recordedDate ? String(context.recordedDate).trim() : "";
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var noteText = context && context.note ? String(context.note).trim() : "";
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? String(context.currentPhotoMemo).trim() : "";
  var photoIndex =
    context && context.photoIndex != null ? String(context.photoIndex).trim() : "";
  var photoCount =
    context && context.photoCount != null ? String(context.photoCount).trim() : "";

  if (dateText) lines.push("記録日: " + dateText);
  if (areaText) lines.push("エリア: " + areaText);
  if (plants.length) lines.push("植栽: " + plants.join("、"));
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 800));
  if (currentPhotoMemo) lines.push("既存の写真メモ: " + currentPhotoMemo.slice(0, 800));
  if (photoIndex) {
    lines.push(
      "写真位置: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : "")
    );
  }
  return lines;
}

function buildPrompt(context) {
  var lines = [
    "次の写真について、植栽記録サイトの写真メモ欄に入れるコメントを1つ作成してください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字の見出し、箇条書き、引用符、Markdownは使わないでください。",
    "コメントは20文字以上100文字未満、1〜3文にしてください。短すぎる断片や途中で切れた文は禁止です。",
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "写真に実際に見えている内容を中心にし、画像だけで分からないことは断定しないでください。",
  ];

  return lines.concat(buildContextLines(context)).concat(["返答はコメント本文だけにしてください。"]).join("\n");
}

function buildRepairPrompt(context, draft, reason) {
  var lines = [
    "次の下書きを修正して、植栽記録サイトの写真メモとして完成させてください。",
    "必ず自然な日本語だけで書いてください。英語、ローマ字、箇条書き、引用符、Markdownは使わないでください。",
    "完成文は20文字以上100文字未満、1〜3文にしてください。",
    "既存の写真メモがある場合は、その意味、観点、固有名詞、言い回しをできるだけ残し、完全に別内容へ書き換えないでください。",
    "下書きの問題: " + reason,
    "下書き: " + String(draft || "").slice(0, 400),
  ];

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

function stripSentenceTail(text) {
  return String(text || "")
    .replace(/[。！？]+$/g, "")
    .trim();
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
  var currentPhotoMemo =
    context && context.currentPhotoMemo ? normalizeComment(String(context.currentPhotoMemo)) : "";
  var noteText = context && context.note ? normalizeComment(String(context.note).slice(0, 60)) : "";
  var plants = normalizePlantNames(context && context.plantNames);
  var areaText = context && context.areaLabel ? String(context.areaLabel).trim() : "";

  if (currentPhotoMemo) segments.push(currentPhotoMemo);
  if (noteText) segments.push(noteText);
  if (plants.length) segments.push(plants.join("、") + "の様子がよくわかります。");
  if (areaText) segments.push(areaText + "での記録です。");
  segments.push("成長の様子がよく伝わる写真です。");
  return segments;
}

function expandCommentToMinimum(comment, context) {
  var out = normalizeComment(comment);
  var segments = buildFallbackSegments(context);

  if (!out) {
    out = segments.shift() || "";
  }

  while (out.length < COMMENT_MIN_LENGTH && segments.length) {
    out = appendSentence(out, segments.shift());
  }

  if (out.length < COMMENT_MIN_LENGTH) {
    out = appendSentence(out, "成長の変化がよくわかります。");
  }

  return normalizeComment(out);
}

function countMatches(text, regex) {
  var matches = String(text || "").match(regex);
  return matches ? matches.length : 0;
}

function getValidationError(comment, context) {
  var text = String(comment || "").trim();
  if (!text) return "コメントが空です。";
  if (text.length < COMMENT_MIN_LENGTH) return "20文字未満で短すぎます。";
  if (text.length >= 100) return "100文字以上で長すぎます。";

  var japaneseCount = countMatches(text, /[ぁ-んァ-ヶ一-龠々]/g);
  if (japaneseCount < 8) return "日本語の文字数が少なすぎます。";

  var latinCount = countMatches(text, /[A-Za-z]/g);
  if (latinCount > Math.max(2, Math.floor(text.length * 0.08))) {
    return "英語やローマ字が多すぎます。";
  }

  var currentPhotoMemo =
    context && context.currentPhotoMemo ? String(context.currentPhotoMemo).trim() : "";
  if (currentPhotoMemo) {
    var memoTokens = currentPhotoMemo.match(/[A-Za-z0-9]{2,}|[ァ-ヶー]{2,}|[一-龠々]{2,}/g) || [];
    var importantTokens = memoTokens.filter(function (token) {
      return token.length >= 2;
    });
    if (importantTokens.length) {
      var overlap = importantTokens.some(function (token) {
        return text.indexOf(token) !== -1;
      });
      if (!overlap) return "既存の写真メモの要点が十分に残っていません。";
    }
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
            parts: [
              {
                text: promptText,
              },
              {
                inline_data: {
                  mime_type: opts.imageMimeType,
                  data: opts.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 256,
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
    comment: normalizeComment(extractGeminiText(data)),
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
    typeof opts.imageBase64 === "string" && opts.imageBase64.trim() ? opts.imageBase64.trim() : "";
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
      signal: opts.signal || controller.signal,
    };

    var result = await requestGeminiComment(requestOpts, buildPrompt(opts.context || {}));
    var validationError = getValidationError(result.comment, opts.context || {});

    if (validationError) {
      result = await requestGeminiComment(
        requestOpts,
        buildRepairPrompt(opts.context || {}, result.comment, validationError)
      );
      validationError = getValidationError(result.comment, opts.context || {});
    }

    if (validationError) {
      result.comment = expandCommentToMinimum(result.comment, opts.context || {});
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
  generateGrowthPhotoComment,
  getGeminiModel,
  normalizeComment,
  expandCommentToMinimum,
  normalizePlantNames,
};
