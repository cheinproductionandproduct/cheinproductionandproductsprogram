'use client'

import React from 'react'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { DocumentList } from '@/components/documents/DocumentList'

export default function DocumentsPage() {
  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">เอกสารรอดำเนินการ</h1>
          <p className="page-subtitle" lang="th">
            เอกสารที่รอการอนุมัติที่คุณสร้าง
          </p>
        </header>
        <section className="list-content">
          <DocumentList initialStatus="PENDING" />
        </section>
      </div>
    </DashboardLayout>
  )
}


