import { prisma } from '@/lib/prisma'
import { DocumentStatus } from '@prisma/client'
import type { FormTemplateConfig } from '@/types/database'

/**
 * Generate document number based on form template settings
 * Format: YYYY-MM-XXX (e.g., 2026-03-001)
 * Numbers are synchronized across all users for the same year-month
 */
export async function generateDocumentNumber(formTemplateId: string): Promise<string> {
  const template = await prisma.formTemplate.findUnique({
    where: { id: formTemplateId },
    select: { settings: true, slug: true },
  })

  if (!template) {
    throw new Error('Form template not found')
  }

  const settings = template.settings as any
  if (!settings?.autoNumber) {
    return ''
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0') // Month is 0-indexed, so +1

  // Calculate start and end of current month
  const startOfMonth = new Date(year, now.getMonth(), 1)
  const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999)

  // Count documents with this template created in this year-month
  // This ensures synchronization across all users
  const count = await prisma.document.count({
    where: {
      formTemplateId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  })

  // Generate next sequential number (3 digits)
  const number = String(count + 1).padStart(3, '0')
  const suffix = `${year}-${month}-${number}`
  // Advance Payment Clearance always uses CRE (not APC) for เลขที่ CRE
  const prefixRaw = (template as any).slug === 'advance-payment-clearance'
    ? 'CRE'
    : (settings.numberPrefix && String(settings.numberPrefix).trim())
  const prefix = prefixRaw || ''
  return prefix ? `${prefix}-${suffix}` : suffix
}

/**
 * Create a new document
 */
export async function createDocument(data: {
  formTemplateId: string
  title: string
  data: Record<string, any>
  createdById: string
  status?: DocumentStatus
  userAssignments?: Record<string, string> // stepId -> userId
}) {
  const { formTemplateId, title, data: formData, createdById, status = DocumentStatus.DRAFT, userAssignments = {} } = data

  // Use document number from form data if provided (advNumber for APR, creNumber for ADC), otherwise generate
  let documentNumber: string | null = null
  const fromForm = (formData.advNumber && typeof formData.advNumber === 'string' && formData.advNumber.trim())
    ? formData.advNumber.trim()
    : (formData.creNumber && typeof formData.creNumber === 'string' && formData.creNumber.trim())
      ? formData.creNumber.trim()
      : null
  if (fromForm) {
    documentNumber = fromForm
  } else {
    documentNumber = await generateDocumentNumber(formTemplateId)
  }

  // Try to create document, retry with new number if there's a duplicate
  let document
  let retries = 0
  const maxRetries = 3
  
  while (retries < maxRetries) {
    try {
      document = await prisma.document.create({
        data: {
          formTemplateId,
          documentNumber: documentNumber || null,
          title,
          data: formData,
          status,
          createdById,
        },
        include: {
          formTemplate: true,
          creator: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      })
      // Success, break out of retry loop
      break
    } catch (error: any) {
      // Check if it's a unique constraint violation on documentNumber
      if (error.code === 'P2002' && error.meta?.target?.includes('documentNumber')) {
        retries++
        if (retries >= maxRetries) {
          throw new Error('Failed to generate unique document number after multiple attempts')
        }
        // Generate a new document number and retry
        documentNumber = await generateDocumentNumber(formTemplateId)
        continue
      }
      // If it's a different error, throw it
      throw error
    }
  }
  
  if (!document) {
    throw new Error('Failed to create document')
  }

  // Store user assignments in document data (store in both formats for compatibility)
  const documentDataWithAssignments = {
    ...formData,
    userAssignments: userAssignments, // Store assignments for later use
    _userAssignments: userAssignments, // Also store with underscore for backward compatibility
  }

  // Update document with assignments
  const updatedDocument = await prisma.document.update({
    where: { id: document.id },
    data: {
      data: documentDataWithAssignments,
    },
  })

  // Create initial version
  await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      version: 1,
      data: documentDataWithAssignments,
      status: document.status,
      changedBy: createdById,
      changeNote: 'Initial version',
    },
  })

  // Store userAssignments in document data for later use when submitting
  // Don't create approvals or change status here - that happens when document is submitted
  // Documents should remain as DRAFT until explicitly submitted

  return updatedDocument
}

/**
 * Get document by ID with all relations
 */
export async function getDocumentById(documentId: string) {
  return await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      formTemplate: true,
      creator: {
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          department: true,
          position: true,
        },
      },
      approvals: {
        include: {
          approver: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          workflowStep: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      versions: {
        orderBy: { version: 'desc' },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
      },
      parentRelations: {
        include: {
          parentDoc: {
            include: {
              formTemplate: true,
            },
          },
        },
      },
      childRelations: {
        include: {
          childDoc: {
            include: {
              formTemplate: true,
            },
          },
        },
      },
    },
  })
}

/**
 * List documents with filters and pagination
 */
export async function listDocuments(options?: {
  page?: number
  limit?: number
  formTemplateId?: string
  status?: DocumentStatus
  createdById?: string
  search?: string
  sortBy?: 'createdAt' | 'updatedAt' | 'title'
  sortOrder?: 'asc' | 'desc'
}) {
  const page = options?.page || 1
  const limit = options?.limit || 20
  const skip = (page - 1) * limit

  const where: any = {}
  if (options?.formTemplateId) where.formTemplateId = options.formTemplateId
  if (options?.status) where.status = options.status
  if (options?.createdById) where.createdById = options.createdById
  if (options?.search) {
    where.OR = [
      { title: { contains: options.search, mode: 'insensitive' } },
      { documentNumber: { contains: options.search, mode: 'insensitive' } },
    ]
  }

  const orderBy: any = {}
  const sortBy = options?.sortBy || 'createdAt'
  const sortOrder = options?.sortOrder || 'desc'
  orderBy[sortBy] = sortOrder

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy,
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
        _count: {
          select: {
            approvals: true,
            attachments: true,
          },
        },
      },
    }),
    prisma.document.count({ where }),
  ])

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * List advance payment requests (APR) with clearance status for manager register.
 * Each item includes the APR document and whether it has been cleared (APC approved) or not.
 */
export async function getAdvanceRegister(options?: { page?: number; limit?: number }) {
  const page = options?.page || 1
  const limit = options?.limit || 30
  const skip = (page - 1) * limit

  const [aprTemplate, adcTemplate] = await Promise.all([
    prisma.formTemplate.findUnique({ where: { slug: 'advance-payment-request' }, select: { id: true } }),
    prisma.formTemplate.findUnique({ where: { slug: 'advance-payment-clearance' }, select: { id: true } }),
  ])
  if (!aprTemplate || !adcTemplate) {
    return { items: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } }
  }

  const whereApr: any = { formTemplateId: aprTemplate.id, status: 'APPROVED' }
  const [aprDocuments, total] = await Promise.all([
    prisma.document.findMany({
      where: whereApr,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, fullName: true, email: true } },
        formTemplate: { select: { slug: true, name: true } },
      },
    }),
    prisma.document.count({ where: whereApr }),
  ])

  const items: Array<{
    apr: typeof aprDocuments[0]
    clearanceDocument: { id: string; documentNumber: string | null; status: DocumentStatus; data: any } | null
    clearanceStatus: 'cleared' | 'pending_clearance' | 'not_cleared'
  }> = []

  for (const apr of aprDocuments) {
    const docNumber = apr.documentNumber || ''
    const clearanceDocs = await prisma.document.findMany({
      where: {
        formTemplateId: adcTemplate.id,
        data: { path: ['advReference'], equals: docNumber },
      },
      select: { id: true, documentNumber: true, status: true, data: true },
      orderBy: { createdAt: 'desc' },
    })
    const rawClearance = clearanceDocs[0] || null
    const clearanceDoc = rawClearance
      ? { id: rawClearance.id, documentNumber: rawClearance.documentNumber, status: rawClearance.status, data: rawClearance.data }
      : null
    const clearanceStatus: 'cleared' | 'pending_clearance' | 'not_cleared' =
      clearanceDoc?.status === 'APPROVED'
        ? 'cleared'
        : clearanceDoc
          ? 'pending_clearance'
          : 'not_cleared'
    items.push({ apr, clearanceDocument: clearanceDoc, clearanceStatus })
  }

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * List documents that reference a given job (data.jobId = jobId)
 */
export async function listDocumentsByJobId(
  jobId: string,
  options?: {
    page?: number
    limit?: number
    createdById?: string // If set, only documents created by this user (for non-admin)
  }
) {
  const page = options?.page || 1
  const limit = options?.limit || 50
  const skip = (page - 1) * limit

  const where: any = {
    data: {
      path: ['jobId'],
      equals: jobId,
    },
  }
  if (options?.createdById) where.createdById = options.createdById

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
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
    }),
    prisma.document.count({ where }),
  ])

  return {
    documents,
    total,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Update document
 */
export async function updateDocument(
  documentId: string,
  data: {
    title?: string
    data?: Record<string, any>
    status?: DocumentStatus
  },
  userId: string
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  })

  if (!document) {
    throw new Error('Document not found')
  }

  // Get current version number
  const latestVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { version: 'desc' },
  })

  const newVersion = (latestVersion?.version || 0) + 1

  // Update document
  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.data && { data: data.data }),
      ...(data.status && { status: data.status }),
    },
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
  })

  // Create new version if data changed
  if (data.data) {
    await prisma.documentVersion.create({
      data: {
        documentId,
        version: newVersion,
        data: data.data,
        status: updated.status,
        changedBy: userId,
        changeNote: 'Document updated',
      },
    })

    // If userAssignments changed and document is PENDING, update approvals
    const updatedData = data.data as any
    const newUserAssignments = updatedData.userAssignments || updatedData._userAssignments
    if (newUserAssignments && updated.status === DocumentStatus.PENDING) {
      // Get workflow steps
      const formTemplate = await prisma.formTemplate.findUnique({
        where: { id: updated.formTemplateId },
        include: {
          approvalWorkflow: {
            include: {
              steps: {
                orderBy: { stepNumber: 'asc' },
              },
            },
          },
        },
      })

      if (formTemplate?.approvalWorkflow) {
        const steps = formTemplate.approvalWorkflow.steps
        
        // Update or create approvals for each step
        for (const step of steps) {
          let assignedUserId: string | null = null

          // Map user assignment IDs to workflow steps
          if (step.stepNumber === 1 && newUserAssignments.approver) {
            assignedUserId = newUserAssignments.approver
          } else if (step.stepNumber === 2 && newUserAssignments.payer) {
            assignedUserId = newUserAssignments.payer
          } else if (newUserAssignments[step.id]) {
            assignedUserId = newUserAssignments[step.id]
          } else {
            assignedUserId = step.assigneeId || null
          }

          // Update existing approval or create new one
          await prisma.approval.upsert({
            where: {
              documentId_workflowStepId: {
                documentId,
                workflowStepId: step.id,
              },
            },
            update: {
              approverId: assignedUserId,
              status: 'PENDING', // Reset to pending if it was rejected/cancelled
            },
            create: {
              documentId,
              workflowStepId: step.id,
              approverId: assignedUserId,
              status: 'PENDING',
            },
          })
        }
      }
    }
  }

  return updated
}

/**
 * Delete document
 */
export async function deleteDocument(documentId: string) {
  return await prisma.document.delete({
    where: { id: documentId },
  })
}

/**
 * Submit document for approval
 */
export async function submitDocument(documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
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
  })

  if (!document) {
    throw new Error('Document not found')
  }

  if (document.status !== DocumentStatus.DRAFT) {
    throw new Error('Only draft documents can be submitted')
  }

  const workflow = document.formTemplate.approvalWorkflow

  // Update document status
  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.PENDING,
      submittedAt: new Date(),
      currentStep: workflow ? 1 : null,
    },
  })

  // Create approval records for workflow steps
  // Check for user assignments stored in document data (check both formats)
  const documentData = document.data as any
  const userAssignments = documentData.userAssignments || documentData._userAssignments || {}

  console.log('[submitDocument] Document ID:', documentId)
  console.log('[submitDocument] User assignments:', userAssignments)
  console.log('[submitDocument] Workflow steps:', workflow?.steps.length || 0)

  if (workflow && workflow.steps.length > 0) {
    // Delete existing approvals first (in case document was resubmitted)
    await prisma.approval.deleteMany({
      where: { documentId },
    })

    // Create new approvals with correct approverId
    const approvals = workflow.steps.map((step) => {
      let assignedUserId: string | null = null

      // Map user assignment IDs to workflow steps based on step number
      // userAssignments.approver -> step 1
      // userAssignments.payer -> step 2
      if (step.stepNumber === 1 && userAssignments.approver) {
        assignedUserId = userAssignments.approver
      } else if (step.stepNumber === 2 && userAssignments.payer) {
        assignedUserId = userAssignments.payer
      } else if (userAssignments[step.id]) {
        // Fallback: check if step.id is in userAssignments
        assignedUserId = userAssignments[step.id]
      } else {
        // Use step's default assignee
        assignedUserId = step.assigneeId || null
      }

      console.log(`[submitDocument] Step ${step.stepNumber} (${step.name}): assignedUserId =`, assignedUserId)
      
      return {
        documentId,
        workflowStepId: step.id,
        approverId: assignedUserId,
        status: 'PENDING' as const,
      }
    })

    const created = await prisma.approval.createMany({
      data: approvals,
    })
    console.log('[submitDocument] Created approvals:', created.count)
  }

  return updated
}

/**
 * Link documents together
 */
export async function linkDocuments(
  parentDocId: string,
  childDocId: string,
  relationshipType: string,
  metadata?: Record<string, any>
) {
  return await prisma.documentRelationship.create({
    data: {
      parentDocId,
      childDocId,
      relationshipType,
      metadata: metadata || {},
    },
  })
}
