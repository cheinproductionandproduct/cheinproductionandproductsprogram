'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardLayout from '../dashboard/layout'
import '../dashboard/dashboard.css'
import { DocumentList } from '@/components/documents/DocumentList'

export default function DocumentsPage() {
  const searchParams = useSearchParams()
  const formTemplateId = searchParams.get('formTemplateId') || undefined
  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">{formTemplateId ? 'รายการเอกสาร' : 'เอกสารรอดำเนินการ'}</h1>
          <p className="page-subtitle" lang="th">
            {formTemplateId ? 'เอกสารที่คุณสร้าง (กรองตามประเภทฟอร์ม)' : 'รายการเอกสารทั้งหมด — กรองสถานะได้ด้านล่าง'}
          </p>
        </header>
        <section className="list-content">
          <DocumentList
            initialFormTemplateId={formTemplateId}
          />
        </section>
      </div>
    </DashboardLayout>
  )
}


