import { useEffect, useRef, useState } from "react";
import { aircraftFamily } from "../../shared/aircraft";
import { AircraftProfile } from "../aircraft/AircraftProfile";
import type { RefData } from "../lib/refdata";
import type { SnapshotSize } from "./snapshot";
import { usePaint } from "./usePaint";

interface Props {
  type: string;
  airline?: string | null;
  refData: RefData;
  className?: string;
  /** card 是机库卡片，thumb 是列表里的小图 */
  size?: SnapshotSize;
}

/** 徽标迟迟不来时，等这么久就先画没有徽标的 */
const LOGO_WAIT = 3000;

/** 3D 飞机的静态图：快滚到时才加载 three.js 渲染一张。画不了就用侧视图。 */
export function AircraftPicture({ type, airline = null, refData, className = "", size = "card" }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const { paint, ready } = usePaint(airline, refData);
  const [near, setNear] = useState(false);
  const [picture, setPicture] = useState<{ subject: string; url: string } | null>(null);
  const known = !!aircraftFamily(type);
  const subject = `${type}|${airline ?? ""}`;
  const [failed, setFailed] = useState<string | null>(null);
  const [late, setLate] = useState<string | null>(null);
  const waited = late === subject;
  const profile = !known || failed === subject;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [profile]);

  useEffect(() => {
    const t = setTimeout(() => setLate(subject), LOGO_WAIT);
    return () => clearTimeout(t);
  }, [subject]);

  useEffect(() => {
    if (profile || !near || !(ready || waited)) return;
    let live = true;
    const key = JSON.stringify([size, subject, paint.livery, !!paint.logo]);
    import("./snapshot")
      .then((s) => s.aircraftSnapshot(key, type, paint, size))
      .then(
        (url) => live && setPicture({ subject, url }),
        () => live && setFailed(subject),
      );
    return () => {
      live = false;
    };
  }, [profile, near, ready, waited, paint, subject, type, size]);

  if (profile) return <AircraftProfile type={type} airline={airline} refData={refData} className={className} />;
  return (
    <span ref={host} className={`aircraft-picture ${className}`}>
      {picture?.subject === subject && <img src={picture.url} alt={refData.aircraft[type] ?? type} draggable={false} />}
    </span>
  );
}
