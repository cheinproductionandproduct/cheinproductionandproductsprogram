'use client'

import Link from 'next/link'
import { useUser } from '@/hooks/use-user'
import { isManager } from '@/lib/auth/permissions'
import { UserRole } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import '../dashboard.css'

type Job = {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
}

export default function SaleReportPage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch('/api/jobs', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.jobs)) setJobs(data.jobs)
      } finally {
        setJobsLoading(false)
      }
    }
    fetchJobs()
  }, [])

  if (userLoading || !user) {
    return (
      <div className="list-page">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }
  if (!isManager(user.role as UserRole)) {
    router.replace('/dashboard')
    return null
  }

  return (
    <div className="list-page">
      <header className="list-header">
        <h1 className="page-title">รายงานยอดขาย (Sale Report)</h1>
        <p className="page-subtitle" lang="th">
          รายงานยอดขายสำหรับผู้จัดการ
        </p>
      </header>
      <Link href="/dashboard" className="form-button" style={{ marginBottom: 16 }}>
        กลับไปแดชบอร์ด
      </Link>

      {jobsLoading ? (
        <div className="list-loading" style={{ marginTop: 20 }}>โหลดรายการงาน...</div>
      ) : (
        <div className="sale-report-cards">
          {jobs.map((job) => (
            <div key={job.id} className="sale-report-card">
              <div className="sale-report-card-image" aria-hidden />
              <div className="sale-report-card-body">
                <div className="sale-report-card-text">
                  <div className="sale-report-card-title">{job.name}</div>
                  <div className="sale-report-card-status">
                    {/* Pending amount is separate from advance payment — show placeholder until you add a field/source */}
                    —
                  </div>
                </div>
                <div className="sale-report-card-actions">
                  <Link href={`/jobs/${job.id}`} className="enter-btn">
                    Enter
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
