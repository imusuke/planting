const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantDescriptionPrompt includes plant timeline and draft hints", function () {
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
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"body"/);
});

test("parsePlantDescriptionResponse extracts JSON from fenced block", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "```json",
      '{"summary":"株元の葉が密になり、春の後半に向けてヒューケラらしいまとまりが増してきました。花茎の動きも見え始め、変化を追うのが楽しい時期です。","body":"記録の初期では株元の葉色がやわらかく、全体に静かな印象がありました。そこから日を追うごとに葉の重なりが増え、地際の密度が少しずつ上がってきています。\\n\\n途中の写真では花茎が立ち上がり、株の高さの変化がはっきり見えるようになりました。葉だけを見ていた時期から、上方向の動きが加わってきたことで、植栽全体の見どころが広がっています。\\n\\n最新の写真では色の濃淡や花茎の数にも変化があり、春の終わりに向けて一段進んだ姿として読めます。葉のまとまりと花の動きの両方を楽しめる植栽です。"}',
      "```",
    ].join("\n")
  );

  assert.match(parsed.summary, /ヒューケラ/);
  assert.match(parsed.body, /花茎/);
  assert.match(parsed.body, /最新の写真/);
});

test("parsePlantDescriptionResponse falls back to labeled plain text", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "概要: 葉の重なりが増え、春の後半に向けて株のまとまりがはっきりしてきました。花茎の動きも見え始め、変化を追いやすい時期です。",
      "",
      "本文:",
      "記録の初期では葉色がやわらかく、株元はまだ静かな印象でした。そこから日を追うごとに葉の重なりが増え、地際の密度が少しずつ上がっています。",
      "",
      "途中の写真では花茎が立ち上がり、葉だけを見ていた時期から上方向の動きが加わってきました。最新の写真では色の濃淡や花茎の数にも変化があり、春の終わりに向けて一段進んだ姿として読めます。",
    ].join("\n")
  );

  assert.match(parsed.summary, /株のまとまり/);
  assert.match(parsed.body, /途中の写真/);
  assert.match(parsed.body, /最新の写真/);
});

test("parsePlantDescriptionResponse falls back to plain prose", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    "記録の初期では葉色がやわらかく、株元はまだ静かな印象でした。そこから日を追うごとに葉の重なりが増え、地際の密度が少しずつ上がっています。途中の写真では花茎が立ち上がり、葉だけを見ていた時期から上方向の動きが加わってきました。最新の写真では色の濃淡や花茎の数にも変化があり、春の終わりに向けて一段進んだ姿として読めます。"
  );

  assert.ok(parsed.summary.length >= 40);
  assert.match(parsed.body, /花茎/);
  assert.match(parsed.body, /最新の写真/);
});
