import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { canManageUsers } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import type { FormTemplateConfig } from '@/types/database'

/**
 * GET /api/form-templates/[id] - Get form template by ID
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
    const template = await prisma.formTemplate.findUnique({
      where: { id },
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

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error fetching template:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/form-templates/[id] - Update form template (admin only)
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

    if (!canManageUsers(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, fields, settings, isActive } = body

    const updated = await prisma.formTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(fields && { fields: fields as any }),
        ...(settings && { settings }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({ template: updated })
  } catch (error: any) {
    console.error('Error updating template:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/form-templates - Create new form template (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canManageUsers(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, slug, description, fields, settings, icon } = body

    if (!name || !slug || !fields) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'name, slug, and fields are required' },
        { status: 400 }
      )
    }

    const template = await prisma.formTemplate.create({
      data: {
        name,
        slug,
        description,
        icon,
        fields: fields as any,
        settings: settings || {},
        isActive: true,
      },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating template:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
