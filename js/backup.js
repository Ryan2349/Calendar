/** JSON 備份匯出／匯入 */

import { calendarState, today } from "./state.js";
import { backupFormat, backupVersion, repeatLabels } from "./constants.js";
import { saveEvents, saveHolidays, isValidDateKey } from "./storage.js";
import { keyOf, showToast } from "./utils.js";
import { render } from "./render.js";

export function exportEventsJson() {
  const backup = {
    format: backupFormat,
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    events: calendarState.events,
    holidays: [...calendarState.holidays],
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lunarcal-backup-${keyOf(today)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("行程與假期 JSON 備份已匯出");
}

export function normalizeBackup(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.format !== backupFormat ||
    (data.version !== 1 && data.version !== 2) ||
    !data.events ||
    typeof data.events !== "object" ||
    Array.isArray(data.events)
  ) {
    throw new Error("檔案格式不支援，請選擇由月序 Calendar 匯出的 JSON 備份。");
  }

  const normalized = Object.create(null);
  let eventCount = 0;

  for (const [sourceKey, items] of Object.entries(data.events)) {
    if (!isValidDateKey(sourceKey) || !Array.isArray(items)) {
      throw new Error("備份中的日期或事件清單格式有誤。");
    }
    const ids = new Set();
    normalized[sourceKey] = items.map(item => {
      eventCount += 1;
      if (
        eventCount > 5000 ||
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof item.id !== "string" ||
        !item.id.trim() ||
        ids.has(item.id) ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 50
      ) {
        throw new Error("備份包含無效或過多的事件資料。");
      }
      ids.add(item.id);
      const repeat = item.repeat || "none";
      if (!Object.hasOwn(repeatLabels, repeat)) {
        throw new Error(`「${item.title}」的重複頻率無效。`);
      }
      for (const field of ["startTime", "endTime"]) {
        const time = item[field];
        if (
          time !== undefined &&
          time !== "" &&
          (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
        ) {
          throw new Error(`「${item.title}」的時間格式無效。`);
        }
      }
      if (item.note !== undefined && typeof item.note !== "string") {
        throw new Error(`「${item.title}」的備註格式無效。`);
      }
      if (
        item.color !== undefined &&
        (typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color))
      ) {
        throw new Error(`「${item.title}」的顏色格式無效。`);
      }
      const event = {
        ...item,
        repeat,
        completedDates: Array.isArray(item.completedDates)
          ? [...item.completedDates]
          : item.completed
            ? [sourceKey]
            : [],
      };
      delete event.completed;
      if (!event.completedDates.every(isValidDateKey)) {
        throw new Error(`「${item.title}」的完成日期無效。`);
      }
      if (event.excludedDates === undefined) event.excludedDates = [];
      if (!Array.isArray(event.excludedDates) || !event.excludedDates.every(isValidDateKey)) {
        throw new Error(`「${item.title}」的重複例外日期無效。`);
      }
      if (event.repeatUntil !== undefined && !isValidDateKey(event.repeatUntil)) {
        throw new Error(`「${item.title}」的重複截止日期無效。`);
      }
      return event;
    });
  }

  let holidays = [];
  if (data.holidays !== undefined) {
    if (!Array.isArray(data.holidays)) {
      throw new Error("備份中的假期標記格式有誤。");
    }
    if (data.holidays.length > 2000) {
      throw new Error("備份包含過多的假期標記。");
    }
    const seen = new Set();
    for (const key of data.holidays) {
      if (!isValidDateKey(key)) {
        throw new Error("備份包含無效的假期日期。");
      }
      if (seen.has(key)) continue;
      seen.add(key);
      holidays.push(key);
    }
    holidays.sort();
  }

  return { events: normalized, eventCount, holidays };
}

export function cancelImport() {
  document.querySelector("#importConfirmModal").hidden = true;
  calendarState.pendingImport = null;
  document.body.classList.remove("modal-open");
}

export function confirmImport() {
  const pending = calendarState.pendingImport;
  if (!pending) return;

  const previousEvents = calendarState.events;
  const previousHolidays = calendarState.holidays;

  calendarState.events = pending.events;
  calendarState.holidays = pending.holidays || [];

  const eventsSaved = saveEvents(calendarState.events, showToast);
  const holidaysSaved = saveHolidays(calendarState.holidays, showToast);

  if (!eventsSaved || !holidaysSaved) {
    calendarState.events = previousEvents;
    calendarState.holidays = previousHolidays;
    cancelImport();
    render();
    return;
  }

  cancelImport();
  render();
  const holidayPart =
    pending.holidays && pending.holidays.length ? `、${pending.holidays.length} 個假期` : "";
  showToast(`已匯入 ${pending.eventCount} 個事件${holidayPart}`);
}

export function openImportExportModal() {
  document.querySelector("#importExportModal").hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector("#cancelImportExportButton").focus());
}

export function closeImportExportModal() {
  document.querySelector("#importExportModal").hidden = true;
  document.body.classList.remove("modal-open");
}
