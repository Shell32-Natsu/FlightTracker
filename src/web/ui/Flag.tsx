import { useState } from "react";

/** 国家/地区旗帜（本地 SVG，Windows 上旗帜 emoji 不显示，所以不用 emoji）。 */
export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size * 1.5, height: size };
  if (failed) {
    return (
      <span className="flag flag-fallback" style={style}>
        {code}
      </span>
    );
  }
  return (
    <img
      className="flag"
      src={`/flags/${code}.svg`}
      alt=""
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
