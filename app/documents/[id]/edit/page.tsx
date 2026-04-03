'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import type { FormField } from '@/types/database'
import DashboardLayout from '../../../dashboard/layout'
import '../../../dashboard/dashboard.css'
import { useUser } from '@/hooks/use-user'
import { getCachedDocumentForEdit, setCachedDocumentForEdit } from '@/lib/documents/document-cache'

const AdvancePaymentRequestForm = dynamic(
  () => import('@/components/forms/AdvancePaymentRequestForm').then((m) => ({ default: m.AdvancePaymentRequestForm })),
  { loading: () => <div className="list-loading">โหลดฟอร์ม...</div>, ssr: false }
)

export default function DocumentEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { user: currentUser, loading: userLoading } = useUser()
  const cachedEdit = id ? getCachedDocumentForEdit(id) : undefined
  const [document, setDocument] = useState<any>(() => cachedEdit?.document ?? null)
  const [fields, setFields] = useState<FormField[]>(() => cachedEdit?.fields ?? [])
  const [loading, setLoading] = useState(() => !cachedEdit?.document)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = params.id as string
    if (!id) return

    const cached = getCachedDocumentForEdit(id)
    if (cached?.document && cached?.fields?.length) {
      setDocument(cached.document)
      setFields(cached.fields)
      setLoading(false)
      setError(null)
      return
    }

    if (document?.id !== id) {
      setDocument(null)
      setFields([])
      setLoading(true)
      setError(null)
    }

    let stale = false
    setLoading(true)
    setError(null)

    async function fetchDocumentAndTemplate() {
      try {
        const docRes = await fetch(`/api/documents/${id}`)
        const docData = await docRes.json()

        if (stale) return
        if (!docRes.ok) {
          throw new Error(docData.error || docData.message || 'Failed to load document')
        }

        const doc = docData.document

        if (doc.status !== 'DRAFT') {
          throw new Error('Only draft documents can be edited')
        }

        setDocument(doc)

        const templateRes = await fetch('/api/form-templates')
        if (!templateRes.ok) throw new Error('Failed to fetch form template')
        const { templates } = await templateRes.json()
        const template = templates.find((t: any) => t.id === doc.formTemplateId)
        if (!template) throw new Error('Form template not found')
        if (template.slug !== 'advance-payment-request') {
          throw new Error('Edit page only supports advance payment request forms')
        }

        const formConfig = template.fields as { fields: FormField[] }
        const fieldList = formConfig.fields || []
        if (!stale) {
          setFields(fieldList)
          setCachedDocumentForEdit(id, doc, fieldList)
        }
      } catch (err: any) {
        if (stale) return
        console.error('Error fetching document:', err)
        setError(err.message || 'Failed to load document')
      } finally {
        if (!stale) setLoading(false)
      }
    }

    fetchDocumentAndTemplate()
    return () => { stale = true }
  }, [params.id])

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true)
    setError(null)

    try {
      // Merge userAssignments into the data object (as it's stored in document.data)
      const updatedData = {
        ...data,
        userAssignments: data.userAssignments || {},
      }

      // Update document via PATCH
      const updateResponse = await fetch(`/api/documents/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: updatedData,
        }),
      })

      const result = await updateResponse.json()

      if (!updateResponse.ok) {
        throw new Error(result.message || result.error || 'Failed to update document')
      }

      // Redirect to document detail page
      router.push(`/documents/${params.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to update document')
      setSubmitting(false)
    }
  }

  if (userLoading || loading) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-loading">โหลด...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error && !document) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-error">{error}</div>
          <button
            onClick={() => router.push(`/documents/${params.id}`)}
            className="form-button"
            style={{ marginTop: '20px' }}
          >
            กลับไปยังเอกสาร
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (!document || !fields.length) {
    return (
      <DashboardLayout>
        <div className="list-page">
          <div className="list-error">ไม่พบเอกสารหรือไม่สามารถแก้ไขได้</div>
        </div>
      </DashboardLayout>
    )
  }

  // Prepare default values from document data
  const documentData = document.data as any
  const defaultValues = {
    ...documentData,
    // Ensure signatures are included
    requesterSignature: documentData.signatures?.requesterSignature || documentData.requesterSignature || '',
    approverSignature: documentData.signatures?.approverSignature || documentData.approverSignature || '',
    payerSignature: documentData.signatures?.payerSignature || documentData.payerSignature || '',
    receiverSignature: documentData.signatures?.receiverSignature || documentData.receiverSignature || '',
    // Include user assignments
    approverUserId: documentData.userAssignments?.approver || '',
    payerUserId: documentData.userAssignments?.payer || '',
  }

  return (
    <DashboardLayout>
      <div className="list-page">
        <header className="list-header">
          <h1 className="page-title">แก้ไขเอกสาร</h1>
          <p className="page-subtitle">
            {document.title} • สถานะ: {document.status}
          </p>
        </header>

        <section className="list-content">
          {error && (
            <div className="form-error-box" style={{ marginBottom: '20px' }}>
              {error}
            </div>
          )}

          <AdvancePaymentRequestForm
            fields={fields}
            onSubmit={handleSubmit}
            defaultValues={defaultValues}
            loading={submitting}
          />
        </section>
      </div>
    </DashboardLayout>
  )
}

