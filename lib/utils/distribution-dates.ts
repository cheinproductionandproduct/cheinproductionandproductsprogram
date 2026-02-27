/**
 * Money distribution is every Friday. Document must be submitted at least 7 days in advance.
 * Valid "วันที่ต้องใช้เงิน" (date money needed) = these distribution Fridays only.
 */

// 2026 distribution Fridays (day/month/year) → stored as YYYY-MM-DD
const FRIDAYS_2026_DMY = [
  '06/03/2026', '13/03/2026', '20/03/2026', '27/03/2026',
  '03/04/2026', '10/04/2026', '17/04/2026', '24/04/2026',
  '08/05/2026', '15/05/2026', '22/05/2026', '29/05/2026',
  '05/06/2026', '12/06/2026', '19/06/2026', '26/06/2026',
  '03/07/2026', '10/07/2026', '17/07/2026', '24/07/2026', '31/07/2026',
  '07/08/2026', '14/08/2026', '21/08/2026', '28/08/2026',
  '04/09/2026', '11/09/2026', '18/09/2026', '25/09/2026',
  '02/10/2026', '09/10/2026', '16/10/2026', '30/10/2026',
  '06/11/2026', '13/11/2026', '20/11/2026', '27/11/2026',
  '04/12/2026', '11/12/2026', '18/12/2026', '25/12/2026',
]

function dmyToISO(dmy: string): string {
  const [d, m, y] = dmy.split('/').map(Number)
  if (!d || !m || !y) return ''
  const month = String(m).padStart(2, '0')
  const day = String(d).padStart(2, '0')
  return `${y}-${month}-${day}`
}

const VALID_DATES_SET_2026 = new Set(FRIDAYS_2026_DMY.map(dmyToISO))

/** All valid distribution dates (YYYY-MM-DD) for 2026 */
export const DISTRIBUTION_DATES_2026: string[] = Array.from(VALID_DATES_SET_2026).sort()

/** Check if date (YYYY-MM-DD) is a valid distribution Friday */
export function isValidDistributionDate(isoDate: string): boolean {
  if (!isoDate || isoDate.length !== 10) return false
  const year = isoDate.slice(0, 4)
  if (year === '2026') return VALID_DATES_SET_2026.has(isoDate)
  // Other years: allow any Friday (optional; add more lists if needed)
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return false
  return d.getDay() === 5 // 5 = Friday
}

/** Check that today is at least 7 days before the distribution date (submit in advance) */
export function isAtLeast7DaysBefore(isoDate: string): boolean {
  if (!isoDate || isoDate.length !== 10) return false
  const dist = new Date(isoDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dist.setHours(0, 0, 0, 0)
  const daysDiff = (dist.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  return daysDiff >= 7
}

function isoToLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Get list of valid distribution dates (YYYY-MM-DD) for the current and next year, for dropdowns */
export function getDistributionDatesForDisplay(): { value: string; label: string }[] {
  const thisYear = new Date().getFullYear()
  const nextYear = thisYear + 1
  const result: { value: string; label: string }[] = []
  if (thisYear === 2026 || nextYear === 2026) {
    DISTRIBUTION_DATES_2026.forEach((iso) => {
      result.push({ value: iso, label: isoToLabel(iso) })
    })
  }
  if (result.length === 0) {
    // Fallback: generate Fridays for this year and next
    for (const year of [thisYear, nextYear]) {
      const start = new Date(year, 0, 1)
      const end = new Date(year, 11, 31)
      for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
        const d = new Date(t)
        if (d.getDay() === 5) {
          const iso = d.toISOString().slice(0, 10)
          result.push({ value: iso, label: isoToLabel(iso) })
        }
      }
    }
  }
  return result.sort((a, b) => a.value.localeCompare(b.value))
}

/** Options for วันที่ต้องใช้เงิน dropdown: only dates ≥7 days ahead, closest first (d/m/y labels) */
export function getDateMoneyNeededOptions(): { value: string; label: string }[] {
  const all = getDistributionDatesForDisplay()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = new Date(today)
  minDate.setDate(minDate.getDate() + 7)
  return all
    .filter((opt) => opt.value >= minDate.toISOString().slice(0, 10))
    .map((opt) => ({ value: opt.value, label: opt.label }))
}

/**
 * Fixed clearance dates (กำหนดวันเคลียร์) - dd/mm/yyyy.
 * Clearance due is the closest of these dates to (base + 15 days); if that day is 15th and Saturday, round down.
 */
const CLEARANCE_DATES_DMY = [
  '20/03/2026', '27/03/2026', '03/04/2026', '10/04/2026', '17/04/2026', '24/04/2026',
  '01/05/2026', '08/05/2026', '22/05/2026', '29/05/2026',
  '05/06/2026', '12/06/2026', '19/06/2026', '26/06/2026',
  '03/07/2026', '10/07/2026', '17/07/2026', '24/07/2026', '31/07/2026',
  '07/08/2026', '14/08/2026', '21/08/2026', '28/08/2026',
  '04/09/2026', '11/09/2026', '18/09/2026', '25/09/2026',
  '02/10/2026', '09/10/2026', '16/10/2026', '23/10/2026', '30/10/2026',
  '13/11/2026', '20/11/2026', '27/11/2026',
  '04/12/2026', '11/12/2026', '18/12/2026', '25/12/2026',
  '01/01/2027', '08/01/2027',
]

const CLEARANCE_DATES_ISO = CLEARANCE_DATES_DMY.map(dmyToISO).filter(Boolean).sort()

/**
 * Get กำหนดวันเคลียร์ (clearance due date) from base date (วันที่ or วันที่ต้องใช้เงิน).
 * Base + 15 days; if that day is the 15th and it's Saturday, round down to Friday 14th.
 * Returns the date from the fixed clearance list that is closest to that target. YYYY-MM-DD.
 */
export function getClosestClearanceDueDate(baseIso: string): string {
  if (!baseIso || baseIso.length !== 10) return ''
  if (CLEARANCE_DATES_ISO.length === 0) return ''
  const base = new Date(baseIso + 'T12:00:00')
  const nominal = new Date(base)
  nominal.setDate(nominal.getDate() + 15)
  let target = nominal
  // If the day is 15 and it's Saturday, round down to Friday (day before)
  if (target.getDate() === 15 && target.getDay() === 6) {
    target = new Date(target)
    target.setDate(target.getDate() - 1)
  }
  const targetTime = target.getTime()
  let closest = CLEARANCE_DATES_ISO[0]
  let minDiff = Math.abs(new Date(closest + 'T12:00:00').getTime() - targetTime)
  for (let i = 1; i < CLEARANCE_DATES_ISO.length; i++) {
    const t = new Date(CLEARANCE_DATES_ISO[i] + 'T12:00:00').getTime()
    const diff = Math.abs(t - targetTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = CLEARANCE_DATES_ISO[i]
    }
  }
  return closest
}

/** Distribution Friday that is closest in time to the request date (วันที่). YYYY-MM-DD in, YYYY-MM-DD out. */
export function getClosestDistributionDateAfter(requestDateIso: string): string {
  if (!requestDateIso || requestDateIso.length !== 10) return ''
  const all = getDistributionDatesForDisplay()
  if (all.length === 0) return ''
  const requestTime = new Date(requestDateIso + 'T12:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()
  let closest = all[0].value
  let minDiff = Math.abs(new Date(closest + 'T12:00:00').getTime() - requestTime)
  for (let i = 1; i < all.length; i++) {
    const t = new Date(all[i].value + 'T12:00:00').getTime()
    const diff = Math.abs(t - requestTime)
    if (diff < minDiff) {
      minDiff = diff
      closest = all[i].value
    }
  }
  // If the closest is in the past, use the next future distribution date instead
  if (new Date(closest + 'T12:00:00').getTime() < todayTime) {
    const next = all.find((opt) => new Date(opt.value + 'T12:00:00').getTime() >= todayTime)
    return next ? next.value : closest
  }
  return closest
}
