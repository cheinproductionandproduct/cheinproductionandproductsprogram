import type { DocumentStatus } from '@prisma/client'

const LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'ฉบับร่าง',
  PENDING: 'รอดำเนินการ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ถูกปฏิเสธ',
  CANCELLED: 'ยกเลิกแล้ว',
  CLEARED: 'เคลียร์แล้ว',
}

export function documentStatusLabelTh(status: DocumentStatus | string): string {
  return LABELS[status as DocumentStatus] ?? String(status)
}
