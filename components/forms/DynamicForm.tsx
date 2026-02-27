'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ItemsTable } from './ItemsTable'
import type { FormField, FormTemplateConfig } from '@/types/database'

interface DynamicFormProps {
  fields: FormField[]
  defaultValues?: Record<string, any>
  onSubmit: (data: Record<string, any>) => void | Promise<void>
  submitLabel?: string
  loading?: boolean
}

export function DynamicForm({
  fields,
  defaultValues = {},
  onSubmit,
  submitLabel = 'Submit',
  loading = false,
}: DynamicFormProps) {
  // Build Zod schema from fields
  const schemaFields: Record<string, any> = {}
  fields.forEach((field) => {
    let fieldSchema: any

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
        fieldSchema = z.string()
        if (field.validation?.min) {
          fieldSchema = fieldSchema.min(field.validation.min)
        }
        if (field.validation?.max) {
          fieldSchema = fieldSchema.max(field.validation.max)
        }
        if (field.validation?.pattern) {
          fieldSchema = fieldSchema.regex(new RegExp(field.validation.pattern))
        }
        break

      case 'number':
        fieldSchema = z.number()
        if (field.validation?.min !== undefined) {
          fieldSchema = fieldSchema.min(field.validation.min)
        }
        if (field.validation?.max !== undefined) {
          fieldSchema = fieldSchema.max(field.validation.max)
        }
        break

      case 'date':
        fieldSchema = z.string().or(z.date())
        break

      case 'checkbox':
        fieldSchema = z.boolean()
        break

      case 'select':
        if (field.options && field.options.length > 0) {
          const values = field.options.map((opt) => opt.value)
          fieldSchema = z.enum(values as [string, ...string[]])
        } else {
          fieldSchema = z.string()
        }
        break

      case 'file':
        fieldSchema = z.any() // File handling will be separate
        break

      case 'items-table':
        // Items table stores array of items and total
        fieldSchema = z.object({
          items: z.array(z.object({
            id: z.string(),
            description: z.string(),
            amount: z.number(),
          })),
          total: z.number(),
        })
        break

      default:
        fieldSchema = z.string()
    }

    if (!field.required) {
      fieldSchema = fieldSchema.optional()
    } else if (field.type === 'number') {
      // For numbers, use nullable instead of optional
      fieldSchema = fieldSchema.nullable()
    }

    schemaFields[field.name] = fieldSchema
  })

  const schema = z.object(schemaFields)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    control,
    setValue,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const renderField = (field: FormField) => {
    const error = errors[field.name]
    const baseClasses =
      'px-3 py-2 border-b border-gray-400 focus:outline-none focus:border-red-800 bg-transparent text-gray-900'
    const errorClasses = error
      ? 'border-red-600'
      : ''

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            {...register(field.name, { required: field.required })}
            id={field.name}
            rows={4}
            placeholder={field.placeholder}
            className={`${baseClasses} ${errorClasses}`}
          />
        )

      case 'select':
        return (
          <select
            {...register(field.name, { required: field.required })}
            id={field.name}
            className={`${baseClasses} ${errorClasses}`}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              {...register(field.name)}
              type="checkbox"
              id={field.name}
              className="h-4 w-4 rounded border-black text-red-600 focus:ring-red-600"
            />
            <label htmlFor={field.name} className="ml-2 text-sm text-black">
              {field.label}
            </label>
          </div>
        )

      case 'date':
        return (
          <input
            {...register(field.name, { required: field.required })}
            type="date"
            id={field.name}
            className={`${baseClasses} ${errorClasses}`}
          />
        )

      case 'number':
        // Check if this is totalAmount - make it read-only if items-table exists
        const isTotalAmount = field.name === 'totalAmount'
        const hasItemsTable = fields.some(f => f.type === 'items-table' && f.name === 'items')
        const isReadOnly = isTotalAmount && hasItemsTable
        
        return (
          <input
            {...register(field.name, {
              required: field.required,
              valueAsNumber: true,
            })}
            type="number"
            id={field.name}
            min={field.validation?.min}
            max={field.validation?.max}
            step="any"
            placeholder={field.placeholder}
            readOnly={isReadOnly}
            className={`${baseClasses} ${errorClasses} ${isReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />
        )

      case 'file':
        return (
          <input
            {...register(field.name, { required: field.required })}
            type="file"
            id={field.name}
            className={`${baseClasses} ${errorClasses}`}
            multiple={false}
          />
        )

      case 'items-table':
        return (
          <Controller
            name={field.name}
            control={control}
            rules={{ required: field.required }}
            defaultValue={defaultValues[field.name] || { items: [{ id: '1', description: '', amount: 0 }], total: 0 }}
            render={({ field: controllerField }) => (
              <ItemsTable
                value={controllerField.value?.items || []}
                onChange={(items, total) => {
                  controllerField.onChange({ items, total })
                  // Also update totalAmount field if it exists
                  const totalField = fields.find(f => f.name === 'totalAmount')
                  if (totalField) {
                    setValue('totalAmount', total, { shouldValidate: true })
                  }
                }}
                required={field.required}
              />
            )}
          />
        )

      case 'email':
        return (
          <input
            {...register(field.name, { required: field.required })}
            type="email"
            id={field.name}
            placeholder={field.placeholder}
            className={`${baseClasses} ${errorClasses}`}
          />
        )

      default:
        return (
          <input
            {...register(field.name, { required: field.required })}
            type="text"
            id={field.name}
            placeholder={field.placeholder}
            className={`${baseClasses} ${errorClasses}`}
          />
        )
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {fields.map((field) => (
        <div key={field.name}>
          {field.type !== 'checkbox' && (
            <label
              htmlFor={field.name}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
          )}
          {renderField(field)}
          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500">
              {field.helpText}
            </p>
          )}
          {errors[field.name] && (
            <p className="mt-1 text-sm text-red-600">
              {errors[field.name]?.message as string}
            </p>
          )}
        </div>
      ))}

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-red-800 text-white px-6 py-2 font-medium transition-colors hover:bg-red-900 disabled:opacity-50"
        >
          {loading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
