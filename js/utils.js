/** 日期／字串工具與 Toast */

import { weekdays, defaultEventColor, repeatLabels } from "./constants.js";

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function keyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function sameDay(a, b) {
  return keyOf(a) === keyOf(b);
}

export function monthLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function displayDate(date) {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function dateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthEndDateKey(monthValue) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue || "");
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${monthValue}-${pad(days[month - 1])}`;
}

export function cloneDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function eventTime(event) {
  return event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : "全天";
}

export function eventColor(event) {
  return /^#[0-9a-f]{6}$/i.test(event.color || "") ? event.color : defaultEventColor;
}

export function eventRepeat(event) {
  return repeatLabels[event.repeat] || repeatLabels.none;
}

export function isOccurrenceCompleted(event, date) {
  return (event.completedDates || []).includes(keyOf(date));
}

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character]));
}

export function isLastDayOfMonth(date) {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
}
