const getRawBody = require("raw-body");

const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

function jsonError(res, status, code, err) {
  var detail =
    err && err.message
      ? String(err.message)
      : err
        ? String(err)
        : "";
  console.error(code, detail || err);
  return res.status(status).json({ error: code, detail: detail });
}

function isParsedJsonObject(body) {
  return (
    body != null &&
    typeof body === "object" &&
    !Buffer.isBuffer(body) &&
    !Array.isArray(body) &&
    typeof body.pipe !== "function"
  );
}

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      return null;
    }
  }
  if (isParsedJsonObject(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      /* fall through */
    }
  }
  try {
    var buf = await getRawBody(req, {
      limit: "8mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody", e);
    return null;
  }
}

function normalizePlantNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(function (name) {
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean)
    .slice(0, 12);
}

function buildPrompt(context) {
  var lines = [
    "次の写真について、植栽記録サイトの写真メモ欄に入れる短い日本語コメントを1つ作成してください。",
    "見えている内容を中心に書き、断定しすぎず、画像だけで分からないことは言い切らないでください。",
    "1〜2文、合計120文字以内、箇条書き・絵文字・引用符・見出し・Markdownなしで返してください。",
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
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 500));
  if (photoIndex) {
    lines.push(
      "写真位置: " + photoIndex + (photoCount ? " / " + photoCount + "枚中" : "")
    );
  }
  lines.push("返答はコメント本文だけにしてください。");
  return lines.join("\n");
}

function buildPromptV2(context) {
  var lines = [
    "次の写真について、植栽記録サイトの写真メモ欄に入れる短い日本語コメントを1つ作成してください。",
    "見えている内容を中心に書き、断定しすぎず、画像だけで分からないことは言い切らないでください。",
    "1〜2文、合計120文字以内、箇条書き・絵文字・引用符・Markdownなしで返してください。",
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
  if (noteText) lines.push("記録全体メモ: " + noteText.slice(0, 500));
  if (currentPhotoMemo) {
    lines.push("ユーザーが更新した写真メモ: " + currentPhotoMemo.slice(0, 500));
    lines.push("上の写真メモの意図を残しつつ、写真と整合する短い最終コメントに磨いてください。");
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
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 300);
}

async function readGeminiErrorMessage(res) {
  try {
    var text = await res.text();
    if (!text) return "";
    var data = JSON.parse(text);
    if (data && data.error && typeof data.error.message === "string") {
      return data.error.message;
    }
    if (data && typeof data.error === "string") {
      return data.error;
    }
    return text;
  } catch (e) {
    return "";
  }
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

function getGeminiModel() {
  if (typeof process.env.GEMINI_MODEL === "string" && process.env.GEMINI_MODEL.trim()) {
    return process.env.GEMINI_MODEL.trim();
  }
  if (
    typeof process.env.GEMINI_PHOTO_COMMENT_MODEL === "string" &&
    process.env.GEMINI_PHOTO_COMMENT_MODEL.trim()
  ) {
    return process.env.GEMINI_PHOTO_COMMENT_MODEL.trim();
  }
  return DEFAULT_GEMINI_MODEL;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "gemini_unavailable",
      detail: "GEMINI_API_KEY が未設定です。",
    });
  }

  var body = await readJsonBody(req);
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64.trim()) {
    return res.status(400).json({ error: "missing_image_base64" });
  }

  var imageMimeType =
    typeof body.imageMimeType === "string" && body.imageMimeType.trim()
      ? body.imageMimeType.trim()
      : "image/jpeg";
  var imageBase64 = body.imageBase64.trim();
  if (Buffer.byteLength(imageBase64, "utf8") > 2_400_000) {
    return res.status(400).json({ error: "image_too_large" });
  }

  var model = getGeminiModel();

  var controller = new AbortController();
  var timer = setTimeout(function () {
    controller.abort();
  }, 25000);

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
                  text: buildPromptV2(body.context || {}),
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
          tools: [
            {
              code_execution: {},
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 120,
          },
          store: false,
        }),
        signal: controller.signal,
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
        return res.status(500).json({
          error: "gemini_request_failed",
          detail:
            "GEMINI_API_KEY が無効です。Google AI Studio で発行した有効な Gemini API キーに更新してください。",
        });
      }

      if (message.indexOf("reported as leaked") !== -1) {
        return res.status(500).json({
          error: "gemini_request_failed",
          detail:
            "現在の Gemini API キーは利用停止されています。Google AI Studio で新しいキーを発行して差し替えてください。",
        });
      }

      var geminiError = message || (await readGeminiErrorMessage(response));
      return res.status(502).json({
        error: "gemini_request_failed",
        detail: geminiError || "Gemini API の呼び出しに失敗しました。",
      });
    }

    var data = await response.json();
    var comment = normalizeComment(extractGeminiText(data));
    if (!comment) {
      return res.status(502).json({
        error: "gemini_empty_response",
        detail: "Gemini からコメント本文を取得できませんでした。",
      });
    }

    return res.status(200).json({
      ok: true,
      comment: comment,
      model: model,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      return res.status(504).json({
        error: "gemini_timeout",
        detail: "Gemini API の応答がタイムアウトしました。",
      });
    }
    return jsonError(res, 500, "internal_error", err);
  } finally {
    clearTimeout(timer);
  }
};
