const test = require("node:test");
const assert = require("node:assert/strict");

const areaDescriptionAi = require("../lib/area-description-ai.js");

test("area description sanitizers strip image embed code", function () {
  const summary = areaDescriptionAi.normalizePlainText(
    "![overview](https://example.com/area.png) 春から初夏にかけて花色の移り変わりが見やすいエリアです。"
  );
  const body = areaDescriptionAi.normalizeBodyText(
    [
      "<img src=\"https://example.com/area.jpg\" alt=\"area\">",
      "古い記録では株元の静かなまとまりが中心でした。",
      "",
      "![memo](https://example.com/area2.png)",
      "新しい記録では花茎が増え、奥行きの出方まで追いやすくなっています。",
    ].join("\n")
  );

  assert.doesNotMatch(summary, /!\[/);
  assert.doesNotMatch(body, /<img/i);
  assert.match(summary, /春から初夏/);
  assert.match(body, /新しい記録/);
});
