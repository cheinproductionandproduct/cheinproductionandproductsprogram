'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdvancePaymentRequestForm } from '@/components/forms/AdvancePaymentRequestForm';
import type { FormField } from '@/types/database';
import { formatDateDMY } from '@/lib/utils/date-format';
import '../dashboard.css';

export default function AdvancePaymentRequestPage() {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    async function fetchTemplateAndNumber() {
      try {
        // Fetch template and document number in parallel
        const [templateResponse, numberResponse] = await Promise.all([
          fetch('/api/form-templates'),
          fetch('/api/documents/generate-number?formTemplateSlug=advance-payment-request'),
        ]);
        
        if (!templateResponse.ok) {
          const errorData = await templateResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch templates: ${templateResponse.status} ${templateResponse.statusText}`);
        }
        
        const data = await templateResponse.json();
        const templates = data.templates || [];
        
        if (templates.length === 0) {
          throw new Error('No templates found in database');
        }
        
        const template = templates.find((t: any) => t.slug === 'advance-payment-request');
        
        if (!template) {
          throw new Error('Template "advance-payment-request" not found. Available templates: ' + templates.map((t: any) => t.slug).join(', '));
        }

        const formConfig = template.fields as { fields: FormField[] };
        setFields(formConfig.fields || []);

        // Fetch document number
        if (numberResponse.ok) {
          const numberData = await numberResponse.json();
          if (numberData.documentNumber) {
            setDocumentNumber(numberData.documentNumber);
          }
        } else {
          console.warn('Failed to fetch document number, will continue without it');
        }
      } catch (err: any) {
        console.error('Error fetching template:', err);
        setError(err.message || 'Failed to load form');
      } finally {
        setLoading(false);
      }
    }

    fetchTemplateAndNumber();
  }, []);

  const handleSubmit = async (data: Record<string, any>) => {
    setSubmitting(true);
    setError(null);

    // Prevent stuck loading: clear after 12s if request or response body hangs
    const timeoutId = setTimeout(() => {
      setSubmitting(false);
      setError((e) => (e ? e : 'การบันทึกใช้เวลานาน กรุณาตรวจสอบรายการเอกสารหรือลองใหม่'));
    }, 12_000);

    try {
      const response = await fetch('/api/form-templates');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch template');
      }

      const { templates } = await response.json();
      const template = templates.find((t: any) => t.slug === 'advance-payment-request');

      if (!template) {
        throw new Error('Template not found');
      }

      const createResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formTemplateId: template.id,
          title: `${template.name} - ${formatDateDMY(new Date())}`,
          data,
          status: 'DRAFT',
          userAssignments: data.userAssignments || {},
        }),
      });

      // Clear loading as soon as we have a response (don't wait for .json() so we never get stuck)
      setSubmitting(false);
      clearTimeout(timeoutId);

      const result = await createResponse.json().catch(() => ({}));

      if (!createResponse.ok) {
        throw new Error(result.message || result.error || 'Failed to create document');
      }

      const docId = result?.document?.id;
      if (docId) {
        router.push(`/documents/${docId}`);
      } else {
        // Server may have created the doc (Prisma ran) but response body was missing/bad
        setError('เอกสารอาจสร้างแล้ว กรุณาตรวจสอบรายการเอกสาร');
      }
    } catch (err: any) {
      console.error('[AdvancePaymentRequestPage] Error in handleSubmit:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      clearTimeout(timeoutId);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="list-loading">โหลด...</div>
      </div>
    );
  }

  if (error && !fields.length) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="max-w-2xl">
          <div className="bg-red-50 border-2 border-red-600 rounded-lg p-6 mb-4">
            <h2 className="text-xl font-bold text-red-800 mb-2">โหลดฟอร์มไม่สำเร็จ</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>Possible solutions:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Make sure you are logged in</li>
                <li>Run the database seed: <code className="bg-gray-200 px-2 py-1 rounded">npm run db:seed</code></li>
                <li>Check that the form template exists in the database</li>
              </ul>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white"
      style={{ fontFamily: '"Sarabun", "Inter", system-ui, sans-serif' }}
    >
      <AdvancePaymentRequestForm
        fields={fields}
        onSubmit={handleSubmit}
        defaultValues={{
          advNumber: documentNumber,
        }}
        loading={submitting}
      />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}


