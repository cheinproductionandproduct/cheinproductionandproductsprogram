import { prisma } from '@/lib/prisma'
import { DocumentStatus, ApprovalStatus, UserRole } from '@prisma/client'
import { canApprove } from '@/lib/auth/permissions'

/**
 * Get pending approvals for a user
 * Only returns approvals for users who can approve (ADMIN, MANAGER, APPROVER)
 * Employees cannot see or sign documents
 */
export async function getPendingApprovals(userId: string, userRole: string) {
  // Check if user has permission to approve documents
  // If user is EMPLOYEE, return empty array
  if (!canApprove(userRole as UserRole)) {
    console.log('[getPendingApprovals] User is EMPLOYEE, cannot approve documents')
    return []
  }

  // Get approvals where:
  // 1. Status is PENDING
  // 2. Either approverId matches the user OR workflow step assigneeId matches OR assigneeRole matches
  // 3. Document is in PENDING status
  // 4. Current step matches the workflow step (or currentStep is null/0 and this is step 1)

  console.log('[getPendingApprovals] userId:', userId, 'userRole:', userRole)

  const approvals = await prisma.approval.findMany({
    where: {
      status: 'PENDING',
      document: {
        status: 'PENDING',
      },
      OR: [
        { approverId: userId }, // Direct assignment via approverId
        {
          workflowStep: {
            assigneeId: userId, // User is specifically assigned to this step
          },
        },
        {
          workflowStep: {
            assigneeRole: userRole as any, // User has the required role
            assigneeId: null, // No specific user assigned (role-based)
          },
        },
      ],
    },
    include: {
      document: {
        include: {
          formTemplate: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      },
      workflowStep: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  console.log('[getPendingApprovals] Found', approvals.length, 'approvals before filtering')

  // Filter to only show approvals for current step
  // If currentStep is null or 0, show step 1 (first step)
  const filtered = approvals.filter((approval) => {
    const document = approval.document
    const currentStep = document.currentStep ?? 1 // Default to step 1 if null
    const matches = approval.workflowStep.stepNumber === currentStep
    console.log(`[getPendingApprovals] Approval ${approval.id}: stepNumber=${approval.workflowStep.stepNumber}, currentStep=${currentStep}, approverId=${approval.approverId}, matches=${matches}`)
    return matches
  })

  console.log('[getPendingApprovals] Returning', filtered.length, 'approvals after filtering')
  return filtered
}

/**
 * Approve a document step
 * Only users with ADMIN, MANAGER, or APPROVER roles can approve documents
 */
export async function approveDocumentStep(
  approvalId: string,
  approverId: string,
  signatureData: string,
  comments?: string
) {
  // Check if approver has permission to approve and get their info
  const approver = await prisma.user.findUnique({
    where: { id: approverId },
    select: { role: true, fullName: true, email: true },
  })

  if (!approver) {
    throw new Error('Approver not found')
  }

  if (!canApprove(approver.role)) {
    throw new Error('Only managers and approvers can sign documents. Employees cannot approve documents.')
  }

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      document: {
        include: {
          formTemplate: {
            include: {
              approvalWorkflow: {
                include: {
                  steps: {
                    orderBy: { stepNumber: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
      workflowStep: true,
    },
  })

  if (!approval) {
    throw new Error('Approval not found')
  }

  if (approval.status !== 'PENDING') {
    throw new Error('Approval is not pending')
  }

  // Check if this is the current step
  const currentStep = approval.document.currentStep || 0
  if (approval.workflowStep.stepNumber !== currentStep) {
    throw new Error('This approval step is not current')
  }

  // Update approval
  const updatedApproval = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      approverId,
      status: 'APPROVED',
      signatureData,
      comments,
      approvedAt: new Date(),
    },
  })

  // Update document data to include the signature
  // Map workflow step to signature field: step 1 = approverSignature, step 2 = payerSignature (or financeManagerSignature for ADC)
  const formSlug = (approval.document.formTemplate as any)?.slug || ''
  const isADC = formSlug === 'advance-payment-clearance'
  const documentData = approval.document.data as any
  const signatures = documentData.signatures || {}
  const approverName = approver.fullName || approver.email || ''
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

  if (approval.workflowStep.stepNumber === 1) {
    // Step 1 = Approver / Manager signature
    signatures.approverSignature = signatureData
    documentData.approverSignatureName = approverName
    documentData.approverSignatureDate = today
  } else if (approval.workflowStep.stepNumber === 2) {
    // Step 2 = Payer (APR) or Finance Manager (ADC) signature
    if (isADC) {
      signatures.financeManagerSignature = signatureData
      documentData.financeManagerSignatureName = approverName
      documentData.financeManagerSignatureDate = today
    } else {
      signatures.payerSignature = signatureData
      documentData.payerSignatureName = approverName
      documentData.payerSignatureDate = today
    }
  }

  documentData.signatures = signatures

  // Update document with signatures
  await prisma.document.update({
    where: { id: approval.documentId },
    data: {
      data: documentData,
    },
  })

  // Check if there are more steps
  const workflow = approval.document.formTemplate.approvalWorkflow
  const totalSteps = workflow?.steps.length || 0
  const nextStep = currentStep + 1

  if (nextStep > totalSteps) {
    // All steps completed - approve document
    await prisma.document.update({
      where: { id: approval.documentId },
      data: {
        status: DocumentStatus.APPROVED,
        currentStep: null,
        completedAt: new Date(),
      },
    })
  } else {
    // Move to next step
    await prisma.document.update({
      where: { id: approval.documentId },
      data: {
        currentStep: nextStep,
      },
    })
  }

  return updatedApproval
}

/**
 * Reject a document step
 */
export async function rejectDocumentStep(
  approvalId: string,
  approverId: string,
  comments: string
) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      document: true,
      workflowStep: true,
    },
  })

  if (!approval) {
    throw new Error('Approval not found')
  }

  if (approval.status !== 'PENDING') {
    throw new Error('Approval is not pending')
  }

  // Update approval
  const updatedApproval = await prisma.approval.update({
    where: { id: approvalId },
    data: {
      approverId,
      status: 'REJECTED',
      comments,
      rejectedAt: new Date(),
    },
  })

  // Reject document
  await prisma.document.update({
    where: { id: approval.documentId },
    data: {
      status: DocumentStatus.REJECTED,
      currentStep: null,
    },
  })

  return updatedApproval
}

/**
 * Get approval by ID
 */
export async function getApprovalById(approvalId: string) {
  return await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      document: {
        include: {
          formTemplate: true,
          creator: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      },
      workflowStep: true,
      approver: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
  })
}
