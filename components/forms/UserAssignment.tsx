'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/Input'

interface User {
  id: string
  email: string
  fullName: string | null
  role: string
}

interface UserAssignmentProps {
  workflowSteps?: Array<{
    id: string
    stepNumber: number
    name: string
    assigneeId?: string | null
    assigneeRole?: string | null
  }>
  onAssignmentsChange: (assignments: Record<string, string>) => void
}

export function UserAssignment({ workflowSteps = [], onAssignmentsChange }: UserAssignmentProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    // Initialize assignments from workflow steps
    const initial: Record<string, string> = {}
    workflowSteps.forEach((step) => {
      if (step.assigneeId) {
        initial[step.id] = step.assigneeId
      }
    })
    setAssignments(initial)
    onAssignmentsChange(initial)
  }, [workflowSteps])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users?limit=100')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignmentChange = (stepId: string, userId: string) => {
    const newAssignments = { ...assignments, [stepId]: userId }
    setAssignments(newAssignments)
    onAssignmentsChange(newAssignments)
  }

  if (loading) {
    return <div className="text-sm text-gray-600">โหลด...</div>
  }

  if (workflowSteps.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Assign Approvers</h3>
      <p className="text-sm text-gray-600">
        Select specific users to approve each step. Leave empty to use role-based approval.
      </p>
      
      {workflowSteps.map((step) => (
        <div key={step.id} className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {step.name} (Step {step.stepNumber})
            {step.assigneeRole && (
              <span className="ml-2 text-xs text-gray-500">
                (Default: {step.assigneeRole})
              </span>
            )}
          </label>
          <select
            value={assignments[step.id] || ''}
            onChange={(e) => handleAssignmentChange(step.id, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Use role-based approval ({step.assigneeRole || 'Any'})</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName || user.email} ({user.role})
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

