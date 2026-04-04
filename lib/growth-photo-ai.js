const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

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

function buildPrompt(context) {
  var lines = [
    "次の写真について、植栽記録サイトの写真メモ欄に入れる自然な日本語コメントを1つ作成してください。",
    "写真に実際に見えている内容を中心に書き、画像だけで分からないことは言い切らないでください。",
    "2〜3文、合計80〜180文字を目安にしてください。途中で切れた短文や箇条書き、絵文字、引用符、Markdownは使わないでください。",
    "植物の様子、色や形、作業や観察のポイントがあれば無理のない範囲で自然に触れてください。",
  ];

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
  if (currentPhotoMemo) {
    lines.push("ユーザーが直前に書いた写真メモ: " + currentPhotoMemo.slice(0, 800));
    lines.push(
      "上の写真メモの意図や言い回しはできるだけ残しつつ、写真と矛盾しない読みやすい最終コメントに整えてください。"
    );
  }
  if (photoIndex) {
    lines.push(
      "写真位置: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : "")
    );
  }
  lines.push("返答はコメント本文だけにしてください。");
  return lines.join("\n");
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out.length > 420) {
    var cut = out.slice(0, 420);
    var lastStop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    out = lastStop >= 60 ? cut.slice(0, lastStop + 1) : cut.trim();
  }

  out = out.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
  if (out && !/[。！？]$/.test(out)) out += "。";
  return out;
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

async function generateGrowthPhotoComment(options) {
  var opts = options || {};
  var env = opts.env || process.env;
  var apiKey = opts.apiKey || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw makeGeminiError(
      "gemini_unavailable",
      "GEMINI_API_KEY が設定されていません。",
      503
    );
  }

  var imageBase64 =
    typeof opts.imageBase64 === "string" && opts.imageBase64.trim() ? opts.imageBase64.trim() : "";
  if (!imageBase64) {
    throw makeGeminiError("missing_image_base64", "imageBase64 がありません。", 400);
  }

  var imageMimeType =
    typeof opts.imageMimeType === "string" && opts.imageMimeType.trim()
      ? opts.imageMimeType.trim()
      : "image/jpeg";
  var model = getGeminiModel(env);
  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, typeof opts.timeoutMs === "number" ? opts.timeoutMs : 25000);

  try {
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
                  text: buildPrompt(opts.context || {}),
                },
                {
                  inline_data: {
                    mime_type: imageMimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.55,
            maxOutputTokens: 256,
          },
          store: false,
        }),
        signal: opts.signal || controller.signal,
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
          "現在の Gemini API キーは無効化されています。Google AI Studio で新しいキーを発行して差し替えてください。",
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
    var comment = normalizeComment(extractGeminiText(data));
    if (!comment) {
      throw makeGeminiError(
        "gemini_empty_response",
        "Gemini からコメント本文を受け取れませんでした。",
        502
      );
    }

    return {
      ok: true,
      model: model,
      comment: comment,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  buildGrowthPhotoCommentPrompt: buildPrompt,
  generateGrowthPhotoComment,
  getGeminiModel,
  normalizeComment,
  normalizePlantNames,
};
