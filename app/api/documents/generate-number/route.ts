import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { generateDocumentNumber } from '@/lib/documents/document-service'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/documents/generate-number?formTemplateSlug=advance-payment-request
 * Generate the next document number for a form template
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const formTemplateSlug = searchParams.get('formTemplateSlug')

    if (!formTemplateSlug) {
      return NextResponse.json(
        { error: 'Missing formTemplateSlug parameter' },
        { status: 400 }
      )
    }

    // Find the form template by slug
    const template = await prisma.formTemplate.findUnique({
      where: { slug: formTemplateSlug },
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      )
    }

    // Generate the next document number
    const documentNumber = await generateDocumentNumber(template.id)

    return NextResponse.json({ documentNumber }, { status: 200 })
  } catch (error: any) {
    console.error('Error generating document number:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

