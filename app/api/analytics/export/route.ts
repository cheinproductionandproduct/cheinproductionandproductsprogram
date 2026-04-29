import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { isAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import ExcelJS from 'exceljs'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || !isAdmin(user.role as UserRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    users,
    documents,
    boqDocuments,
    approvals,
    vehicleRequests,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, email: true, fullName: true, role: true,
        department: true, position: true, isActive: true, createdAt: true,
        _count: { select: { createdDocuments: true, createdBoqDocuments: true, approvals: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.document.findMany({
      select: {
        id: true, documentNumber: true, title: true, status: true,
        createdAt: true, updatedAt: true, submittedAt: true, completedAt: true,
        creator: { select: { email: true, fullName: true } },
        formTemplate: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.boqDocument.findMany({
      select: {
        id: true, title: true, kind: true, status: true,
        createdAt: true, updatedAt: true,
        job: { select: { name: true } },
        creator: { select: { email: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.approval.findMany({
      select: {
        id: true, status: true, createdAt: true, approvedAt: true,
        approver: { select: { email: true, fullName: true } },
        document: { select: { documentNumber: true, title: true } },
        workflowStep: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.vehicleRequest.findMany({
      select: {
        id: true, type: true, serviceLabel: true, status: true, createdAt: true,
        requester: { select: { email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Analytics Export'
  wb.created = now

  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }

  function styleHeader(ws: ExcelJS.Worksheet, cols: number) {
    const row = ws.getRow(1)
    row.font = headerFont
    row.fill = headerFill
    row.alignment = { vertical: 'middle' }
    row.height = 22
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c)
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
    }
  }

  function fmtDate(d: Date | null | undefined) {
    if (!d) return ''
    return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet('Summary')
  wsSummary.columns = [
    { header: 'Metric', key: 'metric', width: 36 },
    { header: 'Value', key: 'value', width: 20 },
  ]
  styleHeader(wsSummary, 2)

  const activeUsers = users.filter(u =>
    documents.some(d => d.creator.email === u.email && d.createdAt >= thirtyDaysAgo) ||
    boqDocuments.some(b => b.creator.email === u.email && b.updatedAt >= thirtyDaysAgo) ||
    approvals.some(a => a.approver?.email === u.email && a.createdAt >= thirtyDaysAgo)
  )

  const docsByStatus = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1; return acc
  }, {})
  const boqByStatus = boqDocuments.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1; return acc
  }, {})

  const summaryRows = [
    ['Export date', fmtDate(now)],
    ['', ''],
    ['── Users ──', ''],
    ['Total users', users.length],
    ['Active users (last 30 days)', activeUsers.length],
    ['Active accounts', users.filter(u => u.isActive).length],
    ['', ''],
    ['── Documents (Forms) ──', ''],
    ['Total documents', documents.length],
    ...Object.entries(docsByStatus).map(([s, n]) => [`  ${s}`, n]),
    ['', ''],
    ['── BOQ Documents ──', ''],
    ['Total BOQ documents', boqDocuments.length],
    ...Object.entries(boqByStatus).map(([s, n]) => [`  ${s}`, n]),
    ['  PLAN', boqDocuments.filter(b => b.kind === 'PLAN').length],
    ['  ACTUAL', boqDocuments.filter(b => b.kind === 'ACTUAL').length],
    ['', ''],
    ['── Approvals ──', ''],
    ['Total approvals', approvals.length],
    ['  APPROVED', approvals.filter(a => a.status === 'APPROVED').length],
    ['  PENDING', approvals.filter(a => a.status === 'PENDING').length],
    ['  REJECTED', approvals.filter(a => a.status === 'REJECTED').length],
    ['', ''],
    ['── Vehicle Requests ──', ''],
    ['Total vehicle requests', vehicleRequests.length],
  ]
  summaryRows.forEach(([m, v]) => wsSummary.addRow({ metric: m, value: v }))

  // ── Sheet 2: Users ─────────────────────────────────────────────────────────
  const wsUsers = wb.addWorksheet('Users')
  wsUsers.columns = [
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Full Name', key: 'fullName', width: 24 },
    { header: 'Role', key: 'role', width: 14 },
    { header: 'Department', key: 'dept', width: 20 },
    { header: 'Position', key: 'pos', width: 20 },
    { header: 'Active', key: 'active', width: 10 },
    { header: 'Docs Created', key: 'docs', width: 14 },
    { header: 'BOQ Created', key: 'boq', width: 14 },
    { header: 'Approvals', key: 'approvals', width: 12 },
    { header: 'Joined', key: 'joined', width: 22 },
  ]
  styleHeader(wsUsers, 10)
  users.forEach(u => wsUsers.addRow({
    email: u.email,
    fullName: u.fullName || '',
    role: u.role,
    dept: u.department || '',
    pos: u.position || '',
    active: u.isActive ? 'Yes' : 'No',
    docs: u._count.createdDocuments,
    boq: u._count.createdBoqDocuments,
    approvals: u._count.approvals,
    joined: fmtDate(u.createdAt),
  }))

  // ── Sheet 3: BOQ Documents ─────────────────────────────────────────────────
  const wsBoq = wb.addWorksheet('BOQ Documents')
  wsBoq.columns = [
    { header: 'Title', key: 'title', width: 32 },
    { header: 'Job', key: 'job', width: 24 },
    { header: 'Kind', key: 'kind', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created By', key: 'creator', width: 28 },
    { header: 'Created At', key: 'createdAt', width: 22 },
    { header: 'Last Updated', key: 'updatedAt', width: 22 },
    { header: 'ID', key: 'id', width: 28 },
  ]
  styleHeader(wsBoq, 8)
  boqDocuments.forEach(b => wsBoq.addRow({
    title: b.title || '(ไม่มีชื่อ)',
    job: b.job?.name || '',
    kind: b.kind,
    status: b.status,
    creator: b.creator.fullName || b.creator.email,
    createdAt: fmtDate(b.createdAt),
    updatedAt: fmtDate(b.updatedAt),
    id: b.id,
  }))

  // ── Sheet 4: Form Documents ────────────────────────────────────────────────
  const wsDocs = wb.addWorksheet('Form Documents')
  wsDocs.columns = [
    { header: 'Doc Number', key: 'docNo', width: 18 },
    { header: 'Title', key: 'title', width: 36 },
    { header: 'Form Type', key: 'type', width: 28 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Created By', key: 'creator', width: 28 },
    { header: 'Created At', key: 'createdAt', width: 22 },
    { header: 'Submitted At', key: 'submittedAt', width: 22 },
    { header: 'Completed At', key: 'completedAt', width: 22 },
  ]
  styleHeader(wsDocs, 8)
  documents.forEach(d => wsDocs.addRow({
    docNo: d.documentNumber || '',
    title: d.title,
    type: d.formTemplate.name,
    status: d.status,
    creator: d.creator.fullName || d.creator.email,
    createdAt: fmtDate(d.createdAt),
    submittedAt: fmtDate(d.submittedAt),
    completedAt: fmtDate(d.completedAt),
  }))

  // ── Sheet 5: Approvals ─────────────────────────────────────────────────────
  const wsApprovals = wb.addWorksheet('Approvals')
  wsApprovals.columns = [
    { header: 'Document', key: 'doc', width: 32 },
    { header: 'Doc Number', key: 'docNo', width: 18 },
    { header: 'Step', key: 'step', width: 24 },
    { header: 'Approver', key: 'approver', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Created At', key: 'createdAt', width: 22 },
    { header: 'Decided At', key: 'decidedAt', width: 22 },
  ]
  styleHeader(wsApprovals, 7)
  approvals.forEach(a => wsApprovals.addRow({
    doc: a.document.title,
    docNo: a.document.documentNumber || '',
    step: a.workflowStep.name,
    approver: a.approver ? (a.approver.fullName || a.approver.email) : '—',
    status: a.status,
    createdAt: fmtDate(a.createdAt),
    decidedAt: fmtDate(a.approvedAt),
  }))

  // ── Sheet 6: Vehicle Requests ──────────────────────────────────────────────
  const wsVehicle = wb.addWorksheet('Vehicle Requests')
  wsVehicle.columns = [
    { header: 'Service', key: 'service', width: 28 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Requester', key: 'requester', width: 28 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Created At', key: 'createdAt', width: 22 },
  ]
  styleHeader(wsVehicle, 5)
  vehicleRequests.forEach(v => wsVehicle.addRow({
    service: v.serviceLabel,
    type: v.type,
    requester: v.requester.fullName || v.requester.email,
    status: v.status,
    createdAt: fmtDate(v.createdAt),
  }))

  // ── Zebra stripe all data sheets ──────────────────────────────────────────
  for (const ws of [wsUsers, wsBoq, wsDocs, wsApprovals, wsVehicle]) {
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      const fill: ExcelJS.Fill = rowNum % 2 === 0
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      row.eachCell(cell => { cell.fill = fill })
    })
  }

  // ── Stream response ────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  const dateStr = now.toISOString().slice(0, 10)

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analytics_${dateStr}.xlsx"`,
    },
  })
}
