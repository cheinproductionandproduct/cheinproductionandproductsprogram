/**
 * Convert number to Thai text (e.g., 500 -> "ห้าร้อยบาทถ้วน")
 */
export function numberToThaiText(num: number): string {
  if (num === 0) return 'ศูนย์บาทถ้วน'
  
  const units = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const tens = ['', 'สิบ', 'ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ', 'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ']
  const hundreds = ['', 'หนึ่งร้อย', 'สองร้อย', 'สามร้อย', 'สี่ร้อย', 'ห้าร้อย', 'หกร้อย', 'เจ็ดร้อย', 'แปดร้อย', 'เก้าร้อย']
  const thousands = ['', 'หนึ่งพัน', 'สองพัน', 'สามพัน', 'สี่พัน', 'ห้าพัน', 'หกพัน', 'เจ็ดพัน', 'แปดพัน', 'เก้าพัน']
  const tenThousands = ['', 'หนึ่งหมื่น', 'สองหมื่น', 'สามหมื่น', 'สี่หมื่น', 'ห้าหมื่น', 'หกหมื่น', 'เจ็ดหมื่น', 'แปดหมื่น', 'เก้าหมื่น']
  const hundredThousands = ['', 'หนึ่งแสน', 'สองแสน', 'สามแสน', 'สี่แสน', 'ห้าแสน', 'หกแสน', 'เจ็ดแสน', 'แปดแสน', 'เก้าแสน']
  const millions = ['', 'หนึ่งล้าน', 'สองล้าน', 'สามล้าน', 'สี่ล้าน', 'ห้าล้าน', 'หกล้าน', 'เจ็ดล้าน', 'แปดล้าน', 'เก้าล้าน']

  // Round to nearest integer
  const rounded = Math.round(num)
  
  if (rounded < 10) {
    return units[rounded] + 'บาทถ้วน'
  }
  
  if (rounded < 100) {
    const ten = Math.floor(rounded / 10)
    const unit = rounded % 10
    if (unit === 0) {
      return tens[ten] + 'บาทถ้วน'
    }
    if (ten === 1) {
      return 'สิบ' + (unit === 1 ? 'เอ็ด' : units[unit]) + 'บาทถ้วน'
    }
    return tens[ten] + units[unit] + 'บาทถ้วน'
  }
  
  if (rounded < 1000) {
    const hundred = Math.floor(rounded / 100)
    const remainder = rounded % 100
    if (remainder === 0) {
      return hundreds[hundred] + 'บาทถ้วน'
    }
    return hundreds[hundred] + numberToThaiText(remainder).replace('บาทถ้วน', '')
  }
  
  if (rounded < 10000) {
    const thousand = Math.floor(rounded / 1000)
    const remainder = rounded % 1000
    if (remainder === 0) {
      return thousands[thousand] + 'บาทถ้วน'
    }
    return thousands[thousand] + numberToThaiText(remainder).replace('บาทถ้วน', '')
  }
  
  if (rounded < 100000) {
    const tenThousand = Math.floor(rounded / 10000)
    const remainder = rounded % 10000
    if (remainder === 0) {
      return tenThousands[tenThousand] + 'บาทถ้วน'
    }
    return tenThousands[tenThousand] + numberToThaiText(remainder).replace('บาทถ้วน', '')
  }
  
  if (rounded < 1000000) {
    const hundredThousand = Math.floor(rounded / 100000)
    const remainder = rounded % 100000
    if (remainder === 0) {
      return hundredThousands[hundredThousand] + 'บาทถ้วน'
    }
    return hundredThousands[hundredThousand] + numberToThaiText(remainder).replace('บาทถ้วน', '')
  }
  
  if (rounded < 10000000) {
    const million = Math.floor(rounded / 1000000)
    const remainder = rounded % 1000000
    if (remainder === 0) {
      return millions[million] + 'บาทถ้วน'
    }
    return millions[million] + numberToThaiText(remainder).replace('บาทถ้วน', '')
  }
  
  // For very large numbers, return formatted number
  return rounded.toLocaleString('th-TH') + 'บาทถ้วน'
}

const MONEY_FORMAT: Intl.NumberFormatOptions = {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}

/**
 * Format number with 2 decimal places (e.g. 1,000.00). Non-finite values → 0.00.
 */
export function formatNumber(num: number): string {
  const n = Number(num)
  const safe = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat('en-US', MONEY_FORMAT).format(safe)
}

/**
 * Format money from loose input (null/empty/invalid → 0.00).
 */
export function formatMoneyValue(v: number | string | null | undefined): string {
  if (v == null || v === '') return formatNumber(0)
  return formatNumber(Number(v))
}

/**
 * Format date to Thai format (DD/MM/YYYY)
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

