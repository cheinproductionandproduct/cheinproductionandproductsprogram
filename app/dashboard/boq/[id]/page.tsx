'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import '../../dashboard.css'
import '../boq.css'

const EDITOR_EMAIL = 'bee@cheinproduction.co.th'

/* ── Types ─────────────────────────────────────────────── */

type SubRow = {
  id: string
  refPage: string
  refCode: string
  description: string
  quantity: number | ''
  unit: string
  materialPrice: number | ''
  laborPrice: number | ''
  note: string
}

type Section = {
  id: string
  title: string
  subRows: SubRow[]
}

type Group = {
  id: string
  title: string
  sections: Section[]
}

/* ── Helpers ────────────────────────────────────────────── */

let _uid = 0
const uid = () => String(++_uid)

const emptySubRow = (): SubRow => ({
  id: `sr-${uid()}`,
  refPage: '',
  refCode: '',
  description: '',
  quantity: '',
  unit: '',
  materialPrice: '',
  laborPrice: '',
  note: '',
})

const calcMaterialAmount = (sr: SubRow) =>
  (Number(sr.quantity) || 0) * (Number(sr.materialPrice) || 0)

const calcLaborAmount = (sr: SubRow) =>
  (Number(sr.quantity) || 0) * (Number(sr.laborPrice) || 0)

const emptySection = (): Section => {
  const id = `sec-${uid()}`
  return { id, title: '', subRows: [emptySubRow()] }
}

const emptyGroup = (): Group => ({
  id: `grp-${uid()}`,
  title: '',
  sections: [emptySection()],
})

const calcSubRowTotal = (sr: SubRow, showMaterial = true) =>
  (showMaterial ? calcMaterialAmount(sr) : 0) + calcLaborAmount(sr)

const calcGroupTotal = (group: Group, showMaterial = true) =>
  group.sections.flatMap(s => s.subRows).reduce((sum, sr) => sum + calcSubRowTotal(sr, showMaterial), 0)

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/* ── NumInput ────────────────────────────────────────────── */
function NumInput({
  value, onChange, className = '', readOnly = false,
}: {
  value: number | ''
  onChange: (v: number | '') => void
  className?: string
  readOnly?: boolean
}) {
  const [localStr, setLocalStr] = useState<string | null>(null)
  const display = localStr !== null ? localStr : (value === '' ? '' : fmt(value as number))
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={display}
      readOnly={readOnly}
      onFocus={() => { if (!readOnly) setLocalStr(value === '' ? '' : String(value)) }}
      onBlur={e => {
        if (readOnly) return
        const raw = e.target.value.replace(/,/g, '')
        const n = parseFloat(raw)
        onChange(raw === '' || isNaN(n) ? '' : n)
        setLocalStr(null)
      }}
      onChange={e => {
        if (readOnly) return
        const raw = e.target.value
        setLocalStr(raw)
        const n = parseFloat(raw.replace(/,/g, ''))
        if (raw === '' || raw === '-') onChange('')
        else if (!isNaN(n)) onChange(n)
      }}
    />
  )
}

/* ── Page ────────────────────────────────────────────────── */

export default function BoqEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const canEdit = user?.email === EDITOR_EMAIL

  const [jobName, setJobName] = useState('')
  const [boqExists, setBoqExists] = useState(false)
  const [groups, setGroups] = useState<Group[]>([emptyGroup()])
  const [showMaterialColumns, setShowMaterialColumns] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const editing = canEdit && isEditing

  /* load BOQ */
  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/boq/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.boq) {
          setJobName(d.boq.job?.name || d.boq.title || '')
          setBoqExists(true)
          setGroups((d.boq.data as Group[])?.length ? d.boq.data as Group[] : [emptyGroup()])
          setShowMaterialColumns(d.boq.showMaterial ?? true)
          setIsEditing(false)
        } else {
          router.replace('/dashboard/boq')
        }
      })
      .catch(() => router.replace('/dashboard/boq'))
      .finally(() => setLoading(false))
  }, [id, router])

  /* save */
  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/boq/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: groups, showMaterial: showMaterialColumns }),
      })
      if (!res.ok) throw new Error()
      setIsEditing(false)
    } catch {
      setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  /* ── mutations ── */
  const addGroup = () => setGroups(p => [...p, emptyGroup()])
  const deleteGroup = (gid: string) => setGroups(p => { const f = p.filter(g => g.id !== gid); return f.length ? f : [emptyGroup()] })
  const updateGroupTitle = (gid: string, t: string) => setGroups(p => p.map(g => g.id === gid ? { ...g, title: t } : g))
  const addSection = (gid: string) => setGroups(p => p.map(g => g.id === gid ? { ...g, sections: [...g.sections, emptySection()] } : g))
  const deleteSection = (gid: string, sid: string) => setGroups(p => p.map(g => { if (g.id !== gid) return g; const f = g.sections.filter(s => s.id !== sid); return { ...g, sections: f.length ? f : [emptySection()] } }))
  const updateSectionTitle = (gid: string, sid: string, t: string) => setGroups(p => p.map(g => g.id !== gid ? g : { ...g, sections: g.sections.map(s => s.id === sid ? { ...s, title: t } : s) }))
  const addSubRow = (gid: string, sid: string) => setGroups(p => p.map(g => g.id !== gid ? g : { ...g, sections: g.sections.map(s => s.id !== sid ? s : { ...s, subRows: [...s.subRows, emptySubRow()] }) }))
  const deleteSubRow = (gid: string, sid: string, rid: string) => setGroups(p => p.map(g => g.id !== gid ? g : { ...g, sections: g.sections.map(s => { if (s.id !== sid) return s; const f = s.subRows.filter(r => r.id !== rid); return { ...s, subRows: f.length ? f : [emptySubRow()] } }) }))
  const updateSubRow = (gid: string, sid: string, rid: string, field: keyof SubRow, val: string | number) =>
    setGroups(p => p.map(g => g.id !== gid ? g : { ...g, sections: g.sections.map(s => s.id !== sid ? s : { ...s, subRows: s.subRows.map(r => r.id === rid ? { ...r, [field]: val } : r) }) }))

  /* ── column math ── */
  const totalCols = showMaterialColumns ? 13 : 11
  const sectionTitleSpan = totalCols - 4
  const groupTitleSpan = totalCols - 2

  /* ── summary totals ── */
  const grandTotal = groups.reduce((sum, g) => sum + calcGroupTotal(g, showMaterialColumns), 0)
  const overhead = grandTotal * 0.12
  const subTotal = grandTotal + overhead
  const vat = subTotal * 0.07
  const totalWithVat = subTotal + vat

  let globalSecIdx = 0

  const SummaryRow = ({ label, amount, highlight }: { label: string; amount: string; highlight: boolean }) => {
    const hl = highlight ? ' boq-summary-label--highlight' : ''
    return (
      <tr>
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td boq-summary-label${hl}`}>{label}</td>
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td${hl}`}></td>
        {showMaterialColumns && <><td className={`boq-td${hl}`}></td><td className={`boq-td${hl}`}></td></>}
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td boq-td-num boq-summary-dash${hl}`}>-</td>
        <td className={`boq-td boq-td-num boq-summary-amount${hl}`}>{amount}</td>
        <td className={`boq-td${hl}`}></td>
        <td className={`boq-td${hl}`}></td>
      </tr>
    )
  }

  if (loading) {
    return (
      <div className="list-page boq-page">
        <p style={{ padding: 32, color: '#888' }}>กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <div className="list-page boq-page">
      <header className="list-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">{jobName || 'Bill of Quantities — ไม่ระบุงาน'}</p>
        </div>
        {!canEdit && <span className="boq-readonly-badge">ดูเท่านั้น</span>}
        {canEdit && !isEditing && boqExists && <span className="boq-saved-badge">บันทึกแล้ว</span>}
      </header>

      <div className="boq-top-bar">
        <Link href="/dashboard/boq" className="form-button boq-back-btn">
          ← กลับรายการ BOQ
        </Link>
        <span className="boq-job-chip">{jobName}</span>
      </div>

      <div className="boq-table-wrapper">
        <table className="boq-table">
          <thead>
            <tr>
              <th rowSpan={2} className="boq-th boq-th-no">ลำดับที่</th>
              <th colSpan={2} className="boq-th">อ้างอิง ID</th>
              <th rowSpan={2} className="boq-th boq-th-desc">รายการ</th>
              <th rowSpan={2} className="boq-th boq-th-qty">จำนวน</th>
              <th rowSpan={2} className="boq-th boq-th-unit">หน่วย</th>
              {showMaterialColumns && (
                <th colSpan={2} className="boq-th boq-th-has-toggle">
                  <button type="button" className="boq-material-toggle-btn"
                    onClick={() => setShowMaterialColumns(false)} title="ซ่อนค่าวัสดุสิ่งก่อสร้าง">−</button>
                  ราคาวัสดุสิ่งก่อสร้าง
                </th>
              )}
              <th colSpan={2} className={!showMaterialColumns ? 'boq-th boq-th-has-toggle' : 'boq-th'}>
                {!showMaterialColumns && (
                  <button type="button" className="boq-material-toggle-btn"
                    onClick={() => setShowMaterialColumns(true)} title="แสดงค่าวัสดุสิ่งก่อสร้าง">+</button>
                )}
                {showMaterialColumns ? 'ค่าแรงงาน' : 'ค่าแรงงาน+ค่าวัสดุ'}
              </th>
              <th rowSpan={2} className="boq-th boq-th-total">ค่าวัสดุ<br />และแรงงาน</th>
              <th rowSpan={2} className="boq-th boq-th-note">หมายเหตุ</th>
              <th rowSpan={2} className="boq-th boq-th-action"></th>
            </tr>
            <tr>
              <th className="boq-th boq-th-sub">เลขหน้า</th>
              <th className="boq-th boq-th-sub">รหัส</th>
              {showMaterialColumns && (<><th className="boq-th boq-th-sub">ราคาต่อหน่วย</th><th className="boq-th boq-th-sub">จำนวนเงิน</th></>)}
              <th className="boq-th boq-th-sub">ราคาต่อหน่วย</th>
              <th className="boq-th boq-th-sub">จำนวนเงิน</th>
            </tr>
          </thead>

          <tbody>
            {groups.map((group, groupIdx) => {
              const groupStartSec = globalSecIdx + 1
              globalSecIdx += group.sections.length
              const groupEndSec = globalSecIdx
              const groupTotal = calcGroupTotal(group, showMaterialColumns)
              return (
                <React.Fragment key={group.id}>
                  <tr className="boq-group-header-row">
                    <td className="boq-td boq-td-group-no">{groupIdx + 1}</td>
                    <td colSpan={groupTitleSpan} className="boq-td boq-td-group-title-cell">
                      <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing}
                        onChange={e => editing && updateGroupTitle(group.id, e.target.value)}
                        placeholder={`หมวดงานที่ ${groupIdx + 1} — พิมพ์ชื่อหมวดงาน`} />
                    </td>
                    <td className="boq-td boq-td-action">
                      {editing && (
                        <div className="boq-action-cell">
                          <button type="button" className="boq-btn boq-action-btn-section-del"
                            onClick={() => deleteGroup(group.id)} disabled={groups.length <= 1} title="ลบหมวดงานนี้">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                          <button type="button" className="boq-btn boq-action-btn-add"
                            onClick={() => addSection(group.id)} title="เพิ่มข้อในหมวดนี้">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {group.sections.map((section, secIdx) => {
                    const globalNum = groupStartSec + secIdx
                    return (
                      <React.Fragment key={section.id}>
                        <tr className="boq-section-header-row">
                          <td className="boq-td boq-td-no boq-td-section-no">{globalNum}</td>
                          <td className="boq-td"></td>
                          <td className="boq-td"></td>
                          <td colSpan={sectionTitleSpan} className="boq-td boq-td-section-title-cell">
                            <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing}
                              onChange={e => editing && updateSectionTitle(group.id, section.id, e.target.value)}
                              placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                          </td>
                          <td className="boq-td boq-td-action"></td>
                        </tr>

                        {section.subRows.map((sr, srIdx) => (
                          <tr key={sr.id} className="boq-row">
                            <td className="boq-td boq-td-no boq-td-sub-no">{globalNum}.{srIdx + 1}</td>
                            <td className="boq-td"><input className="boq-input" value={sr.refPage} readOnly={!editing} onChange={e => editing && updateSubRow(group.id, section.id, sr.id, 'refPage', e.target.value)} /></td>
                            <td className="boq-td"><input className="boq-input" value={sr.refCode} readOnly={!editing} onChange={e => editing && updateSubRow(group.id, section.id, sr.id, 'refCode', e.target.value)} /></td>
                            <td className="boq-td boq-td-desc">
                              <input className="boq-input" value={sr.description} readOnly={!editing}
                                onChange={e => editing && updateSubRow(group.id, section.id, sr.id, 'description', e.target.value)}
                                placeholder={editing ? `รายการที่ ${globalNum}.${srIdx + 1}` : ''} />
                            </td>
                            <td className="boq-td boq-td-num">
                              <NumInput className="boq-input boq-input-num" value={sr.quantity} readOnly={!editing}
                                onChange={v => editing && updateSubRow(group.id, section.id, sr.id, 'quantity', v)} />
                            </td>
                            <td className="boq-td"><input className="boq-input boq-input-sm" value={sr.unit} readOnly={!editing} onChange={e => editing && updateSubRow(group.id, section.id, sr.id, 'unit', e.target.value)} /></td>
                            {showMaterialColumns && (
                              <>
                                <td className="boq-td boq-td-num">
                                  <NumInput className="boq-input boq-input-num" value={sr.materialPrice} readOnly={!editing}
                                    onChange={v => editing && updateSubRow(group.id, section.id, sr.id, 'materialPrice', v)} />
                                </td>
                                <td className="boq-td boq-td-num boq-td-calc">{fmt(calcMaterialAmount(sr))}</td>
                              </>
                            )}
                            <td className="boq-td boq-td-num">
                              <NumInput className="boq-input boq-input-num" value={sr.laborPrice} readOnly={!editing}
                                onChange={v => editing && updateSubRow(group.id, section.id, sr.id, 'laborPrice', v)} />
                            </td>
                            <td className="boq-td boq-td-num boq-td-calc">{fmt(calcLaborAmount(sr))}</td>
                            <td className="boq-td boq-td-num boq-td-total">{fmt(calcSubRowTotal(sr, showMaterialColumns))}</td>
                            <td className="boq-td boq-td-note"><input className="boq-input" value={sr.note} readOnly={!editing} onChange={e => editing && updateSubRow(group.id, section.id, sr.id, 'note', e.target.value)} /></td>
                            <td className="boq-td boq-td-action">
                              {editing && (
                                <div className="boq-action-cell">
                                  {srIdx === 0 && (
                                    <>
                                      <button type="button" className="boq-btn boq-action-btn-section-del"
                                        onClick={() => deleteSection(group.id, section.id)} disabled={group.sections.length <= 1} title="ลบข้อนี้">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                                        </svg>
                                      </button>
                                      <button type="button" className="boq-btn boq-action-btn-add"
                                        onClick={() => addSubRow(group.id, section.id)} title="เพิ่มรายการย่อย">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                  <button type="button" className="boq-btn boq-action-btn-del-row"
                                    onClick={() => deleteSubRow(group.id, section.id, sr.id)} disabled={section.subRows.length <= 1} title="ลบแถวนี้">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}

                  <SummaryRow
                    label={`รวม${group.title || `หมวดงานที่ ${groupIdx + 1}`} ข้อ ${groupStartSec}${groupStartSec !== groupEndSec ? `–${groupEndSec}` : ''}`}
                    amount={fmt(groupTotal)} highlight={false} />
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <SummaryRow label="ค่าดำเนินงาน 12%" amount={fmt(overhead)} highlight={false} />
            <SummaryRow label="รวมราคาทั้งสิ้น" amount={fmt(subTotal)} highlight={true} />
            <SummaryRow label="ภาษีมูลค่าเพิ่ม 7%" amount={fmt(vat)} highlight={false} />
            <SummaryRow label="ราคารวมภาษีมูลค่าเพิ่ม" amount={fmt(totalWithVat)} highlight={false} />
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <div className="boq-actions">
          {editing && (
            <button type="button" className="boq-add-row-btn" onClick={addGroup}>
              + เพิ่มหมวดงาน
            </button>
          )}
          {editing ? (
            <button type="button" className="boq-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
          ) : (
            <button type="button" className="boq-edit-btn" onClick={() => setIsEditing(true)}>
              ✏️ แก้ไข
            </button>
          )}
          {saveError && <span className="boq-save-error">{saveError}</span>}
        </div>
      )}
    </div>
  )
}
