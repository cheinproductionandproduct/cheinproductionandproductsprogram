'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FormField } from '@/types/database'
import { formatDateDMY } from '@/lib/utils/date-format'
import '../../dashboard.css'

const AdvancePaymentRequestForm = dynamic(
  () => import('@/components/forms/AdvancePaymentRequestForm').then((m) => ({ default: m.AdvancePaymentRequestForm })),
  { loading: () => <div className="list-loading">โหลดฟอร์ม...</div>, ssr: false }
)

export default function AdvancePaymentRequestNewPage() {
  const [fields, setFields] = useState<FormField[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documentNumber, setDocumentNumber] = useState<string>('')
  const router = useRouter()

  useEffect(() => {
    async function fetchTemplateAndNumber() {
      try {
        const [templateResponse, numberResponse] = await Promise.all([
          fetch('/api/form-templates'),
          fetch('/api/documents/generate-number?formTemplateSlug=advance-payment-request'),
        ])

        if (!templateResponse.ok) {
          const errorData = await templateResponse.json().catch(() => ({}))
          throw new Error(errorData.message || `Failed to fetch templates: ${templateResponse.status}`)
        }

        const data = await templateResponse.json()
        const templates = data.templates || []
        if (templates.length === 0) throw new Error('No templates found in database')

        const template = templates.find((t: any) => t.slug === 'advance-payment-request')
        if (!template) {
          throw new Error('Template "advance-payment-request" not found.')
        }

        const formConfig = template.fields as { fields: FormField[] }
        setFields(formConfig.fields || [])

        if (numberResponse.ok) {
          const numberData = await numberResponse.json()
          if (numberData.documentNumber) setDocumentNumber(numberData.documentNumber)
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load form')
      } finally {
        setLoading(false)
      }
    }

    fetchTemplateAndNumber()
  }, [])

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true)
    setError(null)
    const timeoutId = setTimeout(() => {
      setSubmitting(false)
      setError((e) => (e ? e : 'การบันทึกใช้เวลานาน กรุณาตรวจสอบรายการเอกสารหรือลองใหม่'))
    }, 12_000)

    try {
      const response = await fetch('/api/form-templates')
      if (!response.ok) throw new Error('Failed to fetch template')
      const { templates } = await response.json()
      const template = templates.find((t: any) => t.slug === 'advance-payment-request')
      if (!template) throw new Error('Template not found')

      const createResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTemplateId: template.id,
          title: `${template.name} - ${formatDateDMY(new Date())}`,
          data,
          status: 'DRAFT',
          userAssignments: data.userAssignments || {},
        }),
      })

      setSubmitting(false)
      clearTimeout(timeoutId)
      const result = await createResponse.json().catch(() => ({}))

      if (!createResponse.ok) {
        throw new Error(result.message || result.error || 'Failed to create document')
      }
      const docId = result?.document?.id
      if (docId) router.push(`/documents/${docId}`)
      else setError('เอกสารอาจสร้างแล้ว กรุณาตรวจสอบรายการเอกสาร')
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการบันทึก')
    } finally {
      clearTimeout(timeoutId)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="list-loading">โหลด...</div>
      </div>
    )
  }

  if (error && !fields.length) {
    return (
      <div className="list-page">
        <div className="list-error">{error}</div>
        <Link href="/dashboard/advance" className="doc-btn-secondary" style={{ marginTop: 12 }}>
          กลับไปใบเบิก
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Sarabun", "Inter", system-ui, sans-serif' }}>
      <div className="list-page" style={{ paddingBottom: 0 }}>
        <header className="list-header" style={{ marginBottom: 16 }}>
          <Link href="/dashboard/advance" className="doc-nav-link" style={{ marginBottom: 8, display: 'inline-block' }}>
            ← กลับไปใบเบิก
          </Link>
        </header>
      </div>
      <AdvancePaymentRequestForm
        fields={fields}
        onSubmit={handleSubmit}
        defaultValues={{ advNumber: documentNumber }}
        loading={submitting}
      />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
