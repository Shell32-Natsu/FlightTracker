import { useEffect, useState } from "react";

/**
 * 两步确认按钮：第一次点击进入确认状态，3 秒内再点一次才执行。
 * 用来代替 window.confirm（嵌入式页面里 confirm 会被直接拒绝）。
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel,
  className = "button danger",
  disabled,
  ariaLabel,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel: React.ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className}${armed ? " armed" : ""}`}
      disabled={disabled}
      aria-label={armed ? undefined : ariaLabel}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
