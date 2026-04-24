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

test("prompt frames user notes as supporting context instead of overriding the photo", function () {
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "deck",
    recordedDate: "2026-04-18",
    plantNames: ["heuchera"],
    userInstruction: "花色の濃淡を中心に見てほしい",
  });

  assert.ok(prompt.includes("その意図をできるだけ本文へ反映しつつ"));
  assert.ok(prompt.includes("写真そのものの見どころとして自然に読めるコメント"));
});

test("prompt includes optional user instruction when supplied", function () {
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "deck",
    recordedDate: "2026-04-18",
    plantNames: ["heuchera"],
    userInstruction: "花色の濃淡を中心に見てほしい",
  });

  assert.match(prompt, /見てほしい点/);
  assert.match(prompt, /見てほしい観点の要約: 花色、濃淡/);
  assert.doesNotMatch(prompt, /花色の濃淡を中心に見てほしい/);
});

test("prompt strips comparison wording from user instruction summary", function () {
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "deck",
    recordedDate: "2026-04-18",
    plantNames: ["heuchera"],
    userInstruction: "前回より花色の濃淡の違いを中心に見てほしい",
  });

  assert.match(prompt, /見てほしい観点の要約: 花色、濃淡/);
  assert.doesNotMatch(prompt, /前回より|違いを中心に見てほしい/);
});

test("prompt tells ai to analyze from the user's viewpoint", function () {
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "deck",
    recordedDate: "2026-04-18",
    plantNames: ["heuchera"],
    userInstruction: "花色の濃淡を中心に見てほしい",
  });

  assert.ok(prompt.includes("写真の中で確かめられる根拠"));
  assert.ok(prompt.includes("要望の文をなぞるのではなく"));
  assert.ok(prompt.includes("花色、濃淡"));
});

test("prompt omits optional user instruction line when blank", function () {
  const prompt = photoAi.buildGrowthPhotoCommentPrompt({
    areaLabel: "deck",
    recordedDate: "2026-04-18",
    plantNames: ["heuchera"],
    userInstruction: "   ",
  });

  assert.doesNotMatch(prompt, /見てほしい点/);
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
  assert.match(result, /ミモザ/);
  assert.doesNotMatch(result, /前回|前より|前の記録/);
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

test("buildFallbackGrowthPhotoComment clears minimum length for sparse context", function () {
  const comment = photoAi.buildFallbackGrowthPhotoComment({
    areaLabel: "玄関前",
    recordedDate: "2026-04-18",
    plantNames: ["アジサイ"],
    photoIndex: 1,
    photoCount: 1,
  });

  assert.ok(comment.length >= photoAi.COMMENT_MIN_LENGTH);
  assert.equal(photoAi.getValidationError(comment, { currentPhotoMemo: "" }), "");
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
    assert.ok(
      prompts.some(function (prompt) {
        return /最終校正してください/.test(prompt);
      })
    );
    assert.match(prompts[2], /最終校正してください/);
    assert.match(prompts[2], /送り仮名、助詞、漢字の使い分け/);
    assert.match(prompts[3], /返答は必ず次のJSONだけにしてください/);
    assert.ok(temperatures[2] < temperatures[0]);
    assert.ok(temperatures[3] <= temperatures[2]);
    assert.equal(photoAi.getValidationError(result.comment, { currentPhotoMemo: "" }), "");
    assert.match(result.comment, /葉先|株元|やわらかな表情/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment splits user-instructed drafting into plan and writing passes", async function () {
  const originalFetch = global.fetch;
  const prompts = [];
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);

      const text =
        call === 1
          ? JSON.stringify({
              requestedViewpoint: "花色の濃淡を、株全体の見え方と結びつけて追う",
              observations: [
                "淡い花と濃い花が隣り合い、色の差が画面の中で見分けやすい",
                "株元から細い花茎が立ち上がり、先端に小さな花が集まっている",
              ],
              closingAngle: "色の重なりが、この株の見頃の入り方を感じさせる",
            })
        : call === 2
          ? "淡い花と少し濃い花が隣り合い、画面の中で花色の差が自然に見比べやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出てきました。色の重なり方から、この株が見頃へ入り始めた流れも静かに感じ取れます。"
          : call === 3
            ? "淡い花と少し濃い花が隣り合い、画面の中で花色の差が自然に見比べやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出てきました。色の重なり方から、この株が見頃へ入り始めた流れも静かに感じ取れます。"
            : JSON.stringify({
                ok: true,
                issues: [],
                revisedComment:
                  "淡い花と少し濃い花が隣り合い、画面の中で花色の差が自然に見比べやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出てきました。色の重なり方から、この株が見頃へ入り始めた流れも静かに感じ取れます。",
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
        areaLabel: "ウッドデッキ",
        recordedDate: "2026-04-18",
        plantNames: ["ヒューケラ"],
        userInstruction: "花色の濃淡を中心に見てほしい",
        photoIndex: 2,
        photoCount: 10,
      },
    });

    assert.equal(call, 4);
    assert.match(prompts[0], /観察設計図/);
    assert.match(prompts[0], /まだ完成コメントは書かないでください/);
    assert.doesNotMatch(prompts[0], /comparison|前回比較/);
    assert.match(prompts[1], /観察設計図をもとに/);
    assert.match(prompts[1], /見てほしい点の解釈:/);
    assert.match(prompts[1], /花色の濃淡/);
    assert.doesNotMatch(prompts[1], /前回比較:|前回写真メモ:/);
    assert.match(result.comment, /花色の差/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment repairs a meta observation plan before drafting", async function () {
  const originalFetch = global.fetch;
  const prompts = [];
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);

      const text =
        call === 1
          ? JSON.stringify({
              requestedViewpoint: "アピールしたい写真や照らされた植栽に目を向ける",
              observations: [
                "アピールしたい写真",
                "照らされた植栽",
              ],
              closingAngle: "コメントとしてまとめやすい",
            })
        : call === 2
          ? JSON.stringify({
              requestedViewpoint: "下から当たる光で葉先の見え方がどう変わるかを追う",
              observations: [
                "細い枝の先で小さな葉が開き始め、光を受けた輪郭が見分けやすい",
                "葉先ごとに向きが少しずつ違い、枝先の動きに細かな差が出ている",
              ],
              closingAngle: "光の当たり方が、この株の立ち上がりをいつもより印象深く見せている",
            })
          : call === 3
            ? "細い枝の先で小さな葉が開き始め、下から当たる光で葉先の輪郭が見分けやすくなっています。葉先ごとに向きが少しずつ違うため、枝先の動きに細かな差が出ていることも自然に追えます。光の当たり方が、この株の立ち上がりをいつもより印象深く見せています。"
            : call === 4
              ? "細い枝の先で小さな葉が開き始め、下から当たる光で葉先の輪郭が見分けやすくなっています。葉先ごとに向きが少しずつ違うため、枝先の動きに細かな差が出ていることも自然に追えます。光の当たり方が、この株の立ち上がりをいつもより印象深く見せています。"
              : JSON.stringify({
                  ok: true,
                  issues: [],
                  revisedComment:
                    "細い枝の先で小さな葉が開き始め、下から当たる光で葉先の輪郭が見分けやすくなっています。葉先ごとに向きが少しずつ違うため、枝先の動きに細かな差が出ていることも自然に追えます。光の当たり方が、この株の立ち上がりをいつもより印象深く見せています。",
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
        areaLabel: "ウッドデッキ",
        recordedDate: "2026-04-18",
        plantNames: ["ヒューケラ"],
        userInstruction: "下からの光で葉先がどう見えるかを見てほしい",
        photoIndex: 2,
        photoCount: 10,
      },
    });

    assert.ok(call >= 5);
    assert.match(prompts[1], /観察設計図は不適切だったので/);
    assert.match(prompts[1], /メタ表現/);
    assert.doesNotMatch(result.comment, /アピール/);
    assert.doesNotMatch(result.comment, /コメント/);
    assert.match(result.comment, /光|葉先|輪郭/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment repairs a comparison observation plan before drafting", async function () {
  const originalFetch = global.fetch;
  const prompts = [];
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);

    const text =
      call === 1
        ? JSON.stringify({
            requestedViewpoint: "前回より花色の濃淡がどう変わったかを追う",
            observations: [
              "前回より淡い花と濃い花の違いが見えやすい",
              "前回より株元から細い花茎が立ち上がって見える",
            ],
            closingAngle: "前回からの変化がこの一枚でも伝わる",
          })
        : call === 2
          ? JSON.stringify({
              requestedViewpoint: "淡い花と濃い花の出方を画面の中で追う",
              observations: [
                "淡い花と濃い花が隣り合い、花色の差が画面の中で見分けやすい",
                "株元から細い花茎が立ち上がり、先端に小さな花が集まっている",
              ],
              closingAngle: "色の重なりが、この株の見どころを静かに支えている",
            })
          : call === 3
            ? "淡い花と濃い花が隣り合い、画面の中で花色の差が自然に見分けやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出ています。色の重なりが、この株らしい見どころを静かに支えています。"
            : call === 4
              ? "淡い花と濃い花が隣り合い、画面の中で花色の差が自然に見分けやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出ています。色の重なりが、この株らしい見どころを静かに支えています。"
              : JSON.stringify({
                  ok: true,
                  issues: [],
                  revisedComment:
                    "淡い花と濃い花が隣り合い、画面の中で花色の差が自然に見分けやすくなっています。株元から細い花茎が立ち上がり、先端に集まる小さな花まで追えるので、株全体の見え方にも奥行きが出ています。色の重なりが、この株らしい見どころを静かに支えています。",
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
        areaLabel: "ウッドデッキ",
        recordedDate: "2026-04-18",
        plantNames: ["ヒューケラ"],
        userInstruction: "前回より花色の濃淡がどう見えるかを踏まえてほしい",
        photoIndex: 2,
        photoCount: 10,
      },
    });

    assert.ok(call >= 5);
    assert.match(prompts[1], /設計図は不適切だったので/);
    assert.match(prompts[1], /今回の写真だけを対象/);
    assert.doesNotMatch(result.comment, /前回/);
    assert.match(result.comment, /花色|濃い花|淡い花/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment ignores reference images for current-photo-only comments", async function () {
  const originalFetch = global.fetch;
  const inlineImageCounts = [];
  const promptTexts = [];
  let call = 0;

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    const parts = body.contents[0].parts;
    inlineImageCounts.push(
      parts.filter(function (part) {
        return !!part.inline_data;
      }).length
    );
    promptTexts.push(
      parts
        .map(function (part) {
          return part && typeof part.text === "string" ? part.text : "";
        })
        .filter(Boolean)
        .join("\n")
    );

    const text =
      call === 4
        ? JSON.stringify({
            ok: true,
            issues: [],
            revisedComment:
              "葉先の緑がやわらかく広がり、光を受けた輪郭の差まで写真の中ではっきり見えてきます。株元から先端まで視線が自然につながるので、細かな動きと全体のまとまりを一緒に追いやすい一枚です。明るく見える部分と落ち着いた部分がほどよく並び、この株の表情が素直に伝わります。",
          })
        : "葉先の緑がやわらかく広がり、光を受けた輪郭の差まで写真の中ではっきり見えてきます。株元から先端まで視線が自然につながるので、細かな動きと全体のまとまりを一緒に追いやすい一枚です。明るく見える部分と落ち着いた部分がほどよく並び、この株の表情が素直に伝わります。";

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
      referenceImages: [
        {
          label: "比較用画像1",
          imageBase64: Buffer.from("reference-image").toString("base64"),
          imageMimeType: "image/jpeg",
        },
      ],
      context: {
        areaLabel: "ウッドデッキ",
        recordedDate: "2026-04-18",
        plantNames: ["ヒューケラ"],
        photoIndex: 1,
        photoCount: 3,
      },
    });

    assert.ok(call >= 4);
    assert.ok(
      inlineImageCounts.every(function (count) {
        return count === 1;
      })
    );
    assert.ok(
      promptTexts.every(function (text) {
        return !/比較用画像/.test(text);
      })
    );
    assert.match(result.comment, /葉先|輪郭|株元/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildFallbackGrowthPhotoComment does not echo user instruction verbatim", function () {
  const userInstruction = "花色の濃淡を中心に見てほしい。";
  const comment = photoAi.buildFallbackGrowthPhotoComment({
    areaLabel: "デッキ",
    recordedDate: "2026-04-18",
    plantNames: ["ヒューケラ"],
    userInstruction: userInstruction,
    photoIndex: 1,
    photoCount: 1,
  });

  assert.doesNotMatch(comment, /花色の濃淡を中心に見てほしい/);
  assert.doesNotMatch(comment, /気になっている見方/);
  assert.doesNotMatch(comment, /に目を向けると|見どころが自然に浮かび上がってきます|組み立てやすい/);
  assert.match(comment, /花色|濃淡/);
  assert.equal(photoAi.getValidationError(comment, { currentPhotoMemo: "" }), "");
});

test("getValidationError rejects comments that ignore the user's requested viewpoint", function () {
  const error = photoAi.getValidationError(
    "葉先の緑がやわらかく広がり、株元にも新しい芽の動きが見えてきました。全体の輪郭も少し整っており、枝先から株元まで茎葉の重なり方を落ち着いて追いやすい状態です。次はまとまり方の違いまで見比べると、この株の動きがさらに読み取りやすくなりそうです。",
    {
      userInstruction: "花色の濃淡を中心に見てほしい",
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /見てほしい観点|反映/);
});

test("getValidationError rejects comments that copy user instruction too directly", function () {
  const error = photoAi.getValidationError(
    "花色の濃淡を中心に見てほしいという補足メモの通りに、花色の濃淡を中心に見てほしい場面です。実際にも花色の濃淡を中心に見てほしい印象が続き、葉先の動きや株元のまとまりより先にその文言が前面に出ています。",
    {
      userInstruction: "花色の濃淡を中心に見てほしい",
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /内部向け|補足メモ/);
});

test("getValidationError rejects promotional meta wording in comments", function () {
  const error = photoAi.getValidationError(
    "細い枝の先に小さな葉が開き始め、下から当たる光で輪郭が浮かび上がっています。葉先ごとの向きの違いまで見えていますが、アピールしたい写真に目を向けると、この植栽の変化が自然に伝わるコメントとして整えやすい場面です。",
    {
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /内部向け/);
});

test("getValidationError rejects internal note wording in user-facing comments", function () {
  const error = photoAi.getValidationError(
    "ユーザーが見てほしい点を手がかりにしながら、実際に写っている見どころへ自然につなげて説明しやすい写真です。葉先の重なりや株元のまとまりも見えており、花色の濃淡まで一文の中で説明してしまっています。さらに指示に触れながら、写真メモとしてまとめた形だと書いてしまっています。",
    {
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /内部向け/);
});

test("getValidationError rejects generic internal bridge phrasing", function () {
  const error = photoAi.getValidationError(
    "気になっている見方を手がかりにしながら、実際に写っている見どころへ自然につなげて説明しやすい写真です。葉先の広がりや株元のまとまりにも触れていますが、読み手に向けたコメントではなく内部の下書き説明のまま残っています。",
    {
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /内部向け/);
});

test("getValidationError rejects bridge phrasing without explicit meta nouns", function () {
  const error = photoAi.getValidationError(
    "花色に目を向けると、今回の写真で押さえたい見どころが自然に浮かび上がってきます。葉の重なりや株元のまとまりも見えていますが、全体としては説明しやすい場面だという書き方に寄っています。枝先の向きや外側への広がりまで触れているものの、写真そのものより説明の運び方が前面に出ています。",
    {
      currentPhotoMemo: "",
    }
  );

  assert.match(error, /内部向け/);
});

test("normalizeComment strips image embed code from AI output", function () {
  const comment = photoAi.normalizeComment(
    [
      "![花の写真](https://example.com/flower.png)",
      "<img src=\"https://example.com/flower.jpg\" alt=\"flower\">",
      "淡い花色が重なって見え、株元から先端へ視線が流れる一枚です。",
    ].join("\n")
  );

  assert.doesNotMatch(comment, /!\[/);
  assert.doesNotMatch(comment, /<img/i);
  assert.match(comment, /淡い花色/);
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
    assert.match(result.comment, /色の移り変わり|やわらかな表情|葉先の動き/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment falls back when all ai drafts stay too short", async function () {
  const originalFetch = global.fetch;
  let call = 0;

  global.fetch = async function () {
    call += 1;
    const text = call === 4
      ? JSON.stringify({
          ok: false,
          issues: ["too_short"],
          revisedComment: "葉が少し伸びています。",
        })
      : "葉が少し伸びています。";

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
        areaLabel: "玄関前",
        recordedDate: "2026-04-20",
        plantNames: ["アジサイ"],
        photoIndex: 1,
        photoCount: 1,
      },
    });

    assert.ok(call >= 4);
    assert.ok(result.comment.length >= photoAi.COMMENT_MIN_LENGTH);
    assert.equal(photoAi.getValidationError(result.comment, { currentPhotoMemo: "" }), "");
    assert.equal(photoAi.getJapaneseNaturalnessError(result.comment, { currentPhotoMemo: "" }), "");
  } finally {
    global.fetch = originalFetch;
  }
});

test("generateGrowthPhotoComment rewrites when manual refresh stays too close to old memo", async function () {
  const originalFetch = global.fetch;
  const prompts = [];
  let call = 0;
  const previousMemo =
    "枝先の桃色の花が厚く重なり、外側へゆるく弧を描く流れが写真でもはっきり見えます。濃い花と淡い花が隣り合うため、ふくらみ方の違いまで追いやすく、株全体の華やぎが前へ出てきた印象です。花の密度と枝先の曲線が重なり、この株の勢いが素直に伝わります。";
  const rewrittenMemo =
    "先端に集まった花がやわらかく持ち上がり、枝先ごとに見え方の差が出てきたことが写真から素直に読めます。濃い桃色の花と少し淡い花が隣り合うので、ふくらみの進み具合までひと目で追え、株全体の華やぎが前へ出てきました。花のまとまりと枝先の流れがそろって見え、この株らしい勢いがよく伝わります。";

  global.fetch = async function (_url, options) {
    call += 1;
    const body = JSON.parse(options.body);
    prompts.push(body.contents[0].parts[0].text);

    const text =
      call === 1
        ? previousMemo
        : call === 2
          ? previousMemo
          : call === 3
            ? JSON.stringify({
                ok: true,
                issues: [],
                revisedComment: previousMemo,
              })
            : rewrittenMemo;

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
      forceFreshRewrite: true,
      forceRewriteAgainstMemo: previousMemo,
      context: {
        areaLabel: "ウッドデッキ",
        recordedDate: "2026-04-11",
        plantNames: ["グレヴィレア・プーリンダ・ロイヤルマントル"],
        photoIndex: 3,
        photoCount: 129,
      },
    });

    assert.ok(call >= 4);
    assert.notEqual(result.comment, previousMemo);
    assert.equal(photoAi.isMemoTooSimilar(previousMemo, result.comment), false);
  } finally {
    global.fetch = originalFetch;
  }
});
