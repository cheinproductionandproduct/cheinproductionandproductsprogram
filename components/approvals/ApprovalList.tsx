'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ApprovalCard } from './ApprovalCard'
import '@/app/dashboard/dashboard.css'

interface ApprovalListProps {
  initialApprovals: any[]
  onRefresh?: () => void | Promise<void>
}

export function ApprovalList({ initialApprovals, onRefresh }: ApprovalListProps) {
  const [approvals, setApprovals] = useState(initialApprovals)

  useEffect(() => {
    setApprovals(initialApprovals)
  }, [initialApprovals])

  const handleApprovalUpdate = (approvalId: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
    onRefresh?.()
  }

  if (approvals.length === 0) {
    return (
      <div className="list-empty">
        <p className="list-empty-text">
          ไม่มีเอกสารรออนุมัติ
        </p>
        <Link href="/documents" className="list-empty-link">
          ดูรายการเอกสาร
        </Link>
      </div>
    )
  }

  return (
    <div className="list-panel">
      <div className="list-cards">
        {approvals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            onUpdate={handleApprovalUpdate}
          />
        ))}
      </div>
    </div>
  )
}
