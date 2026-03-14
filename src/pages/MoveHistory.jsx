import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search } from 'lucide-react'

const TYPE_COLORS = {
  receipt: 'bg-blue-900 text-blue-300',
  delivery: 'bg-purple-900 text-purple-300',
  transfer: 'bg-teal-900 text-teal-300',
  adjustment: 'bg-yellow-900 text-yellow-300',
}

export default function MoveHistory() {
  const [entries, setEntries] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('stock_ledger')
      .select('*, products(name, sku), locations(name, warehouses(name))')
      .order('created_at', { ascending: false })
      .limit(200)
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchHistory()
    const channel = supabase
      .channel('history-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_ledger' }, fetchHistory)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const filtered = entries.filter(e => {
    const matchesSearch =
      (e.products?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.reference ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.products?.sku ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || e.operation_type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Move History</h1>
        <p className="text-sm text-gray-400 mt-0.5">Complete stock ledger — every movement logged</p>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by product, SKU, or reference..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
          <option value="all">All Types</option>
          <option value="receipt">Receipts</option>
          <option value="delivery">Deliveries</option>
          <option value="transfer">Transfers</option>
          <option value="adjustment">Adjustments</option>
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Date & Time</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Reference</th>
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-right px-4 py-3">Change</th>
              <th className="text-left px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-12">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-12">No stock movements yet.</td></tr>
            )}
            {filtered.map(e => (
              <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_COLORS[e.operation_type] ?? 'bg-gray-700 text-gray-300'}`}>
                    {e.operation_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{e.reference}</td>
                <td className="px-4 py-3">
                  <p className="text-white text-xs font-medium">{e.products?.name}</p>
                  <p className="text-gray-500 text-xs font-mono">{e.products?.sku}</p>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {e.locations?.warehouses?.name} → {e.locations?.name}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-bold text-sm ${e.quantity_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {e.quantity_change > 0 ? '+' : ''}{e.quantity_change}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{e.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}