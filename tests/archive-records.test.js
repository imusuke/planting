const test = require("node:test");
const assert = require("node:assert/strict");

const archive = require("../lib/archive-records.js");

test("archiveRecordInList keeps the record but marks it archived", function () {
  const before = [
    { id: "a", note: "keep" },
    { id: "b", note: "archive me" },
  ];

  const result = archive.archiveRecordInList(before, "b", {
    archivedAt: "2026-04-11T01:23:45.000Z",
    reason: "user_archive",
  });

  assert.equal(result.ok, true);
  assert.equal(result.records.length, 2);
  assert.equal(result.record.id, "b");
  assert.equal(result.record.archivedAt, "2026-04-11T01:23:45.000Z");
  assert.equal(result.record.archivedReason, "user_archive");
  assert.deepEqual(
    archive.filterActiveRecords(result.records).map(function (record) {
      return record.id;
    }),
    ["a"]
  );
});

test("findActiveRecordIndex ignores archived records", function () {
  const records = [
    { id: "a", archivedAt: "2026-04-11T00:00:00.000Z" },
    { id: "b" },
  ];

  assert.equal(archive.findRecordIndex(records, "a"), 0);
  assert.equal(archive.findActiveRecordIndex(records, "a"), -1);
  assert.equal(archive.findActiveRecordIndex(records, "b"), 1);
});
