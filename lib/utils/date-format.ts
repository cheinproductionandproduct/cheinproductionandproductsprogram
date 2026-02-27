/**
 * Format a date as d/m/y (dd/mm/yyyy)
 */
export function formatDateDMY(date: Date | string | null | undefined): string {
  if (date == null || date === '') return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Parse d/m/y or dd/mm/yyyy string to YYYY-MM-DD for storage
 */
export function parseDateDMY(input: string): string {
  if (!input || typeof input !== 'string') return ''
  const trimmed = input.trim()
  const parts = trimmed.split(/[/\-.]/)
  if (parts.length !== 3) return ''
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parseInt(parts[2], 10)
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return ''
  if (year < 100) return '' // require 4-digit year
  const d = new Date(year, month, day)
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return ''
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
