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

test("buildPlantSummaryPrompt asks for a short single-paragraph overview", function () {
  const prompt = plantDescriptionAi.buildPlantSummaryPrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽吹きが見え始めた", photoCount: 1 }],
  });

  assert.match(prompt, /概要だけ/);
  assert.match(prompt, /45〜110文字/);
  assert.match(prompt, /引用符、見出し、JSON/);
});

test("buildPlantTitlePrompt asks for a short heading-like title", function () {
  const prompt = plantDescriptionAi.buildPlantTitlePrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽吹きが見え始めた", photoCount: 1 }],
  });

  assert.match(prompt, /タイトルだけ/);
  assert.match(prompt, /10〜48文字/);
  assert.match(prompt, /見出しとして読みやすい一行/);
});

test("buildPlantBodyPrompt asks for three headed paragraphs", function () {
  const prompt = plantDescriptionAi.buildPlantBodyPrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽吹きが見え始めた", photoCount: 1 }],
  });

  assert.match(prompt, /【一般的な特徴】/);
  assert.match(prompt, /【季節ごとの手入れ】/);
  assert.match(prompt, /【この場所での変遷】/);
  assert.match(prompt, /420〜900文字/);
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

test("normalizeGeneratedPlantSummary shortens an overlong summary to a readable overview", function () {
  const summary = plantDescriptionAi.normalizeGeneratedPlantSummary(
    "初夏の彩りとして親しまれるアジサイ。谷津畑では、春の訪れとともに細い枝先から瑞々しい若葉が次々と芽吹き、日ごとに力強い緑のボリュームを増していく生命力あふれる姿が見どころです。アジサイは、日本の初夏を象徴する花木として古くから親しまれています。"
  );

  assert.ok(summary.length <= 48);
  assert.match(summary, /アジサイ/);
  assert.doesNotMatch(summary, /。$/);
});

test("normalizeGeneratedPlantTitle trims long sentence into short title", function () {
  const title = plantDescriptionAi.normalizeGeneratedPlantTitle(
    'タイトル: "初夏の彩りとして親しまれるアジサイ。谷津畑では若葉が伸びています。"',
    { plantName: "アジサイ", areaLabel: "谷津畑" }
  );

  assert.ok(title.length <= 48);
  assert.doesNotMatch(title, /^タイトル|^"/);
  assert.match(title, /アジサイ/);
});

test("normalizeGeneratedPlantBody rewrites body into three complete sections", function () {
  const body = plantDescriptionAi.normalizeGeneratedPlantBody(
    "アジサイは、日本の初夏を象徴する花木として古くから親しまれています。雨に映える多彩な花色はもちろんのこと、光沢のある大きな葉が重なり合う株姿も魅力です。\n\n春は芽吹きのエネルギーを支えるため、土の乾燥に注意して見守ります。夏は花後の剪定を早めに行い、秋から冬は古い枝や細い枝を整理して風通しを整えます。\n\n2026年3月下旬の谷津畑ではまだ静かな枝ぶりでしたが、その後は葉の重なりが増え、季節の進みとともに見どころが広がってきました。"
  );

  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
  assert.match(body, /。$/);
});

test("buildPlantBodyFromSections assembles the three final sections", function () {
  const body = plantDescriptionAi.buildPlantBodyFromSections({
    general: "アジサイは梅雨前後の移り変わりを楽しめる植栽で、葉の量感や花房の表情が見どころです。",
    care: "春は芽吹き後の枝ぶりを見ながら風通しを整え、夏は花後の剪定を早めに行います。秋から冬は弱った枝を整理して次の芽吹きにつなげます。",
    story: "記録の初期は静かな枝ぶりでしたが、その後は葉の重なりが増え、最新の写真では季節の進みが読み取りやすくなっています。",
  });

  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
});
