'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FormField } from './FormField'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import type { FormField as FormFieldType } from '@/types/database'

interface CleanFormProps {
  fields: FormFieldType[]
  onSubmit: (data: Record<string, any>) => Promise<void>
  defaultValues?: Record<string, any>
  loading?: boolean
  submitLabel?: string
}

export function CleanForm({
  fields,
  onSubmit,
  defaultValues = {},
  loading = false,
  submitLabel = 'Submit',
}: CleanFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues,
  })

  const [formError, setFormError] = useState<string | null>(null)

  // Initialize form values
  useEffect(() => {
    fields.forEach((field) => {
      if (defaultValues[field.name] !== undefined) {
        setValue(field.name, defaultValues[field.name])
      } else if (field.type === 'items-table') {
        setValue(field.name, { items: [{ id: '1', description: '', amount: 0 }], total: 0 })
      }
    })
  }, [fields, defaultValues, setValue])

  const onFormSubmit = async (data: Record<string, any>) => {
    setFormError(null)
    try {
      await onSubmit(data)
    } catch (err: any) {
      setFormError(err.message || 'An error occurred')
    }
  }

  return (
    <Container className="py-8">
      <Card className="p-6">
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
          {fields.map((field) => {
            if (field.type === 'items-table') {
              return (
                <Controller
                  key={field.name}
                  name={field.name}
                  control={control}
                  rules={{ required: field.required }}
                  defaultValue={defaultValues[field.name] || { items: [{ id: '1', description: '', amount: 0 }], total: 0 }}
                  render={({ field: controllerField }) => (
                    <FormField
                      field={field}
                      value={controllerField.value}
                      onChange={(value) => {
                        controllerField.onChange(value)
                        // Auto-update totalAmount if it exists
                        const totalField = fields.find(f => f.name === 'totalAmount')
                        if (totalField && value?.total !== undefined) {
                          setValue('totalAmount', value.total)
                        }
                      }}
                      error={errors[field.name]?.message as string}
                    />
                  )}
                />
              )
            }
            
            return (
              <FormField
                key={field.name}
                field={field}
                value={watch(field.name)}
                onChange={(value) => setValue(field.name, value)}
                error={errors[field.name]?.message as string}
              />
            )
          })}

          {formError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
              {formError}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : submitLabel}
            </Button>
          </div>
        </form>
      </Card>
    </Container>
  )
}

