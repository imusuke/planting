const test = require("node:test");
const assert = require("node:assert/strict");

const areaDescriptionAi = require("../lib/area-description-ai.js");

test("pickEvenlySpacedItems keeps first and last records", function () {
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const picked = areaDescriptionAi.pickEvenlySpacedItems(items, 4);

  assert.deepEqual(picked, ["a", "c", "e", "g"]);
});

test("buildAreaDescriptionPrompt includes timeline and draft hints", function () {
  const prompt = areaDescriptionAi.buildAreaDescriptionPrompt({
    areaLabel: "ウッドデッキ",
    currentSummary: "既存の概要です。",
    currentBody: "既存の本文です。",
    firstRecordedDate: "2026-03-01",
    lastRecordedDate: "2026-04-11",
    timelineRecords: [
      {
        recordedDate: "2026-03-01",
        note: "植え付け直後",
        photoCount: 2,
        photoMemos: ["芽がまだ小さい"],
      },
      {
        recordedDate: "2026-04-11",
        note: "花が増えてきた",
        photoCount: 3,
        photoMemos: ["色の差が見える", "枝先が広がる"],
      },
    ],
  });

  assert.match(prompt, /対象エリア: ウッドデッキ/);
  assert.match(prompt, /現在の概要下書き: 既存の概要です。/);
  assert.match(prompt, /記録1: 2026-03-01/);
  assert.match(prompt, /記録2: 2026-04-11/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"body"/);
});

test("parseAreaDescriptionResponse extracts JSON from fenced block", function () {
  const parsed = areaDescriptionAi.parseAreaDescriptionResponse(
    [
      "```json",
      '{"summary":"春先から花数が増え、エリア全体の表情が少しずつ華やいできました。","body":"三月の記録では株元の動きが静かで、植え付け直後らしい落ち着きが残っています。\\n\\n四月に入ると枝先の広がりと花色の差が見えやすくなり、開花の勢いが前へ出てきました。"}',
      "```",
    ].join("\n")
  );

  assert.equal(
    parsed.summary,
    "春先から花数が増え、エリア全体の表情が少しずつ華やいできました。"
  );
  assert.match(parsed.body, /三月の記録/);
  assert.match(parsed.body, /四月に入ると/);
});
