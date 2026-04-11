"use strict";

function isArchivedRecord(record) {
  return !!(record && typeof record.archivedAt === "string" && record.archivedAt.trim());
}

function filterActiveRecords(records) {
  if (!Array.isArray(records) || !records.length) return [];
  return records.filter(function (record) {
    return record && !isArchivedRecord(record);
  });
}

function findRecordIndex(records, id) {
  if (!Array.isArray(records) || !id) return -1;
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (record && record.id === id) return i;
  }
  return -1;
}

function findActiveRecordIndex(records, id) {
  if (!Array.isArray(records) || !id) return -1;
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (!record || record.id !== id || isArchivedRecord(record)) continue;
    return i;
  }
  return -1;
}

function archiveRecordInList(records, id, options) {
  if (!Array.isArray(records) || !id) {
    return { ok: false, error: "missing_id", records: Array.isArray(records) ? records.slice() : [] };
  }
  var idx = findActiveRecordIndex(records, id);
  if (idx < 0) {
    return { ok: false, error: "not_found", records: records.slice() };
  }
  var opts = options || {};
  var archivedAt = opts.archivedAt || new Date().toISOString();
  var archivedReason =
    typeof opts.reason === "string" && opts.reason.trim() ? opts.reason.trim() : "user_archive";

  var next = records.slice();
  var current = next[idx];
  next[idx] = Object.assign({}, current, {
    archivedAt: archivedAt,
    archivedReason: archivedReason,
    updatedAt: archivedAt,
  });
  return {
    ok: true,
    records: next,
    record: next[idx],
    index: idx,
  };
}

module.exports = {
  archiveRecordInList: archiveRecordInList,
  filterActiveRecords: filterActiveRecords,
  findActiveRecordIndex: findActiveRecordIndex,
  findRecordIndex: findRecordIndex,
  isArchivedRecord: isArchivedRecord,
};
