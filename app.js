const today = new Date();
const sampleEvents = {
  "2026-10-01": [{ id: "e1", title: "整理本月目標", startTime: "09:00", endTime: "10:00", repeat: "none", color: "#2563eb" }],
  "2026-10-06": [{ id: "e2", title: "產品設計會議", startTime: "14:00", endTime: "15:30", repeat: "none", color: "#f28b5d" }],
  "2026-10-10": [{ id: "e3", title: "秋日散步", startTime: "16:00", endTime: "17:30", repeat: "none", color: "#9b8afb" }],
  "2026-10-14": [{ id: "e4", title: "閱讀時間", startTime: "20:00", endTime: "21:00", repeat: "weekly", color: "#48a47e" }],
  "2026-10-20": [{ id: "e5", title: "專案回顧", startTime: "10:00", endTime: "11:00", repeat: "none", color: "#f28b5d" }],
  "2026-10-23": [{ id: "e6", title: "晚餐聚會", startTime: "18:30", endTime: "20:00", repeat: "none", color: "#9b8afb" }],
};

const calendarState = {
  viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
  selectedDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  events: loadEvents(),
  holidays: loadHolidays(),
  mode: "calendar",
  editing: null,
  pendingDelete: null,
  pendingImport: null,
};

const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const weekdaysShort = ["日", "一", "二", "三", "四", "五", "六"];
const repeatLabels = {
  none: "不重複",
  daily: "每天",
  weekly: "每週",
  monthly: "每月",
  monthEnd: "月尾",
};
const defaultEventColor = "#2563eb";
const backupFormat = "lunarcal-calendar-backup";
const backupVersion = 2;

function loadEvents() {
  try {
    const saved = localStorage.getItem("lunarcal-events");
    const events = saved ? JSON.parse(saved) : sampleEvents;
    Object.entries(events).forEach(([sourceKey, items]) => items.forEach(event => {
      if (!Array.isArray(event.completedDates)) event.completedDates = event.completed ? [sourceKey] : [];
      delete event.completed;
    }));
    return events;
  } catch { return sampleEvents; }
}

function saveEvents() {
  try { localStorage.setItem("lunarcal-events", JSON.stringify(calendarState.events)); return true; }
  catch { showToast("目前無法儲存事件，請檢查瀏覽器儲存權限"); return false; }
}

function loadHolidays() {
  try {
    const saved = localStorage.getItem("lunarcal-holidays");
    const list = saved ? JSON.parse(saved) : [];
    return Array.isArray(list) ? list.filter(isValidDateKey) : [];
  } catch {
    return [];
  }
}

function saveHolidays() {
  try {
    localStorage.setItem("lunarcal-holidays", JSON.stringify(calendarState.holidays));
    return true;
  } catch {
    showToast("目前無法儲存假期標記，請檢查瀏覽器儲存權限");
    return false;
  }
}

function exportEventsJson() {
  const backup = {
    format: backupFormat,
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    events: calendarState.events,
    holidays: [...calendarState.holidays],
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
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

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeBackup(data) {
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
      if (
        !Array.isArray(event.excludedDates) ||
        !event.excludedDates.every(isValidDateKey)
      ) {
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

function cancelImport() {
  document.querySelector("#importConfirmModal").hidden = true;
  calendarState.pendingImport = null;
  document.body.classList.remove("modal-open");
}

function confirmImport() {
  const pending = calendarState.pendingImport;
  if (!pending) return;

  const previousEvents = calendarState.events;
  const previousHolidays = calendarState.holidays;

  calendarState.events = pending.events;
  calendarState.holidays = pending.holidays || [];

  const eventsSaved = saveEvents();
  const holidaysSaved = saveHolidays();

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
    pending.holidays && pending.holidays.length
      ? `、${pending.holidays.length} 個假期`
      : "";
  showToast(`已匯入 ${pending.eventCount} 個事件${holidayPart}`);
}

function openImportExportModal() {
  document.querySelector("#importExportModal").hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector("#cancelImportExportButton").focus());
}

function closeImportExportModal() {
  document.querySelector("#importExportModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function pad(value) { return String(value).padStart(2, "0"); }
function keyOf(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function dateFromInput(value) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function sameDay(a, b) { return keyOf(a) === keyOf(b); }
function monthLabel(date) { return `${date.getFullYear()}年${date.getMonth() + 1}月`; }
function displayDate(date) { return `${date.getMonth() + 1} 月 ${date.getDate()} 日`; }
function dateInputValue(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function monthEndDateKey(monthValue) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue || "");
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return "";
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${monthValue}-${pad(days[month - 1])}`;
}
function cloneDate(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function eventTime(event) { return event.startTime && event.endTime ? `${event.startTime} – ${event.endTime}` : "全天"; }
function eventColor(event) { return /^#[0-9a-f]{6}$/i.test(event.color || "") ? event.color : defaultEventColor; }
function eventRepeat(event) { return repeatLabels[event.repeat] || repeatLabels.none; }
function isOccurrenceCompleted(event, date) { return (event.completedDates || []).includes(keyOf(date)); }
function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

function isLastDayOfMonth(date) {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function eventOccursOnDate(sourceDate, event, targetDate) {
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

function eventsForDate(date) {
  const matches = [];
  Object.entries(calendarState.events).forEach(([sourceKey, events]) => {
    const sourceDate = dateFromInput(sourceKey);
    events.forEach(event => { if (eventOccursOnDate(sourceDate, event, date)) matches.push({ ...event, _sourceKey: sourceKey, _occurrenceDate: cloneDate(date) }); });
  });
  return matches.sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
}

function eventsForMonth(date) {
  const monthEvents = []; const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) monthEvents.push(...eventsForDate(new Date(date.getFullYear(), date.getMonth(), day)));
  return monthEvents.sort((a, b) => keyOf(a._occurrenceDate).localeCompare(keyOf(b._occurrenceDate)) || (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
}

function allEventEntries() {
  return eventsForMonth(calendarState.viewDate);
}

function render() {
  renderHeader(); renderCalendar(); renderDetails();
  const showingAll = calendarState.mode === "all";
  document.querySelector("#calendarArea").hidden = showingAll;
  document.querySelector("#allEventsView").hidden = !showingAll;
  if (showingAll) renderAllEvents();
}

function setDetailPanelOpen(isOpen) {
  const panel = document.querySelector(".detail-panel");
  const toggle = document.querySelector("#asideToggle");
  panel.classList.toggle("is-closed", !isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "收合側欄" : "展開側欄");
  toggle.title = isOpen ? "收合側欄" : "展開側欄";
  toggle.querySelector(".aside-toggle-icon").textContent = isOpen ? "›" : "‹";
}

function toggleDetailPanel() {
  const isOpen = !document.querySelector(".detail-panel").classList.contains("is-closed");
  setDetailPanelOpen(!isOpen);
}

function showAllEvents() {
  calendarState.mode = "all";
  setDetailPanelOpen(false);
  render();
  document.querySelector("#allEventsTopButton").classList.add("is-active");
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", "true");
}

function showCalendar() {
  calendarState.mode = "calendar";
  render();
  document.querySelector("#allEventsTopButton").classList.remove("is-active");
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", "false");
}

function renderHeader() {
  const showingAll = calendarState.mode === "all";
  document.querySelector("#monthLabel").textContent = showingAll ? "當月所有事件" : monthLabel(calendarState.viewDate);
  document.querySelectorAll(".month-nav").forEach(button => { button.hidden = showingAll; });
  document.querySelector("#asideToggle").hidden = showingAll;
  document.querySelector("#allEventsTopButton").classList.toggle("is-active", showingAll);
  document.querySelector("#allEventsTopButton").setAttribute("aria-pressed", String(showingAll));
  updateMarkHolidayButton();
}

function createCalendarCell(date, dateNumber, isMuted, events) {
  const dateKey = keyOf(date);
  const isHoliday = calendarState.holidays.includes(dateKey);
  const dayClass = sameDay(date, today) ? "today-circle" : "solar";
  const sundayClass = date.getDay() === 0 || isHoliday ? " is-sunday" : "";
  const cell = document.createElement("button");

  cell.type = "button";
  cell.className = `calendar-cell${isMuted ? " is-muted" : ""}${sameDay(date, calendarState.selectedDate) ? " is-selected" : ""}`;
  cell.setAttribute("aria-label", `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`);
  cell.innerHTML = `<div class="day-top"><span class="${dayClass}${sundayClass}">${dateNumber}</span></div><div class="cell-events">${events.slice(0, 3).map(event => renderEventChip(event, date)).join("")}</div>`;
  cell.addEventListener("click", () => selectCalendarDate(date, isMuted));
  return cell;
}

function renderEventChip(event, date) {
  const completedClass = isOccurrenceCompleted(event, date) ? " is-completed" : "";
  return `<span class="event-chip${completedClass}" style="--event-color:${eventColor(event)}">${escapeHtml(event.title)}</span>`;
}

function selectCalendarDate(date, isMuted) {
  calendarState.selectedDate = cloneDate(date);
  if (isMuted) calendarState.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
  showCalendar();
}

function renderCalendar() {
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
      ? (day < 1 ? previousMonthDays + day : day - daysInMonth)
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

function renderDetails() {
  const date = calendarState.selectedDate;
  const events = eventsForDate(date);
  const list = document.querySelector("#eventList");

  document.querySelector("#selectedDateTitle").textContent = displayDate(date);
  document.querySelector("#selectedDateSub").textContent = weekdays[date.getDay()];
  document.querySelector("#dateFooter").textContent = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  document.querySelector("#eventCount").textContent = `${events.length} 個事件`;
  list.innerHTML = events.map(renderDetailEvent).join("");
  document.querySelector("#emptyState").style.display = events.length ? "none" : "flex";
  bindDetailEventToggles(list);
}

function bindDetailEventToggles(list) {
  list.querySelectorAll("[data-toggle]").forEach(input => {
    input.addEventListener("change", () => toggleEvent(
      input.dataset.sourceKey,
      input.dataset.toggle,
      input.dataset.occurrenceDate,
    ));
  });
  list.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      openEditModal(button.dataset.sourceKey, button.dataset.edit);
    });
  });
}

function renderAllEventRow(event) {
  const date = event._occurrenceDate;
  const completed = isOccurrenceCompleted(event, date);
  return `<div class="all-event-row${completed ? " is-completed" : ""}" role="button" tabindex="0" data-select-date="${keyOf(date)}"><div class="all-event-date"><strong>${date.getMonth() + 1}/${date.getDate()}</strong><span>${weekdays[date.getDay()]}</span></div><span class="all-event-marker" style="--event-color:${eventColor(event)}"></span><div class="all-event-copy"><strong>${escapeHtml(event.title)}</strong><small>${eventTime(event)}${event.repeat && event.repeat !== "none" ? ` · ${eventRepeat(event)}` : ""}</small>${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}</div><button class="edit-event" type="button" aria-label="編輯 ${escapeHtml(event.title)}" data-edit="${event.id}" data-source-key="${event._sourceKey}"><svg class="event-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg></button><button class="delete-event" type="button" aria-label="刪除 ${escapeHtml(event.title)} ${date.getMonth() + 1}/${date.getDate()}" data-delete="${event.id}" data-source-key="${event._sourceKey}" data-occurrence-date="${keyOf(date)}"><svg class="event-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
}

function renderAllEvents() {
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
  list.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    openDeleteModal(button.dataset.sourceKey, button.dataset.delete, button.dataset.occurrenceDate);
  }));
  list.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    openEditModal(button.dataset.sourceKey, button.dataset.edit);
  }));
}

function addEvent(eventData) {
  const date = dateFromInput(eventData.date); const key = keyOf(date); calendarState.events[key] ||= [];
  calendarState.events[key].push({ id: `event-${Date.now()}`, title: eventData.title, startTime: eventData.startTime, endTime: eventData.endTime, note: eventData.note, repeat: eventData.repeat, repeatUntil: eventData.repeatUntil || undefined, color: eventData.color });
  calendarState.selectedDate = date; calendarState.viewDate = new Date(date.getFullYear(), date.getMonth(), 1); saveEvents(); render(); showToast("事件已加入日曆");
}

function removeEvent(sourceKey, id) { calendarState.events[sourceKey] = (calendarState.events[sourceKey] || []).filter(event => event.id !== id); saveEvents(); render(); showToast("事件已刪除"); }

function openDeleteModal(sourceKey, id, occurrenceDate = sourceKey) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) return;
  const isRecurring = Boolean(event.repeat && event.repeat !== "none");
  const isSeriesStartOccurrence = isRecurring && occurrenceDate === sourceKey;
  calendarState.pendingDelete = { sourceKey, id, occurrenceDate };
  document.querySelector("#deleteEventName").textContent = `「${event.title}」`;
  document.querySelector("#deleteScopeOptions").hidden = !isRecurring;
  const occurrenceOption = document.querySelector('input[name="repeatDeleteScope"][value="occurrence"]');
  const futureOption = document.querySelector('input[name="repeatDeleteScope"][value="future"]');
  occurrenceOption.disabled = isSeriesStartOccurrence;
  occurrenceOption.checked = !isSeriesStartOccurrence;
  futureOption.checked = isSeriesStartOccurrence;
  document.querySelector("#deleteOccurrenceOption").classList.toggle("is-disabled", isSeriesStartOccurrence);
  if (isRecurring) {
    const date = dateFromInput(occurrenceDate);
    document.querySelector("#deleteOccurrenceLabel").textContent = `只刪除 ${displayDate(date)} 這一天`;
    document.querySelector("#deleteOccurrenceHelp").textContent = isSeriesStartOccurrence
      ? "開始日期的原始重複事件不能只刪除一天。"
      : "其他日期的重複事件會保留。";
    document.querySelector("#deleteFutureLabel").textContent = isSeriesStartOccurrence
      ? "刪除整個重複系列"
      : `刪除 ${displayDate(date)} 及之後的重複事件`;
    document.querySelector("#deleteFutureHelp").textContent = isSeriesStartOccurrence
      ? "這是開始日期；刪除後不會保留任何重複事件。"
      : "保留這一天之前已排定的事件。";
    document.querySelector("#deleteConfirmDescription").textContent = "請選擇要移除的重複事件範圍。";
  } else {
    document.querySelector("#deleteConfirmDescription").textContent = "此操作無法復原。";
  }
  document.querySelector("#deleteConfirmModal").hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector("#confirmDeleteButton").focus());
}

function closeDeleteModal() {
  document.querySelector("#deleteConfirmModal").hidden = true;
  calendarState.pendingDelete = null;
  document.body.classList.remove("modal-open");
}

function confirmDeleteEvent() {
  const pending = calendarState.pendingDelete;
  if (!pending) return;
  const event = (calendarState.events[pending.sourceKey] || []).find(item => item.id === pending.id);
  if (event && event.repeat && event.repeat !== "none") {
    const scope = document.querySelector('input[name="repeatDeleteScope"]:checked')?.value || "occurrence";
    if (scope === "occurrence") {
      if (pending.occurrenceDate === pending.sourceKey) {
        showToast("開始日期的重複事件不能只刪除一天");
        return;
      }
      event.excludedDates = [...new Set([...(event.excludedDates || []), pending.occurrenceDate])];
      closeDeleteModal(); saveEvents(); render(); showToast("已刪除這一天的重複事件"); return;
    }
    if (pending.occurrenceDate === pending.sourceKey) {
      closeDeleteModal();
      removeEvent(pending.sourceKey, pending.id);
      return;
    }
    const lastKeptDate = dateFromInput(pending.occurrenceDate);
    lastKeptDate.setDate(lastKeptDate.getDate() - 1);
    event.repeatUntil = keyOf(lastKeptDate);
    closeDeleteModal(); saveEvents(); render(); showToast("已刪除這一天及之後的重複事件"); return;
  }
  closeDeleteModal();
  removeEvent(pending.sourceKey, pending.id);
}

function toggleEvent(sourceKey, id, occurrenceDate = sourceKey) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) return;
  if (!Array.isArray(event.completedDates)) event.completedDates = event.completed ? [sourceKey] : [];
  delete event.completed;
  const completedDates = new Set(event.completedDates);
  const wasCompleted = completedDates.has(occurrenceDate);
  if (wasCompleted) completedDates.delete(occurrenceDate); else completedDates.add(occurrenceDate);
  event.completedDates = [...completedDates];
  saveEvents(); render(); showToast(wasCompleted ? "已取消完成" : "事件已完成");
}

function updateEvent(sourceKey, id, eventData) {
  const event = (calendarState.events[sourceKey] || []).find(item => item.id === id);
  if (!event) { showToast("找不到要編輯的事件"); return; }
  Object.assign(event, { title: eventData.title, startTime: eventData.startTime, endTime: eventData.endTime, note: eventData.note, repeat: eventData.repeat, repeatUntil: eventData.repeatUntil || undefined, color: eventData.color });
  if (eventData.repeat === "none") delete event.repeatUntil;
  const oldDate = dateFromInput(sourceKey); const newDate = dateFromInput(eventData.date); const newKey = keyOf(newDate);
  if (newKey !== sourceKey) { calendarState.events[sourceKey] = calendarState.events[sourceKey].filter(item => item.id !== id); calendarState.events[newKey] ||= []; calendarState.events[newKey].push(event); }
  calendarState.selectedDate = newDate; calendarState.viewDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1); calendarState.editing = null; saveEvents(); render(); showToast("事件已更新");
}

function shiftMonth(amount) {
  const year = calendarState.viewDate.getFullYear();
  const month = calendarState.viewDate.getMonth() + amount;
  calendarState.viewDate = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  calendarState.selectedDate = new Date(year, month, Math.min(calendarState.selectedDate.getDate(), daysInMonth));
  render();
}

function goToday() { calendarState.viewDate = new Date(today.getFullYear(), today.getMonth(), 1); calendarState.selectedDate = cloneDate(today); showCalendar(); showToast("已回到今天"); }

function toggleHoliday() {
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
  saveHolidays();
  updateMarkHolidayButton();
  render();
}

function updateMarkHolidayButton() {
  const btn = document.querySelector("#markHolidayButton");
  if (!btn) return;
  const isHoliday = calendarState.holidays.includes(keyOf(calendarState.selectedDate));
  btn.textContent = isHoliday ? "取消假期標記" : "標記為假期";
  btn.classList.toggle("is-active", isHoliday);
}

function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900); }

function setModalColor(color) { const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : defaultEventColor; document.querySelector("#modalColor").value = safe; document.querySelectorAll(".color-swatch").forEach(swatch => swatch.classList.toggle("selected", swatch.dataset.color.toLowerCase() === safe.toLowerCase())); }

/** 當重複頻率選「月尾」時，將日期自動調整為該月最後一天，並同步標籤文字。 */
function syncMonthEndDate() {
  const repeat = document.querySelector("#modalRepeat").value;
  if (repeat !== "monthEnd") return;
  const dateInput = document.querySelector("#modalDate");
  const current = dateFromInput(dateInput.value || dateInputValue(calendarState.selectedDate));
  const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  dateInput.value = dateInputValue(lastDay);
  document.querySelector("#modalDateLabel").textContent = `${displayDate(lastDay)} · ${weekdays[lastDay.getDay()]}`;
}

function syncRepeatUntilField() {
  const field = document.querySelector("#repeatUntilField");
  const repeat = document.querySelector("#modalRepeat").value;
  const isRecurring = repeat !== "none";
  field.hidden = !isRecurring;
  document.querySelector("#modalRepeatUntil").disabled = !isRecurring;
  document.querySelector("#modalRepeatUntil").min = document.querySelector("#modalDate").value.slice(0, 7);
}

function configureNewEventModal(date) {
  calendarState.editing = null;
  setModalHeading("NEW EVENT", "新增事件", "儲存事件");
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
  setModalDate(date);
  document.querySelector("#modalTitle").value = event.title || "";
  document.querySelector("#modalStart").value = event.startTime || "";
  document.querySelector("#modalEnd").value = event.endTime || "";
  document.querySelector("#modalRepeat").value = event.repeat || "none";
  document.querySelector("#modalRepeatUntil").value = event.repeatUntil ? event.repeatUntil.slice(0, 7) : "";
  syncRepeatUntilField();
  document.querySelector("#modalNote").value = event.note || "";
  setModalColor(eventColor(event));
  if ((event.repeat || "none") === "monthEnd") syncMonthEndDate();
  return true;
}

function setModalHeading(eyebrow, title, submitLabel) {
  document.querySelector("#modalEyebrow").textContent = eyebrow;
  document.querySelector("#eventModalTitle").textContent = title;
  document.querySelector("#modalSubmitButton").textContent = submitLabel;
}

function setModalDate(date) {
  document.querySelector("#modalDate").value = dateInputValue(date);
  document.querySelector("#modalDateLabel").textContent = `${displayDate(date)} · ${weekdays[date.getDay()]}`;
}

function openModalAndFocus(modalSelector, focusSelector) {
  document.querySelector(modalSelector).hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector(focusSelector).focus());
}

function openEventModal(date = calendarState.selectedDate) {
  configureNewEventModal(date);
  openModalAndFocus("#eventModal", "#modalTitle");
}

function openEditModal(sourceKey, id) {
  if (configureEditEventModal(sourceKey, id)) openModalAndFocus("#eventModal", "#modalTitle");
}

function closeEventModal() { document.querySelector("#eventModal").hidden = true; document.body.classList.remove("modal-open"); }

/* ─────────────────────────────────────────────────────────
   匯出本月月曆為 PNG（純 Canvas，無外部依賴）
   ───────────────────────────────────────────────────────── */
function hexToRgba(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(37,99,235,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 將文字依寬度斷成最多 maxLines 行；最後一行必要時加省略號。 */
function wrapTextLines(ctx, text, maxWidth, maxLines = 2) {
  const raw = String(text || "").trim();
  if (!raw) return [""];
  if (ctx.measureText(raw).width <= maxWidth) return [raw];

  const lines = [];
  let remaining = raw;

  while (remaining && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining);
      remaining = "";
      break;
    }

    // 逐字找出能塞進 maxWidth 的最長前綴
    let low = 1;
    let high = remaining.length;
    let fit = 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const slice = remaining.slice(0, mid);
      const w = ctx.measureText(isLastLine ? slice + "…" : slice).width;
      if (w <= maxWidth) {
        fit = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // 盡量在空白或常見斷點處切開（中文通常無空白，仍以字元為主）
    let breakAt = fit;
    if (!isLastLine) {
      const searchFrom = Math.max(1, fit - 8);
      for (let i = fit; i >= searchFrom; i -= 1) {
        const ch = remaining[i - 1];
        if (ch === " " || ch === "　" || ch === "、" || ch === "，" || ch === "。") {
          breakAt = i;
          break;
        }
      }
    }

    let line = remaining.slice(0, breakAt).trimEnd();
    remaining = remaining.slice(breakAt).trimStart();
    if (isLastLine && remaining) {
      // 確保加上省略號後仍不超寬
      while (line.length > 0 && ctx.measureText(line + "…").width > maxWidth) {
        line = line.slice(0, -1);
      }
      line += "…";
      remaining = "";
    }
    lines.push(line || "…");
  }
  return lines.length ? lines : [""];
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function exportCalendarImage() {
  try {
    const year = calendarState.viewDate.getFullYear();
    const month = calendarState.viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const rows = totalCells / 7;

    // 預先量測各日事件所需高度，讓格子能容納完整（最多兩行）標題
    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    measureCtx.font = "600 10px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";

    const scale = 2;
    const padding = 40;
    const headerH = 72;
    const weekdayH = 40;
    const cellW = 160; // 略加寬，讓長標題有更多空間
    const chipPadX = 8;
    const chipTextMaxW = cellW - chipPadX * 2 - 10; // 左色條 + 內距
    const chipLineH = 12;
    const chipPadY = 4;
    const chipGap = 4;
    const chipMax = 3;
    const dayNumAreaH = 34;
    const moreLineH = 14;

    // 計算每個 cell 需要的高度
    let maxCellH = 100;
    for (let index = 0; index < totalCells; index++) {
      const offset = index - firstDay;
      const day = offset + 1;
      const isMuted = day < 1 || day > daysInMonth;
      if (isMuted) continue;
      const date = new Date(year, month, day);
      const events = eventsForDate(date);
      let contentH = dayNumAreaH;
      events.slice(0, chipMax).forEach(event => {
        const lines = wrapTextLines(measureCtx, event.title || "", chipTextMaxW, 2);
        const chipH = chipPadY * 2 + lines.length * chipLineH;
        contentH += chipH + chipGap;
      });
      if (events.length > chipMax) contentH += moreLineH;
      contentH += 8; // bottom padding
      if (contentH > maxCellH) maxCellH = contentH;
    }
    const cellH = Math.max(110, Math.ceil(maxCellH));

    const gridW = cellW * 7;
    const gridH = cellH * rows;
    const width = padding * 2 + gridW;
    const height = padding * 2 + headerH + weekdayH + gridH + 28;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = "#1f2937";
    ctx.font = "800 28px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(monthLabel(calendarState.viewDate), padding, padding + headerH / 2 - 4);

    // Subtitle
    ctx.fillStyle = "#87909e";
    ctx.font = "600 12px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
    ctx.fillText("月序 Calendar", padding, padding + headerH / 2 + 18);

    // Card border
    const cardX = padding;
    const cardY = padding + headerH;
    const cardW = gridW;
    const cardH = weekdayH + gridH;
    ctx.strokeStyle = "#e8ebef";
    ctx.lineWidth = 1;
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 10);
    ctx.stroke();

    // Weekday header background
    ctx.fillStyle = "#fcfcfd";
    ctx.fillRect(cardX + 0.5, cardY + 0.5, cardW - 1, weekdayH - 1);

    // Weekday labels
    ctx.font = "700 11px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 7; i++) {
      const x = cardX + i * cellW + cellW / 2;
      const y = cardY + weekdayH / 2;
      ctx.fillStyle = i === 0 || i === 6 ? "#798493" : "#989fa9";
      ctx.fillText(weekdays[i], x, y);
    }

    // Horizontal line under weekdays
    ctx.strokeStyle = "#e8ebef";
    ctx.beginPath();
    ctx.moveTo(cardX, cardY + weekdayH);
    ctx.lineTo(cardX + cardW, cardY + weekdayH);
    ctx.stroke();

    // Grid cells
    for (let index = 0; index < totalCells; index++) {
      const col = index % 7;
      const row = Math.floor(index / 7);
      const offset = index - firstDay;
      const day = offset + 1;
      const date = new Date(year, month, day);
      const isMuted = day < 1 || day > daysInMonth;
      const dateNumber = isMuted
        ? (day < 1 ? previousMonthDays + day : day - daysInMonth)
        : day;
      const dateKey = keyOf(date);
      const isHoliday = !isMuted && calendarState.holidays.includes(dateKey);
      const isToday = sameDay(date, today);
      const isSundayOrHoliday = date.getDay() === 0 || isHoliday;
      const events = isMuted ? [] : eventsForDate(date);

      const x = cardX + col * cellW;
      const y = cardY + weekdayH + row * cellH;

      // Cell background
      if (isMuted) {
        ctx.fillStyle = "#fcfcfd";
        ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      }

      // Cell borders
      ctx.strokeStyle = "#e8ebef";
      ctx.lineWidth = 1;
      if (col < 6) {
        ctx.beginPath();
        ctx.moveTo(x + cellW, y);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      }
      if (row < rows - 1) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellH);
        ctx.lineTo(x + cellW, y + cellH);
        ctx.stroke();
      }

      // Day number
      const numX = x + 14;
      const numY = y + 18;
      if (isToday && !isMuted) {
        const cx = numX + 6;
        const cy = numY + 1;
        ctx.fillStyle = isSundayOrHoliday ? "#dc2626" : "#2563eb";
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 13px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(dateNumber), cx, cy + 0.5);
      } else {
        ctx.fillStyle = isMuted
          ? (isSundayOrHoliday ? "#fca5a5" : "#c8cdd4")
          : (isSundayOrHoliday ? "#dc2626" : "#303945");
        ctx.font = "700 15px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(dateNumber), numX, numY);
      }

      // Event chips — 支援最多 2 行完整顯示長標題
      let chipY = y + dayNumAreaH;
      const chipMaxW = cellW - chipPadX * 2;

      events.slice(0, chipMax).forEach(event => {
        const color = eventColor(event);
        const completed = isOccurrenceCompleted(event, date);
        const cx = x + chipPadX;

        ctx.font = "600 10px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
        const lines = wrapTextLines(ctx, event.title || "", chipTextMaxW, 2);
        const chipH = chipPadY * 2 + lines.length * chipLineH;

        // Chip background
        ctx.fillStyle = hexToRgba(color, 0.12);
        roundRectPath(ctx, cx, chipY, chipMaxW, chipH, 3);
        ctx.fill();

        // Left accent bar
        ctx.fillStyle = color;
        ctx.fillRect(cx, chipY + 2, 2, chipH - 4);

        // Title lines
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        if (completed) ctx.globalAlpha = 0.55;

        lines.forEach((line, li) => {
          const ty = chipY + chipPadY + li * chipLineH + chipLineH / 2;
          ctx.fillText(line, cx + 7, ty);
          if (completed) {
            const tw = ctx.measureText(line).width;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + 7, ty);
            ctx.lineTo(cx + 7 + tw, ty);
            ctx.stroke();
          }
        });

        if (completed) ctx.globalAlpha = 1;
        chipY += chipH + chipGap;
      });

      // "+N more"
      if (events.length > chipMax) {
        ctx.fillStyle = "#adb4bd";
        ctx.font = "600 9px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`+${events.length - chipMax}`, x + chipPadX + 2, chipY + 6);
      }
    }

    // Footer
    ctx.fillStyle = "#b4bbc4";
    ctx.font = "500 11px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("月序 Calendar", width - padding, height - padding / 2 - 2);

    // Download
    const link = document.createElement("a");
    const monthKey = `${year}-${pad(month + 1)}`;
    link.download = `lunarcal-${monthKey}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("月曆圖片已匯出");
  } catch (err) {
    console.error(err);
    showToast("匯出圖片失敗，請稍後再試");
  }
}

["#prevMonth"].forEach(selector => document.querySelector(selector).addEventListener("click", () => shiftMonth(-1)));
["#nextMonth"].forEach(selector => document.querySelector(selector).addEventListener("click", () => shiftMonth(1)));
document.querySelector("#todayButton").addEventListener("click", goToday);
document.querySelector("#markHolidayButton").addEventListener("click", toggleHoliday);
document.querySelector("#exportImageButton").addEventListener("click", exportCalendarImage);
document.querySelector("#allEventsTopButton").addEventListener("click", () => { if (calendarState.mode === "all") showCalendar(); else showAllEvents(); });
document.querySelector("#newEventButton").addEventListener("click", () => openEventModal());
document.querySelector("#detailAddButton").addEventListener("click", () => openEventModal());
document.querySelector("#asideToggle").addEventListener("click", toggleDetailPanel);
document.querySelector("#importExportButton").addEventListener("click", openImportExportModal);
document.querySelector("#modalExportButton").addEventListener("click", () => { closeImportExportModal(); exportEventsJson(); });
document.querySelector("#modalImportButton").addEventListener("click", () => { closeImportExportModal(); document.querySelector("#importFileInput").click(); });
document.querySelector("#cancelImportExportButton").addEventListener("click", closeImportExportModal);
document.querySelector("#closeImportExportModal").addEventListener("click", closeImportExportModal);
document.querySelector("#importFileInput").addEventListener("change", async event => {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast("備份檔案過大（上限 10 MB）"); return; }
  try {
    const parsed = JSON.parse(await file.text());
    const backup = normalizeBackup(parsed);
    calendarState.pendingImport = { ...backup, fileName: file.name };
    document.querySelector("#importFileName").textContent = file.name;
    document.querySelector("#importEventCount").textContent =
      `${backup.eventCount} 個事件` +
      (backup.holidays.length ? `、${backup.holidays.length} 個假期` : "");
    document.querySelector("#importConfirmModal").hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => document.querySelector("#cancelImportButton").focus());
  } catch (error) {
    showToast(error instanceof SyntaxError ? "無法讀取 JSON，請確認備份檔案內容" : (error.message || "匯入失敗，請檢查備份檔案"));
  }
});
document.querySelector("#cancelImportButton").addEventListener("click", cancelImport);
document.querySelector("#closeImportModal").addEventListener("click", cancelImport);
document.querySelector("#confirmImportButton").addEventListener("click", confirmImport);
document.querySelector("#closeModal").addEventListener("click", closeEventModal); document.querySelector("#cancelModal").addEventListener("click", closeEventModal);
document.querySelector("#cancelDeleteButton").addEventListener("click", closeDeleteModal);
document.querySelector("#closeDeleteModal").addEventListener("click", closeDeleteModal);
document.querySelector("#confirmDeleteButton").addEventListener("click", confirmDeleteEvent);
document.querySelector("#modalDate").addEventListener("change", event => {
  const date = dateFromInput(event.target.value);
  document.querySelector("#modalDateLabel").textContent = `${displayDate(date)} · ${weekdays[date.getDay()]}`;
  if (document.querySelector("#modalRepeat").value === "monthEnd") syncMonthEndDate();
  syncRepeatUntilField();
});
document.querySelector("#modalRepeat").addEventListener("change", () => {
  if (document.querySelector("#modalRepeat").value === "monthEnd") syncMonthEndDate();
  syncRepeatUntilField();
});
document.querySelector("#modalColor").addEventListener("input", event => setModalColor(event.target.value)); document.querySelectorAll(".color-swatch").forEach(swatch => swatch.addEventListener("click", () => setModalColor(swatch.dataset.color)));
document.querySelector("#eventModalForm").addEventListener("submit", event => {
  event.preventDefault(); const title = document.querySelector("#modalTitle").value.trim(); const date = document.querySelector("#modalDate").value; const startTime = document.querySelector("#modalStart").value; const endTime = document.querySelector("#modalEnd").value;
  if (!title || !date) { showToast("請先填寫事件名稱與日期"); return; }
  if (startTime && endTime && startTime >= endTime) { showToast("結束時間要晚於開始時間"); return; }
  const repeat = document.querySelector("#modalRepeat").value;
  const repeatUntilMonth = document.querySelector("#modalRepeatUntil").value;
  if (repeat !== "none" && repeatUntilMonth && repeatUntilMonth < date.slice(0, 7)) { showToast("重複結束月份不能早於事件月份"); return; }
  const repeatUntil = repeat !== "none" && repeatUntilMonth ? monthEndDateKey(repeatUntilMonth) : "";
  if (repeat !== "none" && repeatUntilMonth && !repeatUntil) { showToast("重複結束月份格式有誤"); return; }
  const eventData = { title, date, startTime, endTime, repeat, repeatUntil: repeat !== "none" ? repeatUntil : "", color: document.querySelector("#modalColor").value, note: document.querySelector("#modalNote").value.trim() };
  if (calendarState.editing) updateEvent(calendarState.editing.sourceKey, calendarState.editing.id, eventData); else addEvent(eventData); closeEventModal();
});
document.querySelectorAll(".view-tab:not(:disabled)").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".view-tab").forEach(item => { item.classList.remove("active"); item.setAttribute("aria-selected", "false"); });
  tab.classList.add("active");
  tab.setAttribute("aria-selected", "true");
}));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !document.querySelector("#importExportModal").hidden) closeImportExportModal();
  else if (event.key === "Escape" && !document.querySelector("#importConfirmModal").hidden) cancelImport();
  else if (event.key === "Escape" && !document.querySelector("#deleteConfirmModal").hidden) closeDeleteModal();
  else if (event.key === "Escape" && !document.querySelector("#eventModal").hidden) closeEventModal();
  const modalOpen = document.body.classList.contains("modal-open");
  if (event.key.toLowerCase() === "n" && !modalOpen && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) openEventModal();
  if (!modalOpen && event.key === "ArrowLeft" && calendarState.mode === "calendar") shiftMonth(-1);
  if (!modalOpen && event.key === "ArrowRight" && calendarState.mode === "calendar") shiftMonth(1);
});

render();