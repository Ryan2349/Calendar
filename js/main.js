/** 入口：事件綁定與初始化 */

import { calendarState, hydrateBackgroundFromIdb } from "./state.js";
import {
  shiftMonth,
  goToday,
  toggleHoliday,
  selectAllColorFilters,
  clearAllColorFilters,
  navigateSelectedDate,
} from "./events.js";
import {
  render,
  showAllEvents,
  showCalendar,
  setRenderCallbacks,
  updateMarkHolidayButton,
  isDetailPanelOpen,
} from "./render.js";
import {
  applyBackground,
  openBackgroundModal,
  closeBackgroundModal,
  handleBackgroundFileSelect,
  applySelectedBackground,
  removePendingBackground,
  updateBackgroundOpacityControl,
  updateBackgroundBrightnessControl,
  updateBackgroundBlurControl,
  scheduleExportPreviewUpdate,
  openFullExportPreview,
} from "./background.js";
import {
  exportEventsJson,
  normalizeBackup,
  cancelImport,
  confirmImport,
  openImportExportModal,
  closeImportExportModal,
} from "./backup.js";
import {
  openEventModal,
  openEditModal,
  closeEventModal,
  openDeleteModal,
  closeDeleteModal,
  confirmDeleteEvent,
  handleEventFormSubmit,
  setModalColor,
  syncMonthEndDate,
  syncRepeatUntilField,
} from "./modals.js";
import { exportCalendarImage, exportCalendarPdf } from "./export-canvas.js";
import { dateFromInput, displayDate, showToast } from "./utils.js";
import { weekdays } from "./constants.js";

setRenderCallbacks({
  openEditModal,
  openDeleteModal,
  scheduleExportPreviewUpdate,
});

// ── 月份導覽與主要操作 ───────────────────────────────────
document.querySelector("#prevMonth").addEventListener("click", () => shiftMonth(-1, render));
document.querySelector("#nextMonth").addEventListener("click", () => shiftMonth(1, render));
document.querySelector("#todayButton").addEventListener("click", () => goToday(showCalendar, render));
document.querySelector("#markHolidayButton").addEventListener("click", () =>
  toggleHoliday(updateMarkHolidayButton, render)
);
document.querySelector("#exportImageButton").addEventListener("click", () => exportCalendarImage());
document.querySelector("#exportPdfButton").addEventListener("click", () => exportCalendarPdf());
document.querySelector("#allEventsTopButton").addEventListener("click", () => {
  if (calendarState.mode === "all") showCalendar();
  else showAllEvents();
});
document.querySelector("#newEventButton").addEventListener("click", () => openEventModal());
document.querySelector("#detailAddButton").addEventListener("click", () => openEventModal());

// ── 匯入／匯出 JSON ─────────────────────────────────────
document.querySelector("#importExportButton").addEventListener("click", openImportExportModal);
document.querySelector("#modalExportButton").addEventListener("click", () => {
  closeImportExportModal();
  exportEventsJson();
});
document.querySelector("#modalImportButton").addEventListener("click", () => {
  closeImportExportModal();
  document.querySelector("#importFileInput").click();
});
document.querySelector("#cancelImportExportButton").addEventListener("click", closeImportExportModal);
document.querySelector("#closeImportExportModal").addEventListener("click", closeImportExportModal);
document.querySelector("#importFileInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast("備份檔案過大（上限 10 MB）");
    return;
  }
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
    showToast(
      error instanceof SyntaxError
        ? "無法讀取 JSON，請確認備份檔案內容"
        : error.message || "匯入失敗，請檢查備份檔案"
    );
  }
});
document.querySelector("#cancelImportButton").addEventListener("click", cancelImport);
document.querySelector("#closeImportModal").addEventListener("click", cancelImport);
document.querySelector("#confirmImportButton").addEventListener("click", confirmImport);

// ── 事件 Modal ──────────────────────────────────────────
document.querySelector("#closeModal").addEventListener("click", closeEventModal);
document.querySelector("#modalDeleteButton").addEventListener("click", () => {
  const editing = calendarState.editing;
  if (!editing) return;
  const { sourceKey, id } = editing;
  closeEventModal();
  openDeleteModal(sourceKey, id);
});
document.querySelector("#closeDeleteModal").addEventListener("click", closeDeleteModal);
document.querySelector("#confirmDeleteButton").addEventListener("click", confirmDeleteEvent);

// ── 背景相關 ────────────────────────────────────────────
document.querySelector("#backgroundButton").addEventListener("click", openBackgroundModal);
document.querySelector("#closeBackgroundModal").addEventListener("click", closeBackgroundModal);
document.querySelector("#cancelBackgroundButton").addEventListener("click", closeBackgroundModal);
document.querySelector("#selectBackgroundButton").addEventListener("click", () =>
  document.querySelector("#backgroundFileInput").click()
);
document.querySelector("#backgroundFileInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) await handleBackgroundFileSelect(file);
});
document.querySelector("#removeBackgroundButton").addEventListener("click", removePendingBackground);
document.querySelector("#applyBackgroundButton").addEventListener("click", () => applySelectedBackground());
document.querySelector("#backgroundOpacityInput").addEventListener("input", event => {
  calendarState.pendingBackgroundOpacity = Number(event.target.value) / 100;
  updateBackgroundOpacityControl(calendarState.pendingBackgroundOpacity);
  scheduleExportPreviewUpdate();
});
document.querySelector("#backgroundBrightnessInput").addEventListener("input", event => {
  calendarState.pendingBackgroundBrightness = Number(event.target.value) / 100;
  updateBackgroundBrightnessControl(calendarState.pendingBackgroundBrightness);
  scheduleExportPreviewUpdate();
});
document.querySelector("#backgroundBlurInput").addEventListener("input", event => {
  calendarState.pendingBackgroundBlur = Number(event.target.value);
  updateBackgroundBlurControl(calendarState.pendingBackgroundBlur);
  scheduleExportPreviewUpdate();
});
document.querySelector("#backgroundPreview").addEventListener("click", openFullExportPreview);
document.querySelector("#colorFilterSelectAll")?.addEventListener("click", () =>
  selectAllColorFilters(render, scheduleExportPreviewUpdate)
);
document.querySelector("#colorFilterClearAll")?.addEventListener("click", () =>
  clearAllColorFilters(render, scheduleExportPreviewUpdate)
);

// ── 表單欄位 ────────────────────────────────────────────
document.querySelector("#modalDate").addEventListener("change", event => {
  const date = dateFromInput(event.target.value);
  document.querySelector("#modalDateLabel").textContent =
    `${displayDate(date)} · ${weekdays[date.getDay()]}`;
  if (document.querySelector("#modalRepeat").value === "monthEnd") syncMonthEndDate();
  syncRepeatUntilField();
});
document.querySelector("#modalRepeat").addEventListener("change", () => {
  if (document.querySelector("#modalRepeat").value === "monthEnd") syncMonthEndDate();
  syncRepeatUntilField();
});
document.querySelector("#modalColor").addEventListener("input", event =>
  setModalColor(event.target.value)
);
document.querySelectorAll(".color-swatch").forEach(swatch =>
  swatch.addEventListener("click", () => setModalColor(swatch.dataset.color))
);
document.querySelector("#eventModalForm").addEventListener("submit", handleEventFormSubmit);

document.querySelectorAll(".view-tab:not(:disabled)").forEach(tab =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach(item => {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
  })
);

// ── 鍵盤快捷鍵 ──────────────────────────────────────────
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.body.classList.contains("full-preview-open")) {
    const overlay = document.querySelector("#fullExportPreviewOverlay");
    if (overlay) {
      overlay.hidden = true;
      document.body.classList.remove("full-preview-open");
    }
    return;
  }
  if (event.key === "Escape" && !document.querySelector("#backgroundModal").hidden) {
    closeBackgroundModal();
  } else if (event.key === "Escape" && !document.querySelector("#importExportModal").hidden) {
    closeImportExportModal();
  } else if (event.key === "Escape" && !document.querySelector("#importConfirmModal").hidden) {
    cancelImport();
  } else if (event.key === "Escape" && !document.querySelector("#deleteConfirmModal").hidden) {
    closeDeleteModal();
  } else if (event.key === "Escape" && !document.querySelector("#eventModal").hidden) {
    closeEventModal();
  }
  const modalOpen = document.body.classList.contains("modal-open");
  const inFormField = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);

  if (
    event.key.toLowerCase() === "n" &&
    !modalOpen &&
    !inFormField
  ) {
    openEventModal();
  }

  // 方向鍵：側欄展開時導航選定日期；收合時左右鍵切換月份
  if (
    !modalOpen &&
    !inFormField &&
    calendarState.mode === "calendar" &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  ) {
    if (isDetailPanelOpen()) {
      event.preventDefault();
      if (event.key === "ArrowLeft") navigateSelectedDate(-1, render);
      else if (event.key === "ArrowRight") navigateSelectedDate(1, render);
      else if (event.key === "ArrowUp") navigateSelectedDate(-7, render);
      else if (event.key === "ArrowDown") navigateSelectedDate(7, render);
    } else if (event.key === "ArrowLeft") {
      shiftMonth(-1, render);
    } else if (event.key === "ArrowRight") {
      shiftMonth(1, render);
    }
  }
});

// 初始化：先補載 IndexedDB 中的大圖／GIF，再套用背景與渲染
(async function init() {
  try {
    await hydrateBackgroundFromIdb();
  } catch (err) {
    console.error("載入背景失敗", err);
  }
  applyBackground();
  render();
})();
