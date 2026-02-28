'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Document, User, DocumentStatus } from '@prisma/client'
import { formatDateDMY } from '@/lib/utils/date-format'
import { SignatureModal } from './SignatureModal'

interface DocumentDetailProps {
  document: any
  currentUser: User
}

export function DocumentDetail({ document, currentUser }: DocumentDetailProps) {
  const [loading, setLoading] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const router = useRouter()

  const getStatusBadge = (status: DocumentStatus) => {
    const badges: Record<DocumentStatus, string> = {
      DRAFT: 'bg-white text-black border border-black',
      PENDING: 'bg-white text-black border border-black',
      APPROVED: 'bg-white text-black border border-black',
      REJECTED: 'bg-white text-black border border-black',
      CANCELLED: 'bg-white text-black border border-black',
    }
    return badges[status] || badges.DRAFT
  }

  const handleSubmit = async () => {
    if (!confirm('Are you sure you want to submit this document for approval?')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/documents/${document.id}/submit`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to submit document')
      }

      router.refresh()
    } catch (error: any) {
      alert(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      router.push('/documents')
    } catch (error: any) {
      alert(error.message || 'An error occurred')
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    try {
      const response = await fetch(`/api/documents/${document.id}/export/pdf`)
      if (!response.ok) {
        throw new Error('Failed to export PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${document.documentNumber || document.id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert(error.message || 'Failed to export PDF')
    }
  }

  const handleExportExcel = async () => {
    try {
      const response = await fetch(`/api/documents/${document.id}/export/excel`)
      if (!response.ok) {
        throw new Error('Failed to export Excel')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${document.documentNumber || document.id}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert(error.message || 'Failed to export Excel')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const formConfig = document.formTemplate.fields as any
  const fields = formConfig?.fields || []
  const data = document.data as Record<string, any>

  const canEdit = document.status === 'DRAFT' && document.createdById === currentUser.id
  const canSubmit = document.status === 'DRAFT' && document.createdById === currentUser.id
  const canDelete = document.status === 'DRAFT' && document.createdById === currentUser.id
  
  // Find if current user has a pending approval
  const pendingApproval = document.approvals?.find(
    (approval: any) => 
      approval.status === 'PENDING' && 
      approval.approverId === currentUser.id
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow border border-black">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-black">
                {document.title}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusBadge(
                  document.status
                )}`}
              >
                {document.status}
              </span>
            </div>
            <p className="mt-2 text-black">
              {document.formTemplate.name} • {document.documentNumber || 'No number'}
            </p>
            <p className="mt-1 text-sm text-black">
              Created by {document.creator.fullName || document.creator.email} on{' '}
              {formatDateDMY(document.createdAt)}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <Link
                href={`/documents/${document.id}/edit`}
                className="rounded-md border-2 border-black px-4 py-2 text-sm text-black transition-colors hover:bg-gray-100"
              >
                Edit
              </Link>
            )}
            {canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-md bg-red-600 border-2 border-black px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Submit for Approval
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="btn-delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                Delete
              </button>
            )}
            {pendingApproval && (
              <button
                onClick={() => setShowSignModal(true)}
                className="rounded-md bg-red-600 border-2 border-black px-4 py-2 text-sm text-white transition-colors hover:bg-red-700"
              >
                Sign
              </button>
            )}
            <button
              onClick={handleExportPDF}
              className="rounded-md border-2 border-black px-4 py-2 text-sm text-black transition-colors hover:bg-gray-100"
            >
              Export PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="rounded-md border-2 border-black px-4 py-2 text-sm text-black transition-colors hover:bg-gray-100"
            >
              Export Excel
            </button>
            <button
              onClick={handlePrint}
              className="rounded-md border-2 border-black px-4 py-2 text-sm text-black transition-colors hover:bg-gray-100"
            >
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Form Data */}
      <div className="rounded-lg bg-white p-6 shadow border border-black">
        <h3 className="mb-4 text-lg font-semibold text-black">
          Form Data
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field: any) => {
            // Special handling for items-table
            if (field.type === 'items-table' && data[field.name]) {
              const itemsData = data[field.name]
              const items = itemsData.items || []
              return (
                <div key={field.name} className="sm:col-span-2">
                  <dt className="text-sm font-medium text-black mb-2">
                    {field.label}
                  </dt>
                  <dd className="mt-1">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-black border border-black">
                        <thead className="bg-white border-b-2 border-black">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-black">
                              ลำดับ
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-black">
                              รายการ
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-black">
                              จำนวนเงิน(บาท)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black bg-white">
                          {items.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-black">
                                {index + 1}
                              </td>
                              <td className="px-4 py-2 text-sm text-black">
                                {item.description || '—'}
                              </td>
                              <td className="px-4 py-2 text-sm text-black">
                                {item.amount ? Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} บาท
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-white border-t-2 border-black">
                          <tr>
                            <td colSpan={2} className="px-4 py-2 text-right text-sm font-medium text-black">
                              รวม (Total)
                            </td>
                            <td className="px-4 py-2 text-sm font-bold text-black">
                              {itemsData.total ? Number(itemsData.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'} บาท
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </dd>
                </div>
              )
            }
            
            return (
              <div key={field.name}>
                <dt className="text-sm font-medium text-black">
                  {field.label}
                </dt>
                <dd className="mt-1 text-sm text-black">
                  {data[field.name] !== undefined && data[field.name] !== null
                    ? String(data[field.name])
                    : '—'}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      {/* Approvals & Signatures */}
      {document.approvals && document.approvals.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow border border-black">
          <h3 className="mb-4 text-lg font-semibold text-black">
            Approval Status & Signatures
          </h3>
          
          {/* Signature Boxes Grid - 4 columns matching the form */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {document.approvals
              .sort((a: any, b: any) => a.workflowStep.stepNumber - b.workflowStep.stepNumber)
              .map((approval: any) => (
                <div
                  key={approval.id}
                  className="rounded border-2 border-black p-4"
                >
                  <p className="mb-2 text-sm font-medium text-black">
                    {approval.workflowStep.name}
                  </p>
                  
                  {approval.status === 'APPROVED' && approval.signatureData ? (
                    <div className="space-y-2">
                      <img
                        src={approval.signatureData}
                        alt="Signature"
                        className="h-20 w-full border border-black bg-white object-contain"
                      />
                      <p className="text-xs text-black">
                        {approval.approver?.fullName || approval.approver?.email || 'Signed'}
                      </p>
                      <p className="text-xs text-black">
                        {approval.approvedAt
                          ? formatDateDMY(approval.approvedAt)
                          : ''}
                      </p>
                    </div>
                  ) : approval.status === 'REJECTED' ? (
                    <div className="space-y-2">
                      <div className="flex h-20 items-center justify-center rounded border-2 border-dashed border-red-600 bg-red-50">
                        <span className="text-xs font-medium text-red-600">
                          REJECTED
                        </span>
                      </div>
                      <p className="text-xs text-black">
                        {approval.approver?.fullName || approval.approver?.email || 'Rejected'}
                      </p>
                      {approval.comments && (
                        <p className="text-xs text-red-600">
                          {approval.comments}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-20 items-center justify-center rounded border-2 border-dashed border-black bg-white">
                      <span className="text-xs text-black">Pending</span>
                    </div>
                  )}
                  
                  {approval.comments && approval.status === 'APPROVED' && (
                    <p className="mt-2 text-xs text-black">
                      {approval.comments}
                    </p>
                  )}
                </div>
              ))}
          </div>

          {/* Detailed Approval List */}
          <div className="mt-6 border-t border-black pt-4">
            <h4 className="mb-3 text-sm font-semibold text-black">
              Approval Details
            </h4>
            <div className="space-y-2">
              {document.approvals
                .sort((a: any, b: any) => a.workflowStep.stepNumber - b.workflowStep.stepNumber)
                .map((approval: any) => (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between rounded border border-black p-3"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-black">
                        Step {approval.workflowStep.stepNumber}: {approval.workflowStep.name}
                      </p>
                      <p className="text-sm text-black">
                        {approval.approver?.fullName || approval.approver?.email || 'Pending'}
                      </p>
                      {approval.comments && (
                        <p className="mt-1 text-sm text-black">
                          {approval.comments}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 text-right">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium border border-black ${
                          approval.status === 'APPROVED'
                            ? 'bg-white text-black'
                            : approval.status === 'REJECTED'
                            ? 'bg-white text-black'
                            : 'bg-white text-black'
                        }`}
                      >
                        {approval.status}
                      </span>
                      {(approval.approvedAt || approval.rejectedAt) && (
                        <p className="mt-1 text-xs text-black">
                          {formatDateDMY(approval.approvedAt || approval.rejectedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Versions */}
      {document.versions && document.versions.length > 1 && (
        <div className="rounded-lg bg-white p-6 shadow border border-black">
          <h3 className="mb-4 text-lg font-semibold text-black">
            Version History
          </h3>
          <div className="space-y-2">
            {document.versions.map((version: any) => (
              <div
                key={version.id}
                className="flex items-center justify-between rounded border border-black p-3"
              >
                <div>
                  <p className="font-medium text-black">
                    Version {version.version}
                  </p>
                  <p className="text-sm text-black">
                    {version.changeNote} • {formatDateDMY(version.createdAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
                    version.status
                  )}`}
                >
                  {version.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Signature Modal for Signing */}
      {showSignModal && pendingApproval && (
        <SignatureModal
          approval={pendingApproval}
          onClose={() => {
            setShowSignModal(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
