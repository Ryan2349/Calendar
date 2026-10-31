/** 自訂背景圖片、透明度、Blur、匯出預覽
 *  - 靜態圖：超過 2MB 自動縮圖壓縮為 JPEG
 *  - GIF：保留原始動畫（blob URL + IndexedDB），匯出時 Canvas 只取靜態第一幀
 *  - 大 GIF（>約 10MB）：一次抽出第一幀並快取，slider／預覽／匯出一律用靜態圖，避免重複解碼導致失敗或 OOM
 */

import { calendarState } from "./state.js";
import {
  saveBackground,
  saveBackgroundOpacity,
  saveBackgroundBlur,
  saveBackgroundBrightness,
  saveBackgroundBlob,
  clearBackgroundBlob,
} from "./storage.js";
import { showToast } from "./utils.js";
import { renderColorFilterControls } from "./render.js";
import { renderCalendarToCanvas } from "./export-canvas.js";

let previewUpdateTimer = null;
let previewGenerationId = 0;

/** 將靜態大圖縮放並壓縮成 JPEG Data URL（會失去動畫，僅用於非 GIF） */
async function compressImageForBackground(file, maxWidth = 2560, maxHeight = 1440, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
      const targetW = Math.round(width * ratio);
      const targetH = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取圖片"));
    };
    img.src = url;
  });
}

/**
 * 從 GIF（或任何圖片 Blob/File）抽出第一幀，縮放後壓成 JPEG data URL。
 * 大 GIF 解碼成本高，必須限制尺寸並只做一次，之後預覽／匯出都用此靜態圖。
 */
async function extractFirstFrameAsJpeg(blobOrFile, maxWidth = 1920, maxHeight = 1080, quality = 0.82) {
  // 優先使用 createImageBitmap（較省記憶體、可指定尺寸）
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blobOrFile, {
        resizeWidth: maxWidth,
        resizeHeight: maxHeight,
        resizeQuality: "high",
      });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return canvas.toDataURL("image/jpeg", quality);
    } catch (err) {
      console.warn("createImageBitmap failed, fallback to Image()", err);
    }
  }

  // Fallback：Image + canvas
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
        const targetW = Math.max(1, Math.round(width * ratio));
        const targetH = Math.max(1, Math.round(height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取 GIF 第一幀"));
    };
    img.src = url;
  });
}

function isGifFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  if (type === "image/gif") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".gif");
}

export function applyBackground() {
  const bg = calendarState.backgroundImage;
  const blur = calendarState.backgroundBlur;
  document.body.style.setProperty("--calendar-blur", `${blur}px`);
  document.body.style.setProperty("--header-blur", `${blur}px`);
  document.body.style.setProperty("--sidebar-blur", `${blur}px`);
  if (bg) {
    // blob: / data: 都可用於 CSS background；GIF 的 blob URL 會播放動畫
    document.body.style.setProperty("--custom-bg", `url("${bg}")`);
    document.body.style.setProperty("--custom-bg-opacity", String(calendarState.backgroundOpacity));
    document.body.style.setProperty("--custom-bg-brightness", String(calendarState.backgroundBrightness));
    document.body.classList.add("has-custom-bg");
  } else {
    document.body.style.removeProperty("--custom-bg");
    document.body.style.removeProperty("--custom-bg-opacity");
    document.body.style.removeProperty("--custom-bg-brightness");
    document.body.classList.remove("has-custom-bg");
  }
}

export function openBackgroundModal() {
  calendarState.pendingBackground = calendarState.backgroundImage;
  calendarState.pendingBackgroundOpacity = calendarState.backgroundOpacity;
  calendarState.pendingBackgroundBlur = calendarState.backgroundBlur;
  calendarState.pendingBackgroundBrightness = calendarState.backgroundBrightness;
  calendarState.pendingBackgroundIsGif = calendarState.backgroundIsGif;
  calendarState.pendingBackgroundBlob = null;
  calendarState.pendingBackgroundStatic = calendarState.backgroundStaticImage;
  updateBackgroundOpacityControl(calendarState.pendingBackgroundOpacity);
  updateBackgroundBrightnessControl(calendarState.pendingBackgroundBrightness);
  updateBackgroundBlurControl(calendarState.pendingBackgroundBlur);
  renderColorFilterControls();
  document.querySelector("#backgroundModal").hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => document.querySelector("#selectBackgroundButton").focus());
  scheduleExportPreviewUpdate(true);
}

export function closeBackgroundModal() {
  document.querySelector("#backgroundModal").hidden = true;
  // 若有未套用的 pending blob URL，釋放之
  if (
    calendarState.pendingBackground &&
    calendarState.pendingBackground.startsWith("blob:") &&
    calendarState.pendingBackground !== calendarState.backgroundImage
  ) {
    try {
      URL.revokeObjectURL(calendarState.pendingBackground);
    } catch {
      /* ignore */
    }
  }
  calendarState.pendingBackground = null;
  calendarState.pendingBackgroundOpacity = null;
  calendarState.pendingBackgroundBlur = null;
  calendarState.pendingBackgroundBrightness = null;
  calendarState.pendingBackgroundIsGif = false;
  calendarState.pendingBackgroundBlob = null;
  calendarState.pendingBackgroundStatic = null;
  calendarState.pendingExportPreviewUrl = null;
  clearTimeout(previewUpdateTimer);
  previewUpdateTimer = null;
  updateBackgroundBlurControl(calendarState.backgroundBlur);
  if (calendarState.backgroundImage) {
    document.body.style.setProperty("--custom-bg-opacity", String(calendarState.backgroundOpacity));
    document.body.style.setProperty("--custom-bg-brightness", String(calendarState.backgroundBrightness));
  } else {
    document.body.style.removeProperty("--custom-bg-opacity");
    document.body.style.removeProperty("--custom-bg-brightness");
  }
  document.body.classList.remove("modal-open");
  setExportPreviewImage(null);
}

function setExportPreviewImage(dataUrl, isLoading = false) {
  const wrap = document.querySelector("#backgroundPreviewWrap");
  const img = document.querySelector("#backgroundPreview");
  const loading = document.querySelector("#backgroundPreviewLoading");
  if (isLoading) {
    wrap.hidden = false;
    if (loading) loading.hidden = false;
    if (!img.getAttribute("src")) {
      img.hidden = true;
    }
    return;
  }
  if (loading) loading.hidden = true;
  if (dataUrl) {
    img.src = dataUrl;
    img.hidden = false;
    img.style.opacity = "1";
    wrap.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    wrap.hidden = true;
  }
}

export function updateBackgroundOpacityControl(opacity) {
  const input = document.querySelector("#backgroundOpacityInput");
  const output = document.querySelector("#backgroundOpacityValue");
  const percent = Math.round(opacity * 100);
  input.value = String(percent);
  output.textContent = `${percent}%`;
  document.body.style.setProperty("--custom-bg-opacity", String(opacity));
}

export function updateBackgroundBrightnessControl(brightness) {
  const input = document.querySelector("#backgroundBrightnessInput");
  const output = document.querySelector("#backgroundBrightnessValue");
  const percent = Math.round(brightness * 100);
  input.value = String(percent);
  output.textContent = `${percent}%`;
  document.body.style.setProperty("--custom-bg-brightness", String(brightness));
}

export function updateBackgroundBlurControl(value) {
  const input = document.querySelector("#backgroundBlurInput");
  const output = document.querySelector("#backgroundBlurValue");
  input.value = String(value);
  output.textContent = `${value}px`;
  document.body.style.setProperty("--calendar-blur", `${value}px`);
  document.body.style.setProperty("--header-blur", `${value}px`);
  document.body.style.setProperty("--sidebar-blur", `${value}px`);
}

export function scheduleExportPreviewUpdate(immediate = false) {
  clearTimeout(previewUpdateTimer);
  if (immediate) {
    generateExportPreview();
    return;
  }
  previewUpdateTimer = setTimeout(() => generateExportPreview(), 180);
}

/**
 * 產生匯出預覽。
 * 對 GIF：一律使用已抽出的靜態第一幀，絕不把完整大 GIF 丟進 Canvas。
 */
async function generateExportPreview() {
  const dataUrl = calendarState.pendingBackground;
  if (!dataUrl) {
    calendarState.pendingExportPreviewUrl = null;
    setExportPreviewImage(null);
    return;
  }
  const genId = ++previewGenerationId;
  setExportPreviewImage(null, true);
  try {
    const opacity = calendarState.pendingBackgroundOpacity ?? calendarState.backgroundOpacity;
    const blur = calendarState.pendingBackgroundBlur ?? calendarState.backgroundBlur;
    const brightness =
      calendarState.pendingBackgroundBrightness ?? calendarState.backgroundBrightness;

    // GIF 優先使用靜態第一幀；沒有則用原圖（小 GIF 仍可接受）
    const isGif = calendarState.pendingBackgroundIsGif;
    let canvasSource = dataUrl;
    if (isGif) {
      let staticFrame =
        calendarState.pendingBackgroundStatic || calendarState.backgroundStaticImage;
      if (!staticFrame) {
        // 補抽：來自 pending 選檔，或舊版 IDB 還沒有 staticDataUrl
        const sourceBlob =
          calendarState.pendingBackgroundBlob || calendarState._gifNeedsStaticExtract;
        if (sourceBlob) {
          try {
            staticFrame = await extractFirstFrameAsJpeg(sourceBlob);
            calendarState.pendingBackgroundStatic = staticFrame;
            // 若已是正式背景，一併寫回 state，之後不用再抽
            if (!calendarState.pendingBackgroundBlob && calendarState.backgroundIsGif) {
              calendarState.backgroundStaticImage = staticFrame;
              calendarState._gifNeedsStaticExtract = null;
            }
          } catch (e) {
            console.warn("preview extract first frame failed", e);
          }
        }
      }
      if (staticFrame) canvasSource = staticFrame;
    }

    const { canvas } = await renderCalendarToCanvas({
      backgroundImage: canvasSource,
      backgroundOpacity: opacity,
      backgroundBlur: blur,
      backgroundBrightness: brightness,
    });
    if (genId !== previewGenerationId) return;
    const previewUrl = canvas.toDataURL("image/png");
    calendarState.pendingExportPreviewUrl = previewUrl;
    setExportPreviewImage(previewUrl);
  } catch (err) {
    console.error(err);
    if (genId === previewGenerationId) {
      setExportPreviewImage(null);
      showToast("無法產生匯出預覽（大 GIF 請稍候或改用較小檔案）");
    }
  }
}

export function openFullExportPreview() {
  const src =
    calendarState.pendingExportPreviewUrl || document.querySelector("#backgroundPreview")?.src;
  if (!src) return;
  let overlay = document.querySelector("#fullExportPreviewOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "fullExportPreviewOverlay";
    overlay.className = "full-export-preview-overlay";
    overlay.innerHTML = `
      <div class="full-export-preview-inner">
        <button type="button" class="full-export-preview-close" aria-label="關閉全圖預覽">×</button>
        <img alt="月曆匯出全圖預覽" />
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.closest(".full-export-preview-close")) {
        overlay.hidden = true;
        document.body.classList.remove("full-preview-open");
      }
    });
  }
  const img = overlay.querySelector("img");
  img.src = src;
  overlay.hidden = false;
  document.body.classList.add("full-preview-open");
}

/**
 * 選擇背景檔案：
 * - GIF：保留原始檔，以 blob URL 顯示（網頁可動畫），存 IndexedDB；同時抽出第一幀給預覽／匯出
 * - 靜態圖 > 2MB：縮圖壓縮為 JPEG
 * - 小靜態圖：直接 data URL
 */
export async function handleBackgroundFileSelect(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("請選擇有效的圖片檔案");
    return;
  }

  // 仍擋極端大檔避免記憶體爆掉（GIF 與靜態圖共用）
  if (file.size > 120 * 1024 * 1024) {
    showToast("圖片過大（建議 120MB 以內）");
    return;
  }

  const isGif = isGifFile(file);
  const isLarge = file.size > 4 * 1024 * 1024;

  if (isGif && isLarge) {
    showToast("GIF 較大，正在載入並產生預覽幀（將保留動畫）…");
  } else if (isLarge && !isGif) {
    showToast("圖片較大，正在壓縮處理…");
  }

  try {
    // 釋放上一次未套用的 pending blob
    if (
      calendarState.pendingBackground &&
      calendarState.pendingBackground.startsWith("blob:") &&
      calendarState.pendingBackground !== calendarState.backgroundImage
    ) {
      try {
        URL.revokeObjectURL(calendarState.pendingBackground);
      } catch {
        /* ignore */
      }
    }

    if (isGif) {
      // 保留完整 GIF → blob URL 可在 CSS 背景播放動畫
      const blobUrl = URL.createObjectURL(file);
      calendarState.pendingBackground = blobUrl;
      calendarState.pendingBackgroundIsGif = true;
      calendarState.pendingBackgroundBlob = file;
      calendarState.pendingBackgroundStatic = null;

      // 同步抽出第一幀（大檔可能需數秒），完成後再觸發預覽
      try {
        const staticFrame = await extractFirstFrameAsJpeg(file);
        calendarState.pendingBackgroundStatic = staticFrame;
        scheduleExportPreviewUpdate(true);
        if (isLarge) showToast("GIF 已就緒（網頁端將播放動畫，預覽使用靜態幀）");
      } catch (extractErr) {
        console.error(extractErr);
        // 即使抽出失敗，仍可套用動畫背景；預覽可能失敗
        calendarState.pendingBackgroundStatic = null;
        scheduleExportPreviewUpdate(true);
        showToast("GIF 已載入，但無法產生預覽幀（檔案可能過大）");
      }
      return;
    }

    // 靜態圖
    calendarState.pendingBackgroundIsGif = false;
    calendarState.pendingBackgroundBlob = null;
    calendarState.pendingBackgroundStatic = null;
    let dataUrl;
    if (file.size > 2 * 1024 * 1024) {
      dataUrl = await compressImageForBackground(file);
    } else {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("讀取圖片失敗"));
        reader.readAsDataURL(file);
      });
    }
    calendarState.pendingBackground = dataUrl;
    scheduleExportPreviewUpdate(true);
    if (isLarge) showToast("圖片已壓縮並就緒");
  } catch (err) {
    console.error(err);
    showToast(err.message || "讀取圖片失敗");
  }
}

export async function applySelectedBackground() {
  const dataUrl = calendarState.pendingBackground;
  const opacity = calendarState.pendingBackgroundOpacity ?? calendarState.backgroundOpacity;
  const blur = calendarState.pendingBackgroundBlur ?? calendarState.backgroundBlur;
  const brightness =
    calendarState.pendingBackgroundBrightness ?? calendarState.backgroundBrightness;
  const isGif = calendarState.pendingBackgroundIsGif;
  const pendingBlob = calendarState.pendingBackgroundBlob;
  const staticFrame = calendarState.pendingBackgroundStatic;

  if (
    dataUrl === calendarState.backgroundImage &&
    opacity === calendarState.backgroundOpacity &&
    blur === calendarState.backgroundBlur &&
    brightness === calendarState.backgroundBrightness
  ) {
    // 參數完全沒變，直接關閉（GIF 靜態幀也已就緒）
    closeBackgroundModal();
    return;
  }

  // 先存設定值
  if (
    !saveBackgroundOpacity(opacity, showToast) ||
    !saveBackgroundBlur(blur, showToast) ||
    !saveBackgroundBrightness(brightness, showToast)
  ) {
    return;
  }

  if (!dataUrl) {
    // 移除背景
    await clearBackgroundBlob(showToast);
    saveBackground(null, showToast);
    if (calendarState.backgroundBlobUrl) {
      try {
        URL.revokeObjectURL(calendarState.backgroundBlobUrl);
      } catch {
        /* ignore */
      }
    }
    calendarState.backgroundImage = null;
    calendarState.backgroundBlobUrl = null;
    calendarState.backgroundIsGif = false;
    calendarState.backgroundStaticImage = null;
  } else if (isGif) {
    // 已有 GIF 背景，只改透明度／亮度／Blur，或重新選了同一張
    if (pendingBlob) {
      // 新選的 GIF 檔
      let frameToSave = staticFrame;
      if (!frameToSave) {
        try {
          frameToSave = await extractFirstFrameAsJpeg(pendingBlob);
        } catch (e) {
          console.warn("apply: extract first frame failed", e);
          frameToSave = null;
        }
      }

      const ok = await saveBackgroundBlob(
        pendingBlob,
        { isGif: true, mime: "image/gif", staticDataUrl: frameToSave || undefined },
        showToast
      );
      if (!ok) return;

      if (calendarState.backgroundBlobUrl) {
        try {
          URL.revokeObjectURL(calendarState.backgroundBlobUrl);
        } catch {
          /* ignore */
        }
      }
      // pending 的 blob URL 可直接沿用為正式 URL
      calendarState.backgroundBlobUrl = dataUrl;
      calendarState.backgroundImage = dataUrl;
      calendarState.backgroundIsGif = true;
      calendarState.backgroundStaticImage = frameToSave || null;
      calendarState.pendingBackgroundBlob = null; // 已正式採用，勿在 close 時 revoke
    } else {
      // 僅調整參數：保持現有 IDB blob 與 static，只更新 opacity 等
      calendarState.backgroundIsGif = true;
      if (staticFrame) calendarState.backgroundStaticImage = staticFrame;
      // backgroundImage / backgroundBlobUrl 不變
    }
  } else {
    // 靜態圖 data URL
    // 若先前是 IDB GIF，先清掉
    await clearBackgroundBlob();
    if (!saveBackground(dataUrl, showToast)) return;

    if (calendarState.backgroundBlobUrl) {
      try {
        URL.revokeObjectURL(calendarState.backgroundBlobUrl);
      } catch {
        /* ignore */
      }
    }
    calendarState.backgroundBlobUrl = null;
    calendarState.backgroundImage = dataUrl;
    calendarState.backgroundIsGif = false;
    calendarState.backgroundStaticImage = null;
  }

  calendarState.backgroundOpacity = opacity;
  calendarState.backgroundBlur = blur;
  calendarState.backgroundBrightness = brightness;
  applyBackground();
  closeBackgroundModal();
  showToast(dataUrl ? (isGif ? "GIF 背景已套用（可動畫）" : "背景已套用") : "背景已移除");
}

export function removePendingBackground() {
  if (
    calendarState.pendingBackground &&
    calendarState.pendingBackground.startsWith("blob:") &&
    calendarState.pendingBackground !== calendarState.backgroundImage
  ) {
    try {
      URL.revokeObjectURL(calendarState.pendingBackground);
    } catch {
      /* ignore */
    }
  }
  calendarState.pendingBackground = null;
  calendarState.pendingBackgroundIsGif = false;
  calendarState.pendingBackgroundBlob = null;
  calendarState.pendingBackgroundStatic = null;
  calendarState.pendingExportPreviewUrl = null;
  clearTimeout(previewUpdateTimer);
  previewUpdateTimer = null;
  setExportPreviewImage(null);
}
