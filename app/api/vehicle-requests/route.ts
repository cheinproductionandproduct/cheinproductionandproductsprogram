import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { prisma } from '@/lib/prisma'
import { Prisma, VehicleRequestStatus, UserRole } from '@prisma/client'
import { isAdmin, isManager } from '@/lib/auth/permissions'

function mapApiError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021') {
      return {
        status: 500,
        payload: {
          error: 'Database table not ready',
          message: 'ตารางข้อมูลคำขอรถยังไม่พร้อมใช้งาน กรุณารัน db push/migration',
          code: error.code,
        },
      }
    }
    return {
      status: 500,
      payload: {
        error: 'Database error',
        message: `Database request failed (${error.code})`,
        code: error.code,
      },
    }
  }

  if (error instanceof Error) {
    return {
      status: 500,
      payload: {
        error: 'Internal server error',
        message: error.message,
      },
    }
  }

  return {
    status: 500,
    payload: {
      error: 'Internal server error',
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      type,
      categorySlug,
      subSlug,
      serviceLabel,
      start,
      dest,
    } = body || {}

    if (!type || !categorySlug || !subSlug || !serviceLabel || !start || !dest) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const requestRow = await prisma.vehicleRequest.create({
      data: {
        type: String(type),
        categorySlug: String(categorySlug),
        subSlug: String(subSlug),
        serviceLabel: String(serviceLabel),
        requesterId: user.id,
        start,
        dest,
        status: VehicleRequestStatus.PENDING,
      },
    })

    return NextResponse.json({ request: requestRow }, { status: 201 })
  } catch (error) {
    console.error('Error creating vehicle request:', error)
    const mapped = mapApiError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10) || 30))
    const skip = (page - 1) * limit

    const where: any = {}

    if (statusParam && Object.values(VehicleRequestStatus).includes(statusParam as VehicleRequestStatus)) {
      where.status = statusParam as VehicleRequestStatus
    }

    // Managers and admins can see all; others see only their own
    const canSeeAll = isAdmin(user.role as UserRole) || isManager(user.role as UserRole)
    if (!canSeeAll) {
      where.requesterId = user.id
    }

    const [items, total] = await Promise.all([
      prisma.vehicleRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: {
            select: {
              id: true,
              fullName: true,
              email: true,
              department: true,
            },
          },
        },
      }),
      prisma.vehicleRequest.count({ where }),
    ])

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error listing vehicle requests:', error)
    const mapped = mapApiError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only managers/admins can update status
    if (!isAdmin(user.role as UserRole) && !isManager(user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only managers or admins can update status' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, status } = body || {}

    if (!id || !status || !Object.values(VehicleRequestStatus).includes(status as VehicleRequestStatus)) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      )
    }

    const updated = await prisma.vehicleRequest.update({
      where: { id: String(id) },
      data: { status: status as VehicleRequestStatus },
    })

    return NextResponse.json({ request: updated })
  } catch (error) {
    console.error('Error updating vehicle request status:', error)
    const mapped = mapApiError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

