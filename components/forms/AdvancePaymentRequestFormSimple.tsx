'use client';

import React, { useState } from 'react';
import { formatDateDMY } from '@/lib/utils/date-format';

interface TableItem {
  id: number;
  description: string;
  amount: string;
}

/** Read-only document detail view: same layout as the form, filled from document data */
export function AdvancePaymentRequestFormSimpleView({
  document,
  assignedUsers = {},
}: {
  document: any;
  assignedUsers?: {
    approver?: { id: string; fullName?: string; email: string };
    payer?: { id: string; fullName?: string; email: string };
    recipient?: { id: string; fullName?: string; email: string };
  };
}) {
  const data = (document?.data || {}) as any;
  const sig = data.signatures || {};
  const itemsData = data.items?.items || [];
  const total = data.items?.total ?? data.totalAmount ?? 0;
  const rows = [...itemsData];
  while (rows.length < 5) rows.push({ description: '', details: '', amount: '' });

  const formatAmount = (val: unknown) =>
    val != null && val !== '' ? Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex justify-center">
      <div className="bg-white w-full max-w-[800px] shadow-2xl p-6 md:p-10 text-black font-sans leading-tight">
        <div className="flex flex-row items-center gap-6 mb-6">
          <div className="flex-shrink-0">
            <h1 className="text-6xl font-bold italic text-red-600 leading-none">Chein</h1>
          </div>
          <div className="text-[10px] md:text-xs text-left border-l border-gray-300 pl-6 py-1">
            <p className="font-bold text-sm">บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)</p>
            <p>159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510</p>
            <p>เลขประจำตัวผู้เสียภาษี 0105559081883</p>
            <div className="flex gap-4">
              <p>โทร. +666 2635 9647</p>
              <p>เบอร์มือถือ +669 0897 9955, +668 3242 2380</p>
            </div>
          </div>
        </div>

        <div className="border border-black relative py-6">
          <h2 className="text-lg md:text-xl font-bold uppercase text-center w-full">
            ใบเบิกเงินทดรองจ่าย (Advance)
          </h2>
          <div className="absolute right-2 bottom-2 text-[10px] md:text-xs flex flex-col items-end space-y-1">
            <div className="flex items-center w-28 md:w-32">
              <span className="whitespace-nowrap">เลขที่ ADV</span>
              <span className="ml-1 flex-1 text-center min-w-0">{document?.documentNumber || data.advNumber || ''}</span>
            </div>
            <div className="flex items-center w-28 md:w-32">
              <span className="whitespace-nowrap">วันที่</span>
              <span className="ml-1 flex-1 text-center min-w-0">{data.date ? formatDateDMY(data.date) : '……/……/……'}</span>
            </div>
          </div>
        </div>

        <div className="border-x border-b border-black">
          <div className="flex flex-col md:flex-row border-b border-black">
            <div className="flex-1 p-2 flex items-center border-b md:border-b-0 md:border-r border-black">
              <span className="text-sm mr-2 whitespace-nowrap">ชื่อผู้ขอเบิก:</span>
              <span className="flex-1">{data.requesterName || ''}</span>
            </div>
            <div className="p-2 flex items-center min-w-[200px]">
              <span className="text-sm mr-2 whitespace-nowrap">วันที่ต้องใช้เงิน:</span>
              <span className="flex-1 text-center">{data.dateMoneyNeeded ? formatDateDMY(data.dateMoneyNeeded) : '……/……/……'}</span>
            </div>
          </div>
          <div className="flex flex-col md:flex-row border-b border-black">
            <div className="flex-1 p-2 flex items-center border-b md:border-b-0 md:border-r border-black">
              <span className="text-sm mr-2">ตำแหน่ง:</span>
              <span className="flex-1">{data.position || ''}</span>
            </div>
            <div className="flex-1 p-2 flex items-center">
              <span className="text-sm mr-2 whitespace-nowrap">ส่วนงาน/ฝ่าย/แผนก:</span>
              <span className="flex-1">{data.department || ''}</span>
            </div>
          </div>
          <div className="p-2 flex flex-col">
            <span className="text-sm mb-1 font-semibold">วัตถุประสงค์การเบิกเงินทดรองจ่าย:</span>
            <div className="w-full text-sm min-h-[3.5rem]">{data.purpose || ''}</div>
          </div>
        </div>

        <table className="w-full border-collapse border-x border-black">
          <thead>
            <tr className="border-y border-black text-sm">
              <th className="border-r border-black p-1 w-12 text-center font-bold">ลำดับ</th>
              <th className="border-r border-black p-1 text-center font-bold">รายการ</th>
              <th className="p-1 w-32 md:w-48 text-center font-bold">จำนวนเงิน(บาท)</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((item: any, idx: number) => (
              <tr key={idx} className="border-b border-black text-sm">
                <td className="border-r border-black p-1 text-center">{idx + 1}</td>
                <td className="border-r border-black p-2">{[item.description, item.details].filter(Boolean).join(' ') || ''}</td>
                <td className="p-2 text-right">{formatAmount(item.amount)}</td>
              </tr>
            ))}
            <tr className="border-b border-black font-bold text-sm bg-gray-50">
              <td colSpan={2} className="border-r border-black p-2 text-center">รวม</td>
              <td className="p-2 text-right">{formatAmount(total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <h3 className="text-center font-bold text-sm mb-2 underline uppercase">เบิกเงินทดรองจ่าย</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 border border-black text-center text-[10px] md:text-xs">
            <div className="border-r border-b md:border-b-0 border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้ขอเบิก</span>
              <div className="flex flex-col items-center">
                {sig.requesterSignature ? <img src={sig.requesterSignature} alt="" className="max-h-12 object-contain border-b border-black w-full mb-1" /> : <div className="w-full border-b border-black mb-1 min-h-[2rem]" />}
                <span>{data.requesterSignatureName || data.requesterName || ''}</span>
                <span>{data.requesterSignatureDate ? formatDateDMY(data.requesterSignatureDate) : '......../......../............'}</span>
              </div>
            </div>
            <div className="border-r-0 md:border-r border-b md:border-b-0 border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้อนุมัติ/ตรวจสอบ</span>
              <div className="flex flex-col items-center">
                {sig.approverSignature ? <img src={sig.approverSignature} alt="" className="max-h-12 object-contain border-b border-black w-full mb-1" /> : <div className="w-full border-b border-black mb-1 min-h-[2rem]" />}
                <span>{data.approverSignatureName || assignedUsers?.approver?.fullName || assignedUsers?.approver?.email || ''}</span>
                <span>{data.approverSignatureDate ? formatDateDMY(data.approverSignatureDate) : '......../......../............'}</span>
              </div>
            </div>
            <div className="border-r border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้จ่ายเงิน</span>
              <div className="flex flex-col items-center">
                {sig.payerSignature ? <img src={sig.payerSignature} alt="" className="max-h-12 object-contain border-b border-black w-full mb-1" /> : <div className="w-full border-b border-black mb-1 min-h-[2rem]" />}
                <span>{data.payerSignatureName || assignedUsers?.payer?.fullName || assignedUsers?.payer?.email || ''}</span>
                <span>{data.payerSignatureDate ? formatDateDMY(data.payerSignatureDate) : '......../......../............'}</span>
              </div>
            </div>
            <div className="p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้รับเงิน</span>
              <div className="flex flex-col items-center">
                {sig.receiverSignature ? <img src={sig.receiverSignature} alt="" className="max-h-12 object-contain border-b border-black w-full mb-1" /> : <div className="w-full border-b border-black mb-1 min-h-[2rem]" />}
                <span>{data.receiverSignatureName || data.requesterName || ''}</span>
                <span>{data.receiverSignatureDate ? formatDateDMY(data.receiverSignatureDate) : (data.dateMoneyNeeded ? formatDateDMY(data.dateMoneyNeeded) : '......../......../............')}</span>
                <div className="text-[10px] text-center mt-1">
                  <div>JV No............................</div>
                  <div>Date: ....../....../.............</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-red-600 font-bold text-[10px] md:text-xs mt-6">
          *ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*
        </p>
        <p className="text-center text-red-600 font-bold text-[10px] md:text-xs mt-1">
          เอกสารรับเงินจะสมบูรณ์เมื่อเงินเข้าบัญชีแล้วเท่านั้น
        </p>
      </div>
    </div>
  );
}

export function AdvancePaymentRequestFormSimple() {
  const [items, setItems] = useState<TableItem[]>(
    Array.from({ length: 5 }, (_, i) => ({ id: i + 1, description: '', amount: '' }))
  );

  const handleAmountChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], amount: value };
    setItems(newItems);
  };

  const handleDescriptionChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], description: value };
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const val = parseFloat(item.amount) || 0;
      return sum + val;
    }, 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex justify-center">
      <div className="bg-white w-full max-w-[800px] shadow-2xl p-6 md:p-10 text-black font-sans leading-tight">
        {/* Header: Logo next to Company Details */}
        <div className="flex flex-row items-center gap-6 mb-6">
          <div className="flex-shrink-0">
            <h1 className="text-6xl font-bold italic text-red-600 leading-none">Chein</h1>
          </div>
          <div className="text-[10px] md:text-xs text-left border-l border-gray-300 pl-6 py-1">
            <p className="font-bold text-sm">บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)</p>
            <p>159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510</p>
            <p>เลขประจำตัวผู้เสียภาษี 0105559081883</p>
            <div className="flex gap-4">
              <p>โทร. +666 2635 9647</p>
              <p>เบอร์มือถือ +669 0897 9955, +668 3242 2380</p>
            </div>
          </div>
        </div>

        {/* Form Title Section */}
        <div className="border border-black relative py-6">
          <h2 className="text-lg md:text-xl font-bold uppercase text-center w-full">
            ใบเบิกเงินทดรองจ่าย (Advance)
          </h2>
          <div className="absolute right-2 bottom-2 text-[10px] md:text-xs flex flex-col items-end space-y-1">
            <div className="flex items-center w-28 md:w-32">
              <span className="whitespace-nowrap">เลขที่ ADV</span>
              <input type="text" className="ml-1 border-b border-dotted border-black outline-none flex-1 text-center bg-transparent min-w-0" />
            </div>
            <div className="flex items-center w-28 md:w-32">
              <span className="whitespace-nowrap">วันที่</span>
              <input type="text" className="ml-1 border-b border-dotted border-black outline-none flex-1 text-center bg-transparent min-w-0" placeholder="../../...." />
            </div>
          </div>
        </div>

        {/* Requester Info */}
        <div className="border-x border-b border-black">
          <div className="flex flex-col md:flex-row border-b border-black">
            <div className="flex-1 p-2 flex items-center border-b md:border-b-0 md:border-r border-black">
              <span className="text-sm mr-2 whitespace-nowrap">ชื่อผู้ขอเบิก:</span>
              <input type="text" className="flex-1 border-b border-dotted border-black outline-none" />
            </div>
            <div className="p-2 flex items-center min-w-[200px]">
              <span className="text-sm mr-2 whitespace-nowrap">วันที่ต้องใช้เงิน:</span>
              <input type="text" className="flex-1 border-b border-dotted border-black outline-none text-center" placeholder="../../...." />
            </div>
          </div>

          <div className="flex flex-col md:flex-row border-b border-black">
            <div className="flex-1 p-2 flex items-center border-b md:border-b-0 md:border-r border-black">
              <span className="text-sm mr-2">ตำแหน่ง:</span>
              <input type="text" className="flex-1 border-b border-dotted border-black outline-none" />
            </div>
            <div className="flex-1 p-2 flex items-center">
              <span className="text-sm mr-2 whitespace-nowrap">ส่วนงาน/ฝ่าย/แผนก:</span>
              <input type="text" className="flex-1 border-b border-dotted border-black outline-none" />
            </div>
          </div>

          <div className="p-2 flex flex-col">
            <span className="text-sm mb-1 font-semibold">วัตถุประสงค์การเบิกเงินทดรองจ่าย:</span>
            <textarea className="w-full resize-none outline-none text-sm h-14" rows={2} />
          </div>
        </div>

        {/* Table */}
        <table className="w-full border-collapse border-x border-black">
          <thead>
            <tr className="border-y border-black text-sm">
              <th className="border-r border-black p-1 w-12 text-center font-bold">ลำดับ</th>
              <th className="border-r border-black p-1 text-center font-bold">รายการ</th>
              <th className="p-1 w-32 md:w-48 text-center font-bold">จำนวนเงิน(บาท)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-b border-black text-sm">
                <td className="border-r border-black p-1 text-center">{item.id}</td>
                <td className="border-r border-black p-0">
                  <input
                    type="text"
                    className="w-full p-2 outline-none"
                    value={item.description}
                    onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                  />
                </td>
                <td className="p-0">
                  <input
                    type="number"
                    className="w-full p-2 outline-none text-right"
                    value={item.amount}
                    onChange={(e) => handleAmountChange(idx, e.target.value)}
                  />
                </td>
              </tr>
            ))}
            <tr className="border-b border-black font-bold text-sm bg-gray-50">
              <td colSpan={2} className="border-r border-black p-2 text-center">รวม</td>
              <td className="p-2 text-right">
                {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer/Approvals */}
        <div className="mt-4">
          <h3 className="text-center font-bold text-sm mb-2 underline uppercase">เบิกเงินทดรองจ่าย</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 border border-black text-center text-[10px] md:text-xs">
            <div className="border-r border-b md:border-b-0 border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้ขอเบิก</span>
              <div className="flex flex-col items-center">
                <div className="w-full border-b border-black mb-1" />
                <span>......../......../............</span>
              </div>
            </div>
            <div className="border-r-0 md:border-r border-b md:border-b-0 border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้อนุมัติ/ตรวจสอบ</span>
              <div className="flex flex-col items-center">
                <div className="w-full border-b border-black mb-1" />
                <span>......../......../............</span>
              </div>
            </div>
            <div className="border-r border-black p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้จ่ายเงิน</span>
              <div className="flex flex-col items-center">
                <div className="w-full border-b border-black mb-1" />
                <span>......../......../............</span>
              </div>
            </div>
            <div className="p-2 flex flex-col h-28 justify-between">
              <span className="font-semibold">ผู้รับเงิน</span>
              <div className="flex flex-col items-center">
                <div className="w-full border-b border-black mb-1" />
                <span>......../......../............</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-red-600 font-bold text-[10px] md:text-xs mt-6">
          *ให้ผู้เบิกเงินเคลียร์ทดรองจ่ายภายใน 15 วัน นับจากวันรับเงิน*
        </p>
        <p className="text-center text-red-600 font-bold text-[10px] md:text-xs mt-1">
          เอกสารรับเงินจะสมบูรณ์เมื่อเงินเข้าบัญชีแล้วเท่านั้น
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white; padding: 0; }
          .min-h-screen { padding: 0; background: white; }
          .shadow-2xl { box-shadow: none; border: none; }
        }
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      ` }} />
    </div>
  );
}

export default AdvancePaymentRequestFormSimple;
