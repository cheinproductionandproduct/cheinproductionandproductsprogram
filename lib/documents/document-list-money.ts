/**
 * Pure helpers for document list / APR dashboard (safe for client components).
 */

export function coerceFiniteMoney(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Money for list cards and APR dashboard total.
 * For ใบเบิก (APR), prefer `items.total` (sum of lines) over `totalAmount` — `totalAmount` can be stale after line edits.
 */
export function getDocumentListMoneyTotal(data: unknown): number | null {
  const d = data as Record<string, unknown> | null
  if (!d || typeof d !== 'object') return null
  const items = d.items as Record<string, unknown> | undefined
  if (items && typeof items === 'object' && 'total' in items) {
    const t = coerceFiniteMoney(items.total)
    if (t !== null) return t
  }
  const ta = coerceFiniteMoney(d.totalAmount)
  if (ta !== null) return ta
  const te = coerceFiniteMoney(d.totalExpenses)
  if (te !== null) return te
  const aa = coerceFiniteMoney(d.advanceAmount)
  if (aa !== null) return aa
  return null
}
