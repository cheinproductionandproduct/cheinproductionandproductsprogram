/** First validation message from react-hook-form / zod error tree */
export function firstFormErrorMessage(errors: Record<string, unknown>): string | null {
  for (const v of Object.values(errors)) {
    if (v && typeof v === 'object' && v !== null && 'message' in v && (v as { message?: string }).message) {
      return String((v as { message: string }).message)
    }
    if (v && typeof v === 'object' && v !== null) {
      const n = firstFormErrorMessage(v as Record<string, unknown>)
      if (n) return n
    }
  }
  return null
}
