'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import { formatDateDMY, parseDateDMY } from '@/lib/utils/date-format'
import { formatNumber } from '@/lib/utils/thai-number'
import { useUser } from '@/hooks/use-user'
import { SignatureCanvas } from '@/components/signature/SignatureCanvas'

interface AdvancePaymentClearanceFormProps {
  creNumber: string
  onSubmit: (data: Record<string, any>) => Promise<void>
  defaultValues?: Record<string, any>
  loading?: boolean
}

type ExpenseItem = { id: string; description: string; amount: number; actualAmount: number; fromApr?: boolean; parentId?: string | null }
const emptyExpenseItems = { items: [] as ExpenseItem[], total: 0 }

export function AdvancePaymentClearanceForm({
  creNumber,
  onSubmit,
  defaultValues = {},
  loading = false,
}: AdvancePaymentClearanceFormProps) {
  const searchParams = useSearchParams()
  const fromAprId = searchParams.get('from')
  const { user: currentUser } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [aprDocuments, setAprDocuments] = useState<
    { id: string; documentNumber: string | null; title?: string | null; data: any; createdAt: string }[]
  >([])
  const [aprTemplateId, setAprTemplateId] = useState<string | null>(null)
  const [loadingAprList, setLoadingAprList] = useState(true)
  const [selectedAprId, setSelectedAprId] = useState<string | null>(fromAprId || null)
  const [jobs, setJobs] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [users, setUsers] = useState<{ id: string; fullName?: string; email: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [openSignatureModal, setOpenSignatureModal] = useState<string | null>(null)
  const [actualAmountDrafts, setActualAmountDrafts] = useState<Record<number, string>>({})
  const [signatures, setSignatures] = useState<Record<string, string>>({
    requesterSignature: defaultValues.signatures?.requesterSignature || defaultValues.requesterSignature || '',
    approverSignature: defaultValues.signatures?.approverSignature || defaultValues.approverSignature || '',
    recipientSignature: defaultValues.signatures?.recipientSignature || defaultValues.recipientSignature || '',
    financeManagerSignature: defaultValues.signatures?.financeManagerSignature || defaultValues.financeManagerSignature || '',
  })

  const initialItems = defaultValues.expenseItems?.items?.length
    ? { items: defaultValues.expenseItems.items, total: defaultValues.expenseItems.total ?? 0 }
    : emptyExpenseItems

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Record<string, any>>({
    defaultValues: {
      ...defaultValues,
      creNumber: defaultValues.creNumber || creNumber,
      date: defaultValues.date || new Date().toISOString().split('T')[0],
      expenseItems: initialItems,
      totalExpenses: defaultValues.totalExpenses ?? 0,
      advanceAmount: defaultValues.advanceAmount ?? 0,
      amountToReturn: defaultValues.amountToReturn ?? 0,
      additionalAmount: defaultValues.additionalAmount ?? 0,
      transferDate:
        defaultValues.transferDate ||
        defaultValues.transferredDate ||
        '',
      requesterName: defaultValues.requesterName || currentUser?.fullName || currentUser?.email || '',
      position: defaultValues.position || currentUser?.position || '',
      department: defaultValues.department || currentUser?.department || '',
      approverUserId: defaultValues.userAssignments?.approver || defaultValues.approverUserId || '',
      payerUserId: defaultValues.userAssignments?.payer || defaultValues.payerUserId || '',
      recipientUserId: defaultValues.userAssignments?.recipient || defaultValues.recipientUserId || '',
    },
  })

  // Fetch APR template and list of APR documents
  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoadingAprList(false)
    }, 10000)
    async function load() {
      try {
        setLoadingAprList(true)
        const tRes = await fetch('/api/form-templates')
        if (cancelled) return
        const tData = await tRes.json()
        const templates = tData.templates || []
        const aprTemplate = templates.find((t: any) => t.slug === 'advance-payment-request')
        if (aprTemplate) setAprTemplateId(aprTemplate.id)

        if (aprTemplate?.id && !cancelled) {
          const dRes = await fetch(
            `/api/documents?limit=50&sortBy=createdAt&sortOrder=desc&formTemplateId=${encodeURIComponent(aprTemplate.id)}`
          )
          if (cancelled) return
          if (dRes.ok) {
            const dData = await dRes.json()
            const docs = dData.documents || []
            setAprDocuments(
              docs.map((d: any) => ({
                id: d.id,
                documentNumber: d.documentNumber,
                title: d.title,
                data: d.data || {},
                createdAt: d.createdAt,
              }))
            )
          }
        }
      } catch (e) {
        console.error('Load APR list:', e)
      } finally {
        if (!cancelled) setLoadingAprList(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  // Fetch jobs for dropdown
  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoadingJobs(false)
    }, 10000)
    async function load() {
      try {
        setLoadingJobs(true)
        const res = await fetch('/api/jobs')
        if (cancelled) return
        const data = await res.json()
        if (res.ok && data.jobs) setJobs(data.jobs)
      } catch (e) {
        console.error('Load jobs:', e)
      } finally {
        if (!cancelled) setLoadingJobs(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  // Fetch users for approval assignment
  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoadingUsers(false)
    }, 10000)
    async function load() {
      try {
        setLoadingUsers(true)
        const res = await fetch('/api/users?limit=1000&isActive=true&sortBy=fullName&sortOrder=asc')
        if (cancelled) return
        const data = await res.json()
        if (res.ok && data.users) setUsers(data.users)
      } catch (e) {
        console.error('Load users:', e)
      } finally {
        if (!cancelled) setLoadingUsers(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  // Default assignees (APC): ผู้อนุมัติ = tassanee@cheinproduction.co.th, ผู้รับเคลียร์เงิน = pc@cheinprod, ผู้จัดการฝ่ายเงิน = tassanee@cheinproduction.co.th
  useEffect(() => {
    if (users.length === 0) return
    const existingApprover = defaultValues.userAssignments?.approver || defaultValues.approverUserId
    const existingRecipient = defaultValues.userAssignments?.recipient || defaultValues.recipientUserId
    const existingPayer = defaultValues.userAssignments?.payer || defaultValues.payerUserId
    const email = (u: any) => (u.email || '').toLowerCase()
    const pc = users.find((u: any) => /^pc@chein/.test(email(u)))
    const tassanee = users.find((u: any) => email(u) === 'tassanee@cheinproduction.co.th')
    if (tassanee && !existingApprover) setValue('approverUserId', tassanee.id)
    if (pc && !existingRecipient) setValue('recipientUserId', pc.id)
    if (tassanee && !existingPayer) setValue('payerUserId', tassanee.id)
  }, [users, setValue, defaultValues.userAssignments, defaultValues.approverUserId, defaultValues.recipientUserId, defaultValues.payerUserId])

  // When "from" APR is in URL, load that document and pre-fill
  useEffect(() => {
    if (!fromAprId || aprDocuments.length === 0) return
    setSelectedAprId(fromAprId)
    const apr = aprDocuments.find((d) => d.id === fromAprId)
    if (apr) applyAprData(apr)
  }, [fromAprId, aprDocuments])

  function applyAprData(apr: { id: string; documentNumber: string | null; data: any }) {
    const d = apr.data
    const advRef = apr.documentNumber || d.advNumber || apr.id
    setValue('advReference', advRef)
    setValue('aprDocumentId', apr.id)
    if (d.dateMoneyNeeded) setValue('dateMoneyNeeded', d.dateMoneyNeeded)
    if (d.requesterName) setValue('requesterName', d.requesterName)
    if (d.position) setValue('position', d.position)
    if (d.department) setValue('department', d.department)
    const total = d.totalAmount ?? d.items?.total ?? 0
    setValue('advanceAmount', Number(total))
    if (d.jobId) setValue('jobId', d.jobId)
    if (d.jobName) setValue('jobName', d.jobName)
    if (d.jobCode) setValue('jobCode', d.jobCode)
    // Populate expense list from APR items (รายการ from APR → รายการค่าใช้จ่าย in ADC); mark as fromApr so they cannot be edited/deleted
    const aprItems = d.items?.items
    if (aprItems && Array.isArray(aprItems) && aprItems.length > 0) {
      const mapped = aprItems.map((item: any, i: number) => ({
        id: item.id || `e-${Date.now()}-${i}`,
        description: [item.description, item.details].filter(Boolean).join(' — ') || '',
        amount: Number(item.amount) || 0,
        actualAmount: Number(item.amount) || 0, // default จำนวนเงินที่ใช้จริง to APR amount
        fromApr: true,
        parentId: null,
      }))
      const totalActual = mapped.reduce((s: number, i: any) => s + (Number(i.actualAmount) || 0), 0)
      setValue('expenseItems', { items: mapped, total: totalActual }, { shouldValidate: true })
    } else {
      setValue('expenseItems', emptyExpenseItems, { shouldValidate: true })
    }
  }

  const onSelectApr = async (documentId: string) => {
    setSelectedAprId(documentId)
    if (!documentId) return
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load document')
      const doc = data.document
      applyAprData({
        id: doc.id,
        documentNumber: doc.documentNumber,
        data: doc.data || {},
      })
    } catch (e) {
      console.error('Load APR document:', e)
      setError('ไม่สามารถโหลดข้อมูลใบเบิกได้')
    }
  }

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

  const getAprSelectOptionLabel = (doc: { id: string; documentNumber: string | null; title?: string | null; data: any }) => {
    const d = doc.data || {}
    const adv = doc.documentNumber || d.advNumber || doc.id
    const rawAmt =
      typeof d.totalAmount === 'number' && Number.isFinite(d.totalAmount)
        ? d.totalAmount
        : typeof d.items?.total === 'number' && Number.isFinite(d.items.total)
          ? d.items.total
          : null
    const amountStr = rawAmt != null ? `${formatNumber(rawAmt)} บาท` : '—'
    const job =
      (typeof d.jobName === 'string' && d.jobName.trim()) ||
      (typeof doc.title === 'string' && doc.title.trim()) ||
      '—'
    return `${adv} · ${amountStr} · ${job}`
  }

  const expenseItems = watch('expenseItems') || initialItems
  const items = expenseItems.items || []
  const sumFromApr = items.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0)
  const totalActual = items.reduce((sum: number, i: any) => sum + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
  const totalExpenses = Number(watch('totalExpenses')) ?? 0
  const advanceAmount = Number(watch('advanceAmount')) || 0
  const amountToReturn = Number(watch('amountToReturn')) ?? 0
  const additionalAmount = Number(watch('additionalAmount')) ?? 0

  // รวมค่าใช้จ่าย = sum of จำนวนเงินที่ใช้จริง from table; auto-update return/additional
  useEffect(() => {
    setValue('totalExpenses', totalActual, { shouldValidate: true })
    if (advanceAmount >= 0) {
      if (totalActual <= advanceAmount) {
        setValue('amountToReturn', Math.max(0, advanceAmount - totalActual), { shouldValidate: true })
        setValue('additionalAmount', 0, { shouldValidate: true })
      } else {
        setValue('amountToReturn', 0, { shouldValidate: true })
        setValue('additionalAmount', totalActual - advanceAmount, { shouldValidate: true })
      }
    }
  }, [totalActual, advanceAmount, setValue])

  const updateExpenseItem = (index: number, field: 'description' | 'amount' | 'actualAmount', value: string | number) => {
    const item = items[index]
    // APR-exported rows: only actualAmount can be edited
    if (item?.fromApr && (field === 'description' || field === 'amount')) return
    const next = items.map((item: any, i: number) =>
      i === index ? { ...item, [field]: value } : item
    )
    const total = next.reduce((s: number, i: any) => s + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
    setValue('expenseItems', { items: next, total }, { shouldValidate: true })
  }

  const addExpenseRow = () => {
    const next = [...items, { id: `e-${Date.now()}`, description: '', amount: 0, actualAmount: 0, fromApr: false, parentId: null }]
    const total = next.reduce((s: number, i: any) => s + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
    setValue('expenseItems', { items: next, total }, { shouldValidate: true })
  }

  const addFrequentItem = (description: string) => {
    const next = [...items, { id: `e-${Date.now()}`, description, amount: 0, actualAmount: 0, fromApr: false, parentId: null }]
    const total = next.reduce((s: number, i: any) => s + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
    setValue('expenseItems', { items: next, total }, { shouldValidate: true })
  }

  /** Add a sub-item under a row (e.g. 1.1, 1.2 under row 1). Insert after last child of parent. */
  const addSubItem = (parentId: string) => {
    const parentIdx = items.findIndex((i: any) => i.id === parentId)
    if (parentIdx === -1) return
    let insertIdx = parentIdx + 1
    for (let i = parentIdx + 1; i < items.length; i++) {
      if (items[i].parentId === parentId) insertIdx = i + 1
      else break
    }
    const newItem = { id: `e-${Date.now()}`, description: '', amount: 0, actualAmount: 0, fromApr: false, parentId }
    const next = [...items.slice(0, insertIdx), newItem, ...items.slice(insertIdx)]
    const total = next.reduce((s: number, i: any) => s + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
    setValue('expenseItems', { items: next, total }, { shouldValidate: true })
  }

  const handleSignatureSave = (signatureName: string, signatureData: string) => {
    setSignatures((prev) => ({ ...prev, [signatureName]: signatureData }))
    setValue(signatureName, signatureData, { shouldValidate: true })
    const today = new Date().toISOString().split('T')[0]
    setValue(`${signatureName}Date`, today, { shouldValidate: true })
    if (signatureName === 'requesterSignature') {
      const userName = currentUser?.fullName || currentUser?.email || ''
      if (userName) setValue('requesterSignatureName', userName, { shouldValidate: true })
    }
    setOpenSignatureModal(null)
  }

  const removeExpenseRow = (index: number) => {
    const item = items[index]
    // Do not allow deleting rows that came from APR
    if (item?.fromApr) return
    // Remove this row and any sub-items (children)
    const next = items.filter((i: any, iIdx: number) => iIdx !== index && i.parentId !== item.id)
    const total = next.reduce((s: number, i: any) => s + (((Number(i.actualAmount) ?? Number(i.amount)) || 0)), 0)
    setValue('expenseItems', { items: next, total }, { shouldValidate: true })
  }

  const beginActualEdit = (flatIndex: number, current: unknown) => {
    const n = Number(current)
    setActualAmountDrafts((prev) => ({ ...prev, [flatIndex]: Number.isFinite(n) ? String(n) : '' }))
  }
  const changeActualEdit = (flatIndex: number, text: string) => {
    setActualAmountDrafts((prev) => ({ ...prev, [flatIndex]: text }))
  }
  const commitActualEdit = (flatIndex: number) => {
    const raw = (actualAmountDrafts[flatIndex] ?? '').trim()
    const n = Number(raw.replace(/,/g, ''))
    updateExpenseItem(flatIndex, 'actualAmount', Number.isFinite(n) ? n : 0)
    setActualAmountDrafts((prev) => {
      const { [flatIndex]: _, ...rest } = prev
      return rest
    })
  }

  /** Build display order: each parent followed by its children. Returns { item, flatIndex, displayNumber }. */
  const orderedRows = (() => {
    const roots = items.filter((i: any) => !i.parentId)
    const ordered: { item: any; flatIndex: number; displayNumber: string }[] = []
    let topLevelNum = 0
    const parentNum: Record<string, string> = {}
    const subCount: Record<string, number> = {}
    roots.forEach((root: any) => {
      const rootIdx = items.findIndex((i: any) => i.id === root.id)
      topLevelNum++
      const num = String(topLevelNum)
      parentNum[root.id] = num
      ordered.push({ item: root, flatIndex: rootIdx, displayNumber: num })
      const children = items.filter((i: any) => i.parentId === root.id)
      children.forEach((child: any) => {
        const childIdx = items.findIndex((i: any) => i.id === child.id)
        const sub = (subCount[root.id] || 0) + 1
        subCount[root.id] = sub
        ordered.push({ item: child, flatIndex: childIdx, displayNumber: `${num}.${sub}` })
      })
    })
    return ordered
  })()

  const handleFormSubmit = async (data: Record<string, any>) => {
    setError(null)
    try {
      if (!data.jobId || !String(data.jobId).trim()) {
        setError('กรุณาเลือกงาน (Job)')
        return
      }
      data.totalExpenses = totalActual
      data.expenseItems = { items: data.expenseItems?.items || items, total: totalActual }
      const j = jobs.find((job) => job.id === data.jobId)
      if (j) {
        data.jobName = j.name
        data.jobCode = j.code
      }
      data.signatures = signatures
      data.requesterSignatureName = currentUser?.fullName || currentUser?.email || data.requesterSignatureName || data.requesterName || ''
      data.userAssignments = {
        approver: watch('approverUserId') || null,
        payer: watch('payerUserId') || null,
        recipient: watch('recipientUserId') || null,
      }
      await onSubmit(data)
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  return (
    <div className="form-container">
      <h1 className="form-title">ใบเคลียร์เงินทดรองจ่าย (Advance Payment Clearance)</h1>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="form-wrapper">
        {/* Select APR to bring data from */}
        <div className="form-section">
          <h2 className="form-section-title">อ้างอิงใบเบิกเงินทดรองจ่าย</h2>
          <div className="form-field-group">
            <label className="form-label">เลือกเอกสารใบเบิกที่ต้องการเคลียร์ <span className="text-red-600">*</span></label>
            <select
              className="form-select"
              value={selectedAprId || ''}
              onChange={(e) => onSelectApr(e.target.value)}
              required
            >
              <option value="">-- เลือกใบเบิก (เลขที่ · จำนวนเงิน · งาน) --</option>
              {loadingAprList ? (
                <option disabled>โหลด...</option>
              ) : (
                aprDocuments.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {getAprSelectOptionLabel(doc)}
                  </option>
                ))
              )}
            </select>
            <p className="form-hint" lang="th">เมื่อเลือกแล้ว ข้อมูลผู้ขอเบิก วันที่เคลียร์ทดลองจ่าย และจำนวนที่เบิกทดรอง จะถูกนำมาจากใบเบิก</p>
          </div>
        </div>

        {/* Document info */}
        <div className="form-section">
          <h2 className="form-section-title">ข้อมูลเอกสาร</h2>
          <div className="form-row form-row--three">
            <div className="form-field-group">
              <label className="form-label">เลขที่ CRE</label>
              <input className="form-input" value={(watch('creNumber') || '').replace(/^(CRE[\s\-]*)+/i, '')} readOnly disabled />
            </div>
            <div className="form-field-group form-field-date">
              <label className="form-label">วันที่ทำเอกสาร <span className="text-red-600">*</span></label>
              <input
                type="date"
                className="form-input"
                {...register('date', { required: 'กรุณาระบุวันที่ทำเอกสาร' })}
              />
            </div>
            <div className="form-field-group">
              <label className="form-label">วันที่เคลียร์ทดลองจ่าย</label>
              <input
                className="form-input"
                value={getDateDisplay(watch('dateMoneyNeeded'))}
                readOnly
                disabled
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field-group form-field-date">
              <label className="form-label" lang="th">
                วันที่โอนเงิน <span className="text-gray-500 font-normal">(Date money was transferred)</span>
              </label>
              <input type="date" className="form-input" {...register('transferDate')} />
              <p className="form-hint" lang="th">
                วันที่โอนเงินคืน/เบิกเพิ่มตามผลเคลียร์ — กรอกเมื่อทราบวันที่ (สอดคล้องกับที่บันทึกในทะเบียน)
              </p>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field-group">
              <label className="form-label">อ้างอิงเลขที่ใบเบิกเงินทดรองจ่าย</label>
              <input className="form-input" value={watch('advReference') || ''} readOnly disabled />
            </div>
            <div className="form-field-group">
              <label className="form-label">งาน (Job) <span className="text-red-600">*</span></label>
              <select
                className="form-select"
                value={watch('jobId') || ''}
                onChange={(e) => {
                  const id = e.target.value
                  setValue('jobId', id)
                  const j = jobs.find((j) => j.id === id)
                  if (j) {
                    setValue('jobName', j.name)
                    setValue('jobCode', j.code || '')
                  }
                }}
                required
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
            </div>
          </div>
        </div>

        {/* Requester (from APR) */}
        <div className="form-section">
          <h2 className="form-section-title">ข้อมูลผู้ขอเบิก (จากใบเบิก)</h2>
          <Input label="ชื่อผู้ขอเบิก" value={watch('requesterName') || ''} onChange={() => {}} disabled />
          <div className="form-row">
            <Input label="ตำแหน่ง" value={watch('position') || ''} onChange={() => {}} disabled />
            <Input label="ส่วนงาน/ฝ่าย/แผนก" value={watch('department') || ''} onChange={() => {}} disabled />
          </div>
        </div>

        {/* Summary of work */}
        <div className="form-section">
          <h2 className="form-section-title">สรุปผลการไปปฏิบัติงาน</h2>
          <div className="form-field-group">
            <label className="form-label">สรุปผลการไปปฏิบัติงาน <span className="text-red-600">*</span></label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="สรุปผลการไปปฏิบัติงาน"
              {...register('workSummary', { required: 'กรุณากรอกสรุปผลการไปปฏิบัติงาน' })}
            />
            {errors.workSummary?.message && (
              <p className="form-error">{errors.workSummary.message as string}</p>
            )}
          </div>
        </div>

        {/* Expense table — editable, from APR, with จำนวนเงินที่ใช้จริง */}
        <div className="form-section">
          <div className="form-section-header">
            <h2 className="form-section-title">รายการค่าใช้จ่าย (จากใบเบิก)</h2>
            <button type="button" onClick={addExpenseRow} className="form-button form-button-small">
              + เพิ่มรายการ
            </button>
          </div>
          <p className="form-hint" lang="th">แก้ไขได้ — กรอกจำนวนเงินที่ใช้จริงในแต่ละรายการ • กด «รายการย่อย» เพื่อเพิ่ม 1.1, 1.2 ภายใต้รายการนั้น</p>
          <div className="frequent-items">
            <span className="frequent-items-label">รายการที่ใช้บ่อย:</span>
            <button type="button" onClick={() => addFrequentItem('ค่าน้ำมัน')} className="frequent-item-btn">ค่าน้ำมัน</button>
            <button type="button" onClick={() => addFrequentItem('ค่าที่จอดรถ')} className="frequent-item-btn">ค่าที่จอดรถ</button>
            <button type="button" onClick={() => addFrequentItem('ค่าทางด่วน')} className="frequent-item-btn">ค่าทางด่วน</button>
            <button type="button" onClick={() => addFrequentItem('ซื้อสดหน้างาน')} className="frequent-item-btn">ซื้อสดหน้างาน</button>
            <button type="button" onClick={() => addFrequentItem('ค่าอาหารและเครื่องดื่ม')} className="frequent-item-btn">ค่าอาหารและเครื่องดื่ม</button>
            <button type="button" onClick={() => addFrequentItem('ค่ารับรอง')} className="frequent-item-btn">ค่ารับรอง</button>
            <button type="button" onClick={() => addFrequentItem('อื่นๆ')} className="frequent-item-btn">อื่นๆ</button>
          </div>
          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th className="items-table-th items-table-th-number">ลำดับ</th>
                  <th className="items-table-th">รายการ</th>
                  <th className="items-table-th items-table-th-amount">จำนวนเงิน(บาท)</th>
                  <th className="items-table-th items-table-th-amount">จำนวนเงินที่ใช้จริง (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="items-table-empty">
                      <div className="items-table-empty-content">
                        <span>เลือกเอกสารใบเบิกเพื่อนำรายการมา หรือเพิ่มรายการเอง</span>
                        <button type="button" onClick={addExpenseRow} className="form-button form-button-small">
                          + เพิ่มรายการแรก
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  orderedRows.map(({ item, flatIndex, displayNumber }) => {
                    const fromApr = !!item.fromApr
                    const isTopLevel = !item.parentId
                    return (
                      <tr key={item.id}>
                        <td className="items-table-td items-table-td-number">{displayNumber}</td>
                        <td className="items-table-td items-table-td-desc">
                          <div className="items-table-desc-row">
                            {fromApr ? (
                              <span className="items-table-text items-table-desc-main">{item.description || '—'}</span>
                            ) : (
                              <input
                                type="text"
                                className="items-table-input items-table-desc-main"
                                value={item.description || ''}
                                onChange={(e) => updateExpenseItem(flatIndex, 'description', e.target.value)}
                                placeholder="รายการ"
                              />
                            )}
                            {isTopLevel && (
                              <button
                                type="button"
                                onClick={() => addSubItem(item.id)}
                                className="form-button form-button-small"
                                style={{ fontSize: 12, flexShrink: 0 }}
                                title="เพิ่มรายการย่อย (เช่น 1.1, 1.2)"
                              >
                                + รายการย่อย
                              </button>
                            )}
                            {!fromApr && (
                              <button type="button" onClick={() => removeExpenseRow(flatIndex)} className="items-table-delete" title="ลบ">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="items-table-td items-table-td-amount">
                          {fromApr ? (
                            <span className="items-table-total-amount">{formatNumber(Number(item.amount) || 0)}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="items-table-input items-table-input-amount"
                              value={item.amount ?? ''}
                              onChange={(e) => updateExpenseItem(flatIndex, 'amount', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                          )}
                        </td>
                        <td className="items-table-td items-table-td-amount">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="items-table-input items-table-input-amount"
                            value={
                              actualAmountDrafts[flatIndex] !== undefined
                                ? actualAmountDrafts[flatIndex]
                                : formatNumber(Number(item.actualAmount ?? item.amount ?? 0))
                            }
                            onFocus={() => beginActualEdit(flatIndex, item.actualAmount ?? item.amount ?? 0)}
                            onChange={(e) => changeActualEdit(flatIndex, e.target.value)}
                            onBlur={() => commitActualEdit(flatIndex)}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
                <tr className="items-table-total-row">
                  <td className="items-table-td items-table-td-number">รวม</td>
                  <td className="items-table-td" />
                  <td className="items-table-td items-table-td-amount">
                    <span className="items-table-total-amount">{formatNumber(sumFromApr)}</span>
                  </td>
                  <td className="items-table-td items-table-td-amount">
                    <span className="items-table-total-amount">{formatNumber(totalActual)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* สรุปการเคลียร์เงิน — รวมค่าใช้จ่าย = sum from table */}
        <div className="form-section">
          <h2 className="form-section-title">สรุปการเคลียร์เงิน</h2>
          <p className="form-hint" lang="th">รวมค่าใช้จ่ายมาจากรวมจำนวนเงินที่ใช้จริงด้านบน</p>
          <div className="form-row">
            <div className="form-field-group">
              <label className="form-label">รวมค่าใช้จ่าย (บาท)</label>
              <input
                type="text"
                className="form-input form-input--money"
                value={formatNumber(totalActual)}
                readOnly
                disabled
              />
            </div>
            <div className="form-field-group">
              <label className="form-label">(หัก) จำนวนที่เบิกทดรอง (บาท)</label>
              <input
                type="text"
                className="form-input form-input--money"
                value={formatNumber(advanceAmount)}
                readOnly
                disabled
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field-group">
              <label className="form-label">จำนวนที่เหลือส่งคืน (บาท)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-input"
                value={Number.isFinite(amountToReturn) ? amountToReturn : 0}
                onChange={(e) => setValue('amountToReturn', parseFloat(e.target.value) || 0, { shouldValidate: true })}
                placeholder="0.00"
              />
            </div>
            <div className="form-field-group">
              <label className="form-label">จำนวนที่เบิกเพิ่ม (บาท)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-input"
                value={Number.isFinite(additionalAmount) ? additionalAmount : 0}
                onChange={(e) => setValue('additionalAmount', parseFloat(e.target.value) || 0, { shouldValidate: true })}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Signatures - only the assigned user can sign each box (same as APR) */}
        <div className="form-section">
          <h2 className="form-section-title">เคลียร์เงินทดรองจ่าย</h2>
          <p className="form-hint" style={{ marginBottom: 12 }} lang="th">คุณลงนามได้เฉพาะช่องที่เลือกคุณเท่านั้น</p>
          <div className="signature-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[
              { label: 'ผู้ขอเคลียร์', name: 'requesterSignature', userIdField: null as string | null, selectPlaceholder: '' },
              { label: 'ผู้อนุมัติ/ตรวจสอบ', name: 'approverSignature', userIdField: 'approverUserId', selectPlaceholder: 'เลือกผู้ใช้' },
              { label: 'ผู้รับเคลียร์เงิน', name: 'recipientSignature', userIdField: 'recipientUserId', selectPlaceholder: 'เลือกผู้รับเคลียร์เงิน' },
              { label: 'ผู้จัดการฝ่ายเงิน', name: 'financeManagerSignature', userIdField: 'payerUserId', selectPlaceholder: 'เลือกผู้ใช้' },
            ].map(({ label, name, userIdField, selectPlaceholder }) => {
              const assignedUserId = userIdField ? watch(userIdField) : null
              const canSign = userIdField
                ? (assignedUserId === currentUser?.id || !assignedUserId)
                : true
              return (
                <div key={name} className="signature-block">
                  <div className="signature-label">{label}</div>
                  <div
                    className={`signature-box ${!canSign ? 'signature-box-disabled' : ''}`}
                    onClick={() => {
                      if (canSign) {
                        setOpenSignatureModal(name)
                      } else {
                        alert('คุณไม่สามารถลงนามในช่องนี้ได้ ต้องให้ผู้ใช้ที่เลือกไว้ลงนาม')
                      }
                    }}
                    style={{ cursor: canSign ? 'pointer' : 'not-allowed', minHeight: 56 }}
                    title={!canSign ? 'ต้องให้ผู้ใช้ที่เลือกไว้ลงนาม' : ''}
                  >
                    {signatures[name] ? (
                      <img src={signatures[name]} alt={`${label} signature`} className="signature-image" />
                    ) : (
                      <span className="signature-placeholder">
                        {!canSign ? 'รอผู้ใช้ที่เลือกลงนาม' : 'ลงนาม'}
                      </span>
                    )}
                  </div>
                  {userIdField ? (
                    <select
                      className="form-select signature-user-select"
                      value={watch(userIdField) || ''}
                      onChange={(e) => {
                        const selectedUserId = e.target.value
                        setValue(userIdField, selectedUserId)
                        if (selectedUserId && selectedUserId !== currentUser?.id) {
                          setSignatures((prev) => ({ ...prev, [name]: '' }))
                          setValue(`${name}Date`, '')
                        }
                      }}
                      disabled
                    >
                      <option value="">-- {selectPlaceholder} --</option>
                      {loadingUsers ? (
                        <option disabled>โหลด...</option>
                      ) : (
                        users.map((u) => (
                          <option key={u.id} value={u.id}>{u.fullName || u.email}</option>
                        ))
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder={`ชื่อ${label}`}
                      className="form-input signature-name"
                      value={name === 'requesterSignature' ? (currentUser?.fullName || currentUser?.email || '') : (watch(`${name}Name`) || '')}
                      onChange={(e) => name !== 'requesterSignature' && setValue(`${name}Name`, e.target.value)}
                      readOnly={name === 'requesterSignature'}
                    />
                  )}
                  <div className="date-input-with-picker date-input-with-picker--small">
                    <input
                      type="text"
                      placeholder="dd/mm/yyyy"
                      className="form-input signature-date"
                      value={getDateDisplay(watch(`${name}Date`))}
                      onChange={(e) => {
                        const v = e.target.value
                        const parsed = parseDateDMY(v)
                        setValue(`${name}Date`, parsed || v, { shouldValidate: true })
                      }}
                      readOnly={!canSign}
                    />
                    {canSign && (
                      <span className="date-picker-trigger-wrap">
                        <span className="date-picker-trigger" aria-hidden>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </span>
                        <input
                          type="date"
                          className="date-picker-overlay date-picker-overlay--small"
                          aria-label="เปิดปฏิทิน"
                          value={getDateISO(watch(`${name}Date`))}
                          onChange={(e) => setValue(`${name}Date`, e.target.value, { shouldValidate: true })}
                        />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {openSignatureModal && (
          <SignatureCanvas
            isOpen={!!openSignatureModal}
            onClose={() => setOpenSignatureModal(null)}
            onSave={(data) => handleSignatureSave(openSignatureModal, data)}
            label={['ผู้ขอเคลียร์', 'ผู้อนุมัติ/ตรวจสอบ', 'ผู้รับเคลียร์เงิน', 'ผู้จัดการฝ่ายเงิน'][
              ['requesterSignature', 'approverSignature', 'recipientSignature', 'financeManagerSignature'].indexOf(openSignatureModal)
            ] || openSignatureModal}
          />
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="submit" className="form-button form-button-submit" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="form-field-group">
      <label className="form-label">{label}</label>
      <input
        type="text"
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}
