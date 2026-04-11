const test = require("node:test");
const assert = require("node:assert/strict");

const photoAi = require("../lib/growth-photo-ai.js");

test("pickStyleProfile varies by context seed", function () {
  const a = photoAi.pickStyleProfile({
    areaLabel: "デッキ",
    recordedDate: "2026-04-10",
    plantNames: ["ミモザ"],
    photoIndex: 1,
  });
  const b = photoAi.pickStyleProfile({
    areaLabel: "谷津畑",
    recordedDate: "2026-04-11",
    plantNames: ["ソラマメ"],
    photoIndex: 3,
  });

  assert.ok(a && a.id);
  assert.ok(b && b.id);
  assert.notEqual(a.id, b.id);
});

test("prompt includes profile-specific guidance", function () {
  const context = {
    areaLabel: "デッキ",
    recordedDate: "2026-04-10",
    plantNames: ["ミモザ"],
    photoIndex: 1,
    previousRecordedDate: "2026-04-01",
  };

  const profile = photoAi.pickStyleProfile(context);
  const prompt = photoAi.buildGrowthPhotoCommentPrompt(context);

  assert.match(prompt, /今回の文体の軸:/);
  assert.ok(prompt.includes(profile.label));
  assert.ok(prompt.includes(profile.example));
});

test("expandCommentToMinimum uses varied fallback sentences from context", function () {
  const result = photoAi.expandCommentToMinimum("", {
    areaLabel: "デッキ",
    recordedDate: "2026-04-10",
    plantNames: ["ミモザ"],
    previousPhotoMemo: "前回は葉が少し開き始めていた。",
    photoIndex: 2,
    photoCount: 4,
  });

  assert.ok(result.length >= photoAi.COMMENT_MIN_LENGTH);
  assert.match(result, /ミモザ|前回/);
});
