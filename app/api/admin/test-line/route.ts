import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { buildPastDueMessage, buildUnclearedReminderMessage, sendLineMessage } from '@/lib/line/send-line'
import { formatDateDMY } from '@/lib/utils/date-format'

/**
 * POST /api/admin/test-line
 * Admin only. Body: { action: 'past_due' | 'uncleared' | 'test_message' | 'custom', message?: string }
 * - past_due: build and send the real past-due reminder (legacy).
 * - uncleared: build and send the same uncleared reminder that cron uses (due date + follow-up).
 * - test_message: send a short test message to LINE to verify OA/Notify works.
 * - custom: send an arbitrary text message (provided by admin).
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

    const body = await request.json().catch(() => ({}))
    const action = (body.action || '').trim() || 'test_message'

    if (action === 'past_due') {
      const { message, count } = await buildPastDueMessage()
      const result = await sendLineMessage(message, count)
      return NextResponse.json({
        ok: result.ok,
        sent: result.sent,
        count: result.count,
        provider: result.provider,
        error: result.error,
        message: result.message,
        preview: result.preview,
      })
    }

    if (action === 'test_message') {
      const testText = `[ทดสอบ] Test message from Chein admin panel — ${formatDateDMY(new Date().toISOString().slice(0, 10))} ${new Date().toTimeString().slice(0, 5)}`
      const result = await sendLineMessage(testText, 0)
      return NextResponse.json({
        ok: result.ok,
        sent: result.sent,
        provider: result.provider,
        error: result.error,
        message: result.message,
        preview: result.preview,
      })
    }

    if (action === 'custom') {
      const msg = typeof body.message === 'string' ? body.message : ''
      if (!msg.trim()) {
        return NextResponse.json({ error: 'Custom message is required' }, { status: 400 })
      }
      const result = await sendLineMessage(msg, 0)
      return NextResponse.json({
        ok: result.ok,
        sent: result.sent,
        provider: result.provider,
        error: result.error,
        message: result.message,
        preview: result.preview,
      })
    }

    if (action === 'uncleared') {
      const { message, count } = await buildUnclearedReminderMessage()
      const result = await sendLineMessage(message, count)
      return NextResponse.json({
        ok: result.ok,
        sent: result.sent,
        count: result.count,
        provider: result.provider,
        error: result.error,
        message: result.message,
        preview: result.preview,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use \"past_due\", \"uncleared\", \"test_message\", or \"custom\"' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[admin/test-line]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
