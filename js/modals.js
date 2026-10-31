/** 新增／編輯事件 Modal、刪除確認 Modal */

import { calendarState } from "./state.js";
import { defaultEventColor, weekdays } from "./constants.js";
import {
  addEvent,
  updateEvent,
  removeEvent,
} from "./events.js";
import {
  dateFromInput,
  dateInputValue,
  displayDate,
  eventColor,
  keyOf,
  monthEndDateKey,
  showToast,
} from "./utils.js";
import { render } from "./render.js";
import { saveEvents } from "./storage.js";

export function setModalColor(color) {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : defaultEventColor;
  document.querySelector("#modalColor").value = safe;
  document.querySelectorAll(".color-swatch").forEach(swatch =>
    swatch.classList.toggle("selected", swatch.dataset.color.toLowerCase() === safe.toLowerCase())
  );
}

export function syncMonthEndDate() {
  const repeat = document.querySelector("#modalRepeat").value;
  if (repeat !== "monthEnd") return;
  const dateInput = document.querySelector("#modalDate");
  const current = dateFromInput(dateInput.value || dateInputValue(calendarState.selectedDate));
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  dateInput.value = dateInputValue(lastDay);
  document.querySelector("#modalDateLabel").textContent =
    `${displayDate(lastDay)} · ${weekdays[lastDay.getDay()]}`;
}

export function syncRepeatUntilField() {
  const field = document.querySelector("#repeatUntilField");
  const repeat = document.querySelector("#modalRepeat").value;
  const isRecurring = repeat !== "none";
  field.hidden = !isRecurring;
  document.querySelector("#modalRepeatUntil").disabled = !isRecurring;
  document.querySelector("#modalRepeatUntil").min = document
    .querySelector("#modalDate")
    .value.slice(0, 7);
}

function setModalHeading(eyebrow, title, submitLabel) {
  document.querySelector("#modalEyebrow").textContent = eyebrow;
  document.querySelector("#eventModalTitle").textContent = title;
  document.querySelector("#modalSubmitButton").textContent = submitLabel;
}

function setModalDate(date) {
  document.querySelector("#modalDate").value = dateInputValue(date);
  document.querySelector("#modalDateLabel").textContent =
    `${displayDate(date)} · ${weekdays[date.getDay()]}`;
}

function openModalAndFocus(modalSelector, focusSelector) {
  document.querySelector(modalSelector).hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector(focusSelector).focus());
}

function configureNewEventModal(date) {
  calendarState.editing = null;
  setModalHeading("NEW EVENT", "新增事件", "儲存事件");
  const deleteBtn = document.querySelector("#modalDeleteButton");
  if (deleteBtn) deleteBtn.hidden = true;
  setModalDate(date);
  document.querySelector("#modalTitle").value = "";
  document.querySelector("#modalStart").value = "09:00";
  document.querySelector("#modalEnd").value = "18:00";
  document.querySelector("#modalRepeat").value = "none";
  document.querySelector("#modalRepeatUntil").value = "";
  syncRepeatUntilField();
  document.querySelector("#modalNote").value = "";
  setModalColor(defaultEventColor);
}

function configureEditEventModal(sourceKey, id) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) return false;

  const date = dateFromInput(sourceKey);
  calendarState.editing = { sourceKey, id };
  setModalHeading("EDIT EVENT", "編輯事件", "儲存變更");
  const deleteBtn = document.querySelector("#modalDeleteButton");
  if (deleteBtn) deleteBtn.hidden = false;
  setModalDate(date);
  document.querySelector("#modalTitle").value = event.title || "";
  document.querySelector("#modalStart").value = event.startTime || "";
  document.querySelector("#modalEnd").value = event.endTime || "";
  document.querySelector("#modalRepeat").value = event.repeat || "none";
  document.querySelector("#modalRepeatUntil").value = event.repeatUntil
    ? event.repeatUntil.slice(0, 7)
    : "";
  syncRepeatUntilField();
  document.querySelector("#modalNote").value = event.note || "";
  setModalColor(eventColor(event));
  if ((event.repeat || "none") === "monthEnd") syncMonthEndDate();
  return true;
}

export function openEventModal(date = calendarState.selectedDate) {
  configureNewEventModal(date);
  openModalAndFocus("#eventModal", "#modalTitle");
}

export function openEditModal(sourceKey, id) {
  if (configureEditEventModal(sourceKey, id)) openModalAndFocus("#eventModal", "#modalTitle");
}

export function closeEventModal() {
  document.querySelector("#eventModal").hidden = true;
  document.body.classList.remove("modal-open");
}

export function openDeleteModal(sourceKey, id, occurrenceDate = sourceKey) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) return;
  const isRecurring = Boolean(event.repeat && event.repeat !== "none");
  const isSeriesStartOccurrence = isRecurring && occurrenceDate === sourceKey;
  calendarState.pendingDelete = { sourceKey, id, occurrenceDate };
  document.querySelector("#deleteEventName").textContent = `「${event.title}」`;
  document.querySelector("#deleteScopeOptions").hidden = !isRecurring;
  const occurrenceOption = document.querySelector(
    'input[name="repeatDeleteScope"][value="occurrence"]'
  );
  const futureOption = document.querySelector('input[name="repeatDeleteScope"][value="future"]');
  occurrenceOption.disabled = isSeriesStartOccurrence;
  occurrenceOption.checked = !isSeriesStartOccurrence;
  futureOption.checked = isSeriesStartOccurrence;
  document
    .querySelector("#deleteOccurrenceOption")
    .classList.toggle("is-disabled", isSeriesStartOccurrence);
  if (isRecurring) {
    const date = dateFromInput(occurrenceDate);
    document.querySelector("#deleteOccurrenceLabel").textContent =
      `只刪除 ${displayDate(date)} 這一天`;
    document.querySelector("#deleteOccurrenceHelp").textContent = isSeriesStartOccurrence
      ? "開始日期的原始重複事件不能只刪除一天。"
      : "其他日期的重複事件會保留。";
    document.querySelector("#deleteFutureLabel").textContent = isSeriesStartOccurrence
      ? "刪除整個重複系列"
      : `刪除 ${displayDate(date)} 及之後的重複事件`;
    document.querySelector("#deleteFutureHelp").textContent = isSeriesStartOccurrence
      ? "這是開始日期；刪除後不會保留任何重複事件。"
      : "保留這一天之前已排定的事件。";
    document.querySelector("#deleteConfirmDescription").textContent =
      "請選擇要移除的重複事件範圍。";
  } else {
    document.querySelector("#deleteConfirmDescription").textContent = "此操作無法復原。";
  }
  document.querySelector("#deleteConfirmModal").hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector("#confirmDeleteButton").focus());
}

export function closeDeleteModal() {
  document.querySelector("#deleteConfirmModal").hidden = true;
  calendarState.pendingDelete = null;
  document.body.classList.remove("modal-open");
}

export function confirmDeleteEvent() {
  const pending = calendarState.pendingDelete;
  if (!pending) return;
  const event = (calendarState.events[pending.sourceKey] || []).find(
    item => item.id === pending.id
  );
  if (event && event.repeat && event.repeat !== "none") {
    const scope =
      document.querySelector('input[name="repeatDeleteScope"]:checked')?.value || "occurrence";
    if (scope === "occurrence") {
      if (pending.occurrenceDate === pending.sourceKey) {
        showToast("開始日期的重複事件不能只刪除一天");
        return;
      }
      event.excludedDates = [
        ...new Set([...(event.excludedDates || []), pending.occurrenceDate]),
      ];
      closeDeleteModal();
      saveEvents(calendarState.events, showToast);
      render();
      showToast("已刪除這一天的重複事件");
      return;
    }
    if (pending.occurrenceDate === pending.sourceKey) {
      closeDeleteModal();
      removeEvent(pending.sourceKey, pending.id, render);
      return;
    }
    const lastKeptDate = dateFromInput(pending.occurrenceDate);
    lastKeptDate.setDate(lastKeptDate.getDate() - 1);
    event.repeatUntil = keyOf(lastKeptDate);
    closeDeleteModal();
    saveEvents(calendarState.events, showToast);
    render();
    showToast("已刪除這一天及之後的重複事件");
    return;
  }
  closeDeleteModal();
  removeEvent(pending.sourceKey, pending.id, render);
}

export function handleEventFormSubmit(event) {
  event.preventDefault();
  const title = document.querySelector("#modalTitle").value.trim();
  const date = document.querySelector("#modalDate").value;
  const startTime = document.querySelector("#modalStart").value;
  const endTime = document.querySelector("#modalEnd").value;
  if (!title || !date) {
    showToast("請先填寫事件名稱與日期");
    return;
  }
  if (startTime && endTime && startTime >= endTime) {
    showToast("結束時間要晚於開始時間");
    return;
  }
  const repeat = document.querySelector("#modalRepeat").value;
  const repeatUntilMonth = document.querySelector("#modalRepeatUntil").value;
  if (repeat !== "none" && repeatUntilMonth && repeatUntilMonth < date.slice(0, 7)) {
    showToast("重複結束月份不能早於事件月份");
    return;
  }
  const repeatUntil =
    repeat !== "none" && repeatUntilMonth ? monthEndDateKey(repeatUntilMonth) : "";
  if (repeat !== "none" && repeatUntilMonth && !repeatUntil) {
    showToast("重複結束月份格式有誤");
    return;
  }
  const eventData = {
    title,
    date,
    startTime,
    endTime,
    repeat,
    repeatUntil: repeat !== "none" ? repeatUntil : "",
    color: document.querySelector("#modalColor").value,
    note: document.querySelector("#modalNote").value.trim(),
  };
  if (calendarState.editing) {
    updateEvent(calendarState.editing.sourceKey, calendarState.editing.id, eventData, render);
  } else {
    addEvent(eventData, render);
  }
  closeEventModal();
}
