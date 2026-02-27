'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function TemplateSelection() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/form-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-black">โหลด...</p>
      </div>
    )
  }

  return (
    <div>
      {templates.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm border-2 border-gray-200">
          <p className="text-gray-900">No form templates available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/documents/new/${template.slug}`}
              className="block p-6 bg-white rounded-lg shadow-sm border-2 border-gray-200 hover:border-red-700 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {template.name}
                  </h3>
                  {template.description && (
                    <p className="text-sm text-gray-500 mb-2">{template.description}</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {template._count?.documents || 0} documents created
              </p>
              <div className="mt-4 text-red-700 text-sm font-medium">
                Open →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
