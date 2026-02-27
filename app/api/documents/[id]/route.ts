import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import {
  getDocumentById,
  updateDocument,
  deleteDocument,
} from '@/lib/documents/document-service'
import { canEditDocument, canDeleteDocument, canApprove } from '@/lib/auth/permissions'
import { DocumentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/documents/[id] - Get document by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const document = await getDocumentById(id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check permissions - users can view:
    // 1. Their own documents
    // 2. Documents they are assigned to approve/sign
    // 3. Admins can view any
    // 4. Managers and approvers can view any (e.g. for APC table / advance register)
    if (document.createdById !== user.id && user.role !== 'ADMIN') {
      if (canApprove(user.role)) {
        // Managers and approvers can view all documents
      } else {
        const approval = await prisma.approval.findFirst({
          where: {
            documentId: document.id,
            approverId: user.id,
            status: 'PENDING',
          },
        })
        if (!approval) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Error getting document:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/documents/[id] - Update document
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const document = await getDocumentById(id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check edit permissions
    if (
      !canEditDocument(
        user.role,
        document.createdById,
        user.id,
        document.status
      )
    ) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot edit this document' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { title, data, status } = body

    // Only allow status changes to DRAFT or CANCELLED for non-admins
    if (status && status !== DocumentStatus.DRAFT && status !== DocumentStatus.CANCELLED) {
      if (user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Cannot change status to ' + status },
          { status: 403 }
        )
      }
    }

    const updated = await updateDocument(id, { title, data, status }, user.id)

    return NextResponse.json({ document: updated })
  } catch (error: any) {
    console.error('Error updating document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/documents/[id] - Delete document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const document = await getDocumentById(id)

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check delete permissions
    if (
      !canDeleteDocument(
        user.role,
        document.createdById,
        user.id,
        document.status
      )
    ) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot delete this document' },
        { status: 403 }
      )
    }

    await deleteDocument(id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
