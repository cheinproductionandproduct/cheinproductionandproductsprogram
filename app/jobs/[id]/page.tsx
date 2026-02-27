'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../dashboard/layout'
import '../../dashboard/dashboard.css'
import { formatDateDMY } from '@/lib/utils/date-format'

interface Job {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  createdAt: string
}

interface DocItem {
  id: string
  documentNumber: string | null
  title: string
  status: string
  createdAt: string
  formTemplate?: { name: string; slug: string }
  creator?: { fullName?: string; email: string }
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string
  const [job, setJob] = useState<Job | null>(null)
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!jobId) return
      setLoading(true)
      setError(null)
      try {
        const [jobsRes, docsRes] = await Promise.all([
          fetch('/api/jobs?includeInactive=true'),
          fetch(`/api/jobs/${jobId}/documents?limit=100`),
        ])

        const jobsData = await jobsRes.json()
        const docsData = await docsRes.json()

        if (!jobsRes.ok) throw new Error(jobsData.error || 'Failed to load job')
        const jobs: Job[] = jobsData.jobs || []
        const found = jobs.find((j: Job) => j.id === jobId)
        if (!found) {
          setError('ไม่พบงานนี้')
          setJob(null)
          setDocuments([])
          setTotalDocuments(0)
          return
        }
        setJob(found)

        if (!docsRes.ok) {
          setDocuments([])
          setTotalDocuments(0)
          return
        }
        setDocuments(docsData.documents || [])
        setTotalDocuments(docsData.total ?? docsData.pagination?.total ?? 0)
      } catch (err: any) {
        setError(err.message || 'โหลดข้อมูลไม่สำเร็จ')
        setJob(null)
        setDocuments([])
        setTotalDocuments(0)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  const jobHeadline = (j: Job) => (j.code ? `${j.code}_${j.name}` : j.name)

  if (loading) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-loading">โหลด...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !job) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-error">{error || 'ไม่พบงานนี้'}</div>
          <button
            type="button"
            onClick={() => router.push('/jobs')}
            className="form-button"
            style={{ marginTop: 16 }}
          >
            กลับไปรายการงาน
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <div>
            <h1 className="page-title">{jobHeadline(job)}</h1>
            <p className="page-subtitle" lang="th">
              จำนวนเอกสารที่อ้างอิงงานนี้: <strong>{totalDocuments}</strong> รายการ
            </p>
          </div>
          <Link href="/jobs" className="form-button">
            กลับไปรายการงาน
          </Link>
        </header>

        <section className="list-content">
          <div className="form-section">
            <h2 className="form-section-title">ข้อมูลงาน</h2>
            <div style={{ padding: '16px 20px' }}>
              <p><strong>ชื่องาน:</strong> {job.name}</p>
              {job.code && <p><strong>รหัส:</strong> {job.code}</p>}
              {job.description && <p><strong>รายละเอียด:</strong> {job.description}</p>}
              <p><strong>สถานะ:</strong> {job.isActive ? 'Active' : 'Inactive'}</p>
              <p><strong>สร้างเมื่อ:</strong> {formatDateDMY(job.createdAt)}</p>
            </div>
          </div>

          <div className="form-section">
            <h2 className="form-section-title">เอกสารที่ใช้งานนี้ ({totalDocuments})</h2>
            {totalDocuments === 0 ? (
              <div style={{ padding: '20px', color: '#666' }} lang="th">
                ยังไม่มีเอกสารที่เลือกงานนี้
              </div>
            ) : (
              <div className="items-table-wrapper" style={{ marginTop: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th className="items-table-th">เลขที่เอกสาร</th>
                      <th className="items-table-th">ประเภท</th>
                      <th className="items-table-th">สถานะ</th>
                      <th className="items-table-th">สร้างโดย</th>
                      <th className="items-table-th">สร้างเมื่อ</th>
                      <th className="items-table-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="items-table-td">{doc.documentNumber || doc.id.slice(0, 8)}</td>
                        <td className="items-table-td">{doc.formTemplate?.name || '-'}</td>
                        <td className="items-table-td">{doc.status}</td>
                        <td className="items-table-td">{doc.creator?.fullName || doc.creator?.email || '-'}</td>
                        <td className="items-table-td">{formatDateDMY(doc.createdAt)}</td>
                        <td className="items-table-td">
                          <Link href={`/documents/${doc.id}`} className="form-button" style={{ padding: '6px 12px', fontSize: 13 }}>
                            ดู
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}
