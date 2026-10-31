/** 畫面渲染：月曆格子、側欄、全部事件、顏色篩選 UI */

import { calendarState, today } from "./state.js";
import { weekdays, presetEventColors } from "./constants.js";
import {
  eventsForDate,
  allEventEntries,
  toggleEvent,
  collectUsedCustomColors,
  applyColorFilterFromCheckboxes,
} from "./events.js";
import {
  keyOf,
  sameDay,
  cloneDate,
  displayDate,
  eventTime,
  eventColor,
  eventRepeat,
  isOccurrenceCompleted,
  escapeHtml,
  monthLabel,
  dateFromInput,
} from "./utils.js";

// late-bound callbacks to avoid circular init issues
let openEditModalFn = null;
let openDeleteModalFn = null;
let scheduleExportPreviewUpdateFn = null;

export function setRenderCallbacks({ openEditModal, openDeleteModal, scheduleExportPreviewUpdate }) {
  openEditModalFn = openEditModal;
  openDeleteModalFn = openDeleteModal;
  scheduleExportPreviewUpdateFn = scheduleExportPreviewUpdate;
}

/** 側欄是否展開（未套用 is-closed） */
export function isDetailPanelOpen() {
  const panel = document.querySelector(".detail-panel");
  return panel ? !panel.classList.contains("is-closed") : true;
}

/** Header 與側欄是否同步展開 */
export function isLayoutOpen() {
  const panel = document.querySelector(".detail-panel");
  const topbar = document.querySelector(".topbar");
  return Boolean(
    panel &&
      topbar &&
      !panel.classList.contains("is-closed") &&
      !topbar.classList.contains("is-closed")
  );
}

export function render() {
  renderHeader();
  renderCalendar();
  renderDetails();
  const showingAll = calendarState.mode === "all";
  document.querySelector("#calendarArea").hidden = showingAll;
  document.querySelector("#allEventsView").hidden = !showingAll;
  if (showingAll) renderAllEvents();
}

export function setDetailPanelOpen(isOpen) {
  const panel = document.querySelector(".detail-panel");
  panel.classList.toggle("is-closed", !isOpen);
  // 側欄開關會影響格子選取樣式，需重繪月曆
  renderCalendar();
}

/** Double Click 使用：同步切換 Header 與側欄，Header 收合時保留 monthLabel */
export function setLayoutOpen(isOpen) {
  const panel = document.querySelector(".detail-panel");
  const topbar = document.querySelector(".topbar");
  panel.classList.toggle("is-closed", !isOpen);
  topbar.classList.toggle("is-closed", !isOpen);
  // 側欄狀態會影響日期選取樣式，Header 狀態則由 CSS 保留月份標題。
  renderCalendar();
}

export function showAllEvents() {
  calendarState.mode = "all";
  setDetailPanelOpen(false);
  render();
  document.querySelector("#allEventsTopButton").classList.add("is-active");
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", "true");
}

export function showCalendar() {
  calendarState.mode = "calendar";
  render();
  document.querySelector("#allEventsTopButton").classList.remove("is-active");
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", "false");
}

export function renderHeader() {
  const showingAll = calendarState.mode === "all";
  document.querySelector("#monthLabel").textContent = showingAll
    ? "當月所有事件"
    : monthLabel(calendarState.viewDate);
  document.querySelectorAll(".month-nav").forEach(button => {
    button.hidden = showingAll;
  });
  document.querySelector("#allEventsTopButton").classList.toggle("is-active", showingAll);
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", String(showingAll));
  updateMarkHolidayButton();
}

export function updateMarkHolidayButton() {
  const btn = document.querySelector("#markHolidayButton");
  if (!btn) return;
  const isHoliday = calendarState.holidays.includes(keyOf(calendarState.selectedDate));
  btn.textContent = isHoliday ? "取消假期標記" : "標記為假期";
  btn.classList.toggle("is-active", isHoliday);
}

function createCalendarCell(date, dateNumber, isMuted, events) {
  const dateKey = keyOf(date);
  const isHoliday = calendarState.holidays.includes(dateKey);
  const dayClass = sameDay(date, today) ? "today-circle" : "solar";
  const sundayClass = date.getDay() === 0 || isHoliday ? " is-sunday" : "";
  const cell = document.createElement("button");
  const maxVisible = 3;
  const visibleEvents = events.slice(0, maxVisible);
  const remaining = events.length - visibleEvents.length;
  const chipsHtml =
    visibleEvents.map(event => renderEventChip(event, date)).join("") +
    (remaining > 0 ? `<span class="event-chip-more">+${remaining}</span>` : "");

  // 僅在側欄展開時顯示選取白色覆蓋
  const panelOpen = isDetailPanelOpen();
  const isSelected = panelOpen && sameDay(date, calendarState.selectedDate);

  cell.type = "button";
  cell.className = `calendar-cell${isMuted ? " is-muted" : ""}${
    isSelected ? " is-selected" : ""
  }`;
  cell.setAttribute(
    "aria-label",
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  );
  cell.innerHTML = `<div class="day-top"><span class="${dayClass}${sundayClass}">${dateNumber}</span></div><div class="cell-events">${chipsHtml}</div>`;

  // 單擊：選取日期（側欄收合時不顯示白色覆蓋）
  cell.addEventListener("click", () => selectCalendarDate(date, isMuted));

  // 雙擊：選取日期並同步切換 Header 與側欄（展開／收合）
  cell.addEventListener("dblclick", () => {
    selectCalendarDate(date, isMuted);
    setLayoutOpen(!isLayoutOpen());
  });

  return cell;
}

function renderEventChip(event, date) {
  const completedClass = isOccurrenceCompleted(event, date) ? " is-completed" : "";
  return `<span class="event-chip${completedClass}" style="--event-color:${eventColor(event)}">${escapeHtml(event.title)}</span>`;
}

export function selectCalendarDate(date, isMuted) {
  calendarState.selectedDate = cloneDate(date);
  if (isMuted) calendarState.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  showCalendar();
}

export function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const year = calendarState.viewDate.getFullYear();
  const month = calendarState.viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  grid.replaceChildren();
  for (let index = 0; index < totalCells; index += 1) {
    const offset = index - firstDay;
    const day = offset + 1;
    const date = new Date(year, month, day);
    const isMuted = day < 1 || day > daysInMonth;
    const dateNumber = isMuted
      ? day < 1
        ? previousMonthDays + day
        : day - daysInMonth
      : day;
    grid.appendChild(createCalendarCell(date, dateNumber, isMuted, eventsForDate(date)));
  }
}

function renderDetailEvent(event) {
  const completed = isOccurrenceCompleted(event, event._occurrenceDate);
  const checked = completed ? " checked" : "";
  const checkboxId = `agenda-${event.id}-${keyOf(event._occurrenceDate)}`;
  return `
    <div class="detail-event${completed ? " is-completed" : ""}" style="--event-color:${eventColor(event)}">
      <label class="detail-event-main" for="${checkboxId}">
        <input id="${checkboxId}" class="agenda-checkbox" type="checkbox"${checked} aria-label="完成 ${escapeHtml(event.title)}" data-toggle="${event.id}" data-source-key="${event._sourceKey}" data-occurrence-date="${keyOf(event._occurrenceDate)}">
        <span class="event-marker"></span>
        <div class="detail-event-copy">
          <strong>${escapeHtml(event.title)}</strong>
          <small>${eventTime(event)}${event.repeat && event.repeat !== "none" ? ` · ${eventRepeat(event)}` : ""}</small>
        </div>
      </label>
      <button class="edit-event detail-event-edit" type="button" aria-label="編輯 ${escapeHtml(event.title)}" title="編輯事件" data-edit="${event.id}" data-source-key="${event._sourceKey}">
        <svg class="event-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
      </button>
    </div>`;
}

export function renderDetails() {
  const date = calendarState.selectedDate;
  const events = eventsForDate(date);
  const list = document.querySelector("#eventList");

  document.querySelector("#selectedDateTitle").textContent = displayDate(date);
  document.querySelector("#selectedDateSub").textContent = weekdays[date.getDay()];
  document.querySelector("#eventCount").textContent = `${events.length} 個事件`;
  list.innerHTML = events.map(renderDetailEvent).join("");
  document.querySelector("#emptyState").style.display = events.length ? "none" : "flex";
  bindDetailEventToggles(list);
}

function bindDetailEventToggles(list) {
  list.querySelectorAll("[data-toggle]").forEach(input => {
    input.addEventListener("change", () =>
      toggleEvent(input.dataset.sourceKey, input.dataset.toggle, input.dataset.occurrenceDate, render)
    );
  });
  list.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (openEditModalFn) openEditModalFn(button.dataset.sourceKey, button.dataset.edit);
    });
  });
}

function renderAllEventRow(event) {
  const date = event._occurrenceDate;
  const completed = isOccurrenceCompleted(event, date);
  return `<div class="all-event-row${completed ? " is-completed" : ""}" role="button" tabindex="0" data-select-date="${keyOf(date)}"><div class="all-event-date"><strong>${date.getMonth() + 1}/${date.getDate()}</strong><span>${weekdays[date.getDay()]}</span></div><span class="all-event-marker" style="--event-color:${eventColor(event)}"></span><div class="all-event-copy"><strong>${escapeHtml(event.title)}</strong><small>${eventTime(event)}${event.repeat && event.repeat !== "none" ? ` · ${eventRepeat(event)}` : ""}</small>${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}</div><button class="edit-event" type="button" aria-label="編輯 ${escapeHtml(event.title)}" data-edit="${event.id}" data-source-key="${event._sourceKey}"><svg class="event-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg></button><button class="delete-event" type="button" aria-label="刪除 ${escapeHtml(event.title)} ${date.getMonth() + 1}/${date.getDate()}" data-delete="${event.id}" data-source-key="${event._sourceKey}" data-occurrence-date="${keyOf(date)}"><svg class="event-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
}

export function renderAllEvents() {
  const entries = allEventEntries();
  const list = document.querySelector("#allEventsList");

  document.querySelector("#allEventsCount").textContent = `${entries.length} 個事件`;
  list.innerHTML = entries.map(renderAllEventRow).join("");
  document.querySelector("#allEventsEmpty").hidden = entries.length > 0;
  list.hidden = entries.length === 0;
  bindAllEventInteractions(list);
}

function bindAllEventInteractions(list) {
  list.querySelectorAll("[data-select-date]").forEach(row => {
    const openDate = () => {
      const date = dateFromInput(row.dataset.selectDate);
      calendarState.selectedDate = date;
      calendarState.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
      renderHeader();
      renderDetails();
    };
    row.addEventListener("click", openDate);
    row.addEventListener("keydown", event => {
      if (event.target.closest("button")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDate();
      }
    });
  });
  list.querySelectorAll("[data-delete]").forEach(button =>
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (openDeleteModalFn) {
        openDeleteModalFn(button.dataset.sourceKey, button.dataset.delete, button.dataset.occurrenceDate);
      }
    })
  );
  list.querySelectorAll("[data-edit]").forEach(button =>
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (openEditModalFn) openEditModalFn(button.dataset.sourceKey, button.dataset.edit);
    })
  );
}

export function renderColorFilterControls() {
  const container = document.querySelector("#colorFilterList");
  if (!container) return;

  const visible = calendarState.visibleColors;
  const customColors = collectUsedCustomColors();
  const allColors = [
    ...presetEventColors.map(c => ({ color: c.color.toLowerCase(), label: c.label, isPreset: true })),
    ...customColors.map(c => ({ color: c, label: c.toUpperCase(), isPreset: false })),
  ];

  if (allColors.length === 0) {
    container.innerHTML = `<p class="color-filter-empty">目前沒有可篩選的顏色標籤</p>`;
    return;
  }

  const isAllVisible = visible === null;
  container.innerHTML = allColors
    .map(({ color, label, isPreset }) => {
      const checked = isAllVisible || visible.has(color);
      const swatchStyle = `background:${color}`;
      return `
      <label class="color-filter-item">
        <input type="checkbox" class="color-filter-checkbox" data-color="${color}" ${checked ? "checked" : ""} />
        <span class="color-filter-swatch" style="${swatchStyle}" aria-hidden="true"></span>
        <span class="color-filter-label">${escapeHtml(label)}${isPreset ? "" : " <em>自訂</em>"}</span>
      </label>`;
    })
    .join("");

  container.querySelectorAll(".color-filter-checkbox").forEach(input => {
    input.addEventListener("change", () => {
      applyColorFilterFromCheckboxes(render, scheduleExportPreviewUpdateFn);
    });
  });
}
