const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantBodyWithFallback fills missing sections from timeline context", function () {
  const body = plantDescriptionAi.buildPlantBodyWithFallback("短すぎる本文", {
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [
      {
        recordedDate: "2026-03-22",
        note: "芽がふくらみ始めています。",
        photoMemos: ["枝先に小さな芽が見えます。"],
      },
      {
        recordedDate: "2026-04-11",
        note: "葉が大きく広がってきました。",
        photoMemos: ["株のボリュームが増しています。"],
      },
    ],
  });

  assert.match(body, /アジサイ/);
  assert.match(body, /谷津畑/);
  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
});

test("buildPlantBodyWithFallback ignores caption-like memo phrases", function () {
  const body = plantDescriptionAi.buildPlantBodyWithFallback("", {
    plantName: "ヒューケラ",
    areaLabel: "ウッドデッキ",
    timelineRecords: [
      {
        recordedDate: "2026-03-22",
        note: "",
        photoMemos: ["前回の印象と比べると、見どころが少し増えてきたように見えます。"],
      },
      {
        recordedDate: "2026-04-11",
        note: "",
        photoMemos: ["2026-04-11 の写真です。"],
      },
    ],
  });

  assert.doesNotMatch(body, /前回の印象と比べると/);
  assert.doesNotMatch(body, /見どころが少し増えてきたように見えます/);
  assert.doesNotMatch(body, /2026-04-11 の写真です/);
  assert.match(body, /ヒューケラ/);
});

test("generatePlantDescription falls back instead of throwing on unreadable body output", async function () {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async function () {
    callCount += 1;
    const text = callCount === 1 ? "谷津畑で楽しむアジサイ" : "短い本文";
    return {
      ok: true,
      json: async function () {
        return {
          candidates: [
            {
              content: {
                parts: [{ text }],
              },
            },
          ],
        };
      },
    };
  };

  try {
    const result = await plantDescriptionAi.generatePlantDescription({
      apiKey: "test-key",
      plantName: "アジサイ",
      areaLabel: "谷津畑",
      timelineRecords: [
        {
          recordedDate: "2026-03-22",
          note: "芽がふくらみ始めています。",
          photoCount: 1,
          photoMemos: ["枝先に小さな芽が見えます。"],
        },
        {
          recordedDate: "2026-04-11",
          note: "葉が大きく広がってきました。",
          photoCount: 2,
          photoMemos: ["株のボリュームが増しています。"],
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

    assert.equal(callCount, 2);
    assert.match(result.summary, /アジサイ/);
    assert.match(result.body, /【一般的な特徴】/);
    assert.match(result.body, /【季節ごとの手入れ】/);
    assert.match(result.body, /【この場所での変遷】/);
  } finally {
    global.fetch = originalFetch;
  }
});
