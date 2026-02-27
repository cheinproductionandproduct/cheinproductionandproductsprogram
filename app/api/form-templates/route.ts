import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/form-templates - List all form templates
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      )
    }

    const templates = await prisma.formTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        approvalWorkflow: {
          include: {
            steps: {
              orderBy: { stepNumber: 'asc' },
            },
          },
        },
        _count: {
          select: {
            documents: true,
          },
        },
      },
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error('Error fetching form templates:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message || 'Failed to fetch form templates'
      },
      { status: 500 }
    )
  }
}
