'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DynamicForm } from '@/components/forms/DynamicForm'
import type { FormTemplateConfig } from '@/types/database'

interface DocumentEditFormProps {
  document: any
}

export function DocumentEditForm({ document }: DocumentEditFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const formConfig = document.formTemplate.fields as unknown as FormTemplateConfig
  const fields = formConfig.fields || []
  const currentData = document.data as Record<string, any>

  const handleSubmit = async (data: Record<string, any>) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: data.title || document.title,
          data,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update document')
      }

      // Redirect to document detail page
      router.push(`/documents/${document.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-8 shadow border border-black">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black">
          Edit {document.formTemplate.name}
        </h2>
        <p className="mt-2 text-sm text-black">
          Document: {document.documentNumber || document.id}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-800 border border-red-600">
          {error}
        </div>
      )}

      <DynamicForm
        fields={fields}
        defaultValues={currentData}
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
        loading={loading}
      />
    </div>
  )
}
