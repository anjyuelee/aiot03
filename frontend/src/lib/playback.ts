type Values = Map<string, number | null>

/** 兩個預報時段之間線性內插；任一端缺值時取有值的那端 */
export function lerpValues(a: Values | null, b: Values | null, f: number): Values {
  if (!a) return b ?? new Map()
  if (!b) return a
  const out: Values = new Map()
  a.forEach((va, id) => {
    const vb = b.get(id) ?? null
    out.set(id, va == null ? vb : vb == null ? va : va + (vb - va) * f)
  })
  return out
}

/** 播放前進 dt 毫秒（每格 stepMs）；走到最後一格後回到「現在」重播 */
export function advancePos(pos: number, dt: number, max: number, stepMs: number): number {
  const next = pos + dt / stepMs
  return next >= max ? 0 : next
}
