import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/middleware-helpers'
import { Prisma } from '@prisma/client'

/** Use Job model if available; otherwise fall back to raw query (e.g. when Prisma client was not regenerated). */
async function getJobs(includeInactive: boolean) {
  if (typeof (prisma as any).job?.findMany === 'function') {
    const jobs = await (prisma as any).job.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    return sortJobsByCustomOrder(jobs)
  }
  const rows = await prisma.$queryRaw<
    { id: string; name: string; code: string | null; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }[]
  >(
    includeInactive
      ? Prisma.sql`SELECT id, name, code, description, "isActive", "createdAt", "updatedAt" FROM jobs ORDER BY "createdAt" DESC`
      : Prisma.sql`SELECT id, name, code, description, "isActive", "createdAt", "updatedAt" FROM jobs WHERE "isActive" = true ORDER BY "createdAt" DESC`
  )
  return sortJobsByCustomOrder(rows)
}

/** Custom sort: "For Sale" first, then "สำนักงาน", then numbered jobs (highest year.number first) */
function sortJobsByCustomOrder(jobs: any[]) {
  return jobs.sort((a, b) => {
    const nameA = a.name.trim()
    const nameB = b.name.trim()
    
    // "For Sale" always first
    if (nameA === 'For Sale') return -1
    if (nameB === 'For Sale') return 1
    
    // "สำนักงาน" second
    if (nameA === 'สำนักงาน') return -1
    if (nameB === 'สำนักงาน') return 1
    
    // Extract year.number from format: YYYY.NNN_...
    const matchA = nameA.match(/^(\d{4})\.(\d+)/)
    const matchB = nameB.match(/^(\d{4})\.(\d+)/)
    
    // If both have year.number, sort by year DESC, then number DESC
    if (matchA && matchB) {
      const yearA = parseInt(matchA[1])
      const yearB = parseInt(matchB[1])
      if (yearA !== yearB) return yearB - yearA // higher year first
      
      const numA = parseInt(matchA[2])
      const numB = parseInt(matchB[2])
      return numB - numA // higher number first
    }
    
    // If only A has year.number, A comes first
    if (matchA) return -1
    if (matchB) return 1
    
    // Otherwise alphabetical
    return nameA.localeCompare(nameB)
  })
}

/**
 * GET /api/jobs - List all active jobs
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const jobs = await getJobs(includeInactive)

    return NextResponse.json({ jobs }, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching jobs:', error)
    const message = error?.message || 'Internal server error'
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/** Create a job. Code is set to null since job name includes the number. */
async function createJob(data: { name: string; description: string | null }) {
  const payload = { name: data.name, code: null, description: data.description }

  if (typeof (prisma as any).job?.create === 'function') {
    return (prisma as any).job.create({ data: payload })
  }
  const { randomBytes } = await import('crypto')
  const id = `c${randomBytes(12).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 25)}`
  const now = new Date()
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO jobs (id, name, code, description, "isActive", "createdAt", "updatedAt")
    VALUES (${id}, ${payload.name}, ${payload.code}, ${payload.description}, true, ${now}, ${now})`
  )
  const rows = await prisma.$queryRaw<
    { id: string; name: string; code: string | null; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }[]
  >(Prisma.sql`SELECT id, name, code, description, "isActive", "createdAt", "updatedAt" FROM jobs WHERE id = ${id}`)
  return rows[0] ?? { id, name: payload.name, code: payload.code, description: payload.description, isActive: true, createdAt: now, updatedAt: now }
}

/**
 * POST /api/jobs - Create a new job
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Job name is required' },
        { status: 400 }
      )
    }

    const job = await createJob({
      name: name.trim(),
      description: description && typeof description === 'string' ? description.trim() || null : null,
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating job:', error)
    const message = error?.message || 'Internal server error'
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? message : 'Internal server error' },
      { status: 500 }
    )
  }
}
