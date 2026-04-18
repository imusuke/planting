const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantBodyWithFallback fills missing sections from timeline context", function () {
  const body = plantDescriptionAi.buildPlantBodyWithFallback("短い本文です。", {
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [
      {
        recordedDate: "2026-03-22",
        note: "細い枝先に芽が見え始めた",
        photoMemos: ["枝の節にふくらみが見える"],
      },
      {
        recordedDate: "2026-04-11",
        note: "若葉が広がって株元がにぎやかになった",
        photoMemos: ["葉が増えて株の輪郭が見えやすくなった"],
      },
    ],
  });

  assert.match(body, /アジサイ/);
  assert.match(body, /谷津畑/);
  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
});

test("generatePlantDescription falls back instead of throwing on unreadable body output", async function () {
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async function () {
    callCount += 1;
    const text = callCount === 1 ? "谷津畑で育つアジサイ" : "短いです。";
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
    const result = await plantDescriptionAi.generatePlantDescription({
      apiKey: "test-key",
      plantName: "アジサイ",
      areaLabel: "谷津畑",
      timelineRecords: [
        {
          recordedDate: "2026-03-22",
          note: "細い枝先に芽が見え始めた",
          photoCount: 1,
          photoMemos: ["枝の節にふくらみが見える"],
        },
        {
          recordedDate: "2026-04-11",
          note: "若葉が広がって株元がにぎやかになった",
          photoCount: 2,
          photoMemos: ["葉が増えて株の輪郭が見えやすくなった"],
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
