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
    /** 沿航线飞过的光点 */
    comet: [number, number, number];
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
    routeFrom: string;
    routeTo: string;
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
    swatch: ["#060a14", "#24457f", "#ffb84d"],
    colors: {
      chrome: "#060a14",
      map: {
        ocean: "#0a1832",
        land: "#1a2a49",
        visited: "#2a4a8a",
        border: "#2a3d63",
        visitedBorder: "#4a70b8",
        graticule: "rgba(140,170,220,0.07)",
        airport: "#ffcf7a",
        selected: "#ffffff",
        comet: [255, 246, 222],
        routeFrom: [255, 207, 122],
        routeTo: [255, 122, 92],
      },
      globe: {
        sphereFrom: "#17305e",
        sphereTo: "#081226",
        halo: "120,170,255",
        rim: "rgba(140,180,255,0.18)",
        graticule: "rgba(140,170,220,0.07)",
        land: "#2c4678",
        border: "#142443",
        route: "#ffb84d",
        routeFrom: "#ffd48a",
        routeTo: "#ff7a5c",
        dotStroke: "#0b111d",
        depDot: "#ffffff",
      },
      stars: true,
    },
  },
  light: {
    name: "浅色",
    desc: "干净明亮，适合白天",
    swatch: ["#eaf1fb", "#c4daf3", "#e07b00"],
    colors: {
      chrome: "#f3f5f9",
      map: {
        ocean: "#c4daf3",
        land: "#f7fafd",
        visited: "#ffdca6",
        border: "#c3d1e4",
        visitedBorder: "#e3ab5c",
        graticule: "rgba(255,255,255,0.5)",
        airport: "#d06a00",
        selected: "#0f172a",
        comet: [196, 52, 24],
        routeFrom: [238, 140, 0],
        routeTo: [222, 70, 44],
      },
      globe: {
        sphereFrom: "#d9e8f9",
        sphereTo: "#a9c8ea",
        halo: "90,130,200",
        rim: "rgba(60,90,140,0.22)",
        graticule: "rgba(255,255,255,0.45)",
        land: "#fbfcfe",
        border: "#c6d2e3",
        route: "#ec8a0c",
        routeFrom: "#ee8c00",
        routeTo: "#de462c",
        dotStroke: "#ffffff",
        depDot: "#0f172a",
      },
      stars: false,
    },
  },
  retro: {
    name: "复古",
    desc: "米色纸张，老地图的配色",
    swatch: ["#f1e7d0", "#b7c8bd", "#c2562a"],
    colors: {
      chrome: "#efe5cf",
      map: {
        ocean: "#b7c8bd",
        land: "#f4e8cb",
        visited: "#e2ba7a",
        border: "#c2a673",
        visitedBorder: "#a3763b",
        graticule: "rgba(70,70,50,0.16)",
        airport: "#a8322a",
        selected: "#2d2217",
        comet: [122, 24, 18],
        routeFrom: [194, 86, 30],
        routeTo: [152, 34, 28],
      },
      globe: {
        sphereFrom: "#cbd6c6",
        sphereTo: "#9fb4a8",
        halo: "150,110,60",
        rim: "rgba(110,80,40,0.3)",
        graticule: "rgba(110,80,40,0.12)",
        land: "#f7efdc",
        border: "#c4ad84",
        route: "#c2562a",
        routeFrom: "#c2561e",
        routeTo: "#98221c",
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
