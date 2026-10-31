/** 常數：星期、重複標籤、預設顏色、備份格式 */

export const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
export const weekdaysShort = ["日", "一", "二", "三", "四", "五", "六"];

export const repeatLabels = {
  none: "不重複",
  daily: "每天",
  weekly: "每週",
  monthly: "每月",
  monthEnd: "月尾",
};

export const defaultEventColor = "#2563eb";

export const presetEventColors = [
  { color: "#2563eb", label: "藍色" },
  { color: "#f28b5d", label: "橙色" },
  { color: "#9b8afb", label: "紫色" },
  { color: "#48a47e", label: "綠色" },
];

export const presetColorSet = new Set(
  presetEventColors.map(c => c.color.toLowerCase())
);

export const backupFormat = "lunarcal-calendar-backup";
export const backupVersion = 2;
