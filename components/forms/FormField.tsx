'use client'

import { Input } from '@/components/ui/Input'
import { ItemsTable } from './ItemsTable'
import type { FormField as FormFieldType } from '@/types/database'

interface FormFieldProps {
  field: FormFieldType
  value: any
  onChange: (value: any) => void
  error?: string
}

export function FormField({ field, value, onChange, error }: FormFieldProps) {
  switch (field.type) {
    case 'items-table':
      return (
        <div className="w-full">
          {field.label && (
            <label className="form-label">
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
          )}
          <ItemsTable
            value={value?.items || []}
            onChange={(items, total) => {
              onChange({ items, total })
            }}
            required={field.required}
          />
          {error && <p className="form-error">{error}</p>}
        </div>
      )
    
    case 'textarea':
      return (
        <div className="w-full">
          {field.label && (
            <label className="form-label">
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </label>
          )}
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className={`form-textarea ${error ? 'border-red-600' : ''}`}
            rows={3}
          />
          {error && <p className="form-error">{error}</p>}
        </div>
      )
    
    default:
      return (
        <Input
          label={field.label}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          error={error}
        />
      )
  }
}

