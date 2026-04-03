export const VEHICLE_CATEGORIES = [
  {
    slug: 'messenger',
    label: 'Messenger',
    sub: ['Lalamove', 'Scooter', 'Grab', 'Bolt'],
  },
  {
    slug: 'emergency',
    label: 'รถฉุกเฉิน',
    sub: ['รถลาก', 'รถพยาบาล'],
  },
  {
    slug: 'company',
    label: 'รถบริษัท',
    sub: ['4 ล้อใหญ่', 'รถเก๋ง', 'รถพี่นพ'],
  },
  {
    slug: 'transport',
    label: 'รถขนส่ง',
    sub: ['4 ล้อ', '6 ล้อ', '6 ล้อใหญ่', 'รถเจี้ยบ', 'รถกระบะ', 'รถตู้'],
  },
] as const

export type VehicleCategorySlug = (typeof VEHICLE_CATEGORIES)[number]['slug']

export function getVehicleCategoryBySlug(slug: string) {
  return VEHICLE_CATEGORIES.find((c) => c.slug === slug)
}

/** Slug for messenger sub-type (e.g. Lalamove -> lalamove) */
export function messengerSubSlug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-')
}

export const MESSENGER_SUB_LABELS: Record<string, string> = {
  lalamove: 'Lalamove',
  scooter: 'Scooter',
  grab: 'Grab',
  bolt: 'Bolt',
}
