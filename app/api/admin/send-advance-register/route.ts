import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { getAdvanceRegister } from '@/lib/documents/document-service'
import { getClosestClearanceDueDate } from '@/lib/utils/distribution-dates'
import { formatDateDMY } from '@/lib/utils/date-format'
import { sendLineMessage } from '@/lib/line/send-line'

/**
 * POST /api/admin/send-advance-register
 * Admin only. Sends the current advance register page (page 1, limit 30) to LINE.
 * Useful for testing how the APC table looks as a LINE message.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 })
    }

    const { items, pagination } = await getAdvanceRegister({ page: 1, limit: 30 })
    const headerLines = [
      'ทะเบียนคุมลูกหนี้เงินทดรอง (Advance Register)',
      `หน้า ${pagination.page} / ${pagination.totalPages} — รวมทั้งหมด ${pagination.total} รายการ`,
      '',
    ]

    const bodyLines: string[] = []
    for (const item of items) {
      const advNumber = item.apr.documentNumber || item.apr.id
      const name = item.apr.creator?.fullName || item.apr.creator?.email || '—'
      const completedAt = item.apr.completedAt ? String(item.apr.completedAt).slice(0, 10) : ''
      const dueIso = completedAt ? getClosestClearanceDueDate(completedAt) : ''
      const due = dueIso ? formatDateDMY(dueIso) : '-'
      bodyLines.push(`${advNumber} — ${name} — กำหนดเคลียร์ ${due}`)
    }

    const message = [...headerLines, ...bodyLines].join('\n')
    const result = await sendLineMessage(message, items.length)

    return NextResponse.json({
      ok: result.ok,
      sent: result.sent,
      provider: result.provider,
      count: items.length,
      error: result.error,
      message: result.message,
      preview: result.preview,
    })
  } catch (error) {
    console.error('[admin/send-advance-register]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}

