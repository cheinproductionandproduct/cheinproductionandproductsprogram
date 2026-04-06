'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { UserRole } from '@prisma/client'
import { canCreateBoq, canDeleteBoq, canSignBoq } from '@/lib/auth/permissions'
import '../dashboard.css'
import './boq.css'

type Job = { id: string; name: string; code: string | null }
type PlanBoqRef = { id: string; title: string; job: { name: string } | null } | null
type BoqRow = {
  id: string
  jobId: string | null
  title: string
  kind: 'PLAN' | 'ACTUAL'
  job: Job | null
  planBoq: PlanBoqRef
  status: string
  updatedAt: string
  createdAt: string
}

function planRefLabel(b: BoqRow): string {
  if (!b.planBoq) return '—'
  const p = b.planBoq
  return p.job?.name || p.title || p.id.slice(0, 8)
}

function normalizeBoqKind(k: unknown): 'PLAN' | 'ACTUAL' {
  return String(k || '').toUpperCase() === 'ACTUAL' ? 'ACTUAL' : 'PLAN'
}

export default function BoqDashboardPage() {
  const router = useRouter()
  const { user } = useUser()
  const canCreate = canCreateBoq(user?.role as UserRole | null | undefined)
  const canDelete = canDeleteBoq(user?.email)
  const canSign = canSignBoq(user?.email)

  const [boqs, setBoqs] = useState<BoqRow[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState<false | 'PLAN' | 'ACTUAL'>(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedPlanBoqId, setSelectedPlanBoqId] = useState('')
  const [boqTitle, setBoqTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => void } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [signingId, setSigningId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const planBoqs = useMemo(() => boqs.filter(b => b.kind === 'PLAN'), [boqs])
  const approvedPlanBoqs = useMemo(() => planBoqs.filter(b => b.status === 'APPROVED'), [planBoqs])
  const actualBoqs = useMemo(() => boqs.filter(b => b.kind === 'ACTUAL'), [boqs])

  const fetchData = async () => {
    setLoading(true)
    setListError(null)
    try {
      const [boqRes, jobRes] = await Promise.all([
        fetch('/api/boq'),
        fetch('/api/jobs'),
      ])
      const boqData = await boqRes.json().catch(() => ({}))
      const jobData = await jobRes.json().catch(() => ({}))

      if (!boqRes.ok) {
        setListError(typeof boqData.error === 'string' ? boqData.error : 'โหลดรายการ BOQ ไม่สำเร็จ')
        setBoqs([])
      } else {
        const raw = Array.isArray(boqData.boqs) ? boqData.boqs : []
        setBoqs(
          raw.map((b: BoqRow & { kind?: string }) => ({
            ...b,
            planBoq: b.planBoq ?? null,
            kind: normalizeBoqKind(b.kind),
          }))
        )
      }
      setJobs(Array.isArray(jobData.jobs) ? jobData.jobs : [])
    } catch {
      setListError('โหลดข้อมูลไม่สำเร็จ')
      setBoqs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const openModal = (kind: 'PLAN' | 'ACTUAL') => {
    setShowModal(kind)
    setSelectedJobId('')
    setSelectedPlanBoqId('')
    setBoqTitle('')
    setCreateError(null)
  }

  const askConfirm = (msg: string, fn: () => void) => setConfirm({ msg, fn })

  const handleDelete = (boq: BoqRow) => {
    askConfirm(`ลบ BOQ "${boqDisplayName(boq)}" ?`, () => {
      askConfirm(`ยืนยันอีกครั้ง: ลบ BOQ "${boqDisplayName(boq)}" ถาวร ?`, async () => {
        setDeletingId(boq.id)
        try {
          const res = await fetch(`/api/boq/${boq.id}`, { method: 'DELETE' })
          const d = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(d.error || 'ลบไม่สำเร็จ')
          await fetchData()
        } catch (err) {
          setCreateError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
        } finally {
          setDeletingId(null)
        }
      })
    })
  }

  const handleCreate = async () => {
    if (!showModal) return
    setCreating(true)
    setCreateError(null)
    try {
      const body: Record<string, unknown> = {
        jobId: selectedJobId || null,
        title: boqTitle.trim(),
        data: [],
        showMaterial: true,
        kind: showModal,
      }
      if (showModal === 'ACTUAL') {
        if (!selectedPlanBoqId) throw new Error('เลือกแผนที่อนุมัติแล้ว')
        body.planBoqId = selectedPlanBoqId
      }

      const res = await fetch('/api/boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'สร้างไม่สำเร็จ')
      setShowModal(false)
      router.push(`/dashboard/boq/${d.boq.id}`)
    } catch (err: any) {
      setCreateError(err.message)
      setCreating(false)
    }
  }

  const handleSign = (boq: BoqRow) => {
    askConfirm(`อนุมัติและลงนาม BOQ "${boqDisplayName(boq)}"?`, async () => {
      setSigningId(boq.id)
      try {
        const res = await fetch(`/api/boq/${boq.id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        })
        if (!res.ok) throw new Error()
        await fetchData()
      } catch {
        setCreateError('อนุมัติไม่สำเร็จ')
      } finally {
        setSigningId(null)
      }
    })
  }

  const boqDisplayName = (b: BoqRow) => b.job?.name || b.title || '— ไม่ระบุชื่อ —'

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  const renderTable = (rows: BoqRow[], opts: { showPlanRef: boolean }) => (
    <div className="boq-list-table-wrapper">
      <table className="boq-list-table">
        <thead>
          <tr>
            <th>ชื่อ / งาน</th>
            {opts.showPlanRef && <th>Plan</th>}
            <th>สถานะ</th>
            <th>อัปเดตล่าสุด</th>
            <th>สร้างเมื่อ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(b => (
            <tr key={b.id} className="boq-list-row" onClick={() => router.push(`/dashboard/boq/${b.id}`)}>
              <td className="boq-list-job">
                {boqDisplayName(b)}
                {b.job && b.title && <span className="boq-list-subtitle">{b.title}</span>}
              </td>
              {opts.showPlanRef && (
                <td className="boq-list-plan-ref" onClick={e => e.stopPropagation()}>{planRefLabel(b)}</td>
              )}
              <td className="boq-list-status" onClick={e => e.stopPropagation()}>
                {b.status === 'DRAFT' && <span className="boq-status-badge boq-status-draft">ร่าง</span>}
                {b.status === 'PENDING' && <span className="boq-status-badge boq-status-pending">รออนุมัติ</span>}
                {b.status === 'APPROVED' && <span className="boq-status-badge boq-status-approved">อนุมัติแล้ว</span>}
              </td>
              <td className="boq-list-date">{fmt(b.updatedAt)}</td>
              <td className="boq-list-date">{fmt(b.createdAt)}</td>
              <td className="boq-list-action">
                {canSign && b.status === 'PENDING' && (
                  <button
                    type="button"
                    className="boq-sign-btn"
                    style={{ padding: '4px 12px', fontSize: 13 }}
                    onClick={(e) => { e.stopPropagation(); handleSign(b) }}
                    disabled={signingId === b.id}
                  >
                    {signingId === b.id ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                  </button>
                )}
                <span className="boq-open-link">เปิด →</span>
                {canDelete && (
                  <button
                    type="button"
                    className="boq-list-delete-btn"
                    onClick={(e) => { e.stopPropagation(); handleDelete(b) }}
                    disabled={deletingId === b.id}
                  >
                    {deletingId === b.id ? 'กำลังลบ...' : 'ลบ'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="list-page boq-page">
      <header className="list-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">
            Plan = ประมาณการ · Actual = สร้างจาก Plan ที่อนุมัติแล้ว (คัดลอกรายการ)
          </p>
        </div>
      </header>

      <div className="boq-top-bar">
        <Link href="/dashboard" className="form-button boq-back-btn">
          กลับไปแดชบอร์ด
        </Link>
      </div>

      {listError && (
        <p className="boq-save-error" role="alert" style={{ marginBottom: 12 }}>{listError}</p>
      )}

      {createError && !showModal && (
        <p className="boq-save-error" style={{ marginBottom: 12 }}>{createError}</p>
      )}

      {loading ? (
        <p style={{ color: '#888', padding: '24px 0' }}>กำลังโหลด...</p>
      ) : (
        <>
          <section className="boq-dash-section">
            <div className="boq-dash-section-head">
              <div>
                <h2 className="boq-dash-section-title">Plan</h2>
                <p className="boq-dash-section-desc">Estimate / quotation — existing BOQs live here</p>
              </div>
              {canCreate && (
                <button type="button" className="boq-create-btn" onClick={() => openModal('PLAN')}>
                  + New Plan
                </button>
              )}
            </div>
            {planBoqs.length === 0 ? (
              <div className="boq-empty boq-empty--inline">
                <p>No Plan BOQs yet — {canCreate ? 'use “+ New Plan”' : 'contact admin'}</p>
              </div>
            ) : (
              renderTable(planBoqs, { showPlanRef: false })
            )}
          </section>

          <section className="boq-dash-section boq-dash-section--actual">
            <div className="boq-dash-section-head">
              <div>
                <h2 className="boq-dash-section-title">Actual</h2>
                <p className="boq-dash-section-desc">
                  สร้างจาก Plan ที่อนุมัติแล้ว — คัดลอกโครงรายการมาให้แก้เป็นยอดทำจริง
                </p>
              </div>
              {canCreate && (
                <button
                  type="button"
                  className="boq-create-btn boq-create-btn--actual"
                  onClick={() => openModal('ACTUAL')}
                  disabled={approvedPlanBoqs.length === 0}
                  title={approvedPlanBoqs.length === 0 ? 'ต้องมี Plan ที่อนุมัติแล้วก่อน' : ''}
                >
                  + New Actual
                </button>
              )}
            </div>
            {actualBoqs.length === 0 ? (
              <div className="boq-empty boq-empty--inline">
                <p>
                  {approvedPlanBoqs.length === 0
                    ? 'ยังสร้าง Actual ไม่ได้ — อนุมัติ Plan BOQ ก่อน แล้วค่อยกด “+ New Actual”'
                    : 'No Actual BOQs yet — pick an approved Plan with “+ New Actual”'}
                </p>
              </div>
            ) : (
              renderTable(actualBoqs, { showPlanRef: true })
            )}
          </section>
        </>
      )}

      {showModal && (
        <div className="boq-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="boq-modal" onClick={e => e.stopPropagation()}>
            <h2 className="boq-modal-title">
              {showModal === 'PLAN' ? 'New Plan BOQ' : 'New Actual BOQ'}
            </h2>

            <label className="boq-modal-label">ชื่อ BOQ (ถ้าไม่ระบุงาน)</label>
            <input
              type="text"
              className="boq-job-select"
              value={boqTitle}
              onChange={e => setBoqTitle(e.target.value)}
              placeholder={showModal === 'PLAN' ? 'เช่น งานก่อสร้างอาคาร A' : 'เช่น Actual — งานโซน 1'}
              style={{ width: '100%', marginBottom: 16 }}
            />

            <label className="boq-modal-label">งาน (Job) — ไม่บังคับ</label>
            <select
              className="boq-job-select"
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              style={{ width: '100%', marginBottom: 16 }}
            >
              <option value="">— ไม่ระบุงาน —</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>

            {showModal === 'ACTUAL' && (
              <>
                <label className="boq-modal-label">Plan ที่อนุมัติแล้ว (คัดลอกรายการจากนี้)</label>
                <select
                  className="boq-job-select"
                  value={selectedPlanBoqId}
                  onChange={e => {
                    const id = e.target.value
                    setSelectedPlanBoqId(id)
                    const p = approvedPlanBoqs.find(x => x.id === id)
                    if (p?.jobId) setSelectedJobId(p.jobId)
                  }}
                  style={{ width: '100%', marginBottom: 16 }}
                  required
                >
                  <option value="">— เลือก Plan ที่อนุมัติแล้ว —</option>
                  {approvedPlanBoqs.map(p => (
                    <option key={p.id} value={p.id}>
                      {boqDisplayName(p)}{p.title ? ` — ${p.title}` : ''}
                    </option>
                  ))}
                </select>
                <p className="boq-modal-hint">ระบบจะคัดลอกเนื้อหา BOQ จากแผนนี้ไปยัง Actual (แก้ไขได้หลังสร้าง)</p>
              </>
            )}

            {createError && <p className="boq-save-error" style={{ marginBottom: 12 }}>{createError}</p>}

            <div className="boq-modal-actions">
              <button type="button" className="boq-modal-cancel" onClick={() => setShowModal(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="boq-save-btn"
                onClick={handleCreate}
                disabled={
                  creating ||
                  (!selectedJobId && !boqTitle.trim()) ||
                  (showModal === 'ACTUAL' && !selectedPlanBoqId)
                }
                title={
                  showModal === 'ACTUAL' && !selectedPlanBoqId
                    ? 'เลือก Plan ที่อนุมัติแล้ว'
                    : !selectedJobId && !boqTitle.trim()
                      ? 'กรุณาระบุชื่อหรือเลือกงาน'
                      : ''
                }
              >
                {creating ? 'กำลังสร้าง...' : 'สร้าง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="boq-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="boq-modal boq-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="boq-confirm-msg">{confirm.msg}</p>
            <div className="boq-modal-actions">
              <button type="button" className="boq-modal-cancel" onClick={() => setConfirm(null)}>
                ยกเลิก
              </button>
              <button type="button" className="boq-confirm-ok" onClick={() => { confirm.fn(); setConfirm(null) }}>
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
