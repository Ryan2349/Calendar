/** localStorage 讀寫：事件、假期、背景、顏色篩選；大圖／GIF 使用 IndexedDB */

import { defaultEventColor } from "./constants.js";

const BG_DB_NAME = "lunarcal-bg-db";
const BG_DB_VERSION = 1;
const BG_STORE = "background";
const BG_KEY = "current";

function openBgDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BG_DB_NAME, BG_DB_VERSION);
    request.onerror = () => reject(request.error || new Error("無法開啟背景資料庫"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BG_STORE)) {
        db.createObjectStore(BG_STORE);
      }
    };
  });
}

/**
 * 將背景 Blob 存入 IndexedDB（支援大圖／GIF）。
 * meta.staticDataUrl：GIF 第一幀的壓縮 JPEG data URL，供預覽／匯出使用，避免每次解碼完整 GIF。
 */
export async function saveBackgroundBlob(blob, meta = {}, showToast) {
  try {
    const db = await openBgDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, "readwrite");
      const store = tx.objectStore(BG_STORE);
      const record = {
        blob,
        mime: blob.type || meta.mime || "image/jpeg",
        isGif: Boolean(meta.isGif),
        updatedAt: Date.now(),
      };
      // 靜態第一幀（字串 data URL）體積通常遠小於原 GIF，可一併存
      if (typeof meta.staticDataUrl === "string" && meta.staticDataUrl.startsWith("data:")) {
        record.staticDataUrl = meta.staticDataUrl;
      }
      store.put(record, BG_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB put failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
    db.close();
    // 標記使用 IndexedDB，並清掉舊的 localStorage data URL
    try {
      localStorage.setItem("lunarcal-background-source", "idb");
      localStorage.removeItem("lunarcal-background");
    } catch {
      /* ignore */
    }
    return true;
  } catch (err) {
    console.error(err);
    if (showToast) {
      const msg =
        err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message || "")))
          ? "背景圖片過大，瀏覽器儲存空間不足，無法儲存"
          : "無法儲存背景圖片（可能超出瀏覽器容量）";
      showToast(msg);
    }
    return false;
  }
}

/** 從 IndexedDB 讀取背景 Blob；沒有則回傳 null */
export async function loadBackgroundBlob() {
  try {
    const db = await openBgDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, "readonly");
      const store = tx.objectStore(BG_STORE);
      const req = store.get(BG_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record || !record.blob) return null;
    return record;
  } catch {
    return null;
  }
}

/** 清除 IndexedDB 中的背景 */
export async function clearBackgroundBlob(showToast) {
  try {
    const db = await openBgDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BG_STORE, "readwrite");
      tx.objectStore(BG_STORE).delete(BG_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    try {
      localStorage.removeItem("lunarcal-background-source");
    } catch {
      /* ignore */
    }
    return true;
  } catch (err) {
    console.error(err);
    if (showToast) showToast("無法清除背景圖片");
    return false;
  }
}

export function loadEvents() {
  try {
    const saved = localStorage.getItem("lunarcal-events");
    const events = saved ? JSON.parse(saved) : {};
    Object.entries(events).forEach(([sourceKey, items]) =>
      items.forEach(event => {
        if (!Array.isArray(event.completedDates))
          event.completedDates = event.completed ? [sourceKey] : [];
        delete event.completed;
      })
    );
    return events;
  } catch {
    return {};
  }
}

export function saveEvents(events, showToast) {
  try {
    localStorage.setItem("lunarcal-events", JSON.stringify(events));
    return true;
  } catch {
    if (showToast) showToast("目前無法儲存事件，請檢查瀏覽器儲存權限");
    return false;
  }
}

export function loadHolidays() {
  try {
    const saved = localStorage.getItem("lunarcal-holidays");
    const list = saved ? JSON.parse(saved) : [];
    return Array.isArray(list) ? list.filter(isValidDateKey) : [];
  } catch {
    return [];
  }
}

export function saveHolidays(holidays, showToast) {
  try {
    localStorage.setItem("lunarcal-holidays", JSON.stringify(holidays));
    return true;
  } catch {
    if (showToast) showToast("目前無法儲存假期標記，請檢查瀏覽器儲存權限");
    return false;
  }
}

/** 同步讀取 localStorage 中的 data URL 背景（舊資料相容） */
export function loadBackground() {
  try {
    const source = localStorage.getItem("lunarcal-background-source");
    if (source === "idb") return null; // 改由 async 從 IndexedDB 載入
    return localStorage.getItem("lunarcal-background") || null;
  } catch {
    return null;
  }
}

/** 儲存小圖 data URL 到 localStorage；大圖請改用 saveBackgroundBlob */
export function saveBackground(dataUrl, showToast) {
  try {
    if (dataUrl) {
      localStorage.setItem("lunarcal-background", dataUrl);
      localStorage.setItem("lunarcal-background-source", "local");
    } else {
      localStorage.removeItem("lunarcal-background");
      localStorage.removeItem("lunarcal-background-source");
    }
    return true;
  } catch {
    if (showToast) showToast("無法儲存背景圖片（可能超出瀏覽器容量）");
    return false;
  }
}

export function loadBackgroundOpacity() {
  try {
    const saved = Number(localStorage.getItem("lunarcal-background-opacity"));
    return Number.isFinite(saved) ? Math.min(1, Math.max(0.15, saved)) : 0.42;
  } catch {
    return 0.42;
  }
}

export function saveBackgroundOpacity(opacity, showToast) {
  try {
    localStorage.setItem("lunarcal-background-opacity", String(opacity));
    return true;
  } catch {
    if (showToast) showToast("無法儲存背景透明度設定");
    return false;
  }
}

export function loadBackgroundBlur(fallback = 8) {
  try {
    const saved = Number(localStorage.getItem("lunarcal-background-blur"));
    return Number.isFinite(saved) ? Math.min(20, Math.max(0, saved)) : fallback;
  } catch {
    return fallback;
  }
}

export function saveBackgroundBlur(value, showToast) {
  try {
    localStorage.setItem("lunarcal-background-blur", String(value));
    return true;
  } catch {
    if (showToast) showToast("無法儲存介面 Blur 設定");
    return false;
  }
}

export function loadBackgroundBrightness(fallback = 1) {
  try {
    const saved = Number(localStorage.getItem("lunarcal-background-brightness"));
    return Number.isFinite(saved) ? Math.min(1.5, Math.max(0.5, saved)) : fallback;
  } catch {
    return fallback;
  }
}

export function saveBackgroundBrightness(value, showToast) {
  try {
    localStorage.setItem("lunarcal-background-brightness", String(value));
    return true;
  } catch {
    if (showToast) showToast("無法儲存背景亮度設定");
    return false;
  }
}

export function loadVisibleColors() {
  try {
    const saved = localStorage.getItem("lunarcal-visible-colors");
    if (saved === null || saved === undefined) return null;
    const list = JSON.parse(saved);
    if (!Array.isArray(list)) return null;
    const normalized = list
      .filter(c => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
      .map(c => c.toLowerCase());
    return new Set(normalized);
  } catch {
    return null;
  }
}

export function saveVisibleColors(setOrNull, showToast) {
  try {
    if (setOrNull === null) {
      localStorage.removeItem("lunarcal-visible-colors");
    } else {
      localStorage.setItem("lunarcal-visible-colors", JSON.stringify([...setOrNull]));
    }
    return true;
  } catch {
    if (showToast) showToast("無法儲存顏色篩選設定");
    return false;
  }
}

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeColorKey(color) {
  const safe = /^#[0-9a-f]{6}$/i.test(color || "") ? color : defaultEventColor;
  return safe.toLowerCase();
}
