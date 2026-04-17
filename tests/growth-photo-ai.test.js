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

test("fragmentary broken memo is not preserved in prompt context", function () {
  const brokenMemo =
    "ウッドデッキの鉢から伸びた細い花茎の先に、星。細かな花びらの先が星のように開き、淡いピンク色の濃淡。細かな花びらの先が星のように開き、淡いピンクから。ウッドデッキの鉢から細い花茎が何本も立ち上がり。ウッドデッキで育つツボサンゴの株元から細い花。";
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "ウッドデッキ",
    recordedDate: "2026-04-11",
    plantNames: ["ヒューケラ（ツボサンゴ）"],
    currentPhotoMemo: brokenMemo,
    previousPhotoMemo: brokenMemo,
  });

  assert.doesNotMatch(prompt, /既存の写真メモ:/);
  assert.doesNotMatch(prompt, /前回写真メモ:/);
  assert.doesNotMatch(prompt, /ウッドデッキの鉢から伸びた細い花茎の先に、星/);
});

test("shouldReplaceMemoWithFallback detects broken caption-style memo", function () {
  const brokenMemo =
    "ウッドデッキの鉢から伸びた細い花茎の先に、星。細かな花びらの先が星のように開き、淡いピンク色の濃淡。細かな花びらの先が星のように開き、淡いピンクから。ウッドデッキの鉢から細い花茎が何本も立ち上がり。ウッドデッキで育つツボサンゴの株元から細い花。ウッドデッキで過ごすヒューケラの株元から細く伸び。ウッドデッキで育てているツボサンゴの株元から細い花。細い花茎の先に星のような形をした淡いピンク色の小さな。";

  assert.equal(
    photoAi.shouldReplaceMemoWithFallback(brokenMemo, {
      areaLabel: "ウッドデッキ",
      recordedDate: "2026-04-11",
      plantNames: ["ヒューケラ（ツボサンゴ）"],
      photoIndex: 2,
      photoCount: 129,
    }),
    true
  );
});

test("buildFallbackGrowthPhotoComment returns natural japanese for broken context", function () {
  const comment = photoAi.buildFallbackGrowthPhotoComment({
    areaLabel: "ウッドデッキ",
    recordedDate: "2026-04-11",
    plantNames: ["ヒューケラ（ツボサンゴ）"],
    currentPhotoMemo:
      "ウッドデッキの鉢から伸びた細い花茎の先に、星。細かな花びらの先が星のように開き、淡いピンク色の濃淡。細かな花びらの先が星のように開き、淡いピンクから。",
    photoIndex: 2,
    photoCount: 129,
  });

  assert.equal(photoAi.getValidationError(comment, { currentPhotoMemo: "" }), "");
  assert.equal(photoAi.getJapaneseNaturalnessError(comment, { currentPhotoMemo: "" }), "");
});

test("isMemoTooSimilar detects near-identical broken rewrites", function () {
  const left =
    "鮮やかな濃い桃色の花が、前回よりも。(In。枝先に集まった鮮やかな濃い桃色の花が、くるりと曲線を描。色の濃淡やふくらみ方に季節の進みがにじみます。";
  const right =
    "鮮やかな濃い桃色の花が前回よりも目立ち、枝先に集まった濃い桃色の花がくるりと曲線を描きます。色の濃淡やふくらみ方にも季節の進みがにじみます。";

  assert.equal(photoAi.isMemoTooSimilar(left, right), true);
});

test("getJapaneseNaturalnessError detects repetitive sentence starts", function () {
  const text =
    "ミモザは葉先の伸びが見えています。ミモザは株元にも動きがありそうです。ミモザはこの先も変化が続きそうです。";
  const error = photoAi.getJapaneseNaturalnessError(text, {
    plantNames: ["ミモザ"],
  });

  assert.match(error, /単調|続き/);
});

test("getJapaneseNaturalnessError allows a natural varied comment", function () {
  const text =
    "葉先の緑が少し濃くなり、外側へ開く向きが前よりそろって見えます。株元には新しい動きも重なり、写真全体でミモザの勢いが落ち着いて広がってきたことが伝わります。次の記録では輪郭のまとまりがさらに見えやすくなりそうです。";
  const error = photoAi.getJapaneseNaturalnessError(text, {
    plantNames: ["ミモザ"],
  });

  assert.equal(error, "");
});

test("getJapaneseNaturalnessError detects overused polite progressive endings", function () {
  const text =
    "葉先の緑が前より濃くなって見えています。株元にも新しい芽の動きが出てきています。外側へ広がる向きもそろって見えていて、写真全体で枝先のまとまりも少しずつ整ってきています。花や葉の位置関係も追いやすくなっていて、次の変化を比べる準備もできています。";
  const error = photoAi.getJapaneseNaturalnessError(text, {
    plantNames: ["ミモザ"],
  });

  assert.match(error, /単調/);
});

test("getJapaneseNaturalnessError detects explanatory stock phrases", function () {
  const text =
    "葉先の緑が前より濃く見えます。株元にも新しい動きが出てきていて、全体のまとまりも整ってきています。次の変化も追いやすくなっています。";
  const error = photoAi.getJapaneseNaturalnessError(text, {
    plantNames: ["ミモザ"],
  });

  assert.match(error, /硬く単調|単調/);
});

test("getJapaneseNaturalnessError detects fragmentary caption-style japanese", function () {
  const text =
    "ウッドデッキの鉢から伸びた細い花茎の先に、星。細かな花びらの先が星のように開き、淡いピンク色の濃淡。細かな花びらの先が星のように開き、淡いピンクから。ウッドデッキの鉢から細い花茎が何本も立ち上がり。ウッドデッキで育つツボサンゴの株元から細い花。ウッドデッキで過ごすヒューケラの株元から細く伸び。";
  const error = photoAi.getJapaneseNaturalnessError(text, {
    areaLabel: "ウッドデッキ",
    plantNames: ["ヒューケラ（ツボサンゴ）"],
  });

  assert.match(error, /成立していません|断片的|不自然/);
});

test("generateGrowthPhotoComment runs proofread and final quality review before accepting comment", async function () {
  const originalFetch = global.fetch;
  const prompts = [];
  const temperatures = [];
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);
    temperatures.push(body.generationConfig.temperature);

    const text =
      call === 1
        ? "葉先の緑が前より濃くなって見えています。株元にも新しい芽の動きが出てきています。外側へ広がる向きもそろって見えていて、写真全体で枝先のまとまりも少しずつ整ってきています。花や葉の位置関係も追いやすくなっていて、次の変化を比べる準備もできています。"
        : call === 2
          ? "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いが無理なく伝わってきます。輪郭のまとまりも増しているので、次は厚みの出方まで比べやすくなりそうです。"
          : call === 3
            ? "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いが自然に伝わってきます。輪郭のまとまりも増しているので、次は厚みの出方まで比べやすくなりそうです。"
            : JSON.stringify({
                ok: false,
                issues: ["文末の硬さが少し残っています。"],
                revisedComment:
                  "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いがやわらかく広がっています。輪郭のまとまりも増してきたので、次は厚みや株姿の変化まで見比べやすくなりそうです。",
              });

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
    const result = await photoAi.generateGrowthPhotoComment({
      apiKey: "test-key",
      imageBase64: Buffer.from("fake-image").toString("base64"),
      context: {
        areaLabel: "デッキ",
        recordedDate: "2026-04-20",
        plantNames: ["ミモザ"],
        photoIndex: 1,
        photoCount: 1,
      },
    });

    assert.equal(call, 4);
    assert.match(prompts[1], /日本語として自然で読みやすい文章に整えてください/);
    assert.match(prompts[2], /最終校正してください/);
    assert.match(prompts[2], /送り仮名、助詞、漢字の使い分け/);
    assert.match(prompts[3], /返答は必ず次のJSONだけにしてください/);
    assert.ok(temperatures[2] < temperatures[0]);
    assert.ok(temperatures[3] <= temperatures[2]);
    assert.match(result.comment, /やわらかく広がっています/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment falls back safely when final quality review is not json", async function () {
  const originalFetch = global.fetch;
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;

    const text =
      call === 1
        ? "葉先の緑が前より濃くなって見えています。株元にも新しい芽の動きが出てきています。外側へ広がる向きもそろって見えていて、写真全体で枝先のまとまりも少しずつ整ってきています。花や葉の位置関係も追いやすくなっていて、次の変化を比べる準備もできています。"
        : call === 2
          ? "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いが無理なく伝わってきます。輪郭のまとまりも増しているので、次は厚みの出方まで比べやすくなりそうです。"
          : call === 3
            ? "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いが自然に伝わってきます。輪郭のまとまりも増しているので、次は厚みの出方まで比べやすくなりそうです。"
            : "葉先の緑が前より濃くなり、外側へ開く向きもそろってきました。株元には新しい芽の動きが重なり、株全体の勢いが自然に伝わってきます。輪郭のまとまりも増しているので、次は厚みの出方まで比べやすくなりそうです。";

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
    const result = await photoAi.generateGrowthPhotoComment({
      apiKey: "test-key",
      imageBase64: Buffer.from("fake-image").toString("base64"),
      context: {
        areaLabel: "デッキ",
        recordedDate: "2026-04-20",
        plantNames: ["ミモザ"],
        photoIndex: 1,
        photoCount: 1,
      },
    });

    assert.equal(call, 4);
    assert.match(result.comment, /自然に伝わってきます/);
  } finally {
    global.fetch = originalFetch;
  }
});
