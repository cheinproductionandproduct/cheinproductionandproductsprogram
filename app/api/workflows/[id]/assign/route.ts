import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { requireAdmin } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'

/**
 * Assign a specific user to a workflow step
 * PUT /api/workflows/[id]/assign
 * Body: { stepNumber: number, assigneeId: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can assign users to workflow steps
    try {
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { stepNumber, assigneeId } = body

    if (!stepNumber || !assigneeId) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'stepNumber and assigneeId are required' },
        { status: 400 }
      )
    }

    // Verify workflow exists
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id },
      include: {
        steps: true,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Find the step
    const step = workflow.steps.find((s) => s.stepNumber === stepNumber)
    if (!step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    // Verify user exists
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
    })

    if (!assignee) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Update the step with specific user assignment
    const updatedStep = await prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        assigneeId,
        assigneeRole: null, // Clear role-based assignment when user is assigned
      },
    })

    return NextResponse.json({ step: updatedStep }, { status: 200 })
  } catch (error: any) {
    console.error('Error assigning user to workflow step:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * Remove user assignment from a workflow step (revert to role-based)
 * DELETE /api/workflows/[id]/assign
 * Body: { stepNumber: number, assigneeRole: string }
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

    // Only admins can modify workflow assignments
    try {
      await requireAdmin()
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { stepNumber, assigneeRole } = body

    if (!stepNumber) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'stepNumber is required' },
        { status: 400 }
      )
    }

    // Verify workflow exists
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id },
      include: {
        steps: true,
      },
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Find the step
    const step = workflow.steps.find((s) => s.stepNumber === stepNumber)
    if (!step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 })
    }

    // Update the step to remove user assignment (revert to role-based)
    const updatedStep = await prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        assigneeId: null,
        assigneeRole: assigneeRole || undefined, // Set role if provided
      },
    })

    return NextResponse.json({ step: updatedStep }, { status: 200 })
  } catch (error: any) {
    console.error('Error removing user assignment from workflow step:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

