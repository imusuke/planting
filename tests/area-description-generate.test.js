const test = require("node:test");
const assert = require("node:assert/strict");

const areaDescriptionAi = require("../lib/area-description-ai.js");

test("normalizeGeneratedAreaBody drops caption-like date lines", function () {
  const body = areaDescriptionAi.normalizeGeneratedAreaBody(
    [
      "玄関前の白い壁を背景に、鉢植えや草花が季節ごとに表情を変えるエリアです。",
      "",
      "2026-03-28 のエリア写真です。",
      "",
      "2026-04-10 のエリア写真です。",
      "",
      "春が進むにつれて青い花が広がり、足元の彩りが少しずつ増えていきます。",
    ].join("\n"),
    { areaLabel: "玄関前" }
  );

  assert.doesNotMatch(body, /2026-03-28 のエリア写真です/);
  assert.doesNotMatch(body, /2026-04-10 のエリア写真です/);
});

test("generateAreaDescription falls back instead of returning caption-style body", async function () {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async function () {
    callCount += 1;
    const text =
      callCount === 1
        ? "玄関前の白い壁を背景に、季節の彩りが見えるエリアです。"
        : "2026-03-28 のエリア写真です。\n\n2026-04-10 のエリア写真です。";
    return {
      ok: true,
      json: async function () {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: text }],
              },
            },
          ],
        };
      },
    };
  };

  try {
    const result = await areaDescriptionAi.generateAreaDescription({
      apiKey: "test-key",
      areaLabel: "玄関前",
      timelineRecords: [
        {
          recordedDate: "2026-03-28",
          note: "鉢植えの足元に青い花が見え始めた",
          photoCount: 1,
          photoMemos: ["白い壁の前で青い花が目立ち始めた"],
        },
        {
          recordedDate: "2026-04-10",
          note: "花の広がりが増して足元が明るく見える",
          photoCount: 1,
          photoMemos: ["春が進み青い花の面積が広がった"],
        },
      ],
      imageEntries: [
        {
          imageBase64: "ZmFrZQ==",
          imageMimeType: "image/jpeg",
          label: "写真1",
        },
      ],
    });

    assert.equal(callCount, 3);
    assert.match(result.summary, /玄関前/);
    assert.ok(result.body.length >= 120);
    assert.doesNotMatch(result.body, /エリア写真です/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildFallbackAreaBody ignores generic ai photo-comment phrases", function () {
  const body = areaDescriptionAi.buildFallbackAreaBody({
    areaLabel: "玄関前",
    timelineRecords: [
      {
        recordedDate: "2026-03-28",
        note: "白い壁の前で青い花が見え始めた",
        photoMemos: [
          "前回の印象と比べると、見どころが少し増えてきたように見えます。色や形の変化が重なり、季節の進み方まで伝わってくる記録になっています。",
        ],
      },
      {
        recordedDate: "2026-04-10",
        note: "青い花の面積が広がって入口が明るく見える",
        photoMemos: [
          "葉や株の動きが重なり、生育の流れが自然に読み取れる段階です。",
        ],
      },
    ],
  });

  assert.match(body, /白い壁の前で青い花が見え始めた/);
  assert.match(body, /青い花の面積が広がって入口が明るく見える/);
  assert.doesNotMatch(body, /前回の印象と比べると/);
  assert.doesNotMatch(body, /見どころが少し増えてきたように見えます/);
});
