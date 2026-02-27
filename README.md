# Document Management System with E-Signing

A flexible document management system built with Next.js, React, Prisma, and Supabase for handling forms, e-signing, and approval workflows.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **ORM**: Prisma
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Deployment**: Vercel

## Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- npm or yarn package manager

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project in [Supabase](https://supabase.com)
2. Go to Project Settings > API to get your keys
3. Go to Project Settings > Database to get your connection string

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[YOUR-ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SERVICE-ROLE-KEY]"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**Important**: Replace the placeholders with your actual Supabase credentials.

### 4. Generate Supabase TypeScript Types

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
```

Or if using Supabase CLI locally:
```bash
npx supabase gen types typescript --local > types/supabase.ts
```

### 5. Set Up Database Schema

After creating your Prisma schema (in Phase 2), run:

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database (for development)
npm run db:push

# Or create a migration (for production)
npm run db:migrate
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes to database (dev)
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio (database GUI)

## Project Structure

```
├── app/                    # Next.js app directory
├── lib/                    # Utility functions
│   ├── prisma.ts          # Prisma client instance
│   └── supabase/          # Supabase client utilities
├── types/                  # TypeScript type definitions
├── prisma/                 # Prisma schema and migrations
├── middleware.ts           # Next.js middleware for auth
└── vercel.json            # Vercel deployment config
```

## Deployment to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

The `vercel.json` file is already configured to run Prisma generate before building.

## Next Steps

This is Phase 1: Project Setup. The next phases will include:
- Phase 2: Database Schema Design
- Phase 3: Authentication and Permissions
- Phase 4: Document CRUD System
- Phase 5: E-Signing and Approval Workflow
- And more...

## License

Private - Company Internal Use