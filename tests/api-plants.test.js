const test = require("node:test");
const assert = require("node:assert/strict");

const plantsApi = require("../api/plants.js");

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

test("buildCatalogResponse keeps edited plant list while merging missing areas", function () {
  const defaultAreas = [
    { id: "alpha", label: "Alpha", plants: ["keep-me", "default-only"] },
    { id: "beta", label: "Beta", plants: ["beta-plant"] },
  ];
  const fromKv = {
    areas: [{ id: "alpha", label: "Alpha", plants: ["keep-me"] }],
  };

  const result = plantsApi._test.buildCatalogResponse(fromKv, defaultAreas);

  assert.equal(result.source, "kv");
  assert.deepEqual(result.areas, [
    { id: "alpha", label: "Alpha", plants: ["keep-me"] },
    { id: "beta", label: "Beta", plants: ["beta-plant"] },
  ]);
});

test("applyAreaIdMigrations and applyAreaRenamesToRecord rewrite historical records", function () {
  const original = {
    id: "rec-1",
    areaId: "old-area",
    areaLabel: "Old Area",
    plants: ["old-name", "other", "old-name"],
  };

  const migrated = plantsApi._test.applyAreaIdMigrations(
    [original],
    [{ from: "old-area", to: "new-area" }],
    { "new-area": "New Area" }
  )[0];

  const renamed = plantsApi._test.applyAreaRenamesToRecord(migrated, [
    { areaId: "new-area", from: "old-name", to: "new-name" },
  ]);

  assert.equal(renamed.areaId, "new-area");
  assert.equal(renamed.areaLabel, "New Area");
  assert.deepEqual(renamed.plants, ["new-name", "other"]);
});

test("GET handler returns file catalog when KV is empty", async function () {
  try {
    plantsApi._test.setKvClient({
      get: async function () {
        return null;
      },
      set: async function () {},
    });
    const req = { method: "GET", headers: {} };
    const res = createMockRes();

    await plantsApi(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, "file");
    assert.ok(Array.isArray(res.body.areas));
    assert.ok(res.body.areas.length > 0);
  } finally {
    plantsApi._test.resetKvClient();
  }
});
