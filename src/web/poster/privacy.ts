import { useState } from "react";

/**
 * “隐藏隐私信息”开关：海报和动画共用，记在本机。
 * 打开后导出的图片 / 视频里不出现航班号、具体日期（只留年份）、起降时刻、座位和持有人姓名，
 * 文件名里也不带这些。
 */

const STORAGE_KEY = "export-hide-private";

export function usePrivateMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  return [
    on,
    (v) => {
      setOn(v);
      try {
        localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
      } catch {
        // 隐私模式等
      }
    },
  ];
}

/** "2024-03-05" 的年份；一段日期跨年时写成 "2023–2024" */
export function yearSpan(dates: string[]): string {
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))].sort();
  if (!years.length) return "";
  return years.length === 1 ? years[0] : `${years[0]}–${years.at(-1)}`;
}
