const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantDescriptionPrompt includes requested structure, timeline, and draft hints", function () {
  const prompt = plantDescriptionAi.buildPlantDescriptionPrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    currentSummary: "既存の概要です。",
    currentBody: "既存の本文です。",
    firstRecordedDate: "2026-03-01",
    lastRecordedDate: "2026-06-18",
    timelineRecords: [
      {
        recordedDate: "2026-03-01",
        note: "芽吹きが見え始めた",
        photoCount: 2,
        photoMemos: ["葉色がやわらかい"],
        recordPlants: ["アジサイ", "ソラマメ"],
      },
      {
        recordedDate: "2026-06-18",
        note: "花房の色が見えてきた",
        photoCount: 3,
        photoMemos: ["株元の密度が増えた", "花の色が濃くなった"],
        recordPlants: ["アジサイ"],
      },
    ],
  });

  assert.match(prompt, /対象植栽: アジサイ/);
  assert.match(prompt, /エリア: 谷津畑/);
  assert.match(prompt, /現在の概要案: 既存の概要です。/);
  assert.match(prompt, /記録1: 2026-03-01/);
  assert.match(prompt, /記録2: 2026-06-18/);
  assert.match(prompt, /一般的な特徴/);
  assert.match(prompt, /春・夏・秋・冬/);
  assert.match(prompt, /時系列写真の中でどう変わってきたか/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"body"/);
});

test("parsePlantDescriptionResponse extracts JSON from fenced block", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "```json",
      '{"summary":"初夏に向かって葉の勢いが増し、この場所で育つアジサイらしい厚みのある株姿が見えてきました。花の気配も加わり、これからの変化が楽しみな段階です。","body":"アジサイは季節が進むにつれて葉の量感や花房の表情がはっきり変わる植栽で、梅雨前後の移り変わりを楽しめるのが魅力です。谷津畑でも、株元から立ち上がる枝と葉の広がりが見どころになっています。\\n\\n春は芽吹きのあとに混み合った古枝を見ながら風通しを整え、夏は乾きすぎを防ぎつつ西日と蒸れを避けるのが大切です。秋は株の姿を見ながら来季に向けて弱った枝を整理し、冬は落葉後の骨格を確認しながら無理のない剪定につなげます。\\n\\n記録の初期では芽吹きの動きが中心で、株全体はまだ静かな印象でした。そこから葉の重なりが増え、枝先の広がりに厚みが出てきて、最新の写真では花房の色や気配まで読み取れるようになっています。この場所で育つアジサイが、春の芽吹きから初夏の見どころへ向かって少しずつ表情を変えてきた流れが伝わります。"}',
      "```",
    ].join("\n")
  );

  assert.match(parsed.summary, /アジサイ/);
  assert.match(parsed.body, /春は/);
  assert.match(parsed.body, /記録の初期/);
});

test("parsePlantDescriptionResponse falls back to labeled plain text", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "概要: 葉の勢いが増し、この場所で育つアジサイらしい厚みのある株姿が見えてきました。花の気配も加わり、これからの変化が楽しみな段階です。",
      "",
      "本文:",
      "アジサイは季節が進むにつれて葉の量感や花房の表情がはっきり変わる植栽で、梅雨前後の移り変わりを楽しめるのが魅力です。",
      "",
      "春は芽吹きのあとに混み合った古枝を見ながら風通しを整え、夏は乾きすぎを防ぎつつ西日と蒸れを避けるのが大切です。秋は株の姿を見ながら来季に向けて弱った枝を整理し、冬は落葉後の骨格を確認しながら無理のない剪定につなげます。",
      "",
      "記録の初期では芽吹きの動きが中心で、株全体はまだ静かな印象でした。そこから葉の重なりが増え、最新の写真では花房の色や気配まで読み取れるようになっています。",
    ].join("\n")
  );

  assert.match(parsed.summary, /アジサイ/);
  assert.match(parsed.body, /春は/);
  assert.match(parsed.body, /記録の初期/);
});

test("parsePlantDescriptionResponse falls back to plain prose", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    "アジサイは季節が進むにつれて葉の量感や花房の表情がはっきり変わる植栽で、梅雨前後の移り変わりを楽しめるのが魅力です。春は芽吹きのあとに混み合った古枝を見ながら風通しを整え、夏は乾きすぎを防ぎつつ西日と蒸れを避けるのが大切です。秋は株の姿を見ながら来季に向けて弱った枝を整理し、冬は落葉後の骨格を確認しながら無理のない剪定につなげます。記録の初期では芽吹きの動きが中心で、株全体はまだ静かな印象でした。そこから葉の重なりが増え、最新の写真では花房の色や気配まで読み取れるようになっています。"
  );

  assert.ok(parsed.summary.length >= 40);
  assert.match(parsed.body, /夏は/);
  assert.match(parsed.body, /最新の写真/);
});

test("parsePlantDescriptionResponse salvages malformed json-like response", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    '{"summary":"初夏の訪れを告げるアジサイ。谷津畑では、春の芽吹きから力強い葉の展開へと移り変わり、日ごとに瑞々しい緑のボリュームを増しています。","body":"アジサイは季節が進むにつれて葉の量感や花房の表情がはっきり変わる植栽です。\\n\\n春は芽吹きのあとに混み合った古枝を見ながら風通しを整え、夏は乾きすぎを防ぎつつ西日と蒸れを避けるのが大切です。\\n\\n2026年3月下旬の谷津畑ではまだ静かな株姿でしたが、その後は葉の重なりが増え、季節の進みとともに見どころが広がってきました。"'
  );

  assert.match(parsed.summary, /アジサイ/);
  assert.doesNotMatch(parsed.summary, /^\s*\{/);
  assert.doesNotMatch(parsed.summary, /"summary"/);
  assert.match(parsed.body, /春は/);
  assert.doesNotMatch(parsed.body, /^\s*\{/);
  assert.doesNotMatch(parsed.body, /"body"/);
});

test("parsePlantDescriptionResponse strips json-like wrapper noise before prose fallback", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    '{ "summary": "初夏の訪れを告げるアジサイ。谷津畑では葉の重なりが増えています。", "body": "アジサイは梅雨前後の移り変わりを楽しめる植栽です。春は芽吹きのあとに古枝を整え、夏は乾きすぎと蒸れを避けます。秋は株姿を見ながら弱った枝を整理し、冬は落葉後の骨格を見て剪定につなげます。記録の初期では静かな枝ぶりでしたが、最新の写真では葉の量感が増して季節の進みが読み取りやすくなっています。" }'
  );

  assert.match(parsed.summary, /アジサイ/);
  assert.doesNotMatch(parsed.summary, /"summary"|^\s*\{/);
  assert.match(parsed.body, /最新の写真/);
  assert.doesNotMatch(parsed.body, /"body"|^\s*\{/);
});

test("parsePlantDescriptionResponse strips leading quotes and escaped newlines from json-like fields", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      'タイトル：',
      '"初夏の訪れを告げるアジサイ。谷津畑では、春の芽吹きから力強い葉の展開へと移り変わり、日ごとに瑞々しい緑のボリュームを増しています。"',
      "",
      '詳細メモ：',
      '"アジサイは、日本の初夏を彩る代表的な花木として親しまれています。\\n\\n美しい姿を保つためには、季節ごとの丁寧な手入れが欠かせません。\\n\\n記録の初期では芽吹きの動きが中心でしたが、最新の写真では葉の量感が増しています。"'
    ].join("\n")
  );

  assert.doesNotMatch(parsed.summary, /^"/);
  assert.match(parsed.summary, /アジサイ/);
  assert.match(parsed.body, /美しい姿を保つためには/);
  assert.match(parsed.body, /記録の初期/);
  assert.doesNotMatch(parsed.body, /\\n/);
  assert.doesNotMatch(parsed.body, /^"/);
});
