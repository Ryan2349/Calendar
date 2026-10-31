/** 應用全域狀態 */

import {
  loadEvents,
  loadHolidays,
  loadBackground,
  loadBackgroundOpacity,
  loadBackgroundBlur,
  loadBackgroundBrightness,
  loadVisibleColors,
  loadBackgroundBlob,
} from "./storage.js";

export const today = new Date();

export const calendarState = {
  viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
  selectedDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  events: loadEvents(),
  holidays: loadHolidays(),
  // 可能是 data URL 或 blob: URL；大圖／GIF 由 IndexedDB 載入後填入
  backgroundImage: loadBackground(),
  backgroundOpacity: loadBackgroundOpacity(),
  backgroundBlur: loadBackgroundBlur(8),
  backgroundBrightness: loadBackgroundBrightness(1),
  /** 目前背景是否為 GIF（決定網頁端是否保留動畫） */
  backgroundIsGif: false,
  /** 目前使用中的 blob URL，換圖時需 revoke */
  backgroundBlobUrl: null,
  /**
   * GIF 第一幀的靜態 JPEG data URL（供 Canvas 預覽／匯出）。
   * 大 GIF 解碼成本高，必須用此靜態圖，避免每次 slider 都解碼完整動畫。
   */
  backgroundStaticImage: null,
  visibleColors: loadVisibleColors(),
  mode: "calendar",
  editing: null,
  pendingDelete: null,
  pendingImport: null,
  pendingBackground: null,
  pendingBackgroundOpacity: null,
  pendingBackgroundBlur: null,
  pendingBackgroundBrightness: null,
  pendingBackgroundIsGif: false,
  pendingBackgroundBlob: null,
  /** 待套用的 GIF 靜態第一幀 */
  pendingBackgroundStatic: null,
  pendingExportPreviewUrl: null,
};

/**
 * 啟動時從 IndexedDB 補載大圖／GIF 背景。
 * 若有資料會覆寫 backgroundImage 並建立 blob URL（GIF 可動畫）。
 * 同時還原 staticDataUrl 供預覽／匯出使用。
 */
export async function hydrateBackgroundFromIdb() {
  const record = await loadBackgroundBlob();
  if (!record || !record.blob) return false;

  // 釋放舊 blob URL
  if (calendarState.backgroundBlobUrl) {
    try {
      URL.revokeObjectURL(calendarState.backgroundBlobUrl);
    } catch {
      /* ignore */
    }
  }

  const blobUrl = URL.createObjectURL(record.blob);
  calendarState.backgroundBlobUrl = blobUrl;
  calendarState.backgroundImage = blobUrl;
  calendarState.backgroundIsGif = Boolean(record.isGif) || (record.mime || "").includes("gif");
  // 還原靜態第一幀（若有）；沒有則保持 null，之後 export／預覽會再嘗試從 blob 抽
  calendarState.backgroundStaticImage =
    typeof record.staticDataUrl === "string" && record.staticDataUrl.startsWith("data:")
      ? record.staticDataUrl
      : null;

  // 舊版 IDB 記錄沒有 staticDataUrl：背景標記為需補抽，由 background.js 在需要時處理
  if (calendarState.backgroundIsGif && !calendarState.backgroundStaticImage) {
    calendarState._gifNeedsStaticExtract = record.blob;
  } else {
    calendarState._gifNeedsStaticExtract = null;
  }
  return true;
}
