'use client'

import React from 'react'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { DocumentList } from '@/components/documents/DocumentList'

export default function ApprovalsPage() {
  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">เอกสารที่อนุมัติแล้ว</h1>
          <p className="page-subtitle" lang="th">
            เอกสารที่ได้รับการอนุมัติแล้วที่คุณสร้าง
          </p>
        </header>
        <section className="list-content">
          <DocumentList initialStatus="APPROVED,CLEARED" />
        </section>
      </div>
    </DashboardLayout>
  )
}


