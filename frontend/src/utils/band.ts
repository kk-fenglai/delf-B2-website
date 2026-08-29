// IELTS raw(0..40) → band 换算。表来自 catalogue（后端体系配置），降序阈值,
// 第一个 min ≤ raw 的条目命中。
export interface BandThreshold { min: number; band: number }

export function bandFromRaw(bands: BandThreshold[] | undefined | null, raw: number): number | null {
  if (!bands?.length) return null;
  const hit = [...bands].sort((a, b) => b.min - a.min).find((b) => raw >= b.min);
  return hit ? hit.band : null;
}
