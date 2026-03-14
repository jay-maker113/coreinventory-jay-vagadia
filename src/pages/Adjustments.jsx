import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Search, ChevronDown, ChevronUp } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-white" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const emptyForm = {
  location_id: '',
  note: '',
  lines: [{ product_id: '', quantity_counted: 0 }]
}

export default function Adjustments() {
  const [adjustments, setAdjustments] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [validating, setValidating] = useState(null)

  async function fetchAll() {
    const [{ data: adj }, { data: prod }, { data: loc }, { data: stock }] = await Promise.all([
      supabase.from('adjustments').select('*, locations(name), adjustment_lines(*, products(name, sku))').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, sku').order('name'),
      supabase.from('locations').select('id, name, warehouses(name)').order('name'),
      supabase.from('stock_levels').select('product_id, location_id, quantity_on_hand'),
    ])
    setAdjustments(adj ?? [])
    setProducts(prod ?? [])
    setLocations(loc ?? [])
    const map = {}
    stock?.forEach(row => {
      map[`${row.product_id}__${row.location_id}`] = Number(row.quantity_on_hand)
    })
    setStockMap(map)
  }

  useEffect(() => { fetchAll() }, [])

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', quantity_counted: 0 }] }))
  }

  function removeLine(i) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  function updateLine(i, field, value) {
    setForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], [field]: value }
      return { ...f, lines }
    })
  }

  async function handleCreate() {
    if (!form.location_id) { setError('Select a location.'); return }
    if (form.lines.some(l => !l.product_id)) { setError('All lines must have a product.'); return }
    setSaving(true)
    setError('')

    const { data: adj, error: adjErr } = await supabase
      .from('adjustments')
      .insert({
        reference: 'ADJ-' + Date.now().toString().slice(-6),
        location_id: form.location_id,
        note: form.note.trim() || null,
        status: 'ready',
      })
      .select().single()

    if (adjErr) { setError(adjErr.message); setSaving(false); return }

    const lines = form.lines.map(l => {
      const current = stockMap[`${l.product_id}__${form.location_id}`] ?? 0
      const diff = Number(l.quantity_counted) - current
      return {
        adjustment_id: adj.id,
        product_id: l.product_id,
        quantity_counted: Number(l.quantity_counted),
        quantity_difference: diff,
      }
    })

    const { error: lineErr } = await supabase.from('adjustment_lines').insert(lines)
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
    setSaving(false)
  }

  async function handleValidate(adj) {
    if (!confirm(`Validate adjustment ${adj.reference}? Stock will be corrected.`)) return
    setValidating(adj.id)

    const ledgerEntries = adj.adjustment_lines
      .filter(line => line.quantity_difference !== 0)
      .map(line => ({
        product_id: line.product_id,
        location_id: adj.location_id,
        quantity_change: Number(line.quantity_difference),
        reference: adj.reference,
        operation_type: 'adjustment',
        note: adj.note ?? 'Stock adjustment',
      }))

    if (ledgerEntries.length > 0) {
      const { error: ledgerErr } = await supabase.from('stock_ledger').insert(ledgerEntries)
      if (ledgerErr) { alert(ledgerErr.message); setValidating(null); return }
    }

    await supabase.from('adjustments').update({
      status: 'done',
      validated_at: new Date().toISOString()
    }).eq('id', adj.id)

    fetchAll()
    setValidating(null)
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this adjustment?')) return
    await supabase.from('adjustments').update({ status: 'cancelled' }).eq('id', id)
    fetchAll()
  }

  // Show current stock for selected location + product in modal
  function getCurrentStock(productId) {
    if (!form.location_id || !productId) return null
    return stockMap[`${productId}__${form.location_id}`] ?? 0
  }

  const filtered = adjustments.filter(a =>
    a.reference.toLowerCase().includes(search.toLowerCase()) ||
    (a.note ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Adjustments</h1>
          <p className="text-sm text-gray-400 mt-0.5">Fix discrepancies between recorded and physical stock</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Adjustment
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference or note..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-10 text-center text-gray-500 text-sm">
            No adjustments yet.
          </div>
        )}
        {filtered.map(a => (
          <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
              onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            >
              <div className="flex items-center gap-3">
                {expanded === a.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div>
                  <p className="text-sm font-mono font-medium text-white">{a.reference}</p>
                  <p className="text-xs text-gray-400">{a.locations?.name ?? '—'}{a.note ? ` · ${a.note}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString()}</span>
                <StatusBadge status={a.status} />
                {a.status !== 'done' && a.status !== 'cancelled' && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleValidate(a)} disabled={validating === a.id}
                      className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors">
                      {validating === a.id ? 'Validating...' : 'Validate'}
                    </button>
                    <button onClick={() => handleCancel(a.id)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
            {expanded === a.id && (
              <div className="border-t border-gray-800 px-4 py-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-1">Product</th>
                      <th className="text-right py-1">Counted</th>
                      <th className="text-right py-1">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.adjustment_lines?.map(line => (
                      <tr key={line.id} className="border-t border-gray-800">
                        <td className="py-1.5 text-gray-300">{line.products?.name}</td>
                        <td className="py-1.5 text-right text-gray-300">{line.quantity_counted}</td>
                        <td className={`py-1.5 text-right font-semibold ${line.quantity_difference > 0 ? 'text-green-400' : line.quantity_difference < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                          {line.quantity_difference > 0 ? '+' : ''}{line.quantity_difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="New Stock Adjustment" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Location *</label>
              <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.warehouses?.name} → {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Reason / Note</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Damaged goods, Physical count" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Products *</label>
                <button onClick={addLine} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add line</button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, i) => {
                  const current = getCurrentStock(line.product_id)
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">
                          <option value="">— Product —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                        <input type="number" min="0" value={line.quantity_counted}
                          onChange={e => updateLine(i, 'quantity_counted', e.target.value)}
                          className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                        {form.lines.length > 1 && (
                          <button onClick={() => removeLine(i)}><X className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" /></button>
                        )}
                      </div>
                      {line.product_id && form.location_id && (
                        <p className="text-xs text-gray-500 pl-1">
                          Current stock: <span className="text-gray-300">{current}</span>
                          {' → '}
                          Difference: <span className={Number(line.quantity_counted) - current > 0 ? 'text-green-400' : Number(line.quantity_counted) - current < 0 ? 'text-red-400' : 'text-gray-500'}>
                            {Number(line.quantity_counted) - current > 0 ? '+' : ''}{Number(line.quantity_counted) - current}
                          </span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleCreate} disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating...' : 'Create Adjustment'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}