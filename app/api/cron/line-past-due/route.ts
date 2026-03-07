import { NextRequest, NextResponse } from 'next/server'
import { buildUnclearedReminderMessage, sendLineMessage } from '@/lib/line/send-line'

/**
 * Cron: every Friday 8 AM (Bangkok) — send to LINE reminders for APR items
 * that are still uncleared on their clearance due date and on the follow-up
 * Friday two weeks later. Secured by CRON_SECRET.
 *
 * GET /api/cron/line-past-due
 * Headers: Authorization: Bearer <CRON_SECRET>
 * Or query: ?secret=<CRON_SECRET> (for external cron services)
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret || secret.length < 8) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 501 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const querySecret = request.nextUrl.searchParams.get('secret')
    const isValid = token === secret || querySecret === secret
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, count } = await buildUnclearedReminderMessage()
    const result = await sendLineMessage(message, count)

    if (result.error && !result.sent) {
      return NextResponse.json(
        { ok: result.ok, sent: false, count: result.count, provider: result.provider, error: result.error },
        { status: 502 }
      )
    }
    return NextResponse.json({
      ok: result.ok,
      sent: result.sent,
      count: result.count,
      provider: result.provider,
      message: result.message,
      preview: result.preview,
    })
  } catch (error) {
    console.error('[cron/line-past-due]', error)
    return NextResponse.json(
      { ok: false, sent: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
