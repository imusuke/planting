const test = require("node:test");
const assert = require("node:assert/strict");

const plantDescriptionAi = require("../lib/plant-description-ai.js");

test("buildPlantDescriptionPrompt includes structure, timeline, and subjective tone guidance", function () {
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
        note: "芽がふくらみ始めています。",
        photoCount: 2,
        photoMemos: ["枝先に小さな芽が見えます。"],
        recordPlants: ["アジサイ", "ソラマメ"],
      },
      {
        recordedDate: "2026-06-18",
        note: "葉が大きく広がってきました。",
        photoCount: 3,
        photoMemos: ["株のボリュームが増しています。", "葉色が濃くなっています。"],
        recordPlants: ["アジサイ"],
      },
    ],
  });

  assert.match(prompt, /対象植栽: アジサイ/);
  assert.match(prompt, /エリア: 谷津畑/);
  assert.match(prompt, /現在の概要案: 既存の概要です。/);
  assert.match(prompt, /記録1: 2026-03-01/);
  assert.match(prompt, /記録2: 2026-06-18/);
  assert.match(prompt, /主体的に書いてください/);
  assert.match(prompt, /一般的な特徴/);
  assert.match(prompt, /追ってみたくなるストーリー/);
  assert.match(prompt, /"summary"/);
  assert.match(prompt, /"body"/);
});

test("buildPlantSummaryPrompt asks for a short inviting overview", function () {
  const prompt = plantDescriptionAi.buildPlantSummaryPrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽がふくらみ始めています。", photoCount: 1 }],
  });

  assert.match(prompt, /概要だけ/);
  assert.match(prompt, /45〜110文字/);
  assert.match(prompt, /主体的に書いてください/);
  assert.match(prompt, /写真コメント風の言い回しは禁止/);
});

test("buildPlantTitlePrompt asks for a short appealing heading", function () {
  const prompt = plantDescriptionAi.buildPlantTitlePrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽がふくらみ始めています。", photoCount: 1 }],
  });

  assert.match(prompt, /タイトルだけ/);
  assert.match(prompt, /10〜48文字/);
  assert.match(prompt, /見出し/);
  assert.match(prompt, /魅力や見どころがにじむ/);
});

test("buildPlantBodyPrompt asks for three labeled paragraphs in a guided tone", function () {
  const prompt = plantDescriptionAi.buildPlantBodyPrompt({
    plantName: "アジサイ",
    areaLabel: "谷津畑",
    timelineRecords: [{ recordedDate: "2026-03-01", note: "芽がふくらみ始めています。", photoCount: 1 }],
  });

  assert.match(prompt, /【一般的な特徴】/);
  assert.match(prompt, /【季節ごとの手入れ】/);
  assert.match(prompt, /【この場所での変遷】/);
  assert.match(prompt, /420〜900文字/);
  assert.match(prompt, /写真コメント風の言い回しは禁止/);
});

test("parsePlantDescriptionResponse extracts JSON from fenced block", function () {
  const parsed = plantDescriptionAi.parsePlantDescriptionResponse(
    [
      "```json",
      '{"summary":"谷津畑で楽しむアジサイの育ち","body":"【一般的な特徴】\\nアジサイは葉の大きさと株姿の変化を追うほど面白さが増す植栽です。今は芽吹きから葉の広がりへ移る流れが見どころになっています。\\n\\n【季節ごとの手入れ】\\n春は乾きすぎを防ぎながら芽吹きを支え、夏は蒸れた枝葉を整えると株の負担を抑えやすくなります。花後の整理を早めに進めると次の季節への準備もしやすくなります。\\n\\n【この場所での変遷】\\n3月の静かな芽の動きから、6月には葉の量が増えて株全体の厚みが見えてきました。写真を追うほど、この場所での育ち方がよく分かります。"}',
      "```",
    ].join("\n")
  );

  assert.equal(parsed.summary, "谷津畑で楽しむアジサイの育ち");
  assert.match(parsed.body, /【一般的な特徴】/);
  assert.match(parsed.body, /【季節ごとの手入れ】/);
  assert.match(parsed.body, /【この場所での変遷】/);
});

test("normalizeGeneratedPlantTitle trims long prose into a short heading", function () {
  const title = plantDescriptionAi.normalizeGeneratedPlantTitle(
    'タイトル: "谷津畑でゆっくり育ってきたアジサイは、葉の広がりと株姿の変化を追うほど魅力が増していきます。"',
    { plantName: "アジサイ", areaLabel: "谷津畑" }
  );

  assert.ok(title.length <= 48);
  assert.match(title, /アジサイ/);
  assert.doesNotMatch(title, /^タイトル|^"/);
});

test("buildPlantBodyFromSections assembles the three final sections", function () {
  const body = plantDescriptionAi.buildPlantBodyFromSections({
    general:
      "アジサイは葉の重なりや株姿の変化を追うほど魅力が増す植栽です。今は芽吹きの勢いが見どころになっています。",
    care:
      "春は乾きすぎを防ぎ、夏は蒸れた枝葉を整えると株の調子を保ちやすくなります。花後の整理も早めに進めます。",
    story:
      "3月の静かな芽の動きから、6月には葉の量が増えて株全体の厚みが見えてきました。写真を追うほど、この場所での育ち方が分かります。",
  });

  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
});

test("buildPlantBodyWithFallback replaces comment-like section phrasing", function () {
  const body = plantDescriptionAi.buildPlantBodyWithFallback(
    [
      "【一般的な特徴】",
      "アジサイは花色に目を向けると、今回の見どころが自然に浮かび上がってきます。葉の広がりまで説明しやすい場面です。",
      "",
      "【季節ごとの手入れ】",
      "春は乾きすぎを防ぎ、夏は蒸れた枝葉を整えると株の調子を保ちやすくなります。秋から冬は古い枝を軽く整理すると、次の季節の立ち上がりを支えやすくなります。",
      "",
      "【この場所での変遷】",
      "前回の印象と比べると、見どころが少し増えてきたように見えます。色や形の変化が重なり、季節の進み方まで伝わってくる記録です。",
    ].join("\n"),
    {
      plantName: "アジサイ",
      areaLabel: "谷津畑",
      timelineRecords: [
        {
          recordedDate: "2026-03-01",
          note: "芽がふくらみ始めています。",
          photoMemos: ["枝先に小さな芽が見えます。"],
        },
        {
          recordedDate: "2026-06-18",
          note: "葉が大きく広がってきました。",
          photoMemos: ["株のボリュームが増しています。"],
        },
      ],
    }
  );

  assert.match(body, /【一般的な特徴】/);
  assert.match(body, /【季節ごとの手入れ】/);
  assert.match(body, /【この場所での変遷】/);
  assert.doesNotMatch(body, /に目を向けると|見どころが自然に浮かび上がってきます|説明しやすい/);
  assert.doesNotMatch(body, /前回の印象と比べると|季節の進み方まで伝わってくる記録/);
});
