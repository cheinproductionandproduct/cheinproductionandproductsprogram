'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CleanForm } from '@/components/forms/CleanForm'
import { UserAssignment } from '@/components/forms/UserAssignment'
import { Card } from '@/components/ui/Card'
import type { FormTemplateConfig } from '@/types/database'
import { formatDateDMY } from '@/lib/utils/date-format'
import type { FormTemplate } from '@prisma/client'

interface DocumentFormProps {
  template: FormTemplate & {
    approvalWorkflow?: {
      steps: Array<{
        id: string
        stepNumber: number
        name: string
        assigneeId?: string | null
        assigneeRole?: string | null
      }>
    }
  }
}

export function DocumentForm({ template }: DocumentFormProps) {
  const [loading, setLoading] = useState(false)
  const [userAssignments, setUserAssignments] = useState<Record<string, string>>({})
  const router = useRouter()

  const formConfig = template.fields as unknown as FormTemplateConfig
  const fields = formConfig.fields || []
  const workflowSteps = template.approvalWorkflow?.steps || []

  const handleSubmit = async (data: Record<string, any>) => {
    setLoading(true)

    try {
      // Generate title from form data or use template name
      const title = data.title || `${template.name} - ${formatDateDMY(new Date())}`

      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formTemplateId: template.id,
          title,
          data,
          status: 'DRAFT',
          userAssignments, // Send user assignments
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create document')
      }

      // Redirect to document detail page
      router.push(`/documents/${result.document.id}`)
    } catch (err: any) {
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {workflowSteps.length > 0 && (
        <Card className="p-6">
          <UserAssignment
            workflowSteps={workflowSteps}
            onAssignmentsChange={setUserAssignments}
          />
        </Card>
      )}
      
      <CleanForm
        fields={fields}
        onSubmit={handleSubmit}
        loading={loading}
        submitLabel="Save as Draft"
      />
    </div>
  )
}
