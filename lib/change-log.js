"use strict";

const { kv } = require("@vercel/kv");

const KV_KEY = "planting_change_log_v1";
const MAX_ENTRIES = 200;
let kvClient = kv;

function trimText(value, maxLength) {
  var text = value == null ? "" : String(value).trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeStringArray(value, maxItems, maxItemLength) {
  if (!Array.isArray(value) || !value.length) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < value.length; i++) {
    var item = trimText(value[i], maxItemLength || 120);
    if (!item || seen[item]) continue;
    seen[item] = true;
    out.push(item);
    if (maxItems && out.length >= maxItems) break;
  }
  return out;
}

function normalizeChangeLogEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  var action = trimText(entry.action, 80);
  var targetType = trimText(entry.targetType, 80);
  if (!action || !targetType) return null;
  return {
    id: trimText(entry.id, 80) || "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10),
    createdAt: trimText(entry.createdAt, 40) || new Date().toISOString(),
    action: action,
    targetType: targetType,
    targetId: trimText(entry.targetId, 160),
    areaId: trimText(entry.areaId, 120),
    areaLabel: trimText(entry.areaLabel, 160),
    plantName: trimText(entry.plantName, 160),
    plantNames: normalizeStringArray(entry.plantNames, 12, 120),
    detail: trimText(entry.detail, 500),
    meta: entry.meta && typeof entry.meta === "object" ? Object.assign({}, entry.meta) : {},
  };
}

async function readChangeLog(limit) {
  try {
    var raw = await kvClient.get(KV_KEY);
    if (raw == null || raw === "") return [];
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    var list = Array.isArray(parsed) ? parsed.map(normalizeChangeLogEntry).filter(Boolean) : [];
    var count = parseInt(String(limit || 0), 10);
    if (!count || count < 0) return list;
    return list.slice(0, count);
  } catch (err) {
    console.error("change-log read", err);
    return null;
  }
}

async function writeChangeLog(entries) {
  await kvClient.set(KV_KEY, JSON.stringify(entries));
}

async function appendChangeLog(entry) {
  var normalized = normalizeChangeLogEntry(entry);
  if (!normalized) return null;
  var list = await readChangeLog();
  if (list === null) throw new Error("kv_unavailable");
  list.unshift(normalized);
  if (list.length > MAX_ENTRIES) {
    list.length = MAX_ENTRIES;
  }
  await writeChangeLog(list);
  return normalized;
}

async function appendChangeLogSafe(entry) {
  try {
    return await appendChangeLog(entry);
  } catch (err) {
    console.error("change-log append", err);
    return null;
  }
}

function setKvClient(client) {
  kvClient = client || kv;
}

function resetKvClient() {
  kvClient = kv;
}

module.exports = {
  KV_KEY: KV_KEY,
  MAX_ENTRIES: MAX_ENTRIES,
  normalizeChangeLogEntry: normalizeChangeLogEntry,
  readChangeLog: readChangeLog,
  writeChangeLog: writeChangeLog,
  appendChangeLog: appendChangeLog,
  appendChangeLogSafe: appendChangeLogSafe,
  setKvClient: setKvClient,
  resetKvClient: resetKvClient,
};
