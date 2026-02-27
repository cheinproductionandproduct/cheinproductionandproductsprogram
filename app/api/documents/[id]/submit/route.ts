import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { submitDocument, getDocumentById } from '@/lib/documents/document-service'

/**
 * POST /api/documents/[id]/submit - Submit document for approval
 */
export async function POST(
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

    // Only creator can submit
    if (document.createdById !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only the creator can submit this document' },
        { status: 403 }
      )
    }

    const submitted = await submitDocument(id)

    return NextResponse.json({ document: submitted })
  } catch (error: any) {
    console.error('Error submitting document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
