import { getPastDueAdvanceRegister, getUnclearedForReminder } from '@/lib/documents/document-service'
import { formatDateDMY } from '@/lib/utils/date-format'

const LINE_NOTIFY_URL = 'https://notify-api.line.me/api/notify'
const LINE_MESSAGING_PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const LINE_MESSAGING_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast'
const LINE_TEXT_MAX_LEN = 5000

export type SendLineResult = {
  ok: boolean
  sent: boolean
  provider?: 'line_messaging_broadcast' | 'line_messaging_push' | 'line_notify'
  count?: number
  error?: string
  message?: string
  preview?: string
}

/**
 * Build the past-due advance clearance message (same as cron).
 */
export async function buildPastDueMessage(): Promise<{ message: string; count: number }> {
  const pastDue = await getPastDueAdvanceRegister({ limit: 500 })
  const todayStr = formatDateDMY(new Date().toISOString().slice(0, 10))

  const customIntro = (process.env.LINE_PAST_DUE_INTRO || '').trim()
  const customOutro = (process.env.LINE_PAST_DUE_OUTRO || '').trim()

  const defaultIntro = [
    'รายการพ้นกำหนดเคลียร์เงินทดรอง (Advance Payment Clearance)',
    `อัปเดต: ${todayStr}`,
    '',
  ].join('\n')
  const intro = customIntro
    ? customIntro.replace(/\{\{DATE\}\}/g, todayStr).replace(/\{\{TODAY\}\}/g, todayStr)
    : defaultIntro

  const listLines: string[] = []
  pastDue.forEach((item) => {
    const advNumber = item.apr.documentNumber || item.apr.id
    const name = item.apr.creator?.fullName || item.apr.creator?.email || '—'
    const due = formatDateDMY(item.dueDateIso)
    listLines.push(`${advNumber} — ${name} — ครบกำหนด ${due}`)
  })
  const listBlock = listLines.join('\n')
  const outro = customOutro
    ? customOutro.replace(/\{\{DATE\}\}/g, todayStr).replace(/\{\{TODAY\}\}/g, todayStr)
    : ''

  let message = [intro, listBlock, outro].filter(Boolean).join('\n')
  if (message.length > LINE_TEXT_MAX_LEN) {
    message = message.slice(0, LINE_TEXT_MAX_LEN - 3) + '…'
  }
  return { message, count: pastDue.length }
}

/**
 * Build message for uncleared items whose clearance due date is today
 * or two weeks after the due date (twice-per-month reminder).
 */
export async function buildUnclearedReminderMessage(): Promise<{ message: string; count: number }> {
  const items = await getUnclearedForReminder({ limit: 500 })
  const todayStr = formatDateDMY(new Date().toISOString().slice(0, 10))

  const header = [
    'ทะเบียนคุมลูกหนี้เงินทดรอง — รายการที่ยังไม่เคลียร์',
    `แจ้งเตือนวันที่: ${todayStr}`,
    '',
  ].join('\n')

  const lines: string[] = []
  items.forEach((item) => {
    const advNumber = item.apr.documentNumber || item.apr.id
    const name = item.apr.creator?.fullName || item.apr.creator?.email || '—'
    const due = formatDateDMY(item.dueDateIso)
    lines.push(`${advNumber} — ${name} — กำหนดเคลียร์ ${due}`)
  })

  let message = [header, ...lines].join('\n')
  if (message.length > LINE_TEXT_MAX_LEN) {
    message = message.slice(0, LINE_TEXT_MAX_LEN - 3) + '…'
  }
  return { message, count: items.length }
}

/**
 * Send a text message to LINE (broadcast, push, or Notify depending on env).
 */
export async function sendLineMessage(message: string, count = 0): Promise<SendLineResult> {
  const channelToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  const pushToId = (process.env.LINE_PUSH_TO_ID || '').trim()
  const notifyToken = (process.env.LINE_NOTIFY_ACCESS_TOKEN || '').trim()

  if (channelToken && !pushToId) {
    const res = await fetch(LINE_MESSAGING_BROADCAST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ type: 'text', text: message }],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return {
        ok: false,
        sent: false,
        count,
        provider: 'line_messaging_broadcast',
        error: `LINE Messaging API broadcast failed: ${res.status} ${text}`,
      }
    }
    return { ok: true, sent: true, count, provider: 'line_messaging_broadcast' }
  }

  if (channelToken && pushToId) {
    const pushRes = await fetch(LINE_MESSAGING_PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToId,
        messages: [{ type: 'text', text: message }],
      }),
    })
    if (!pushRes.ok) {
      const text = await pushRes.text()
      return {
        ok: false,
        sent: false,
        count,
        provider: 'line_messaging_push',
        error: `LINE Messaging API push failed: ${pushRes.status} ${text}`,
      }
    }
    return { ok: true, sent: true, count, provider: 'line_messaging_push' }
  }

  if (notifyToken) {
    const form = new URLSearchParams()
    form.set('message', message)
    const lineRes = await fetch(LINE_NOTIFY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notifyToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    if (!lineRes.ok) {
      const text = await lineRes.text()
      return {
        ok: false,
        sent: false,
        count,
        provider: 'line_notify',
        error: `LINE Notify failed: ${lineRes.status} ${text}`,
      }
    }
    return { ok: true, sent: true, count, provider: 'line_notify' }
  }

  return {
    ok: true,
    sent: false,
    count,
    message:
      'Set LINE_CHANNEL_ACCESS_TOKEN (broadcast), or + LINE_PUSH_TO_ID, or LINE_NOTIFY_ACCESS_TOKEN',
    preview: message.slice(0, 200) + (message.length > 200 ? '…' : ''),
  }
}
