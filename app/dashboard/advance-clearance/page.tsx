'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { formatDateDMY } from '@/lib/utils/date-format'
import '../dashboard.css'

const AdvancePaymentClearanceForm = dynamic(
  () => import('@/components/forms/AdvancePaymentClearanceForm').then((m) => ({ default: m.AdvancePaymentClearanceForm })),
  { loading: () => <div className="list-loading">โหลดฟอร์ม...</div>, ssr: false }
)

export default function AdvancePaymentClearancePage() {
  const [creNumber, setCreNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 8000)

    async function load() {
      try {
        setLoading(true)
        const res = await fetch('/api/documents/generate-number?formTemplateSlug=advance-payment-clearance')
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.documentNumber) setCreNumber(data.documentNumber)
        }
      } catch (e) {
        console.error('Load CRE number:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  const handleSubmit = async (formData: Record<string, any>) => {
    setSubmitting(true)
    setError(null)
    try {
      const templateRes = await fetch('/api/form-templates')
      const { templates } = await templateRes.json()
      const template = templates?.find((t: any) => t.slug === 'advance-payment-clearance')
      if (!template) throw new Error('Template ใบเคลียร์เงินทดรองจ่าย ไม่พบในระบบ')

      const createRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formTemplateId: template.id,
          title: `ใบเคลียร์เงินทดรองจ่าย - ${formatDateDMY(new Date())}`,
          data: formData,
          status: 'DRAFT',
          userAssignments: formData.userAssignments || {},
        }),
      })
      const result = await createRes.json()
      if (!createRes.ok) throw new Error(result.error || result.message || 'สร้างเอกสารไม่สำเร็จ')
      router.push(`/documents/${result.document.id}`)
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด')
    } finally {
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

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Sarabun", "Inter", system-ui, sans-serif' }}>
      <AdvancePaymentClearanceForm
        creNumber={creNumber}
        onSubmit={handleSubmit}
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
