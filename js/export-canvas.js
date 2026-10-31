/** 月曆 Canvas 繪製與 PNG／PDF 匯出 */

import { calendarState, today } from "./state.js";
import { weekdays } from "./constants.js";
import { eventsForDate } from "./events.js";
import {
  keyOf,
  pad,
  sameDay,
  monthLabel,
  eventColor,
  isOccurrenceCompleted,
  showToast,
} from "./utils.js";

function hexToRgba(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(37,99,235,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

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

export async function renderCalendarToCanvas(options = {}) {
  // GIF 時優先使用靜態第一幀，避免把完整大 GIF 解碼進 Canvas（易 OOM／超時）
  let bgImage =
    options.backgroundImage !== undefined ? options.backgroundImage : calendarState.backgroundImage;
  if (
    options.backgroundImage === undefined &&
    calendarState.backgroundIsGif &&
    calendarState.backgroundStaticImage
  ) {
    bgImage = calendarState.backgroundStaticImage;
  }
  const bgOpacity =
    options.backgroundOpacity !== undefined
      ? options.backgroundOpacity
      : calendarState.backgroundOpacity;
  const bgBlur =
    options.backgroundBlur !== undefined ? options.backgroundBlur : calendarState.backgroundBlur;
  const bgBrightness =
    options.backgroundBrightness !== undefined
      ? options.backgroundBrightness
      : calendarState.backgroundBrightness;

  const year = calendarState.viewDate.getFullYear();
  const month = calendarState.viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const rows = totalCells / 7;

  // ── 橫向 A4 尺寸（297mm × 210mm）@ 150 DPI ───────────────
  // 產出的 PNG 比例與實際列印尺寸對應橫向 A4，PDF 亦以此為準
  // 預覽與正式「匯出圖片」使用完全相同的解析度與參數
  const A4_W_MM = 297;
  const A4_H_MM = 210;
  const EXPORT_DPI = 150;
  const PX_PER_MM = EXPORT_DPI / 25.4;
  const width = Math.round(A4_W_MM * PX_PER_MM);   // ≈ 1754
  const height = Math.round(A4_H_MM * PX_PER_MM);  // ≈ 1240
  const scale = 2; // 實際 canvas 像素再 ×2，提升銳利度

  const padding = 28;
  const headerH = 70;
  const weekdayH = 38;
  const gridW = width - padding * 2;
  const gridH = height - padding * 2 - headerH - weekdayH;
  const cellW = gridW / 7;
  const cellH = gridH / rows;

  // 格子共用幾何參數；各格會依事件數量再動態縮放 chip 尺寸
  // 事件少、空間足 → 放大字級與 chip 高度方便閱讀；事件多 → 縮小以盡量顯示全部
  const dayNumAreaH = Math.min(36, Math.max(26, cellH * 0.28));
  const chipPadXBase = Math.max(5, cellW * 0.05);
  const moreLineHBase = 11;
  const minChipH = 10;
  const minGap = 1;
  // 空間充足時的舒適上限（依格子高度）
  const maxComfortChipH = Math.min(28, Math.max(18, cellH * 0.22));
  const maxComfortFont = Math.min(15, Math.max(12, Math.round(cellH * 0.11)));
  const idealGap = 3;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // ── 背景：使用指定或目前設定的透明度與 Blur ──
  if (bgImage) {
    const bgImg = new Image();
    // 大圖／殘留 blob URL 可能很慢或失敗，加 timeout 避免預覽卡死
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        bgImg.onload = null;
        bgImg.onerror = null;
        reject(new Error("背景圖片載入逾時"));
      }, 20000);
      bgImg.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      bgImg.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("背景圖片載入失敗"));
      };
      bgImg.src = bgImage;
    });

    const imgRatio = bgImg.width / bgImg.height;
    const canvasRatio = width / height;
    let drawW, drawH, offsetX, offsetY;
    if (imgRatio > canvasRatio) {
      drawH = height;
      drawW = height * imgRatio;
      offsetX = (width - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = width;
      drawH = width / imgRatio;
      offsetX = 0;
      offsetY = (height - drawH) / 2;
    }

    ctx.save();
    const filterParts = [];
    if (bgBlur > 0) filterParts.push(`blur(${bgBlur}px)`);
    if (bgBrightness !== 1) filterParts.push(`brightness(${bgBrightness})`);
    if (filterParts.length) ctx.filter = filterParts.join(" ");
    ctx.globalAlpha = bgOpacity;
    ctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    const overlayAlpha = 0.55 + (1 - bgOpacity) * 0.28;
    ctx.fillStyle = `rgba(255,255,255,${overlayAlpha})`;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // Title（僅年月，不顯示「月序 Calendar」）
  ctx.fillStyle = "#1f2937";
  ctx.font = "800 28px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(monthLabel(calendarState.viewDate), padding, padding + headerH / 2);

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
  ctx.fillStyle = "rgba(252,252,253,0.92)";
  ctx.fillRect(cardX + 0.5, cardY + 0.5, cardW - 1, weekdayH - 1);

  // Weekday labels
  ctx.font = "700 12px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif";
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
      ctx.fillStyle = "rgba(249,250,251,0.55)";
      ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
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
    const numX = x + 12;
    const numY = y + Math.min(18, dayNumAreaH * 0.55);
    if (isToday && !isMuted) {
      const cx = numX + 7;
      const cy = numY + 1;
      const radius = Math.min(13, dayNumAreaH * 0.42);
      ctx.fillStyle = isSundayOrHoliday ? "#dc2626" : "#2563eb";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(radius * 1.05)}px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(dateNumber), cx, cy + 0.5);
    } else {
      ctx.fillStyle = isMuted
        ? (isSundayOrHoliday ? "#fca5a5" : "#6b7280")
        : (isSundayOrHoliday ? "#dc2626" : "#303945");
      ctx.font = `700 ${Math.round(Math.min(16, dayNumAreaH * 0.5))}px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(dateNumber), numX, numY);
    }

    // Event chips：事件少 → 放大字級／高度方便閱讀；事件多 → 縮小以盡量顯示全部
    const availableForChips = Math.max(0, cellH - dayNumAreaH - 6);
    const eventCount = events.length;

    if (eventCount > 0 && availableForChips > 0) {
      const minTotalForAll = eventCount * minChipH + Math.max(0, eventCount - 1) * minGap;
      const canFitAll = minTotalForAll <= availableForChips;

      let showCount;
      let chipH;
      let chipGap;
      let chipPadY;
      let allowTwoLines;
      let fontSize;
      let chipPadX;
      let textInset;

      if (canFitAll) {
        showCount = eventCount;
        const gaps = Math.max(0, showCount - 1);

        // 依可用高度均分，事件越少、空間越多 → chip 越大（最高 maxComfortChipH）
        const roomPerChip = (availableForChips - gaps * idealGap) / showCount;
        chipH = Math.max(minChipH, Math.min(maxComfortChipH, Math.floor(roomPerChip)));
        chipGap = idealGap;

        // 垂直內距隨高度放大
        if (chipH >= 22) chipPadY = 5;
        else if (chipH >= 18) chipPadY = 4;
        else if (chipH >= 14) chipPadY = 3;
        else if (chipH >= 12) chipPadY = 2;
        else chipPadY = 1;

        // 字級隨 chip 高度放大，事件少時可達 maxComfortFont
        const lineHForFont = Math.max(8, chipH - chipPadY * 2);
        fontSize = Math.max(7, Math.min(maxComfortFont, Math.round(lineHForFont * 0.9)));

        // 事件少且空間充足時，水平內距略增，視覺更寬敞易讀
        if (showCount <= 2 && chipH >= 18) {
          chipPadX = Math.max(chipPadXBase, Math.min(10, cellW * 0.06));
          textInset = 8;
        } else if (chipH >= 16) {
          chipPadX = chipPadXBase;
          textInset = 7;
        } else {
          chipPadX = chipPadXBase;
          textInset = 6;
        }

        // 事件 ≤3 且空間足夠時允許雙行，以顯示較長標題
        allowTwoLines = showCount <= 3 && availableForChips >= showCount * (chipH + Math.round(lineHForFont * 0.75)) + gaps * chipGap;
        if (allowTwoLines) {
          const twoLineH = chipPadY * 2 + 2 * lineHForFont;
          const need = showCount * twoLineH + gaps * chipGap;
          if (need > availableForChips) allowTwoLines = false;
        }
      } else {
        // 最小尺寸仍放不下全部 → 盡量多放，剩餘 +N
        chipH = minChipH;
        chipGap = minGap;
        chipPadY = 0;
        allowTwoLines = false;
        fontSize = 7;
        chipPadX = chipPadXBase;
        textInset = 5;
        const moreH = moreLineHBase;
        const maxFit = Math.max(0, Math.floor((availableForChips - moreH + chipGap) / (chipH + chipGap)));
        showCount = Math.min(eventCount, Math.max(1, maxFit));
        if (showCount >= eventCount) showCount = eventCount;
      }

      const chipMaxW = cellW - chipPadX * 2;
      const chipTextMaxW = chipMaxW - textInset - 4;
      const lineH = Math.max(8, chipH - chipPadY * 2);
      const moreLineH = Math.max(9, Math.min(14, fontSize + 2));
      let chipY = y + dayNumAreaH;
      let usedH = 0;

      ctx.font = `600 ${fontSize}px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif`;

      for (let ei = 0; ei < showCount; ei += 1) {
        const event = events[ei];
        const color = eventColor(event);
        const completed = isOccurrenceCompleted(event, date);
        const cx = x + chipPadX;
        const maxLines = allowTwoLines ? 2 : 1;
        const lines = wrapTextLines(ctx, event.title || "", chipTextMaxW, maxLines);
        const thisChipH = allowTwoLines
          ? chipPadY * 2 + lines.length * lineH
          : chipH;

        if (usedH + thisChipH > availableForChips + 0.5) break;

        const radius = Math.min(4, Math.max(2, thisChipH / 4));
        ctx.fillStyle = hexToRgba(color, 0.12);
        roundRectPath(ctx, cx, chipY, chipMaxW, thisChipH, radius);
        ctx.fill();

        const barW = chipH >= 16 ? 3 : 2;
        const barH = Math.max(2, thisChipH - (chipH >= 16 ? 6 : 4));
        ctx.fillStyle = color;
        ctx.fillRect(cx, chipY + (thisChipH - barH) / 2, barW, barH);

        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        if (completed) ctx.globalAlpha = 0.55;

        lines.forEach((line, li) => {
          const ty = chipY + chipPadY + li * lineH + lineH / 2;
          ctx.fillText(line, cx + textInset, ty);
          if (completed) {
            const tw = ctx.measureText(line).width;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + textInset, ty);
            ctx.lineTo(cx + textInset + tw, ty);
            ctx.stroke();
          }
        });

        if (completed) ctx.globalAlpha = 1;
        chipY += thisChipH + chipGap;
        usedH += thisChipH + chipGap;
      }

      const remaining = eventCount - showCount;
      if (remaining > 0 && usedH + moreLineH <= availableForChips + 1) {
        ctx.fillStyle = "#adb4bd";
        ctx.font = `600 ${Math.max(7, fontSize - 1)}px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`+${remaining}`, x + chipPadX + 2, chipY + moreLineH / 2);
      }
    }
  }

  const monthKey = `${year}-${pad(month + 1)}`;
  return { canvas, width, height, scale, monthKey, mmW: A4_W_MM, mmH: A4_H_MM };
}

export async function exportCalendarImage() {
  try {
    const { canvas, monthKey } = await renderCalendarToCanvas();
    const link = document.createElement("a");
    link.download = `lunarcal-${monthKey}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("月曆圖片已匯出（橫向 A4）");
  } catch (err) {
    console.error(err);
    showToast("匯出圖片失敗，請稍後再試");
  }
}

export async function exportCalendarPdf() {
  try {
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      showToast("PDF 套件尚未載入，請檢查網路連線後重新整理");
      return;
    }
    // 直接使用與 PNG 相同的畫布，轉為真正的橫向 A4 PDF
    const { canvas, monthKey, mmW, mmH } = await renderCalendarToCanvas();
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, 0, mmW, mmH, undefined, "FAST");
    pdf.save(`lunarcal-${monthKey}.pdf`);
    showToast("月曆 PDF 已匯出（橫向 A4）");
  } catch (err) {
    console.error(err);
    showToast("匯出 PDF 失敗，請稍後再試");
  }
}
