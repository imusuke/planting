const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantDescriptionPrompt includes structure, timeline, and draft hints", function () {
  const prompt = plantDescriptionAi.buildPlantDescriptionPrompt({
    plantName: "ヒューケラ",
    areaLabel: "ウッドデッキ",
    currentSummary: "既存の概要です。",
    currentBody: "既存の本文です。",
    firstRecordedDate: "2026-03-01",
    lastRecordedDate: "2026-04-18",
    timelineRecords: [
      {
        recordedDate: "2026-03-01",
        note: "芽が動き始めた",
        photoCount: 2,
        photoMemos: ["葉の色がやわらかい"],
        recordPlants: ["ヒューケラ", "ミモザ"],
      },
      {
        recordedDate: "2026-04-18",
        note: "花茎が上がってきた",
        photoCount: 3,
        photoMemos: ["株元の密度が増えた", "花の色が見え始めた"],
        recordPlants: ["ヒューケラ"],
      },
    ],
  });

  assert.match(prompt, /対象植栽: ヒューケラ/);
  assert.match(prompt, /エリア: ウッドデッキ/);
  assert.match(prompt, /現在の概要案: 既存の概要です。/);
  assert.match(prompt, /記録1: 2026-03-01/);
  assert.match(prompt, /記録2: 2026-04-18/);
  assert.match(prompt, /一般的な特徴や見どころ/);
  assert.match(prompt, /春・夏・秋・冬/);
  assert.match(prompt, /時系列ストーリー/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"body"/);
});

test("parsePlantDescriptionResponse extracts JSON from fenced block", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "```json",
      '{"summary":"葉の重なりが増え、春の後半に向けてヒューケラらしいまとまりがはっきりしてきました。花茎の動きも見え始め、変化を追いやすい時期です。","body":"ヒューケラは葉色の変化や株元のまとまりを楽しめる植栽で、季節の進み方が姿に出やすいのが魅力です。\\n\\n春は株元の蒸れを避けながら古い葉を軽く整理し、夏は乾きすぎと強い西日を避けて葉傷みを防ぎます。秋は株の充実を見ながら混み合った部分を整え、冬は傷んだ葉を少しずつ外して寒さの中でも株元の風通しを保ちます。\\n\\n記録の初期では葉色がやわらかく、株元はまだ静かな印象でした。そこから日を追うごとに葉の重なりが増え、地際の密度が少しずつ上がっています。途中の写真では花茎が立ち上がり、最新の写真では色の濃淡や花茎の数にも変化があり、この場所で育つヒューケラの季節の進み方がよく伝わってきます。"}',
      "```",
    ].join("\n")
  );

  assert.match(parsed.summary, /ヒューケラ/);
  assert.match(parsed.body, /春は/);
  assert.match(parsed.body, /記録の初期/);
});

test("parsePlantDescriptionResponse falls back to labeled plain text", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "概要: 葉の重なりが増え、春の後半に向けて株のまとまりがはっきりしてきました。花茎の動きも見え始め、変化を追いやすい時期です。",
      "",
      "本文:",
      "ヒューケラは葉色の変化や株元のまとまりを楽しめる植栽で、季節の進み方が姿に出やすいのが魅力です。",
      "",
      "春は株元の蒸れを避けながら古い葉を軽く整理し、夏は乾きすぎと強い西日を避けて葉傷みを防ぎます。秋は株の充実を見ながら混み合った部分を整え、冬は傷んだ葉を少しずつ外して寒さの中でも株元の風通しを保ちます。",
      "",
      "記録の初期では葉色がやわらかく、株元はまだ静かな印象でした。そこから日を追うごとに葉の重なりが増え、最新の写真では花茎の動きも加わって、この場所で育つヒューケラの変化が一段伝わりやすくなっています。",
    ].join("\n")
  );

  assert.match(parsed.summary, /株のまとまり/);
  assert.match(parsed.body, /春は/);
  assert.match(parsed.body, /記録の初期/);
});

test("parsePlantDescriptionResponse falls back to plain prose", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    "ヒューケラは葉色の変化や株元のまとまりを楽しめる植栽で、季節の進み方が姿に出やすいのが魅力です。春は株元の蒸れを避けながら古い葉を軽く整理し、夏は乾きすぎと強い西日を避けて葉傷みを防ぎます。秋は株の充実を見ながら混み合った部分を整え、冬は傷んだ葉を少しずつ外して寒さの中でも株元の風通しを保ちます。記録の初期では葉色がやわらかく、株元はまだ静かな印象でした。そこから日を追うごとに葉の重なりが増え、最新の写真では花茎の動きも加わって、この場所で育つヒューケラの変化が一段伝わりやすくなっています。"
  );

  assert.ok(parsed.summary.length >= 40);
  assert.match(parsed.body, /夏は/);
  assert.match(parsed.body, /最新の写真/);
});
