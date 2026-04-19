'use client'

import { formatDateDMY } from '@/lib/utils/date-format'
import { numberToThaiText, formatMoneyValue } from '@/lib/utils/thai-number'

const COMPANY = {
  name: 'บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)',
  address: '159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510',
  taxId: 'เลขประจำตัวผู้เสียภาษี 0105559081883',
  phone: 'โทร. +666 2635 9647',
  mobile: 'เบอร์มือถือ +669 0897 9955, +668 3242 2380',
}

/* ----- APR: ใบเบิกเงินทดรองจ่าย (Advance) - replicates paper form design ----- */
export function PrintableDocumentFormAPR({ document, assignedUsers }: { document: any; assignedUsers: any }) {
  const data = (document?.data || {}) as any
  const sig = data.signatures || {}
  const items = (data.items?.items || []) as any[]
  const total = data.items?.total ?? data.totalAmount ?? 0
  const rows = items.filter((item: any) => item.description || item.amount)

  const fmtAmt = (v: any) => formatMoneyValue(v)
  const rowsPerPage = 11
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) }, (_, i) =>
    rows.slice(i * rowsPerPage, (i + 1) * rowsPerPage)
  )

  return (
    <>
      {pages.map((pageRows: any[], pageIndex: number) => (
        <div className={`adv-sheet adv-page${pageIndex < pages.length - 1 ? ' adv-page--break' : ''}`} lang="th" key={`apr-page-${pageIndex}`}>
          <div className="adv-header">
            <div className="adv-logo">
              <img src="/cheinprodlogo-removebg-preview.png" alt="Chein" />
            </div>
            <div className="adv-company">
              <p className="adv-company-name">{COMPANY.name}</p>
              <p>{COMPANY.address}</p>
              <p>{COMPANY.taxId}</p>
              <p>{COMPANY.phone}</p>
              <p>{COMPANY.mobile}</p>
            </div>
          </div>

          <div className="adv-title-box">
            <h2 className="adv-title-text">ใบเบิกเงินทดรองจ่าย (Advance)</h2>
            <div className="adv-title-meta">
              <div className="adv-meta-line">
                <span>เลขที่ ADV</span>
                <span className="adv-meta-val">{document?.documentNumber || data.advNumber || ''}</span>
              </div>
              <div className="adv-meta-line">
                <span>วันที่</span>
                <span className="adv-meta-val">{data.date ? formatDateDMY(data.date) : '..../..../....'}</span>
              </div>
            </div>
          </div>

          <div className="adv-info">
            <div className="adv-info-row">
              <div className="adv-info-cell adv-info-cell--wide">
                <span className="adv-info-label">ชื่อผู้ขอเบิก:</span>
                <span className="adv-info-val">{data.requesterName || ''}</span>
              </div>
              <div className="adv-info-cell">
                <span className="adv-info-label">วันที่ต้องใช้เงิน</span>
                <span className="adv-info-val">{data.dateMoneyNeeded ? formatDateDMY(data.dateMoneyNeeded) : '..../..../....'}</span>
              </div>
            </div>
            <div className="adv-info-row">
              <div className="adv-info-cell adv-info-cell--narrow">
                <span className="adv-info-label">ตำแหน่ง:</span>
                <span className="adv-info-val">{data.position || ''}</span>
              </div>
              <div className="adv-info-cell adv-info-cell--wide">
                <span className="adv-info-label">ส่วนงาน/ฝ่าย/แผนก</span>
                <span className="adv-info-val">{data.department || ''}</span>
              </div>
            </div>
            {(data.jobName || data.jobCode) && (
              <div className="adv-info-row">
                <div className="adv-info-cell adv-info-cell--full">
                  <span className="adv-info-label">งาน (Job):</span>
                  <span className="adv-info-val">{[data.jobCode, data.jobName].filter(Boolean).join(' – ')}</span>
                </div>
              </div>
            )}
            <div className="adv-info-row adv-info-row--col">
              <span className="adv-info-label">วัตถุประสงค์การเบิกเงินทดรองจ่าย:</span>
              <div className="adv-purpose">{data.purpose || ''}</div>
            </div>
          </div>

          <table className="adv-tbl">
            <thead>
              <tr>
                <th className="adv-tbl-no">ลำดับ</th>
                <th className="adv-tbl-desc">รายการ</th>
                <th className="adv-tbl-amt">จำนวนเงิน(บาท)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item: any, localIdx: number) => {
                const n = pageIndex * rowsPerPage + localIdx
                return (
                  <tr key={`apr-row-${n}`}>
                    <td className="adv-tbl-no">{n + 1}</td>
                    <td className="adv-tbl-desc">{[item.description, item.details].filter(Boolean).join(' ')}</td>
                    <td className="adv-tbl-amt">{fmtAmt(item.amount)}</td>
                  </tr>
                )
              })}
              {pageIndex === pages.length - 1 && (
                <tr className="adv-tbl-total">
                  <td className="adv-tbl-no" colSpan={2}>รวม</td>
                  <td className="adv-tbl-amt">{fmtAmt(total)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <>
              <div className="adv-sigs">
                <h3 className="adv-sigs-heading">เบิกเงินทดรองจ่าย</h3>
                <div className="adv-sigs-grid">
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้ขอเบิก</span>
                    <div className="adv-sig-area">
                      {sig.requesterSignature && <img src={sig.requesterSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.requesterSignatureName || data.requesterName || ''}</span>
                    <span className="adv-sig-date">{data.requesterSignatureDate ? formatDateDMY(data.requesterSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้อนุมัติ/ตรวจสอบ</span>
                    <div className="adv-sig-area">
                      {sig.approverSignature && <img src={sig.approverSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.approverSignatureName || assignedUsers?.approver?.fullName || assignedUsers?.approver?.email || ''}</span>
                    <span className="adv-sig-date">{data.approverSignatureDate ? formatDateDMY(data.approverSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้จ่ายเงิน</span>
                    <div className="adv-sig-area">
                      {sig.payerSignature && <img src={sig.payerSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.payerSignatureName || assignedUsers?.payer?.fullName || assignedUsers?.payer?.email || ''}</span>
                    <span className="adv-sig-date">{data.payerSignatureDate ? formatDateDMY(data.payerSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้รับเงิน</span>
                    <div className="adv-sig-area">
                      {sig.receiverSignature && <img src={sig.receiverSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.receiverSignatureName || data.requesterName || ''}</span>
                    <span className="adv-sig-date">{data.receiverSignatureDate ? formatDateDMY(data.receiverSignatureDate) : (data.dateMoneyNeeded ? formatDateDMY(data.dateMoneyNeeded) : '__/__/__')}</span>
                    <div className="adv-receiver-extras">
                      <div className="adv-receiver-extra-line">JV No............................</div>
                      <div className="adv-receiver-extra-line">Date: ....../....../.............</div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="adv-footer">*ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*</p>
              <p className="adv-footer">เอกสารรับเงินจะสมบูรณ์เมื่อเงินเข้าบัญชีแล้วเท่านั้น</p>
            </>
          )}
        </div>
      ))}
    </>
  )
}

/* ----- ADC: ใบเคลียร์เงินทดรองจ่าย - displays form data for comparison (amount vs actual amount) ----- */
export function PrintableDocumentFormADC({ document, assignedUsers }: { document: any; assignedUsers: any }) {
  const data = (document?.data || {}) as any
  const sig = data.signatures || {}
  const items = (data.expenseItems?.items || []) as any[]
  const rows = items.filter((item: any) => item.description || item.amount != null || item.actualAmount != null)
  const sumAmount = rows.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0)
  const totalActual = data.totalExpenses ?? rows.reduce((s: number, i: any) => s + (Number(i.actualAmount ?? i.amount) || 0), 0)
  const advanceAmount = Number(data.advanceAmount) ?? 0
  const amountToReturn = Number(data.amountToReturn) ?? 0
  const additionalAmount = Number(data.additionalAmount) ?? 0
  const transferDate =
    (typeof data.transferDate === 'string' && data.transferDate) ||
    (typeof data.transferredDate === 'string' && data.transferredDate) ||
    ''

  const fmtAmt = (v: any) => formatMoneyValue(v)
  const rowsPerPage = 9
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) }, (_, i) =>
    rows.slice(i * rowsPerPage, (i + 1) * rowsPerPage)
  )

  return (
    <>
      {pages.map((pageRows: any[], pageIndex: number) => (
        <div className={`adv-sheet adc-sheet adv-page${pageIndex < pages.length - 1 ? ' adv-page--break' : ''}`} lang="th" key={`adc-page-${pageIndex}`}>
          <div className="adv-header">
            <div className="adv-logo">
              <img src="/cheinprodlogo-removebg-preview.png" alt="Chein" />
            </div>
            <div className="adv-company">
              <p className="adv-company-name">{COMPANY.name}</p>
              <p>{COMPANY.address}</p>
              <p>{COMPANY.taxId}</p>
              <p>{COMPANY.phone}</p>
              <p>{COMPANY.mobile}</p>
            </div>
          </div>

          <div className="adv-title-box">
            <h2 className="adv-title-text">ใบเคลียร์เงินทดรองจ่าย</h2>
            <div className="adv-title-meta">
              <div className="adv-meta-line">
                <span>เลขที่ CRE</span>
                <span className="adv-meta-val">{(document?.documentNumber || data.creNumber || '').replace(/^(CRE[\s\-]*)+/i, '')}</span>
              </div>
              <div className="adv-meta-line">
                <span>วันที่ทำเอกสาร</span>
                <span className="adv-meta-val">{data.date ? formatDateDMY(data.date) : '..../..../....'}</span>
              </div>
              <div className="adv-meta-line">
                <span>วันที่เคลียร์ทดลองจ่าย</span>
                <span className="adv-meta-val">{data.dateMoneyNeeded ? formatDateDMY(data.dateMoneyNeeded) : '..../..../....'}</span>
              </div>
              <div className="adv-meta-line">
                <span>วันที่โอนเงิน</span>
                <span className="adv-meta-val">{transferDate ? formatDateDMY(transferDate) : '..../..../....'}</span>
              </div>
            </div>
          </div>

          <div className="adv-info">
            <div className="adv-info-row">
              <div className="adv-info-cell adv-info-cell--full">
                <span className="adv-info-label">ชื่อผู้ขอเบิก:</span>
                <span className="adv-info-val">{data.requesterName || ''}</span>
              </div>
            </div>
            <div className="adv-info-row">
              <div className="adv-info-cell adv-info-cell--narrow">
                <span className="adv-info-label">ตำแหน่ง:</span>
                <span className="adv-info-val">{data.position || ''}</span>
              </div>
              <div className="adv-info-cell adv-info-cell--wide">
                <span className="adv-info-label">ส่วนงาน/ฝ่าย/แผนก</span>
                <span className="adv-info-val">{data.department || ''}</span>
              </div>
            </div>
            {(data.jobName || data.jobCode) && (
              <div className="adv-info-row">
                <div className="adv-info-cell adv-info-cell--full">
                  <span className="adv-info-label">งาน (Job):</span>
                  <span className="adv-info-val">{[data.jobCode, data.jobName].filter(Boolean).join(' – ')}</span>
                </div>
              </div>
            )}
            <div className="adv-info-row">
              <div className="adv-info-cell adv-info-cell--full">
                <span className="adv-info-label">อ้างอิงเลขที่ใบเบิกเงินทดรองจ่าย:</span>
                <span className="adv-info-val">{data.advReference || ''}</span>
              </div>
            </div>
            <div className="adv-info-row adv-info-row--col">
              <span className="adv-info-label">สรุปผลการไปปฏิบัติงาน</span>
              <div className="adv-purpose">{data.workSummary || ''}</div>
            </div>
          </div>

          <table className="adc-tbl">
            <thead>
              <tr>
                <th className="adc-tbl-no">ลำดับ</th>
                <th className="adc-tbl-desc">รายการ</th>
                <th className="adc-tbl-amt">จำนวนเงิน(บาท)</th>
                <th className="adc-tbl-amt">จำนวนเงินที่ใช้จริง (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item: any, localIdx: number) => {
                const n = pageIndex * rowsPerPage + localIdx
                return (
                  <tr key={item.id || `adc-row-${n}`}>
                    <td className="adc-tbl-no">{n + 1}</td>
                    <td className="adc-tbl-desc">{item.description || ''}</td>
                    <td className="adc-tbl-amt">{fmtAmt(item.amount)}</td>
                    <td className="adc-tbl-amt">{fmtAmt(item.actualAmount ?? item.amount)}</td>
                  </tr>
                )
              })}
              {pageIndex === pages.length - 1 && (
                <>
                  <tr className="adc-tbl-total">
                    <td className="adc-tbl-no">รวม</td>
                    <td className="adc-tbl-desc" />
                    <td className="adc-tbl-amt">{fmtAmt(sumAmount)}</td>
                    <td className="adc-tbl-amt">{fmtAmt(totalActual)}</td>
                  </tr>
                  <tr className="adc-tbl-summary">
                    <td colSpan={2} className="adc-tbl-summary-label">รวมค่าใช้จ่าย</td>
                    <td className="adc-tbl-amt">{fmtAmt(sumAmount)}</td>
                    <td className="adc-tbl-amt">{fmtAmt(totalActual)}</td>
                  </tr>
                  <tr className="adc-tbl-summary">
                    <td colSpan={2} className="adc-tbl-summary-label">(หัก) จำนวนที่เบิกทดรอง</td>
                    <td className="adc-tbl-amt" colSpan={2}>{fmtAmt(advanceAmount)}</td>
                  </tr>
                  <tr className="adc-tbl-summary">
                    <td colSpan={2} className="adc-tbl-summary-label">จำนวนที่เหลือส่งคืน</td>
                    <td className="adc-tbl-amt" colSpan={2}>{fmtAmt(amountToReturn)}</td>
                  </tr>
                  <tr className="adc-tbl-summary adc-tbl-summary-last">
                    <td colSpan={2} className="adc-tbl-summary-label">จำนวนที่เบิกเพิ่ม</td>
                    <td className="adc-tbl-amt" colSpan={2}>{fmtAmt(additionalAmount)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {pageIndex === pages.length - 1 && (
            <>
              <div className="adv-sigs">
                <h3 className="adv-sigs-heading">เคลียร์เงินทดรองจ่าย</h3>
                <div className="adv-sigs-grid">
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้ขอเคลียร์</span>
                    <div className="adv-sig-area">
                      {sig.requesterSignature && <img src={sig.requesterSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.requesterSignatureName || data.requesterName || ''}</span>
                    <span className="adv-sig-date">{data.requesterSignatureDate ? formatDateDMY(data.requesterSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้อนุมัติ/ตรวจสอบ</span>
                    <div className="adv-sig-area">
                      {sig.approverSignature && <img src={sig.approverSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.approverSignatureName || assignedUsers?.approver?.fullName || assignedUsers?.approver?.email || ''}</span>
                    <span className="adv-sig-date">{data.approverSignatureDate ? formatDateDMY(data.approverSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ผู้รับเคลียร์เงิน</span>
                    <div className="adv-sig-area">
                      {sig.recipientSignature && <img src={sig.recipientSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.recipientSignatureName || assignedUsers?.recipient?.fullName || assignedUsers?.recipient?.email || ''}</span>
                    <span className="adv-sig-date">{data.recipientSignatureDate ? formatDateDMY(data.recipientSignatureDate) : '__/__/__'}</span>
                  </div>
                  <div className="adv-sig-col">
                    <span className="adv-sig-label">ฝ่ายบัญชี/การเงิน</span>
                    <div className="adv-sig-area">
                      {sig.financeManagerSignature && <img src={sig.financeManagerSignature} alt="" />}
                    </div>
                    <div className="adv-sig-line" />
                    <span className="adv-sig-name">{data.financeManagerSignatureName || assignedUsers?.payer?.fullName || assignedUsers?.payer?.email || 'tassanee@cheinproduction.co.th'}</span>
                    <span className="adv-sig-date">{data.financeManagerSignatureDate ? formatDateDMY(data.financeManagerSignatureDate) : '__/__/__'}</span>
                  </div>
                </div>
              </div>

              <p className="adv-footer">*ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*</p>
              <p className="adv-footer">เอกสารรับเงินจะสมบูรณ์เมื่อเงินเข้าบัญชีแล้วเท่านั้น</p>
            </>
          )}
        </div>
      ))}
    </>
  )
}

export function PrintableDocumentForm({ document, assignedUsers }: { document: any; assignedUsers: any }) {
  const slug = document?.formTemplate?.slug || ''
  const isADC = slug === 'advance-payment-clearance'
  const cancelNote =
    document?.status === 'CANCELLED' && (document?.data as any)?.cancellationRemark
      ? String((document.data as any).cancellationRemark)
      : null

  const cancelledBanner = cancelNote ? (
    <div className="adv-cancelled-banner-print" lang="th">
      <p>
        <strong>ยกเลิกแล้ว</strong> — {cancelNote}
      </p>
    </div>
  ) : null

  if (isADC) {
    return (
      <>
        {cancelledBanner}
        <PrintableDocumentFormADC document={document} assignedUsers={assignedUsers} />
      </>
    )
  }
  return (
    <>
      {cancelledBanner}
      <PrintableDocumentFormAPR document={document} assignedUsers={assignedUsers} />
    </>
  )
}
