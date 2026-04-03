'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import '../dashboard.css'
import './boq.css'

const EDITOR_EMAIL = 'bee@cheinproduction.co.th'

type Job = { id: string; name: string; code: string | null }
type BoqRow = {
  id: string
  jobId: string
  job: Job
  status: string
  updatedAt: string
  createdAt: string
}

export default function BoqDashboard() {
  const router = useRouter()
  const { user } = useUser()
  const canEdit = user?.email === EDITOR_EMAIL

  const [boqs, setBoqs] = useState<BoqRow[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const existingJobIds = new Set(boqs.map(b => b.jobId))
  const availableJobs = jobs.filter(j => !existingJobIds.has(j.id))

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

  const handleCreate = async () => {
    if (!selectedJobId) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selectedJobId, data: [], showMaterial: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'สร้างไม่สำเร็จ')
      router.push(`/dashboard/boq/${d.boq.id}`)
    } catch (err: any) {
      setCreateError(err.message)
      setCreating(false)
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="list-page boq-page">
      <header className="list-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">Bill of Quantities — รายการ BOQ ทั้งหมด</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="boq-create-btn"
            onClick={() => { setShowModal(true); setSelectedJobId(''); setCreateError(null) }}
          >
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
          <p>ยังไม่มี BOQ — {canEdit ? 'กด "+ สร้าง BOQ ใหม่" เพื่อเริ่ม' : 'ติดต่อผู้ดูแลระบบ'}</p>
        </div>
      ) : (
        <div className="boq-list-table-wrapper">
          <table className="boq-list-table">
            <thead>
              <tr>
                <th>งาน (Job)</th>
                <th>อัปเดตล่าสุด</th>
                <th>สร้างเมื่อ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {boqs.map(b => (
                <tr key={b.id} className="boq-list-row" onClick={() => router.push(`/dashboard/boq/${b.id}`)}>
                  <td className="boq-list-job">{b.job.name}</td>
                  <td className="boq-list-date">{fmt(b.updatedAt)}</td>
                  <td className="boq-list-date">{fmt(b.createdAt)}</td>
                  <td className="boq-list-action">
                    <span className="boq-open-link">เปิด →</span>
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
            <label className="boq-modal-label">เลือกงาน</label>
            <select
              className="boq-job-select"
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              style={{ width: '100%', marginBottom: 16 }}
            >
              <option value="">— เลือกงาน —</option>
              {availableJobs.map(j => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
            {availableJobs.length === 0 && (
              <p className="boq-modal-note">ทุกงานมี BOQ แล้ว</p>
            )}
            {createError && <p className="boq-save-error">{createError}</p>}
            <div className="boq-modal-actions">
              <button type="button" className="boq-modal-cancel" onClick={() => setShowModal(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="boq-save-btn"
                onClick={handleCreate}
                disabled={!selectedJobId || creating || availableJobs.length === 0}
              >
                {creating ? 'กำลังสร้าง...' : 'สร้าง BOQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
