// IELTS raw(0..40) → band 换算。表来自 catalogue（后端体系配置），降序阈值,
// 第一个 min ≤ raw 的条目命中。
export interface BandThreshold { min: number; band: number }

// TCF：正确率(0..100) → 估算 CEFR 等级。升序阈值，最后一个 minPct ≤ pct 的条目命中。
export function cefrFromPct(bands: Array<{ minPct: number; level: string }> | undefined | null, pct: number): string | null {
  if (!bands?.length) return null;
  const hit = [...bands].sort((a, b) => a.minPct - b.minPct).filter((b) => pct >= b.minPct).pop();
  return hit ? hit.level : null;
}

export function bandFromRaw(bands: BandThreshold[] | undefined | null, raw: number): number | null {
  if (!bands?.length) return null;
  const hit = [...bands].sort((a, b) => b.min - a.min).find((b) => raw >= b.min);
  return hit ? hit.band : null;
}
