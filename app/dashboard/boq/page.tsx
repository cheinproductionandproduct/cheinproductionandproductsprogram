'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { UserRole } from '@prisma/client'
import { canCreateBoq, canDeleteBoq } from '@/lib/auth/permissions'
import '../dashboard.css'
import './boq.css'

type Job = { id: string; name: string; code: string | null }
type BoqRow = {
  id: string
  jobId: string | null
  title: string
  job: Job | null
  status: string
  updatedAt: string
  createdAt: string
}

export default function BoqDashboard() {
  const router = useRouter()
  const { user } = useUser()
  const canCreate = canCreateBoq(user?.role as UserRole | null | undefined)
  const canDelete = canDeleteBoq(user?.email)

  const [boqs, setBoqs] = useState<BoqRow[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [boqTitle, setBoqTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => void } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [boqRes, jobRes] = await Promise.all([
        fetch('/api/boq'),
        fetch('/api/jobs'),
      ])
      const boqData = await boqRes.json()
      const jobData = await jobRes.json()
      setBoqs(boqData.boqs ?? [])
      setJobs(jobData.jobs ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const openModal = () => {
    setShowModal(true)
    setSelectedJobId('')
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
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: selectedJobId || null,
          title: boqTitle.trim(),
          data: [],
          showMaterial: true,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'สร้างไม่สำเร็จ')
      router.push(`/dashboard/boq/${d.boq.id}`)
    } catch (err: any) {
      setCreateError(err.message)
      setCreating(false)
    }
  }

  const boqDisplayName = (b: BoqRow) => b.job?.name || b.title || '— ไม่ระบุชื่อ —'

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="list-page boq-page">
      <header className="list-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">Bill of Quantities — รายการ BOQ ทั้งหมด</p>
        </div>
        {canCreate && (
          <button type="button" className="boq-create-btn" onClick={openModal}>
            + สร้าง BOQ ใหม่
          </button>
        )}
      </header>

      <div className="boq-top-bar">
        <Link href="/dashboard" className="form-button boq-back-btn">
          กลับไปแดชบอร์ด
        </Link>
      </div>

      {loading ? (
        <p style={{ color: '#888', padding: '24px 0' }}>กำลังโหลด...</p>
      ) : boqs.length === 0 ? (
        <div className="boq-empty">
          <p>ยังไม่มี BOQ — {canCreate ? 'กด "+ สร้าง BOQ ใหม่" เพื่อเริ่ม' : 'ติดต่อผู้ดูแลระบบ'}</p>
        </div>
      ) : (
        <div className="boq-list-table-wrapper">
          <table className="boq-list-table">
            <thead>
              <tr>
                <th>ชื่อ / งาน</th>
                <th>อัปเดตล่าสุด</th>
                <th>สร้างเมื่อ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {boqs.map(b => (
                <tr key={b.id} className="boq-list-row" onClick={() => router.push(`/dashboard/boq/${b.id}`)}>
                  <td className="boq-list-job">
                    {boqDisplayName(b)}
                    {b.job && b.title && <span className="boq-list-subtitle">{b.title}</span>}
                  </td>
                  <td className="boq-list-date">{fmt(b.updatedAt)}</td>
                  <td className="boq-list-date">{fmt(b.createdAt)}</td>
                  <td className="boq-list-action">
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
      )}

      {/* Create modal */}
      {showModal && (
        <div className="boq-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="boq-modal" onClick={e => e.stopPropagation()}>
            <h2 className="boq-modal-title">สร้าง BOQ ใหม่</h2>

            <label className="boq-modal-label">ชื่อ BOQ (ถ้าไม่ระบุงาน)</label>
            <input
              type="text"
              className="boq-job-select"
              value={boqTitle}
              onChange={e => setBoqTitle(e.target.value)}
              placeholder="เช่น งานก่อสร้างอาคาร A"
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

            {createError && <p className="boq-save-error" style={{ marginBottom: 12 }}>{createError}</p>}

            <div className="boq-modal-actions">
              <button type="button" className="boq-modal-cancel" onClick={() => setShowModal(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="boq-save-btn"
                onClick={handleCreate}
                disabled={creating || (!selectedJobId && !boqTitle.trim())}
                title={!selectedJobId && !boqTitle.trim() ? 'กรุณาระบุชื่อหรือเลือกงาน' : ''}
              >
                {creating ? 'กำลังสร้าง...' : 'สร้าง BOQ'}
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
