import { useQuery } from "@tanstack/react-query";
import type { Topology } from "topojson-specification";
import type { Airline, Airport, Country } from "../../shared/types";

export interface RefData {
  airports: Record<string, Airport>;
  countries: Record<string, Country>;
  airlines: Record<string, Airline>;
  aircraft: Record<string, string>;
}

async function load<T>(name: string): Promise<T> {
  const res = await fetch(`/refdata/${name}.json`);
  if (!res.ok) throw new Error(`加载参考数据 ${name} 失败`);
  return res.json();
}

/** 参考数据：页面加载一次后常驻内存。 */
export function useRefData() {
  return useQuery({
    queryKey: ["refdata"],
    queryFn: async (): Promise<RefData> => {
      const [airports, countries, airlines, aircraft] = await Promise.all([
        load<RefData["airports"]>("airports"),
        load<RefData["countries"]>("countries"),
        load<RefData["airlines"]>("airlines"),
        load<RefData["aircraft"]>("aircraft"),
      ]);
      return { airports, countries, airlines, aircraft };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** 国界 TopoJSON（Natural Earth 1:50m），只有地图页需要。 */
export function useWorldTopo() {
  return useQuery({
    queryKey: ["world-topo"],
    queryFn: () => load<Topology>("countries-50m"),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
