import { PrismaClient, UserRole } from '@prisma/client'
import type { FormTemplateConfig } from '../types/database'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Advance Payment Request Form - Based on actual company form
  const advancePaymentRequest = await prisma.formTemplate.upsert({
    where: { slug: 'advance-payment-request' },
    update: {
      name: 'ใบเบิกเงินทดรองจ่าย (Advance Payment Request)',
      description: 'Request for advance payment - Chein Production and Products Co., Ltd.',
      fields: {
        fields: [
          {
            name: 'advNumber',
            type: 'text',
            label: 'เลขที่ ADV (ADV No.)',
            required: false,
            helpText: 'Auto-generated if left blank',
          },
          {
            name: 'date',
            type: 'date',
            label: 'วันที่ (Date)',
            required: true,
          },
          {
            name: 'dateMoneyNeeded',
            type: 'date',
            label: 'วันที่ต้องใช้เงิน (Date Money Needed)',
            required: true,
          },
          {
            name: 'requesterName',
            type: 'text',
            label: 'ชื่อผู้ขอเบิก (Requester\'s Name)',
            required: true,
          },
          {
            name: 'position',
            type: 'text',
            label: 'ตำแหน่ง (Position)',
            required: true,
          },
          {
            name: 'department',
            type: 'text',
            label: 'ส่วนงาน/ฝ่าย/แผนก (Department/Division/Section)',
            required: true,
          },
          {
            name: 'purpose',
            type: 'textarea',
            label: 'วัสถุประสงค์การเบิกเงินทดรองจ่าย (Purpose of Advance Payment)',
            required: true,
            placeholder: 'ระบุวัตถุประสงค์ในการเบิกเงินทดรองจ่าย',
          },
          {
            name: 'items',
            type: 'items-table',
            label: 'รายการ (Items)',
            required: true,
            helpText: 'Click + to add items to the list',
          },
          {
            name: 'totalAmount',
            type: 'number',
            label: 'รวม (Total Amount) - บาท (Baht)',
            required: true,
            validation: { min: 0 },
            helpText: 'Auto-calculated from items',
          },
        ],
      } as any,
      settings: {
        autoNumber: true,
        numberPrefix: 'ADV',
        allowDraft: true,
      },
    },
    create: {
      name: 'ใบเบิกเงินทดรองจ่าย (Advance Payment Request)',
      slug: 'advance-payment-request',
      description: 'Request for advance payment - Chein Production and Products Co., Ltd.',
      icon: 'dollar-sign',
      fields: {
        fields: [
          {
            name: 'advNumber',
            type: 'text',
            label: 'เลขที่ ADV (ADV No.)',
            required: false,
            helpText: 'Auto-generated if left blank',
          },
          {
            name: 'date',
            type: 'date',
            label: 'วันที่ (Date)',
            required: true,
          },
          {
            name: 'dateMoneyNeeded',
            type: 'date',
            label: 'วันที่ต้องใช้เงิน (Date Money Needed)',
            required: true,
          },
          {
            name: 'requesterName',
            type: 'text',
            label: 'ชื่อผู้ขอเบิก (Requester\'s Name)',
            required: true,
          },
          {
            name: 'position',
            type: 'text',
            label: 'ตำแหน่ง (Position)',
            required: true,
          },
          {
            name: 'department',
            type: 'text',
            label: 'ส่วนงาน/ฝ่าย/แผนก (Department/Division/Section)',
            required: true,
          },
          {
            name: 'purpose',
            type: 'textarea',
            label: 'วัสถุประสงค์การเบิกเงินทดรองจ่าย (Purpose of Advance Payment)',
            required: true,
            placeholder: 'ระบุวัตถุประสงค์ในการเบิกเงินทดรองจ่าย',
          },
          {
            name: 'items',
            type: 'items-table',
            label: 'รายการ (Items)',
            required: true,
            helpText: 'Click + to add items to the list',
          },
          {
            name: 'totalAmount',
            type: 'number',
            label: 'รวม (Total Amount) - บาท (Baht)',
            required: true,
            validation: { min: 0 },
            helpText: 'Auto-calculated from items',
          },
        ],
      } as any,
      settings: {
        autoNumber: true,
        numberPrefix: 'ADV',
        allowDraft: true,
      },
    },
  })

  console.log('✅ Created form template:', advancePaymentRequest.name)

  // Advance Payment Clearance Form - Links to Request
  const advancePaymentClearance = await prisma.formTemplate.upsert({
    where: { slug: 'advance-payment-clearance' },
    update: {
      name: 'ใบเคลียร์เงินทดรองจ่าย (Advance Payment Clearance)',
      description: 'Clearance for advance payment - Must be cleared within 15 days',
      fields: {
        fields: [
          {
            name: 'creNumber',
            type: 'text',
            label: 'เลขที่ CRE (CRE No.)',
            required: false,
            helpText: 'Auto-generated if left blank',
          },
          {
            name: 'date',
            type: 'date',
            label: 'วันที่ (Date)',
            required: true,
          },
          {
            name: 'dateMoneyNeeded',
            type: 'date',
            label: 'วันที่ต้องใช้เงิน (Date Required for Money)',
            required: true,
          },
          {
            name: 'requesterName',
            type: 'text',
            label: 'ชื่อผู้ขอเบิก (Requester\'s Name)',
            required: true,
          },
          {
            name: 'position',
            type: 'text',
            label: 'ตำแหน่ง (Position)',
            required: true,
          },
          {
            name: 'department',
            type: 'text',
            label: 'ส่วนงาน/ฝ่าย/แผนก (Department/Division/Section)',
            required: true,
          },
          {
            name: 'advReference',
            type: 'text',
            label: 'อ้างอิงเลขที่ใบเบิกเงินทดรองจ่าย (Reference ADV Number)',
            required: true,
            helpText: 'Reference to the original advance payment request (ADV No.)',
          },
          {
            name: 'workSummary',
            type: 'textarea',
            label: 'สรุปผลการไปปฏิบัติงาน (Summary of Work Performed)',
            required: true,
            placeholder: 'สรุปผลการไปปฏิบัติงาน',
          },
          {
            name: 'expenseItems',
            type: 'textarea',
            label: 'รายการค่าใช้จ่าย (Expense Items) - Enter one item per line in format: Description|Amount',
            required: true,
            helpText: 'Format: Item Description|Amount (e.g., Test|100)',
            placeholder: 'Test|100\nTest|100\nTest|100',
          },
          {
            name: 'totalExpenses',
            type: 'number',
            label: 'รวมค่าใช้จ่าย (Total Expenses) - บาท',
            required: true,
            validation: { min: 0 },
          },
          {
            name: 'advanceAmount',
            type: 'number',
            label: '(หัก) จำนวนที่เบิกทดรอง (Less: Advance Amount) - บาท',
            required: true,
            validation: { min: 0 },
            helpText: 'Amount from the original advance payment request',
          },
          {
            name: 'amountToReturn',
            type: 'number',
            label: 'จำนวนที่เหลือส่งคืน (Amount Remaining to be Returned) - บาท',
            required: true,
            helpText: 'Positive = refund needed, Zero or Negative = no refund',
          },
          {
            name: 'additionalAmount',
            type: 'number',
            label: 'จำนวนที่เบิกเพิ่ม (Additional Amount to be Reimbursed) - บาท',
            required: true,
            validation: { min: 0 },
            helpText: 'Additional amount needed if expenses exceed advance',
          },
          {
            name: 'transferDate',
            type: 'date',
            label: 'วันที่โอนเงิน (Date money was transferred)',
            required: false,
            helpText: 'วันที่โอนเงินคืน/เบิกเพิ่มเข้าบัญชี (กรอกเมื่อทราบวันที่)',
          },
          {
            name: 'receipts',
            type: 'file',
            label: 'ใบเสร็จ/หลักฐาน (Receipts/Evidence)',
            required: false,
            helpText: 'Upload receipts and supporting documents',
          },
        ],
      } as any,
      settings: {
        autoNumber: true,
        numberPrefix: 'CRE',
        allowDraft: true,
      },
    },
    create: {
      name: 'ใบเคลียร์เงินทดรองจ่าย (Advance Payment Clearance)',
      slug: 'advance-payment-clearance',
      description: 'Clearance for advance payment - Links to Advance Payment Request',
      icon: 'check-circle',
      fields: {
        fields: [
          { name: 'creNumber', type: 'text', label: 'เลขที่ CRE (CRE No.)', required: false },
          { name: 'date', type: 'date', label: 'วันที่ (Date)', required: true },
          { name: 'dateMoneyNeeded', type: 'date', label: 'วันที่ต้องใช้เงิน', required: true },
          { name: 'requesterName', type: 'text', label: 'ชื่อผู้ขอเบิก', required: true },
          { name: 'position', type: 'text', label: 'ตำแหน่ง', required: true },
          { name: 'department', type: 'text', label: 'ส่วนงาน/ฝ่าย/แผนก', required: true },
          { name: 'advReference', type: 'text', label: 'อ้างอิงเลขที่ใบเบิกเงินทดรองจ่าย', required: true },
          { name: 'workSummary', type: 'textarea', label: 'สรุปผลการไปปฏิบัติงาน', required: true },
          { name: 'expenseItems', type: 'items-table', label: 'รายการค่าใช้จ่าย', required: true },
          { name: 'totalExpenses', type: 'number', label: 'รวมค่าใช้จ่าย', required: true },
          { name: 'advanceAmount', type: 'number', label: '(หัก) จำนวนที่เบิกทดรอง', required: true },
          { name: 'amountToReturn', type: 'number', label: 'จำนวนที่เหลือส่งคืน', required: true },
          { name: 'additionalAmount', type: 'number', label: 'จำนวนที่เบิกเพิ่ม', required: true },
          {
            name: 'transferDate',
            type: 'date',
            label: 'วันที่โอนเงิน (Date money was transferred)',
            required: false,
          },
          { name: 'receipts', type: 'file', label: 'ใบเสร็จ/หลักฐาน', required: false },
        ],
      } as any,
      settings: {
        autoNumber: true,
        numberPrefix: 'CRE',
        allowDraft: true,
      },
    },
  })

  console.log('✅ Created form template:', advancePaymentClearance.name)

  // Example: Create approval workflow for Advance Payment Request
  const aprWorkflow = await prisma.approvalWorkflow.upsert({
    where: { formTemplateId: advancePaymentRequest.id },
    update: {},
    create: {
      formTemplateId: advancePaymentRequest.id,
      name: 'Advance Payment Request Workflow',
      description: 'Standard approval workflow for advance payment requests',
      steps: {
        create: [
          {
            stepNumber: 1,
            name: 'Manager Approval',
            description: 'Direct manager must approve',
            assigneeRole: UserRole.MANAGER,
            isRequired: true,
            canReject: true,
          },
          {
            stepNumber: 2,
            name: 'Finance Review',
            description: 'Finance department review',
            assigneeRole: UserRole.APPROVER,
            isRequired: true,
            canReject: true,
          },
        ],
      },
    },
  })

  console.log('✅ Created approval workflow:', aprWorkflow.name)

  // Example: Create approval workflow for Advance Payment Clearance
  const apcWorkflow = await prisma.approvalWorkflow.upsert({
    where: { formTemplateId: advancePaymentClearance.id },
    update: {},
    create: {
      formTemplateId: advancePaymentClearance.id,
      name: 'Advance Payment Clearance Workflow',
      description: 'Standard approval workflow for advance payment clearance',
      steps: {
        create: [
          {
            stepNumber: 1,
            name: 'Manager Verification',
            description: 'Manager verifies expenses',
            assigneeRole: UserRole.MANAGER,
            isRequired: true,
            canReject: true,
          },
          {
            stepNumber: 2,
            name: 'Finance Final Approval',
            description: 'Finance final approval and settlement',
            assigneeRole: UserRole.APPROVER,
            isRequired: true,
            canReject: true,
          },
        ],
      },
    },
  })

  console.log('✅ Created approval workflow:', apcWorkflow.name)

  console.log('🎉 Database seed completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
