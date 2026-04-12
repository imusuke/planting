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

test("expandCommentToMinimum avoids repeating the plant name at each sentence start", function () {
  const result = photoAi.expandCommentToMinimum("", {
    areaLabel: "玄関前",
    recordedDate: "2026-04-10",
    plantNames: ["ノリウツギ"],
    photoIndex: 1,
    photoCount: 1,
  });

  const sentences = (result.match(/[^。！？]+[。！？]?/g) || []).map((part) => part.trim());
  const repeatedPlantStarts = sentences.filter((sentence) => sentence.startsWith("ノリウツギ")).length;

  assert.ok(result.length >= photoAi.COMMENT_MIN_LENGTH);
  assert.ok(repeatedPlantStarts <= 1);
});

test("expandCommentToMinimum differs across contexts for the same plant", function () {
  const a = photoAi.expandCommentToMinimum("", {
    areaLabel: "デッキ",
    recordedDate: "2026-04-10",
    plantNames: ["ミモザ"],
    photoIndex: 1,
    photoCount: 1,
    note: "新芽が増えてきた",
  });
  const b = photoAi.expandCommentToMinimum("", {
    areaLabel: "デッキ",
    recordedDate: "2026-04-18",
    plantNames: ["ミモザ"],
    photoIndex: 2,
    photoCount: 3,
    note: "つぼみがふくらんできた",
    previousRecordedDate: "2026-04-10",
    previousPhotoMemo: "前回は葉先の伸びが目立っていた。",
  });

  assert.notEqual(a, b);
  assert.notEqual(a.slice(0, 28), b.slice(0, 28));
});

test("legacy generic memo is not preserved in prompt context", function () {
  const legacyMemo =
    "ミモザの動きが一枚の中にはっきり出ています。葉の向きや株の広がりからも、生育の勢いが感じられる段階です。前回の印象と比べると、見どころが少し増えてきたように見えます。";
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "デッキ",
    recordedDate: "2026-04-20",
    plantNames: ["ミモザ"],
    currentPhotoMemo: legacyMemo,
    previousPhotoMemo: legacyMemo,
  });

  assert.doesNotMatch(prompt, /既存の写真メモ:/);
  assert.doesNotMatch(prompt, /前回写真メモ:/);
  assert.doesNotMatch(prompt, /見どころが少し増えてきたように見えます/);
});
