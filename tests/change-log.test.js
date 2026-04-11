const test = require("node:test");
const assert = require("node:assert/strict");

const changeLog = require("../lib/change-log.js");

test("normalizeChangeLogEntry trims text and de-duplicates plant names", function () {
  const entry = changeLog.normalizeChangeLogEntry({
    action: " growth_record_updated ",
    targetType: " growth_record ",
    targetId: " rec-1 ",
    areaId: " deck ",
    areaLabel: " ウッドデッキ ",
    plantName: " ミモザ ",
    plantNames: [" ミモザ ", "ミモザ", "  ", "コルジリネ"],
    detail: " 画像コメントを更新 ",
  });

  assert.equal(entry.action, "growth_record_updated");
  assert.equal(entry.targetType, "growth_record");
  assert.equal(entry.targetId, "rec-1");
  assert.equal(entry.areaId, "deck");
  assert.equal(entry.areaLabel, "ウッドデッキ");
  assert.equal(entry.plantName, "ミモザ");
  assert.deepEqual(entry.plantNames, ["ミモザ", "コルジリネ"]);
  assert.equal(entry.detail, "画像コメントを更新");
  assert.ok(entry.id);
  assert.ok(entry.createdAt);
});

test("appendChangeLog stores newest entries first", async function () {
  const store = { value: null };

  changeLog.setKvClient({
    async get() {
      return store.value;
    },
    async set(key, value) {
      assert.equal(key, changeLog.KV_KEY);
      store.value = value;
    },
  });

  try {
    await changeLog.appendChangeLog({
      id: "older",
      createdAt: "2026-04-11T00:00:00.000Z",
      action: "plant_detail_saved",
      targetType: "plant_detail",
      targetId: "deck:ミモザ",
      areaId: "deck",
      plantName: "ミモザ",
    });

    await changeLog.appendChangeLog({
      id: "newer",
      createdAt: "2026-04-11T01:00:00.000Z",
      action: "growth_record_updated",
      targetType: "growth_record",
      targetId: "rec-2",
      areaId: "deck",
      plantNames: ["ミモザ"],
    });

    const items = await changeLog.readChangeLog(10);
    assert.deepEqual(
      items.map(function (item) {
        return item.id;
      }),
      ["newer", "older"]
    );
  } finally {
    changeLog.resetKvClient();
  }
});
