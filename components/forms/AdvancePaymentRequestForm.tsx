'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { numberToThaiText, formatNumber } from '@/lib/utils/thai-number'
import { formatDateDMY, parseDateDMY } from '@/lib/utils/date-format'
import { isValidDistributionDate, isAtLeast7DaysBefore, getDateMoneyNeededOptions, getClosestDistributionDateAfter, getClosestClearanceDueDate, getNextDistributionFriday, getDistributionDatesForDisplay, getDistributionDatesFromToday } from '@/lib/utils/distribution-dates'
import type { FormField } from '@/types/database'
import { SignatureCanvas } from '@/components/signature/SignatureCanvas'
import { useUser } from '@/hooks/use-user'

interface AdvancePaymentRequestFormProps {
  fields: FormField[]
  onSubmit: (data: Record<string, any>) => Promise<void>
  defaultValues?: Record<string, any>
  loading?: boolean
}

// Reusable Input Component
interface InputProps {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date' | 'textarea'
  placeholder?: string
  required?: boolean
  className?: string
  error?: string
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
  error,
  disabled = false,
}) => {
  const baseClasses = 'form-input'
  const errorClasses = error ? 'border-red-600' : ''
  
  if (type === 'textarea') {
    return (
      <div className={`form-field-group ${className}`}>
        <label className="form-label">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          rows={4}
          className={`form-textarea ${errorClasses}`}
        />
        {error && <p className="form-error">{error}</p>}
      </div>
    )
  }
  
  return (
    <div className={`form-field-group ${className}`}>
      <label className="form-label">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`${baseClasses} ${errorClasses}`}
      />
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export function AdvancePaymentRequestForm({
  fields,
  onSubmit,
  defaultValues = {},
  loading = false,
}: AdvancePaymentRequestFormProps) {
  const { user: currentUser } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [openSignatureModal, setOpenSignatureModal] = useState<string | null>(null)
  const datePickerRef = useRef<HTMLInputElement>(null)
  const signatureDateRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const dateMoneyNeededOptions = getDateMoneyNeededOptions()
  const dateOptions = getDistributionDatesFromToday() // วันที่: only today and future Fridays (past dates removed)
  const [users, setUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [jobs, setJobs] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [signatures, setSignatures] = useState<Record<string, string>>({
    requesterSignature: defaultValues.signatures?.requesterSignature || defaultValues.requesterSignature || '',
    approverSignature: defaultValues.signatures?.approverSignature || defaultValues.approverSignature || '',
    payerSignature: defaultValues.signatures?.payerSignature || defaultValues.payerSignature || '',
    receiverSignature: defaultValues.signatures?.receiverSignature || defaultValues.receiverSignature || '',
  })

  // Update signatures when defaultValues change (for editing)
  useEffect(() => {
    if (defaultValues.signatures || defaultValues.requesterSignature || defaultValues.approverSignature) {
      setSignatures({
        requesterSignature: defaultValues.signatures?.requesterSignature || defaultValues.requesterSignature || '',
        approverSignature: defaultValues.signatures?.approverSignature || defaultValues.approverSignature || '',
        payerSignature: defaultValues.signatures?.payerSignature || defaultValues.payerSignature || '',
        receiverSignature: defaultValues.signatures?.receiverSignature || defaultValues.receiverSignature || '',
      })
    }
  }, [defaultValues])

  // Fetch users from Prisma database for dropdowns
  useEffect(() => {
    async function fetchUsers() {
      try {
        setLoadingUsers(true)
        // Fetch all active users from Prisma (using a high limit to get all users)
        // The API uses prisma.user.findMany() to fetch from the database
        const res = await fetch('/api/users?limit=1000&isActive=true&sortBy=fullName&sortOrder=asc')
        const data = await res.json()
        if (res.ok && data.users) {
          setUsers(data.users)
        } else {
          console.error('Failed to fetch users:', data.error)
        }
      } catch (err) {
        console.error('Error fetching users from database:', err)
      } finally {
        setLoadingUsers(false)
      }
    }
    fetchUsers()
  }, [])

  // Fetch jobs for dropdown (next to ADV number)
  useEffect(() => {
    async function loadJobs() {
      try {
        setLoadingJobs(true)
        const res = await fetch('/api/jobs')
        const data = await res.json()
        if (res.ok && data.jobs) {
          setJobs(data.jobs)
        }
      } catch (err) {
        console.error('Error fetching jobs:', err)
      } finally {
        setLoadingJobs(false)
      }
    }
    loadJobs()
  }, [])

  // Build validation schema
  const schemaFields: Record<string, any> = {}
  fields.forEach((field) => {
    if (field.type === 'items-table') {
      schemaFields[field.name] = z.object({
        items: z.array(
          z.object({
            id: z.string(),
            description: z.string().min(1, 'Item description is required'),
            details: z.string().optional(),
            amount: z.number().min(0, 'Amount must be 0 or greater'),
          })
        ).min(1, 'At least one item is required'),
        total: z.number().min(0),
      })
    } else if (field.type === 'number') {
      schemaFields[field.name] = field.required
        ? z.number().min(0, 'Must be 0 or greater')
        : z.number().min(0).optional()
    } else if (field.type === 'date') {
      schemaFields[field.name] = field.required 
        ? z.string().min(1, 'Date is required')
        : z.string().optional()
    } else if (field.type === 'textarea') {
      schemaFields[field.name] = field.required 
        ? z.string().min(1, 'This field is required')
        : z.string().optional()
    } else {
      schemaFields[field.name] = field.required 
        ? z.string().min(1, 'This field is required')
        : z.string().optional()
    }
  })
  // Job is required so every document has a job selected
  let schema = z.object({
    ...schemaFields,
    jobId: z.string().min(1, 'กรุณาเลือกงาน (Job)'),
    urgent: z.boolean().optional(),
  })
  // วันที่ต้องใช้เงิน: when Urgent=true use current date; otherwise must be distribution Friday and 7 days ahead
  schema = schema.superRefine((data: any, ctx) => {
    if (data.urgent === true) return // Skip validation when urgent is checked — both dates use current date
    const d = data.dateMoneyNeeded
    if (!d || typeof d !== 'string' || d.length < 10) return
    if (!isValidDistributionDate(d)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'วันที่ต้องใช้เงินต้องเป็นวันศุกร์ที่จ่ายเงินตามกำหนดเท่านั้น', path: ['dateMoneyNeeded'] })
      return
    }
    if (!isAtLeast7DaysBefore(d)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ต้องส่งเอกสารล่วงหน้าอย่างน้อย 7 วันก่อนวันจ่ายเงิน', path: ['dateMoneyNeeded'] })
    }
  })

  // Initialize default items if not provided
  const initialItems = defaultValues.items || { items: [{ id: '1', description: '', details: '', amount: 0 }], total: 0 }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<Record<string, any>>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaultValues,
      urgent: defaultValues.urgent === true || defaultValues.urgent === 'yes' ? true : false,
      date: (defaultValues.date && dateOptions.some((o) => o.value === defaultValues.date))
        ? defaultValues.date
        : (dateOptions[0]?.value || new Date().toISOString().split('T')[0]),
      dateMoneyNeeded: (defaultValues.dateMoneyNeeded && dateMoneyNeededOptions.some((o) => o.value === defaultValues.dateMoneyNeeded))
        ? defaultValues.dateMoneyNeeded
        : getNextDistributionFriday(defaultValues.date || dateOptions[0]?.value || new Date().toISOString().split('T')[0]),
      items: initialItems,
      totalAmount: initialItems.total || 0,
      requesterName: defaultValues.requesterName || currentUser?.fullName || currentUser?.email || '',
      position: defaultValues.position || currentUser?.position || '',
      department: defaultValues.department || currentUser?.department || '',
      requesterSignatureName: defaultValues.requesterSignatureName || currentUser?.fullName || currentUser?.email || '',
      receiverSignatureName: defaultValues.receiverSignatureName || currentUser?.fullName || currentUser?.email || '',
    },
  })

  // Auto-fill requester info from user account when current user is loaded
  useEffect(() => {
    if (currentUser) {
      const userName = currentUser.fullName || currentUser.email || ''
      // Set requester info from user account
      setValue('requesterName', userName)
      if (currentUser.position) {
        setValue('position', currentUser.position)
      }
      if (currentUser.department) {
        setValue('department', currentUser.department)
      }
      // Set both requester and receiver signature names to current user
      setValue('requesterSignatureName', userName)
      setValue('receiverSignatureName', userName)
      // Also set receiver user ID to current user
      setValue('receiverUserId', currentUser.id)
    }
  }, [currentUser, setValue])

  // Sync receiver name with requester name whenever requester changes
  const requesterName = watch('requesterSignatureName')
  useEffect(() => {
    if (requesterName !== undefined) {
      setValue('receiverSignatureName', requesterName)
    }
  }, [requesterName, setValue])

  // Auto-set dates based on urgent: Urgent=checked → use current date for both; otherwise → NEXT distribution Friday after วันที่
  const urgent = watch('urgent')
  const dateRequest = watch('date')
  useEffect(() => {
    if (urgent === true) {
      // When urgent is checked, set both dates to current date
      const today = new Date().toISOString().split('T')[0]
      setValue('date', today, { shouldValidate: true })
      setValue('dateMoneyNeeded', today, { shouldValidate: true })
    } else if (dateRequest && getDateISO(dateRequest) !== '') {
      // When urgent is not checked, use selected Friday and push dateMoneyNeeded to next Friday
      const requestIso = getDateISO(dateRequest) || dateRequest
      const nextFriday = getNextDistributionFriday(requestIso)
      if (nextFriday) setValue('dateMoneyNeeded', nextFriday, { shouldValidate: true })
    }
  }, [urgent, dateRequest, setValue])

  // Display date as d/m/y when value is YYYY-MM-DD (avoids regex in JSX and ensures correct format on load)
  const getDateDisplay = (val: string | undefined) => {
    if (val == null || val === '') return ''
    const s = String(val)
    if (s.length !== 10 || s[4] !== '-' || s[7] !== '-') return s
    return formatDateDMY(s)
  }
  const getDateISO = (val: string | undefined) => {
    if (val == null || val === '') return ''
    const s = String(val)
    return s.length === 10 && s[4] === '-' && s[7] === '-' ? s : ''
  }
  // กำหนดวันเคลียร์: closest from fixed clearance list to (base + 15 days); if 15th is Saturday, round down
  const getClearanceDueDate = (): string => {
    const base = urgent === 'yes' ? watch('date') : watch('dateMoneyNeeded')
    const iso = getDateISO(base) || base
    if (!iso || iso.length !== 10) return ''
    const clearanceIso = getClosestClearanceDueDate(iso)
    return clearanceIso ? formatDateDMY(clearanceIso) : ''
  }

  // Default approver and payer to Bee (bee@cheinproduction.co.th) when creating new APR
  const existingApprover = defaultValues.approverUserId ?? defaultValues.userAssignments?.approver
  const existingPayer = defaultValues.payerUserId ?? defaultValues.userAssignments?.payer
  useEffect(() => {
    if (users.length === 0) return
    const bee = users.find((u: any) => (u.email || '').toLowerCase() === 'bee@cheinproduction.co.th')
    if (!bee) return
    if (!existingApprover) setValue('approverUserId', bee.id)
    if (!existingPayer) setValue('payerUserId', bee.id)
  }, [users, setValue, existingApprover, existingPayer])

  const handleFormSubmit = async (data: Record<string, any>) => {
    setError(null)
    console.log('[AdvancePaymentRequestForm] Form submitted with data:', data)
    
    try {
      // Validate items have descriptions
      if (data.items && data.items.items) {
        const hasEmptyItems = data.items.items.some((item: any) => !item.description || item.description.trim() === '')
        if (hasEmptyItems) {
          setError('กรุณาระบุรายการให้ครบถ้วน')
          console.error('[AdvancePaymentRequestForm] Validation failed: empty items')
          return
        }
      }

      // Ensure totalAmount is calculated
      if (data.items && data.items.total !== undefined) {
        data.totalAmount = data.items.total
      }

      // Include signatures in the data
      data.signatures = signatures

      // Ensure requester and receiver names are set if signatures exist
      if (signatures.requesterSignature && !data.requesterSignatureName) {
        data.requesterSignatureName = currentUser?.fullName || currentUser?.email || ''
      }
      if (signatures.receiverSignature && !data.receiverSignatureName) {
        data.receiverSignatureName = currentUser?.fullName || currentUser?.email || ''
      }

      // Ensure dates are set for signatures that exist (recipient date = วันที่ได้เงิน)
      if (signatures.requesterSignature && !data.requesterSignatureDate) {
        data.requesterSignatureDate = new Date().toISOString().split('T')[0]
      }
      if (signatures.receiverSignature && !data.receiverSignatureDate) {
        data.receiverSignatureDate = data.dateMoneyNeeded || new Date().toISOString().split('T')[0]
      }

      // Include job name for display (jobId is stored, jobName/jobCode for readability)
      if (data.jobId) {
        const selectedJob = jobs.find((j) => j.id === data.jobId)
        if (selectedJob) {
          data.jobName = selectedJob.name
          data.jobCode = selectedJob.code
        }
      }

      // Include user assignments for signing
      // Receiver is the same as requester (current user), so use current user ID
      data.userAssignments = {
        approver: watch('approverUserId') || null,
        payer: watch('payerUserId') || null,
        receiver: currentUser?.id || null, // Receiver is always the current user
      }

      console.log('[AdvancePaymentRequestForm] Calling onSubmit with userAssignments:', data.userAssignments)
      await onSubmit(data)
      console.log('[AdvancePaymentRequestForm] onSubmit completed successfully')
    } catch (err: any) {
      console.error('[AdvancePaymentRequestForm] Error in handleFormSubmit:', err)
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  const handleSignatureSave = (signatureName: string, signatureData: string) => {
    const today = new Date().toISOString().split('T')[0]
    const dateMoneyNeeded = getValues('dateMoneyNeeded') || today // วันที่ได้เงิน

    // Sync signing between ผู้เบิก and ผู้รับเงิน: same signature image and names; recipient date = วันที่ได้เงิน
    if (signatureName === 'requesterSignature' || signatureName === 'receiverSignature') {
      const userName = currentUser?.fullName || currentUser?.email || ''
      setSignatures(prev => ({
        ...prev,
        requesterSignature: signatureData,
        receiverSignature: signatureData,
      }))
      setValue('requesterSignature', signatureData, { shouldValidate: true })
      setValue('receiverSignature', signatureData, { shouldValidate: true })
      setValue('requesterSignatureName', userName, { shouldValidate: true })
      setValue('receiverSignatureName', userName, { shouldValidate: true })
      setValue('requesterSignatureDate', today, { shouldValidate: true })
      setValue('receiverSignatureDate', dateMoneyNeeded, { shouldValidate: true })
    } else {
      setSignatures(prev => ({ ...prev, [signatureName]: signatureData }))
      setValue(signatureName, signatureData, { shouldValidate: true })
      setValue(`${signatureName}Date`, today, { shouldValidate: true })
    }

    setOpenSignatureModal(null)
  }

  const getCurrentItems = () => {
    const itemsData = watch('items') || initialItems
    return itemsData.items || []
  }

  const addItem = () => {
    const currentItems = getCurrentItems()
    const newId = String(Date.now())
    const newItems = [...currentItems, { id: newId, description: '', details: '', amount: 0 }]
    const newTotal = newItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
    setValue('items', { items: newItems, total: newTotal }, { shouldValidate: true })
    setValue('totalAmount', newTotal, { shouldValidate: true })
  }

  const removeItem = (id: string) => {
    const currentItems = getCurrentItems()
    if (currentItems.length > 1) {
      const newItems = currentItems.filter((item: any) => item.id !== id)
      const newTotal = newItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
      setValue('items', { items: newItems, total: newTotal }, { shouldValidate: true })
      setValue('totalAmount', newTotal, { shouldValidate: true })
    }
  }

  const updateItem = (id: string, field: 'description' | 'details' | 'amount', value: string | number) => {
    const currentItems = getCurrentItems()
    const updated = currentItems.map((item: any) =>
      item.id === id ? { ...item, [field]: value } : item
    )
    const newTotal = updated.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
    setValue('items', { items: updated, total: newTotal }, { shouldValidate: true })
    setValue('totalAmount', newTotal, { shouldValidate: true })
  }

  const addFrequentItem = (description: string) => {
    const currentItems = getCurrentItems()
    
    // Check if there's an empty first item (default row with no description)
    const firstItem = currentItems[0]
    if (firstItem && (!firstItem.description || firstItem.description.trim() === '')) {
      // Replace the first empty item with the frequent item
      const updated = currentItems.map((item: any, index: number) =>
        index === 0 ? { ...item, description, details: '', amount: 0 } : item
      )
      const newTotal = updated.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
      setValue('items', { items: updated, total: newTotal }, { shouldValidate: true })
      setValue('totalAmount', newTotal, { shouldValidate: true })
    } else {
      // If first item is not empty, add as new item
      const newId = String(Date.now())
      const newItems = [...currentItems, { id: newId, description, details: '', amount: 0 }]
      const newTotal = newItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
      setValue('items', { items: newItems, total: newTotal }, { shouldValidate: true })
      setValue('totalAmount', newTotal, { shouldValidate: true })
    }
  }

  return (
    <div className="form-container">
      <h1 className="form-title">ใบเบิกเงินทดรองจ่าย (Advance Payment Request)</h1>
      
      <form onSubmit={handleSubmit(handleFormSubmit, (errors) => {
        console.error('[AdvancePaymentRequestForm] Form validation errors:', errors)
        setError('กรุณากรอกข้อมูลให้ครบถ้วน')
      })} className="form-wrapper">
        {/* Document Info Section */}
        <div className="form-section">
          <h2 className="form-section-title">ข้อมูลเอกสาร</h2>
          <div className="form-row">
            <Input
              label="เลขที่ ADV"
              value={watch('advNumber') || ''}
              onChange={(v) => setValue('advNumber', v)}
              error={errors.advNumber?.message as string}
              disabled={true}
            />
            <div className="form-field-group">
              <label className="form-label">งาน (Job) <span className="text-red-600">*</span></label>
              <select
                className="form-select"
                value={watch('jobId') || ''}
                onChange={(e) => setValue('jobId', e.target.value)}
              >
                <option value="">-- เลือกงาน --</option>
                {loadingJobs ? (
                  <option disabled>โหลด...</option>
                ) : (
                  jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.code ? `${job.code}_${job.name}` : job.name}
                    </option>
                  ))
                )}
              </select>
              {errors.jobId?.message && <p className="form-error">{errors.jobId.message as string}</p>}
            </div>
          </div>
          <div className="form-row form-row--dates-urgent">
            <div className="form-field-group form-field-date">
              <label className="form-label">วันที่ <span className="text-red-600">*</span></label>
              {urgent === true ? (
                <input
                  type="text"
                  className="form-input"
                  value={getDateDisplay(watch('date'))}
                  readOnly
                  disabled
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
              ) : (
                <select
                  className="form-select"
                  value={getDateISO(watch('date')) || ''}
                  onChange={(e) => setValue('date', e.target.value, { shouldValidate: true })}
                >
                  <option value="">-- เลือกวันที่ (ศุกร์เท่านั้น) --</option>
                  {dateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
              {errors.date?.message && <p className="form-error">{errors.date.message as string}</p>}
            </div>
            <div className="form-field-group form-field-date">
              <label className="form-label">วันที่ต้องใช้เงิน <span className="text-red-600">*</span></label>
              {urgent === true ? (
                <>
                  <p className="form-hint" lang="th">เร่งด่วน — ใช้วันที่ปัจจุบัน</p>
                  <input
                    type="text"
                    className="form-input"
                    value={getDateDisplay(watch('dateMoneyNeeded'))}
                    readOnly
                    disabled
                    style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </>
              ) : (
                <>
                  <p className="form-hint" lang="th">จ่ายทุกวันศุกร์ — ต้องส่งเอกสารล่วงหน้าอย่างน้อย 7 วัน (วันศุกร์ถัดไปหลังวันที่)</p>
                  <select
                    className="form-select"
                    value={getDateISO(watch('dateMoneyNeeded')) || ''}
                    onChange={(e) => setValue('dateMoneyNeeded', e.target.value, { shouldValidate: true })}
                  >
                    <option value="">-- เลือกวันจ่ายเงิน --</option>
                    {dateMoneyNeededOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    {(() => {
                      const current = watch('dateMoneyNeeded')
                      const iso = getDateISO(current)
                      if (iso && !dateMoneyNeededOptions.some((o) => o.value === iso) && isValidDistributionDate(iso)) {
                        return <option value={iso}>{getDateDisplay(current)}</option>
                      }
                      return null
                    })()}
                  </select>
                </>
              )}
              {errors.dateMoneyNeeded?.message && <p className="form-error">{errors.dateMoneyNeeded.message as string}</p>}
            </div>
            <div className="form-urgent-clearance-row">
              <div className="form-urgent-box" style={{ flex: 1 }}>
                <label className="form-label">เร่งด่วน (Urgent)</label>
                <label 
                  className="form-select"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    backgroundColor: watch('urgent') === true ? '#fef2f2' : '#ffffff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={watch('urgent') === true}
                    onChange={(e) => setValue('urgent', e.target.checked, { shouldValidate: true })}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: '#dc2626',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ 
                    color: watch('urgent') === true ? '#dc2626' : 'inherit',
                    fontWeight: watch('urgent') === true ? '600' : 'normal',
                  }}>
                    เร่งด่วน
                  </span>
                </label>
              </div>
              <div className="form-field-group form-clearance-field">
                <label className="form-label">กำหนดวันเคลียร์</label>
                <input
                  type="text"
                  className="form-input"
                  value={getClearanceDueDate()}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>
          <p className="form-hint form-clearance-hint" lang="th" style={{ marginTop: 4, marginBottom: 0 }}>
            กำหนดวันเคลียร์: {urgent === true ? 'วันที่ + 15 วัน' : 'วันที่ต้องใช้เงิน + 15 วัน'}
          </p>
        </div>

        {/* Requester Info Section */}
        <div className="form-section">
          <h2 className="form-section-title">ข้อมูลผู้ขอเบิก</h2>
          <Input
            label="ชื่อผู้ขอเบิก"
            value={watch('requesterName') || ''}
            onChange={(v) => setValue('requesterName', v)}
            required
            error={errors.requesterName?.message as string}
            disabled={true}
          />
          <div className="form-row">
            <Input
              label="ตำแหน่ง"
              value={watch('position') || ''}
              onChange={(v) => setValue('position', v)}
              required
              error={errors.position?.message as string}
              disabled={true}
            />
            <Input
              label="ส่วนงาน/ฝ่าย/แผนก"
              value={watch('department') || ''}
              onChange={(v) => setValue('department', v)}
              required
              error={errors.department?.message as string}
              disabled={true}
            />
          </div>
        </div>

        {/* Purpose Section */}
        <div className="form-section">
          <h2 className="form-section-title">วัตถุประสงค์</h2>
          <Input
            label="วัตถุประสงค์การเบิกเงินทดรองจ่าย"
            value={watch('purpose') || ''}
            onChange={(v) => setValue('purpose', v)}
            type="textarea"
            required
            error={errors.purpose?.message as string}
          />
        </div>

        {/* Items Table Section */}
        <div className="form-section">
          <Controller
            name="items"
            control={control}
            rules={{ required: true }}
            defaultValue={initialItems}
            render={({ field }) => {
              const currentItems = field.value?.items || []
              const currentTotal = field.value?.total || 0
              const itemsError = errors.items?.message as string

              return (
                <div>
                  <div className="form-section-header">
                    <h2 className="form-section-title">รายการ</h2>
                    <button
                      type="button"
                      onClick={addItem}
                      className="form-button form-button-small"
                    >
                      + เพิ่มรายการ
                    </button>
                  </div>
                  
                  <div className="frequent-items">
                    <span className="frequent-items-label">รายการที่ใช้บ่อย:</span>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าน้ำมัน')}
                      className="frequent-item-btn"
                    >
                      ค่าน้ำมัน
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าที่จอดรถ')}
                      className="frequent-item-btn"
                    >
                      ค่าที่จอดรถ
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าทางด่วน')}
                      className="frequent-item-btn"
                    >
                      ค่าทางด่วน
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ซื้อสดหน้างาน')}
                      className="frequent-item-btn"
                    >
                      ซื้อสดหน้างาน
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่าอาหารและเครื่องดื่ม')}
                      className="frequent-item-btn"
                    >
                      ค่าอาหารและเครื่องดื่ม
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('ค่ารับรอง')}
                      className="frequent-item-btn"
                    >
                      ค่ารับรอง
                    </button>
                    <button
                      type="button"
                      onClick={() => addFrequentItem('อื่นๆ')}
                      className="frequent-item-btn"
                    >
                      อื่นๆ
                    </button>
                  </div>

                  {itemsError && <p className="form-error">{itemsError}</p>}

                  <div className="items-table-wrapper">
                    <table className="items-table">
                      <thead>
                        <tr>
                          <th className="items-table-th items-table-th-number">ลำดับ</th>
                          <th className="items-table-th">รายการ</th>
                          <th className="items-table-th">รายละเอียด</th>
                          <th className="items-table-th items-table-th-amount">จำนวนเงิน(บาท)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentItems.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="items-table-empty">
                              <div className="items-table-empty-content">
                                <span>ยังไม่มีรายการ</span>
                                <button
                                  type="button"
                                  onClick={addItem}
                                  className="form-button form-button-small"
                                >
                                  + เพิ่มรายการแรก
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <>
                            {currentItems.map((item: any, index: number) => (
                              <tr key={item.id} className="items-table-row">
                                <td className="items-table-td items-table-td-number">
                                  {index + 1}
                                </td>
                                <td className="items-table-td">
                                  <input
                                    type="text"
                                    value={item.description || ''}
                                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                                    placeholder="รายการ"
                                    className="items-table-input"
                                  />
                                  {currentItems.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeItem(item.id)}
                                      className="items-table-delete"
                                      title="ลบรายการ"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                      </svg>
                                    </button>
                                  )}
                                </td>
                                <td className="items-table-td">
                                  <input
                                    type="text"
                                    value={item.details || ''}
                                    onChange={(e) => updateItem(item.id, 'details', e.target.value)}
                                    placeholder="รายละเอียด"
                                    className="items-table-input"
                                  />
                                </td>
                                <td className="items-table-td items-table-td-amount">
                                  <input
                                    type="number"
                                    value={item.amount || ''}
                                    onChange={(e) => updateItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="items-table-input items-table-input-amount"
                                  />
                                </td>
                              </tr>
                            ))}
                            <tr className="items-table-total-row">
                              <td className="items-table-td items-table-td-number">รวม</td>
                              <td className="items-table-td" colSpan={2}>
                                <span className="items-table-total-text">{numberToThaiText(currentTotal)}</span>
                              </td>
                              <td className="items-table-td items-table-td-amount">
                                <span className="items-table-total-amount">{formatNumber(currentTotal)}</span>
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }}
          />
        </div>

        {/* Signature Section */}
        <div className="form-section">
          <h2 className="form-section-title">เบิกเงินทดรองจ่าย</h2>
          <div className="signature-grid">
            {[
              { label: 'ผู้ขอเบิก', name: 'requesterSignature', userIdField: null, isRequester: true },
              { label: 'ผู้อนุมัติ/ตรวจสอบ', name: 'approverSignature', userIdField: 'approverUserId' },
              { label: 'ผู้จ่ายเงิน', name: 'payerSignature', userIdField: 'payerUserId' },
              { label: 'ผู้รับเงิน', name: 'receiverSignature', userIdField: null, isReceiver: true },
            ].map((sig) => {
              // Check if current user can sign this box
              const assignedUserId = sig.userIdField ? watch(sig.userIdField) : null
              const canSign = sig.userIdField 
                ? (assignedUserId === currentUser?.id || !assignedUserId) // Can sign if assigned to current user or not assigned yet
                : true // Requester and receiver are always current user, so they can sign
              
              return (
                <div key={sig.name} className="signature-block">
                  <div className="signature-label">{sig.label}</div>
                  <div 
                    className={`signature-box ${!canSign ? 'signature-box-disabled' : ''}`}
                    onClick={() => {
                      if (canSign) {
                        setOpenSignatureModal(sig.name)
                      } else {
                        alert(`คุณไม่สามารถลงนามในช่องนี้ได้ ต้องให้ผู้ใช้ที่เลือกไว้ลงนาม`)
                      }
                    }}
                    style={{ cursor: canSign ? 'pointer' : 'not-allowed' }}
                    title={!canSign ? 'ต้องให้ผู้ใช้ที่เลือกไว้ลงนาม' : ''}
                  >
                    {signatures[sig.name] ? (
                      <img 
                        src={signatures[sig.name]} 
                        alt={`${sig.label} signature`}
                        className="signature-image"
                      />
                    ) : (
                      <span className="signature-placeholder">
                        {!canSign ? 'รอผู้ใช้ที่เลือกลงนาม' : 'ลายเซ็น'}
                      </span>
                    )}
                  </div>
                  {sig.userIdField ? (
                    <select
                      className="form-select signature-user-select"
                      value={watch(sig.userIdField) || ''}
                      onChange={(e) => {
                        const selectedUserId = e.target.value
                        setValue(sig.userIdField!, selectedUserId)
                        // If user selects someone else, clear the signature (they need to sign)
                        if (selectedUserId && selectedUserId !== currentUser?.id) {
                          setSignatures(prev => ({
                            ...prev,
                            [sig.name]: ''
                          }))
                          setValue(sig.name, '')
                          setValue(`${sig.name}Date`, '')
                        }
                      }}
                    >
                      <option value="">-- เลือกผู้ใช้ --</option>
                      {loadingUsers ? (
                        <option disabled>โหลด...</option>
                      ) : (
                        users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName || user.email}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder={`ชื่อ${sig.label}`}
                      className="form-input signature-name"
                      value={watch(`${sig.name}Name`) || ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setValue(`${sig.name}Name`, value)
                        // If requester name changes, sync receiver name
                        if (sig.name === 'requesterSignature') {
                          setValue('receiverSignatureName', value)
                        }
                      }}
                      readOnly={sig.name === 'receiverSignature'}
                    />
                  )}
                  <div className="date-input-with-picker date-input-with-picker--small">
                    <input
                      type="text"
                      placeholder="dd/mm/yyyy"
                      className="form-input signature-date"
                      value={sig.name === 'receiverSignature' ? (getDateDisplay(watch('receiverSignatureDate')) || getDateDisplay(watch('dateMoneyNeeded'))) : getDateDisplay(watch(`${sig.name}Date`))}
                      onChange={(e) => {
                        if (sig.name === 'receiverSignature') return
                        const v = e.target.value
                        const parsed = parseDateDMY(v)
                        setValue(`${sig.name}Date`, parsed || v, { shouldValidate: true })
                      }}
                      readOnly={sig.name === 'receiverSignature' || !canSign}
                    />
                    {canSign && sig.name !== 'receiverSignature' && (
                      <span className="date-picker-trigger-wrap">
                        <span className="date-picker-trigger" aria-hidden>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </span>
                        <input
                          ref={(el) => { signatureDateRefs.current[`${sig.name}Date`] = el }}
                          type="date"
                          className="date-picker-overlay date-picker-overlay--small"
                          aria-label="เปิดปฏิทิน"
                          value={getDateISO(watch(`${sig.name}Date`))}
                          onChange={(e) => setValue(`${sig.name}Date`, e.target.value, { shouldValidate: true })}
                        />
                      </span>
                    )}
                  </div>
                  {sig.name === 'receiverSignature' && (
                    <div className="adv-receiver-extras" lang="th">
                      <div className="adv-receiver-extra-line">JV No............................</div>
                      <div className="adv-receiver-extra-line">Date: ....../....../.............</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Signature Canvas Modal */}
        {openSignatureModal && (
          <SignatureCanvas
            isOpen={true}
            onClose={() => setOpenSignatureModal(null)}
            onSave={(signature) => handleSignatureSave(openSignatureModal, signature)}
            label={[
              { label: 'ผู้ขอเบิก', name: 'requesterSignature' },
              { label: 'ผู้อนุมัติ/ตรวจสอบ', name: 'approverSignature' },
              { label: 'ผู้จ่ายเงิน', name: 'payerSignature' },
              { label: 'ผู้รับเงิน', name: 'receiverSignature' },
            ].find(s => s.name === openSignatureModal)?.label || 'ลายเซ็น'}
          />
        )}

        {/* Footer Note */}
        <div className="form-section form-section-note">
          <p className="form-note">
            *ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*
          </p>
          <p className="form-note">
            เอกสารรับเงินจะสมบูรณ์เมื่อเงินเข้าบัญชีแล้วเท่านั้น
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="form-error-box" style={{ marginBottom: '20px' }}>
            <strong>เกิดข้อผิดพลาด:</strong> {error}
          </div>
        )}
        
        {/* Show validation errors if any */}
        {Object.keys(errors).length > 0 && (
          <div className="form-error-box" style={{ marginBottom: '20px' }}>
            <strong>กรุณาตรวจสอบข้อมูล:</strong>
            <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
              {Object.entries(errors).map(([key, error]: [string, any]) => (
                <li key={key}>{key}: {error?.message || 'Invalid'}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            disabled={loading}
            className="form-button form-button-submit"
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึกและส่ง'}
          </button>
        </div>
      </form>
    </div>
  )
}
