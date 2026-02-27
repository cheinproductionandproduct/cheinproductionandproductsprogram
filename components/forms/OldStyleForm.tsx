'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { numberToThaiText, formatDate, formatNumber } from '@/lib/utils/thai-number'
import { SignatureCanvas } from '@/components/signature/SignatureCanvas'
import type { FormField } from '@/types/database'

interface OldStyleFormProps {
  fields: FormField[]
  onSubmit: (data: Record<string, any>) => Promise<void>
  defaultValues?: Record<string, any>
  loading?: boolean
  templateName?: string
}

// Reusable Input Component matching old form style
interface InputProps {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date' | 'textarea'
  placeholder?: string
  required?: boolean
  className?: string
  inline?: boolean
  readOnly?: boolean
  disabled?: boolean
}

const Input: React.FC<InputProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  className = '',
  inline = false,
  readOnly = false,
  disabled = false,
}) => {
  const baseClasses = 'px-3 py-2 border-b border-gray-400 focus:outline-none focus:border-red-800 bg-transparent'
  const disabledClasses = (readOnly || disabled) ? 'bg-gray-100 cursor-not-allowed' : ''
  
  if (inline) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <label className="text-sm text-gray-700 whitespace-nowrap">
          {label}
        </label>
        {type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            readOnly={readOnly || disabled}
            disabled={disabled}
            rows={2}
            className={`flex-1 ${baseClasses} ${disabledClasses}`}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            required={required}
            readOnly={readOnly || disabled}
            disabled={disabled}
            className={`flex-1 ${baseClasses} ${disabledClasses}`}
          />
        )}
      </div>
    )
  }
  
  if (type === 'textarea') {
    return (
      <div className={className}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          readOnly={readOnly || disabled}
          disabled={disabled}
          rows={3}
          className={`w-full ${baseClasses} ${disabledClasses}`}
        />
      </div>
    )
  }
  
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly || disabled}
        disabled={disabled}
        className={`w-full ${baseClasses} ${disabledClasses}`}
      />
    </div>
  )
}

export function OldStyleForm({
  fields,
  onSubmit,
  defaultValues = {},
  loading = false,
  templateName = 'Document',
}: OldStyleFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, any>>(defaultValues)
  const [error, setError] = useState<string | null>(null)
  const [signatureModal, setSignatureModal] = useState<{ isOpen: boolean; field: string; label: string }>({
    isOpen: false,
    field: '',
    label: '',
  })

  // Initialize form data from fields
  useEffect(() => {
    const initialData: Record<string, any> = { ...defaultValues }
    fields.forEach((field) => {
      if (initialData[field.name] === undefined) {
        if (field.type === 'items-table') {
          initialData[field.name] = { items: [{ id: '1', description: '', amount: 0 }], total: 0 }
        } else if (field.type === 'number') {
          initialData[field.name] = 0
        } else if (field.type === 'date') {
          initialData[field.name] = new Date().toISOString().split('T')[0]
        } else {
          initialData[field.name] = ''
        }
      }
    })
    setFormData(initialData)
  }, [fields, defaultValues])

  const updateField = (fieldName: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [fieldName]: value }
      // Auto-calculate total if items table exists
      if (fieldName === 'items' && Array.isArray(value)) {
        const total = value.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
        updated.totalAmount = total
      }
      return updated
    })
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    try {
      await onSubmit(formData)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  // Get items table field
  const itemsField = fields.find(f => f.type === 'items-table')
  const itemsData = itemsField ? formData[itemsField.name] : null
  const currentItems = itemsData?.items || []
  const currentTotal = itemsData?.total || 0

  const addItem = () => {
    const newItem = { id: Date.now().toString(), description: '', amount: 0 }
    const updatedItems = [...currentItems, newItem]
    const total = updatedItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    updateField(itemsField!.name, { items: updatedItems, total })
  }

  const addFrequentItem = (description: string) => {
    const newItem = { id: Date.now().toString(), description, amount: 0 }
    const updatedItems = [...currentItems, newItem]
    const total = updatedItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    updateField(itemsField!.name, { items: updatedItems, total })
  }

  const removeItem = (id: string) => {
    if (currentItems.length > 1) {
      const updatedItems = currentItems.filter((item: any) => item.id !== id)
      const total = updatedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
      updateField(itemsField!.name, { items: updatedItems, total })
    }
  }

  const updateItem = (id: string, field: 'description' | 'amount', value: string | number) => {
    const updatedItems = currentItems.map((item: any) =>
      item.id === id ? { ...item, [field]: value } : item
    )
    const total = updatedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
    updateField(itemsField!.name, { items: updatedItems, total })
  }

  // Signature fields (4 boxes)
  const signatureFields = [
    { label: 'ผู้ขอเบิก', name: 'requesterName', signature: 'requesterSignature', date: 'requesterDate' },
    { label: 'ผู้อนุมัติ/ตรวจสอบ', name: 'approverName', signature: 'approverSignature', date: 'approverDate' },
    { label: 'ผู้จ่ายเงิน', name: 'payerName', signature: 'payerSignature', date: 'payerDate' },
    { label: 'ผู้รับเงิน', name: 'receiverName', signature: 'receiverSignature', date: 'receiverDate' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg border border-gray-300 p-8 print:p-4">
          {/* Company Header */}
          <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-400">
            <div className="flex-1 pr-8">
              <div className="mb-4">
                <img
                  src="/cheinprodlogo-removebg-preview.png"
                  alt="Chein Logo"
                  className="h-16 w-auto object-contain mb-2"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'block'
                  }}
                />
                <div className="text-3xl font-bold text-red-600 italic hidden" style={{ fontFamily: 'cursive' }}>
                  Chein
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-2">
                บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)
              </div>
              <div className="text-xs text-gray-700 mb-1">
                159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510
              </div>
              <div className="text-xs text-gray-700 mb-1">
                เลขประจำตัวผู้เสียภาษี 0105559081883
              </div>
              <div className="text-xs text-gray-700 mb-1">
                โทร. +666 2635 9647
              </div>
              <div className="text-xs text-gray-700">
                เบอร์มือถือ +669 0897 9955, +668 3242 2380
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <h1 className="text-xl font-bold text-gray-900 mb-6">
                {templateName}
              </h1>
              {/* Dynamic metadata fields */}
              {fields.filter(f => ['advNumber', 'creNumber', 'date', 'dateMoneyNeeded'].includes(f.name)).map((field) => (
                <Input
                  key={field.name}
                  label={field.label}
                  value={formData[field.name] || ''}
                  onChange={(v) => updateField(field.name, v)}
                  type={field.type as any}
                  inline
                  className="text-sm"
                  readOnly={field.name.includes('Number')}
                />
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {fields
              .filter(f => 
                !['advNumber', 'creNumber', 'date', 'dateMoneyNeeded'].includes(f.name) && 
                f.type !== 'items-table' && 
                !f.name.includes('Signature') && 
                !f.name.includes('Date') && 
                f.name !== 'totalAmount' &&
                !['requesterName', 'approverName', 'payerName', 'receiverName'].includes(f.name)
              )
              .map((field) => (
                <Input
                  key={field.name}
                  label={field.label}
                  value={formData[field.name] || ''}
                  onChange={(v) => updateField(field.name, v)}
                  type={field.type as any}
                  required={field.required}
                  inline={!['purpose', 'workSummary'].includes(field.name)}
                />
              ))}

            {/* Items Table */}
            {itemsField && (
              <section className="mb-6">
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">รายการ</h3>
                    <button
                      type="button"
                      onClick={addItem}
                      className="px-4 py-2 bg-red-800 text-white text-sm rounded-md hover:bg-red-900"
                    >
                      + เพิ่มรายการ
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-600">รายการที่ใช้บ่อย:</span>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าน้ำมัน')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-md hover:bg-gray-200 border border-gray-300 transition-colors"
                    >
                      ค่าน้ำมัน
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าที่จอดรถ')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-md hover:bg-gray-200 border border-gray-300 transition-colors"
                    >
                      ค่าที่จอดรถ
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าทางด่วน')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded-md hover:bg-gray-200 border border-gray-300 transition-colors"
                    >
                      ค่าทางด่วน
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-400">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-center w-16">ลำดับ</th>
                        <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-left">รายการ</th>
                        <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-right w-32">จำนวนเงิน(บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="border border-gray-400 px-3 py-8 text-center text-gray-500 text-sm">
                            <div className="flex flex-col items-center gap-2">
                              <span>ยังไม่มีรายการ</span>
                              <button
                                type="button"
                                onClick={addItem}
                                className="px-4 py-2 bg-red-800 text-white text-sm rounded-md hover:bg-red-900"
                              >
                                + เพิ่มรายการแรก
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {currentItems.map((item: any, index: number) => (
                            <tr key={item.id} className="hover:bg-gray-50 group">
                              <td className="border border-gray-400 px-3 py-2 text-center text-sm">{index + 1}</td>
                              <td className="border border-gray-400 px-3 py-2 relative">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                  placeholder="รายละเอียดรายการ"
                                  className="w-full px-2 py-1.5 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                />
                                {currentItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md border border-black bg-[#c0392b] hover:bg-[#a93226] text-white transition-all opacity-0 group-hover:opacity-100"
                                    title="ลบรายการ"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                  </button>
                                )}
                              </td>
                              <td className="border border-gray-400 px-3 py-2">
                                <input
                                  type="number"
                                  value={item.amount || ''}
                                  onChange={(e) => updateItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                                />
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td className="border border-gray-400 px-3 py-2 text-sm text-center">รวม</td>
                            <td className="border border-gray-400 px-3 py-2 text-sm">{numberToThaiText(currentTotal)}</td>
                            <td className="border border-gray-400 px-3 py-2 text-sm text-right font-bold">
                              {formatNumber(currentTotal)}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Signature Section */}
            <section className="mb-6">
              <div className="mb-3 text-sm font-semibold text-gray-900">เบิกเงินทดรองจ่าย</div>
              <div className="grid grid-cols-4 gap-4">
                {signatureFields.map((sig) => (
                  <div key={sig.name} className="text-center">
                    <div className="text-xs text-gray-700 mb-1">{sig.label}</div>
                    <div
                      onClick={() => setSignatureModal({ isOpen: true, field: sig.signature, label: sig.label })}
                      className="border-2 border-dashed border-gray-400 h-20 mb-2 flex items-center justify-center cursor-pointer hover:border-red-800 hover:bg-gray-50 transition-colors"
                      title="คลิกเพื่อลงนาม"
                    >
                      {formData[sig.signature] ? (
                        <img
                          src={formData[sig.signature]}
                          alt={`${sig.label} signature`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-gray-400">คลิกเพื่อเซ็น</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData[sig.name] || ''}
                      onChange={(e) => updateField(sig.name, e.target.value)}
                      placeholder={`ชื่อ${sig.label}`}
                      className="w-full px-2 py-1 border-b border-gray-400 focus:outline-none focus:border-red-800 bg-transparent text-sm text-center mb-2"
                    />
                    <Input
                      label=""
                      value={formData[sig.date] || ''}
                      onChange={(v) => updateField(sig.date, v)}
                      type="date"
                      inline
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <section className="text-center mt-8 pt-4 border-t border-gray-300">
              <p className="text-xs text-gray-700 italic">*ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*</p>
            </section>

            {/* Error Message */}
            {error && (
              <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-800 border border-red-600">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-6 mt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-red-800 text-white rounded-md hover:bg-red-900 disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Signature Canvas Modal */}
      <SignatureCanvas
        isOpen={signatureModal.isOpen}
        onClose={() => setSignatureModal({ isOpen: false, field: '', label: '' })}
        onSave={(signature) => {
          updateField(signatureModal.field, signature)
          // Auto-set date
          const sigField = signatureFields.find(s => s.signature === signatureModal.field)
          if (sigField) {
            updateField(sigField.date, new Date().toISOString().split('T')[0])
          }
          setSignatureModal({ isOpen: false, field: '', label: '' })
        }}
        label={signatureModal.label}
      />
    </div>
  )
}

