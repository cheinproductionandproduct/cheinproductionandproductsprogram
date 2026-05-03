'use client'

import { useState } from 'react'
import { useUser } from '@/hooks/use-user'
import { isAdmin } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import { useRouter } from 'next/navigation'
import '../dashboard.css'

type TestResult = {
  ok: boolean
  sent?: boolean
  count?: number
  provider?: string
  error?: string
  message?: string
  preview?: string
} | null

export default function AdminPanelPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [lineResult, setLineResult] = useState<TestResult>(null)
  const [loading, setLoading] = useState<string | null>(null)

  if (userLoading || !user) {
    return (
      <div className="list-page">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }
  if (!isAdmin(user.role as UserRole)) {
    router.replace('/dashboard')
    return null
  }

  const runTest = async (action: 'past_due' | 'uncleared' | 'test_message') => {
    setLoading(action)
    setLineResult(null)
    try {
      const res = await fetch('/api/admin/test-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLineResult({ ok: false, error: data.error || data.message || 'Request failed' })
        return
      }
      setLineResult({
        ok: data.ok,
        sent: data.sent,
        count: data.count,
        provider: data.provider,
        error: data.error,
        message: data.message,
        preview: data.preview,
      })
    } catch (e) {
      setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setLoading(null)
    }
  }

  const exportAnalytics = async () => {
    setLoading('analytics')
    try {
      const res = await fetch('/api/analytics/export')
      if (!res.ok) { setLineResult({ ok: false, error: 'Export failed' }); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setLoading(null)
    }
  }

  const fixAdcAssignments = async () => {
    if (!window.confirm('อัปเดตผู้ลงนามในเอกสาร APC แบบร่างทั้งหมดให้ตรงกับผู้ลงนามปัจจุบัน (tassanee / pc / bee) ใช่หรือไม่?')) return
    setLoading('fix_adc')
    setLineResult(null)
    try {
      const res = await fetch('/api/admin/fix-adc-assignments', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setLineResult({ ok: false, error: data.error || 'Request failed' })
        return
      }
      setLineResult({
        ok: data.ok,
        message: `อัปเดตแล้ว ${data.updated} เอกสาร — ผู้อนุมัติ: ${data.assignedTo?.approver}, ผู้รับ: ${data.assignedTo?.recipient}, ฝ่ายบัญชี: ${data.assignedTo?.payer}`,
      })
    } catch (e) {
      setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setLoading(null)
    }
  }

  const sendAdvanceRegister = async () => {
    setLoading('advance_register')
    setLineResult(null)
    try {
      const res = await fetch('/api/admin/send-advance-register', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setLineResult({ ok: false, error: data.error || data.message || 'Request failed' })
        return
      }
      setLineResult({
        ok: data.ok,
        sent: data.sent,
        count: data.count,
        provider: data.provider,
        error: data.error,
        message: data.message,
        preview: data.preview,
      })
    } catch (e) {
      setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle" lang="th">
          ทดสอบการส่ง LINE OA และ cron (สำหรับ Admin เท่านั้น)
        </p>
      </header>

      <section className="list-content">
        <div className="list-panel" style={{ marginBottom: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>
            ส่ง APC ที่ค้างอยู่ทั้งหมดให้ tassanee
          </h2>
          <p className="form-hint" style={{ marginBottom: 16 }} lang="th">
            อัปเดตเอกสาร APC ที่ยัง PENDING และ DRAFT ทั้งหมด ให้ tassanee เป็นผู้ลงนามขั้นแรก
          </p>
          <button
            type="button"
            className="form-button form-button-submit"
            disabled={!!loading}
            onClick={async () => {
              if (!window.confirm('ส่งเอกสาร APC ที่ค้างทั้งหมดให้ tassanee?')) return
              setLoading('push_apc_tassanee')
              setLineResult(null)
              try {
                const res = await fetch('/api/admin/push-apc-to-tassanee', { method: 'POST' })
                const data = await res.json()
                setLineResult({
                  ok: data.ok,
                  message: data.ok
                    ? `ส่งให้ ${data.tassanee} — PENDING: ${data.pendingDocsFound} เอกสาร (${data.approvalsUpdated} approvals), DRAFT: ${data.draftDocsUpdated} เอกสาร`
                    : data.error,
                })
              } catch (e) {
                setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Error' })
              } finally {
                setLoading(null)
              }
            }}
          >
            {loading === 'push_apc_tassanee' ? 'กำลังอัปเดต...' : 'ส่ง APC ทั้งหมดให้ tassanee'}
          </button>
        </div>

        <div className="list-panel" style={{ marginBottom: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>
            อัปเดต Workflow APC (3 ขั้นตอน)
          </h2>
          <p className="form-hint" style={{ marginBottom: 16 }} lang="th">
            ตั้งค่า workflow การลงนาม APC ให้เป็น 3 ขั้นตอนตามลำดับ: ผู้ตรวจสอบ/อนุมัติ (tassanee) → ผู้รับเคลียร์เงิน (pc) → ผู้อนุมัติ (bee) — ทำครั้งเดียว
          </p>
          <button
            type="button"
            className="form-button form-button-submit"
            disabled={!!loading}
            onClick={async () => {
              if (!window.confirm('อัปเดต APC workflow เป็น 3 ขั้นตอน?')) return
              setLoading('fix_apc_workflow')
              setLineResult(null)
              try {
                const res = await fetch('/api/admin/fix-apc-workflow', { method: 'POST' })
                const data = await res.json()
                setLineResult({ ok: data.ok, message: data.message || data.error })
              } catch (e) {
                setLineResult({ ok: false, error: e instanceof Error ? e.message : 'Error' })
              } finally {
                setLoading(null)
              }
            }}
          >
            {loading === 'fix_apc_workflow' ? 'กำลังอัปเดต...' : 'อัปเดต APC Workflow → 3 ขั้นตอน'}
          </button>
        </div>

        <div className="list-panel" style={{ marginBottom: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>
            แก้ไขผู้ลงนาม APC เก่า
          </h2>
          <p className="form-hint" style={{ marginBottom: 16 }} lang="th">
            อัปเดตเอกสาร APC (ใบเคลียร์เงินทดรองจ่าย) ทุกฉบับที่ยังเป็นร่าง ให้ใช้ผู้ลงนามปัจจุบัน (tassanee / pc / bee) — ทำได้ครั้งเดียว ไม่กระทบเอกสารที่อนุมัติแล้ว
          </p>
          <button
            type="button"
            className="form-button"
            disabled={!!loading}
            onClick={fixAdcAssignments}
          >
            {loading === 'fix_adc' ? 'กำลังอัปเดต...' : 'อัปเดตผู้ลงนาม APC ทั้งหมด'}
          </button>
        </div>

        <div className="list-panel" style={{ marginBottom: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>
            Analytics Export
          </h2>
          <p className="form-hint" style={{ marginBottom: 16 }} lang="th">
            Export ข้อมูลการใช้งานทั้งหมด (Users, BOQ Documents, Forms, Approvals, Vehicle Requests)
          </p>
          <button
            type="button"
            className="form-button"
            disabled={!!loading}
            onClick={exportAnalytics}
          >
            {loading === 'analytics' ? 'กำลัง Export...' : '⬇ Download Analytics (.xlsx)'}
          </button>
        </div>

        <div className="list-panel">
          <h2 className="form-section-title" style={{ marginBottom: 16 }}>
            LINE OA / Cron tests
          </h2>
          <p className="form-hint" style={{ marginBottom: 16 }} lang="th">
            กดปุ่มด้านล่างเพื่อทดสอบการส่งข้อความไปยัง LINE Official Account (หรือ LINE Notify)
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            <button
              type="button"
              className="form-button"
              disabled={!!loading}
              onClick={() => runTest('test_message')}
            >
              {loading === 'test_message' ? 'กำลังส่ง...' : 'ส่งข้อความทดสอบ (Test message)'}
            </button>
            <button
              type="button"
              className="form-button"
              disabled={!!loading}
              onClick={() => runTest('past_due')}
            >
              {loading === 'past_due' ? 'กำลังส่ง...' : 'ส่งรายการพ้นกำหนดจริง (Past-due reminder)'}
            </button>
            <button
              type="button"
              className="form-button"
              disabled={!!loading}
              onClick={() => runTest('uncleared')}
            >
              {loading === 'uncleared' ? 'กำลังส่ง...' : 'ส่งรายการยังไม่เคลียร์ (ตาม logic cron)'}
            </button>
            <button
              type="button"
              className="form-button"
              disabled={!!loading}
              onClick={sendAdvanceRegister}
            >
              {loading === 'advance_register' ? 'กำลังส่ง...' : 'ส่งตารางทะเบียนคุม (หน้า 1)'}
            </button>
          </div>

          {lineResult && (
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${lineResult.ok && lineResult.sent ? '#16a34a' : lineResult.error ? '#e74c3c' : '#ddd'}`,
                background: lineResult.ok && lineResult.sent ? '#f0fdf4' : lineResult.error ? '#fef2f2' : '#f9f9f9',
              }}
            >
              <strong>ผลลัพธ์:</strong>
              <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                <li>ส่งสำเร็จ: {lineResult.sent ? 'ใช่' : 'ไม่'}</li>
                {lineResult.provider && <li>Channel: {lineResult.provider}</li>}
                {lineResult.count != null && lineResult.count > 0 && (
                  <li>จำนวนรายการพ้นกำหนด: {lineResult.count}</li>
                )}
                {lineResult.error && <li style={{ color: '#b91c1c' }}>Error: {lineResult.error}</li>}
                {lineResult.message && <li>{lineResult.message}</li>}
                {lineResult.preview && (
                  <li style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    Preview: {lineResult.preview}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
