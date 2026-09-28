import { useEffect } from "react";
import { DEFAULT_SETTINGS, THEME_IDS, type ThemeId } from "../../shared/settings";
import { useSettings, useUpdateSettings } from "./api";

/**
 * 界面主题。CSS 部分见 styles.css 里的 [data-theme]；这里是 JS 里画的东西（地图、小地球、徽标）要用的颜色。
 * 选择存在服务端设置里，另在 localStorage 缓存一份，index.html 在页面渲染前就先套上，避免闪一下深色。
 */

export interface ThemeColors {
  /** 浏览器地址栏 / 状态栏颜色 */
  chrome: string;
  map: {
    ocean: string;
    land: string;
    visited: string;
    border: string;
    visitedBorder: string;
    graticule: string;
    airport: string;
    selected: string;
    /** 航线渐变：起点、终点 */
    routeFrom: [number, number, number];
    routeTo: [number, number, number];
    /** 大气光晕的强度 */
    atmosphere: number;
  };
  globe: {
    sphereFrom: string;
    sphereTo: string;
    halo: string;
    rim: string;
    graticule: string;
    land: string;
    border: string;
    route: string;
    dotStroke: string;
    depDot: string;
  };
  /** 星空背景（浅色主题不画） */
  stars: boolean;
}

export const THEMES: Record<ThemeId, { name: string; desc: string; swatch: [string, string, string]; colors: ThemeColors }> = {
  night: {
    name: "夜航",
    desc: "深色星空，琥珀色航线",
    swatch: ["#05080f", "#1c3157", "#ffb84d"],
    colors: {
      chrome: "#05080f",
      map: {
        ocean: "#07101f",
        land: "#111c30",
        visited: "#1c3157",
        border: "#1e2c47",
        visitedBorder: "#2f4a78",
        graticule: "rgba(140,170,220,0.06)",
        airport: "#ffcf7a",
        selected: "#ffffff",
        routeFrom: [255, 207, 122],
        routeTo: [255, 122, 92],
        atmosphere: 1,
      },
      globe: {
        sphereFrom: "#12213d",
        sphereTo: "#070e1c",
        halo: "120,170,255",
        rim: "rgba(140,180,255,0.18)",
        graticule: "rgba(140,170,220,0.07)",
        land: "#1a2944",
        border: "#0c1628",
        route: "#ffb84d",
        dotStroke: "#0b111d",
        depDot: "#ffffff",
      },
      stars: true,
    },
  },
  light: {
    name: "浅色",
    desc: "干净明亮，适合白天",
    swatch: ["#f3f5f9", "#c9d8f2", "#ec8a0c"],
    colors: {
      chrome: "#f3f5f9",
      map: {
        ocean: "#e8eef6",
        land: "#f8fafc",
        visited: "#d3e0f5",
        border: "#c6d2e3",
        visitedBorder: "#9fb5d8",
        graticule: "rgba(60,90,140,0.08)",
        airport: "#e07b00",
        selected: "#0f172a",
        routeFrom: [245, 158, 11],
        routeTo: [234, 88, 60],
        atmosphere: 0.35,
      },
      globe: {
        sphereFrom: "#f4f7fb",
        sphereTo: "#dfe7f2",
        halo: "90,130,200",
        rim: "rgba(60,90,140,0.22)",
        graticule: "rgba(60,90,140,0.08)",
        land: "#ffffff",
        border: "#c6d2e3",
        route: "#ec8a0c",
        dotStroke: "#ffffff",
        depDot: "#0f172a",
      },
      stars: false,
    },
  },
  retro: {
    name: "复古",
    desc: "米色纸张，老地图的配色",
    swatch: ["#efe5cf", "#c9a877", "#c2562a"],
    colors: {
      chrome: "#efe5cf",
      map: {
        ocean: "#e6d8b8",
        land: "#f4ebd6",
        visited: "#dcc39a",
        border: "#c4ad84",
        visitedBorder: "#a88758",
        graticule: "rgba(110,80,40,0.12)",
        airport: "#a8322a",
        selected: "#2d2217",
        routeFrom: [201, 104, 42],
        routeTo: [160, 44, 36],
        atmosphere: 0.25,
      },
      globe: {
        sphereFrom: "#efe3c8",
        sphereTo: "#dccaa3",
        halo: "150,110,60",
        rim: "rgba(110,80,40,0.3)",
        graticule: "rgba(110,80,40,0.12)",
        land: "#f7efdc",
        border: "#c4ad84",
        route: "#c2562a",
        dotStroke: "#f7efdc",
        depDot: "#2d2217",
      },
      stars: false,
    },
  },
};

const STORAGE_KEY = "hangji-theme";

export function cachedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (THEME_IDS as readonly string[]).includes(v)) return v as ThemeId;
  } catch {
    // 隐私模式等
  }
  return DEFAULT_SETTINGS.theme;
}

/** 把主题套到页面上：<html data-theme>、浏览器栏颜色，并缓存到本地 */
export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === "night") delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.style.colorScheme = theme === "night" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES[theme].colors.chrome);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 忽略
  }
}

/** 当前主题：服务端设置为准，加载前先用本地缓存 */
export function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const settings = useSettings();
  const update = useUpdateSettings();
  const theme = settings.data?.theme ?? cachedTheme();
  return [
    theme,
    (t) => {
      applyTheme(t);
      update.mutate({ theme: t });
    },
  ];
}

export function useThemeColors(): ThemeColors {
  return THEMES[useTheme()[0]].colors;
}

/** 设置加载后（或在别的设备上改了）同步到页面 */
export function useThemeSync() {
  const [theme] = useTheme();
  useEffect(() => applyTheme(theme), [theme]);
}
