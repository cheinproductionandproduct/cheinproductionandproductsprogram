'use client'

import { useState, useEffect } from 'react'
import { numberToThaiText } from '@/lib/utils/thai-number'

interface Item {
  id: string
  description: string
  amount: number
}

interface ItemsTableProps {
  value?: Item[]
  onChange: (items: Item[], total: number) => void
  required?: boolean
}

export function ItemsTable({ value = [], onChange, required = false }: ItemsTableProps) {
  const [items, setItems] = useState<Item[]>(
    value && value.length > 0 ? value : [{ id: '1', description: '', amount: 0 }]
  )

  useEffect(() => {
    if (value && value.length > 0) {
      setItems(value)
    } else if (items.length === 0) {
      setItems([{ id: '1', description: '', amount: 0 }])
    }
  }, [value])

  const addItem = () => {
    const newId = String(items.length + 1)
    const newItem: Item = { id: newId, description: '', amount: 0 }
    setItems([...items, newItem])
  }

  const removeItem = (id: string) => {
    if (items.length > 1) {
      const updated = items.filter((item) => item.id !== id)
      setItems(updated)
      calculateTotal(updated)
    }
  }

  const updateItem = (id: string, field: 'description' | 'amount', value: string | number) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    )
    setItems(updated)
    calculateTotal(updated)
  }

  const calculateTotal = (itemsList: Item[]) => {
    const total = itemsList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    onChange(itemsList, total)
  }

  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-400">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-center w-16">ลำดับ</th>
              <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-left">รายการ</th>
              <th className="border border-gray-400 px-3 py-2 text-sm font-semibold text-right w-32">จำนวนเงิน(บาท)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="hover:bg-gray-50 group">
                <td className="border border-gray-400 px-3 py-2 text-center text-sm">{index + 1}</td>
                <td className="border border-gray-400 px-3 py-2 relative">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="รายละเอียดรายการ"
                    className="w-full px-2 py-1.5 pr-10 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md border border-black bg-[#c0392b] hover:bg-[#a93226] text-white transition-all opacity-0 group-hover:opacity-100"
                      title="ลบรายการ"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </td>
                <td className="border border-gray-400 px-3 py-2">
                  <input
                    type="number"
                    value={item.amount || ''}
                    onChange={(e) => updateItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="border border-gray-400 px-3 py-2 text-sm text-center">รวม</td>
              <td className="border border-gray-400 px-3 py-2 text-sm">{numberToThaiText(total)}</td>
              <td className="border border-gray-400 px-3 py-2 text-sm text-right font-bold">
                {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={addItem}
          className="rounded-md bg-red-800 text-white px-4 py-2 text-sm hover:bg-red-900 transition-colors"
        >
          + เพิ่มรายการ
        </button>
      </div>
      {required && items.length === 0 && (
        <p className="text-sm text-red-600">At least one item is required</p>
      )}
    </div>
  )
}
