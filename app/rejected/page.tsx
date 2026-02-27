'use client'

import React from 'react'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { DocumentList } from '@/components/documents/DocumentList'

export default function RejectedDocumentsPage() {
  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">เอกสารถูกปฏิเสธ</h1>
          <p className="page-subtitle" lang="th">
            เอกสารที่ถูกปฏิเสธจากกระบวนการอนุมัติ
          </p>
        </header>
        <section className="list-content">
          <DocumentList initialStatus="REJECTED" />
        </section>
      </div>
    </DashboardLayout>
  )
}

