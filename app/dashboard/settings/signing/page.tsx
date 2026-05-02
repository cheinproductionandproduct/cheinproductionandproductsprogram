'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/hooks/use-user'
import { hasRole } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import { useRouter } from 'next/navigation'
import '../../dashboard.css'

type StepInfo = { stepNumber: number; name: string; assigneeId: string | null; assignee: { id: string; fullName: string | null; email: string } | null }
type UserInfo = { id: string; fullName: string | null; email: string; role: string }

export default function SigningSettingsPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [steps, setSteps] = useState<StepInfo[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (userLoading) return
    if (!user || !hasRole(user.role as UserRole, UserRole.MANAGER)) {
      router.replace('/dashboard')
      return
    }
    fetch('/api/settings/apc-signing')
      .then(r => r.json())
      .then(d => {
        setSteps(d.steps ?? [])
        setUsers(d.users ?? [])
        const sel: Record<number, string> = {}
        for (const s of d.steps ?? []) sel[s.stepNumber] = s.assigneeId ?? ''
        setSelections(sel)
      })
      .finally(() => setLoading(false))
  }, [user, userLoading, router])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/settings/apc-signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step1UserId: selections[1] || null,
          step2UserId: selections[2] || null,
          step3UserId: selections[3] || null,
        }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      setMsg({ type: 'ok', text: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' })
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const STEP_LABELS = [
    { num: 1, label: 'ขั้น 1 — ผู้ตรวจสอบ/อนุมัติ', hint: 'ลงนามก่อน (เช่น tassanee)' },
    { num: 2, label: 'ขั้น 2 — ผู้รับเคลียร์เงิน',   hint: 'ลงนามลำดับที่สอง (เช่น pc)' },
    { num: 3, label: 'ขั้น 3 — ผู้อนุมัติ',            hint: 'ลงนามสุดท้าย (เช่น bee)' },
  ]

  if (userLoading || loading) {
    return <div className="list-page"><div className="list-loading">โหลด...</div></div>
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">ตั้งค่าการลงนาม APC</h1>
        <p className="page-subtitle" lang="th">กำหนดลำดับผู้ลงนามในใบเคลียร์เงินทดรองจ่าย</p>
      </header>

      <section className="list-content">
        <div className="list-panel" style={{ maxWidth: 600 }}>
          <p className="form-hint" style={{ marginBottom: 24 }} lang="th">
            เลือกผู้ลงนามสำหรับแต่ละขั้นตอน — เอกสารจะต้องผ่านการลงนามตามลำดับ ขั้น 1 → 2 → 3
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {STEP_LABELS.map(({ num, label, hint }) => (
              <div key={num}>
                <label className="form-label" style={{ marginBottom: 4 }}>{label}</label>
                <p className="form-hint" style={{ marginBottom: 8 }}>{hint}</p>
                <select
                  className="boq-job-select"
                  style={{ width: '100%', maxWidth: 400 }}
                  value={selections[num] ?? ''}
                  onChange={e => setSelections(prev => ({ ...prev, [num]: e.target.value }))}
                >
                  <option value="">— ไม่ระบุ (ใช้ตาม role) —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 28, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              className="form-button form-button-submit"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
            {msg && (
              <span style={{
                fontSize: 14,
                color: msg.type === 'ok' ? '#166534' : '#b91c1c',
              }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>

        <div className="list-panel" style={{ maxWidth: 600, marginTop: 24 }}>
          <h2 className="form-section-title" style={{ marginBottom: 12 }}>ลำดับการลงนามปัจจุบัน</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STEP_LABELS.map(({ num, label }) => {
              const step = steps.find(s => s.stepNumber === num)
              const assignee = step?.assignee
              return (
                <div key={num} style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8,
                  background: '#f9f9f9', border: '1px solid #eee',
                }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#1F3864', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>{num}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{label.split(' — ')[1]}</div>
                    <div style={{ fontSize: 13, color: '#555' }}>
                      {assignee ? (assignee.fullName || assignee.email) : <em style={{ color: '#999' }}>ไม่ระบุ</em>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
