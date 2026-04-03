import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { listDocuments, createDocument, stripDocumentDataForList } from '@/lib/documents/document-service'
import { canCreateDocuments } from '@/lib/auth/permissions'
import { DocumentStatus } from '@prisma/client'

/**
 * GET /api/documents - List documents with filters
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const formTemplateId = searchParams.get('formTemplateId') || undefined
    const rawStatus = searchParams.get('status') || undefined
    let status: DocumentStatus | undefined
    let statusIn: DocumentStatus[] | undefined
    if (rawStatus?.includes(',')) {
      statusIn = rawStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as DocumentStatus[]
    } else if (rawStatus) {
      status = rawStatus as DocumentStatus
    }
    const createdById = searchParams.get('createdById') || undefined
    const search = searchParams.get('search') || undefined
    const sortBy = (searchParams.get('sortBy') as any) || 'createdAt'
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'

    // Employees and non-admins can only see documents they created
    // Admins can see all documents
    const filterCreatedById = user.role !== 'ADMIN' ? user.id : createdById

    const result = await listDocuments({
      page,
      limit,
      formTemplateId,
      status,
      statusIn,
      createdById: filterCreatedById,
      search,
      sortBy,
      sortOrder,
    })

    // Send lean payload: only amount-related fields from document.data (no signatures, full items, etc.)
    const documents = (result.documents || []).map(stripDocumentDataForList)
    return NextResponse.json({ ...result, documents })
  } catch (error) {
    console.error('Error listing documents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/documents - Create new document
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canCreateDocuments(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot create documents' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { formTemplateId, title, data, status, userAssignments } = body

    if (!formTemplateId || !title || !data) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'formTemplateId, title, and data are required' },
        { status: 400 }
      )
    }

    const document = await createDocument({
      formTemplateId,
      title,
      data,
      createdById: user.id,
      status: status || DocumentStatus.DRAFT,
      userAssignments: userAssignments || {}, // Pass user assignments
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating document:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
