/** 事件查詢、重複規則、CRUD、完成狀態、顏色可見性 */

import { calendarState, today } from "./state.js";
import { presetColorSet } from "./constants.js";
import {
  saveEvents,
  saveHolidays,
  saveVisibleColors,
  normalizeColorKey,
} from "./storage.js";
import {
  keyOf,
  dateFromInput,
  sameDay,
  cloneDate,
  eventColor,
  isOccurrenceCompleted,
  isLastDayOfMonth,
  showToast,
} from "./utils.js";

export function isEventColorVisible(event) {
  const visible = calendarState.visibleColors;
  if (visible === null) return true;
  return visible.has(normalizeColorKey(eventColor(event)));
}

export function collectUsedCustomColors() {
  const used = new Set();
  Object.values(calendarState.events).forEach(items => {
    (items || []).forEach(event => {
      const key = normalizeColorKey(event.color);
      if (!presetColorSet.has(key)) used.add(key);
    });
  });
  return [...used].sort();
}

export function eventOccursOnDate(sourceDate, event, targetDate) {
  if (targetDate < sourceDate) return false;
  const targetKey = keyOf(targetDate);
  if ((event.excludedDates || []).includes(targetKey)) return false;
  if (event.repeatUntil && targetKey > event.repeatUntil) return false;
  if (!event.repeat || event.repeat === "none") return sameDay(sourceDate, targetDate);
  if (event.repeat === "daily") return true;
  if (event.repeat === "weekly") return sourceDate.getDay() === targetDate.getDay();
  if (event.repeat === "monthly") return sourceDate.getDate() === targetDate.getDate();
  if (event.repeat === "monthEnd") return isLastDayOfMonth(targetDate);
  return sameDay(sourceDate, targetDate);
}

export function eventsForDate(date) {
  const matches = [];
  Object.entries(calendarState.events).forEach(([sourceKey, events]) => {
    const sourceDate = dateFromInput(sourceKey);
    events.forEach(event => {
      if (eventOccursOnDate(sourceDate, event, date) && isEventColorVisible(event)) {
        matches.push({ ...event, _sourceKey: sourceKey, _occurrenceDate: cloneDate(date) });
      }
    });
  });
  return matches.sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
}

export function eventsForMonth(date) {
  const monthEvents = [];
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    monthEvents.push(...eventsForDate(new Date(date.getFullYear(), date.getMonth(), day)));
  }
  return monthEvents.sort(
    (a, b) =>
      keyOf(a._occurrenceDate).localeCompare(keyOf(b._occurrenceDate)) ||
      (a.startTime || "99:99").localeCompare(b.startTime || "99:99")
  );
}

export function allEventEntries() {
  return eventsForMonth(calendarState.viewDate);
}

export function addEvent(eventData, render) {
  const date = dateFromInput(eventData.date);
  const key = keyOf(date);
  calendarState.events[key] ||= [];
  calendarState.events[key].push({
    id: `event-${Date.now()}`,
    title: eventData.title,
    startTime: eventData.startTime,
    endTime: eventData.endTime,
    note: eventData.note,
    repeat: eventData.repeat,
    repeatUntil: eventData.repeatUntil || undefined,
    color: eventData.color,
  });
  calendarState.selectedDate = date;
  calendarState.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  saveEvents(calendarState.events, showToast);
  if (render) render();
  showToast("事件已加入日曆");
}

export function removeEvent(sourceKey, id, render) {
  calendarState.events[sourceKey] = (calendarState.events[sourceKey] || []).filter(
    event => event.id !== id
  );
  saveEvents(calendarState.events, showToast);
  if (render) render();
  showToast("事件已刪除");
}

export function toggleEvent(sourceKey, id, occurrenceDate = sourceKey, render) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) return;
  if (!Array.isArray(event.completedDates)) {
    event.completedDates = event.completed ? [sourceKey] : [];
  }
  delete event.completed;
  const completedDates = new Set(event.completedDates);
  const wasCompleted = completedDates.has(occurrenceDate);
  if (wasCompleted) completedDates.delete(occurrenceDate);
  else completedDates.add(occurrenceDate);
  event.completedDates = [...completedDates];
  saveEvents(calendarState.events, showToast);
  if (render) render();
  showToast(wasCompleted ? "已取消完成" : "事件已完成");
}

export function updateEvent(sourceKey, id, eventData, render) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) {
    showToast("找不到要編輯的事件");
    return;
  }
  Object.assign(event, {
    title: eventData.title,
    startTime: eventData.startTime,
    endTime: eventData.endTime,
    note: eventData.note,
    repeat: eventData.repeat,
    repeatUntil: eventData.repeatUntil || undefined,
    color: eventData.color,
  });
  if (eventData.repeat === "none") delete event.repeatUntil;
  const newDate = dateFromInput(eventData.date);
  const newKey = keyOf(newDate);
  if (newKey !== sourceKey) {
    calendarState.events[sourceKey] = calendarState.events[sourceKey].filter(item => item.id !== id);
    calendarState.events[newKey] ||= [];
    calendarState.events[newKey].push(event);
  }
  calendarState.selectedDate = newDate;
  calendarState.viewDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
  calendarState.editing = null;
  saveEvents(calendarState.events, showToast);
  if (render) render();
  showToast("事件已更新");
}

export function shiftMonth(amount, render) {
  const year = calendarState.viewDate.getFullYear();
  const month = calendarState.viewDate.getMonth() + amount;
  calendarState.viewDate = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  calendarState.selectedDate = new Date(
    year,
    month,
    Math.min(calendarState.selectedDate.getDate(), daysInMonth)
  );
  if (render) render();
}

/**
 * 以日為單位移動選定日期（側欄展開時方向鍵導航用）。
 * 若跨月，會自動切換 viewDate 到該月。
 */
export function navigateSelectedDate(deltaDays, render) {
  const next = cloneDate(calendarState.selectedDate);
  next.setDate(next.getDate() + deltaDays);
  calendarState.selectedDate = next;
  if (
    next.getFullYear() !== calendarState.viewDate.getFullYear() ||
    next.getMonth() !== calendarState.viewDate.getMonth()
  ) {
    calendarState.viewDate = new Date(next.getFullYear(), next.getMonth(), 1);
  }
  if (render) render();
}

export function goToday(showCalendarFn, render) {
  calendarState.viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarState.selectedDate = cloneDate(today);
  if (showCalendarFn) showCalendarFn();
  else if (render) render();
  showToast("已回到今天");
}

export function toggleHoliday(updateMarkHolidayButton, render) {
  const key = keyOf(calendarState.selectedDate);
  const idx = calendarState.holidays.indexOf(key);
  if (idx >= 0) {
    calendarState.holidays.splice(idx, 1);
    showToast("已取消假期標記");
  } else {
    calendarState.holidays.push(key);
    calendarState.holidays.sort();
    showToast("已標記為假期");
  }
  saveHolidays(calendarState.holidays, showToast);
  if (updateMarkHolidayButton) updateMarkHolidayButton();
  if (render) render();
}

export function applyColorFilterFromCheckboxes(render, scheduleExportPreviewUpdate) {
  const checkboxes = [...document.querySelectorAll(".color-filter-checkbox")];
  if (checkboxes.length === 0) return;

  const checked = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.color.toLowerCase());
  const allColors = checkboxes.map(cb => cb.dataset.color.toLowerCase());

  if (checked.length === allColors.length) {
    calendarState.visibleColors = null;
  } else {
    calendarState.visibleColors = new Set(checked);
  }
  saveVisibleColors(calendarState.visibleColors, showToast);
  if (render) render();
  if (scheduleExportPreviewUpdate) scheduleExportPreviewUpdate();
}

export function selectAllColorFilters(render, scheduleExportPreviewUpdate) {
  document.querySelectorAll(".color-filter-checkbox").forEach(cb => {
    cb.checked = true;
  });
  calendarState.visibleColors = null;
  saveVisibleColors(null, showToast);
  if (render) render();
  if (scheduleExportPreviewUpdate) scheduleExportPreviewUpdate();
}

export function clearAllColorFilters(render, scheduleExportPreviewUpdate) {
  document.querySelectorAll(".color-filter-checkbox").forEach(cb => {
    cb.checked = false;
  });
  calendarState.visibleColors = new Set();
  saveVisibleColors(calendarState.visibleColors, showToast);
  if (render) render();
  if (scheduleExportPreviewUpdate) scheduleExportPreviewUpdate();
}
