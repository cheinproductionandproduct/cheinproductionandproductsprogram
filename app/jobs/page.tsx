'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'
import { useUser } from '@/hooks/use-user'
import { UserRole } from '@prisma/client'

interface Job {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  createdAt: string
}

export default function JobListPage() {
  const { user } = useUser()
  const canManageJobs = user && (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER)
  
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /** Display job name (user pastes it with number already included) */
  const jobHeadline = (job: Job) => job.name

  const fetchJobs = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/jobs?includeInactive=true')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load jobs')
      setJobs(data.jobs || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create job')
      setShowCreateModal(false)
      setCreateName('')
      setCreateDescription('')
      fetchJobs()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create job')
    } finally {
      setCreating(false)
    }
  }

  const openCreateModal = () => {
    setCreateError(null)
    setCreateName('')
    setCreateDescription('')
    setShowCreateModal(true)
  }

  const handleDeleteJob = async (jobId: string, jobName: string) => {
    if (!confirm(`Delete "${jobName}"?\n\nThis cannot be undone.`)) return
    
    setDeletingId(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete job')
      fetchJobs()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="job-page-header">
          <div className="job-page-header-left">
            <h1 className="page-title">Job List</h1>
            <p className="page-subtitle" lang="th">
              รายการงาน สำหรับเลือกใช้ในใบเบิกเงินทดรองจ่าย
            </p>
          </div>
          {canManageJobs && (
            <button
              type="button"
              onClick={openCreateModal}
              className="job-create-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Job
            </button>
          )}
        </header>

        <section className="list-content">
          {loading && (
            <div className="list-loading">โหลด...</div>
          )}
          {error && !loading && (
            <div className="list-error" lang="th">
              {error}
            </div>
          )}
          {!loading && !error && jobs.length === 0 && (
            <div className="list-panel">
              <div className="list-empty">
                <p className="list-empty-text">ยังไม่มีรายการงาน</p>
                {canManageJobs && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="form-button form-button-submit"
                    style={{ marginTop: 12 }}
                  >
                    สร้างงานแรก
                  </button>
                )}
              </div>
            </div>
          )}
          {!loading && !error && jobs.length > 0 && (
            <div className="list-panel">
              <table className="job-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>#</th>
                    <th>Job Name</th>
                    <th style={{ width: '120px' }}>Status</th>
                    <th style={{ width: '140px' }}>Created</th>
                    {canManageJobs && <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job, idx) => (
                    <tr key={job.id}>
                      <td style={{ textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                      <td>
                        <Link href={`/jobs/${job.id}`} className="job-row-link">
                          {jobHeadline(job)}
                        </Link>
                      </td>
                      <td>
                        {job.isActive ? (
                          <span className="job-status-active">Active</span>
                        ) : (
                          <span className="job-status-inactive">Inactive</span>
                        )}
                      </td>
                      <td style={{ color: '#666', fontSize: '13px' }}>
                        {formatDateDMY(job.createdAt)}
                      </td>
                      {canManageJobs && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job.id, jobHeadline(job))}
                            disabled={deletingId === job.id}
                            className="job-table-delete-btn"
                            title="Delete job"
                          >
                            {deletingId === job.id ? '...' : '🗑️'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showCreateModal && (
        <div className="job-create-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="job-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="job-create-modal-header">
              <h2 className="job-create-modal-title">สร้างงานใหม่</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="job-create-modal-close"
                aria-label="ปิด"
              >
                ×
              </button>
            </div>
            <form className="job-create-modal-body" onSubmit={handleCreateJob}>
              {createError && (
                <div className="form-error-box" style={{ marginBottom: 16 }}>
                  {createError}
                </div>
              )}
              <div className="form-field-group">
                <label className="form-label">Job Name (with number) <span className="text-red-600">*</span></label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. 2025.001_Project Alpha"
                  className="form-input"
                  required
                />
                <p className="form-hint">Paste the job name that includes the number</p>
              </div>
              <div className="form-field-group">
                <label className="form-label">รายละเอียด (ไม่บังคับ)</label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="อธิบายงานสั้นๆ"
                  className="form-textarea"
                  rows={3}
                />
              </div>
              <div className="job-create-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="form-button"
                  style={{ background: '#fff', color: '#000' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="form-button form-button-submit"
                >
                  {creating ? 'กำลังสร้าง...' : 'สร้างงาน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
