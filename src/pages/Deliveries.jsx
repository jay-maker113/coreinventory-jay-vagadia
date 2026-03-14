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
  customer: '',
  location_id: '',
  scheduled_date: '',
  lines: [{ product_id: '', quantity_demanded: 1 }]
}

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([])
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
    const [{ data: del }, { data: prod }, { data: loc }, { data: stock }] = await Promise.all([
      supabase.from('deliveries').select('*, locations(name), delivery_lines(*, products(name, sku))').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, sku').order('name'),
      supabase.from('locations').select('id, name, warehouse_id, warehouses(name)').order('name'),
      supabase.from('stock_levels').select('product_id, location_id, quantity_on_hand'),
    ])
    setDeliveries(del ?? [])
    setProducts(prod ?? [])
    setLocations(loc ?? [])

    // Build stock map keyed by product_id + location_id
    const map = {}
    stock?.forEach(row => {
      const key = `${row.product_id}__${row.location_id}`
      map[key] = Number(row.quantity_on_hand)
    })
    setStockMap(map)
  }

  useEffect(() => { fetchAll() }, [])

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', quantity_demanded: 1 }] }))
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

  function generateRef() {
    return 'DEL-' + Date.now().toString().slice(-6)
  }

  async function handleCreate() {
    if (!form.location_id) { setError('Select a source location.'); return }
    if (form.lines.some(l => !l.product_id)) { setError('All lines must have a product.'); return }
    setSaving(true)
    setError('')

    const { data: del, error: delErr } = await supabase
      .from('deliveries')
      .insert({
        reference: generateRef(),
        customer: form.customer.trim() || null,
        location_id: form.location_id,
        scheduled_date: form.scheduled_date || null,
        status: 'ready',
      })
      .select()
      .single()

    if (delErr) { setError(delErr.message); setSaving(false); return }

    const lines = form.lines.map(l => ({
      delivery_id: del.id,
      product_id: l.product_id,
      quantity_demanded: Number(l.quantity_demanded),
      quantity_done: Number(l.quantity_demanded),
    }))

    const { error: lineErr } = await supabase.from('delivery_lines').insert(lines)
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
    setSaving(false)
  }

  async function handleValidate(delivery) {
    // Check stock availability per product per location
    for (const line of delivery.delivery_lines) {
      const key = `${line.product_id}__${delivery.location_id}`
      const available = stockMap[key] ?? 0
      if (available < line.quantity_done) {
        alert(`Insufficient stock for "${line.products?.name}". Available: ${available}, Required: ${line.quantity_done}`)
        return
      }
    }

    if (!confirm(`Validate delivery ${delivery.reference}? This will deduct stock.`)) return
    setValidating(delivery.id)

    const ledgerEntries = delivery.delivery_lines.map(line => ({
      product_id: line.product_id,
      location_id: delivery.location_id,
      quantity_change: -Number(line.quantity_done),
      reference: delivery.reference,
      operation_type: 'delivery',
      note: `Delivery to ${delivery.customer ?? 'customer'}`,
    }))

    const { error: ledgerErr } = await supabase.from('stock_ledger').insert(ledgerEntries)
    if (ledgerErr) { alert(ledgerErr.message); setValidating(null); return }

    await supabase.from('deliveries').update({
      status: 'done',
      validated_at: new Date().toISOString()
    }).eq('id', delivery.id)

    fetchAll()
    setValidating(null)
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this delivery?')) return
    await supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', id)
    fetchAll()
  }

  const filtered = deliveries.filter(d =>
    d.reference.toLowerCase().includes(search.toLowerCase()) ||
    (d.customer ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Deliveries</h1>
          <p className="text-sm text-gray-400 mt-0.5">Outgoing stock to customers</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Delivery
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference or customer..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-10 text-center text-gray-500 text-sm">
            No deliveries yet.
          </div>
        )}
        {filtered.map(d => (
          <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            >
              <div className="flex items-center gap-3">
                {expanded === d.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div>
                  <p className="text-sm font-mono font-medium text-white">{d.reference}</p>
                  <p className="text-xs text-gray-400">{d.customer ?? 'No customer'} · {d.locations?.name ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{new Date(d.created_at).toLocaleDateString()}</span>
                <StatusBadge status={d.status} />
                {d.status !== 'done' && d.status !== 'cancelled' && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleValidate(d)}
                      disabled={validating === d.id}
                      className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      {validating === d.id ? 'Validating...' : 'Validate'}
                    </button>
                    <button
                      onClick={() => handleCancel(d.id)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {expanded === d.id && (
              <div className="border-t border-gray-800 px-4 py-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-1">Product</th>
                      <th className="text-left py-1">SKU</th>
                      <th className="text-right py-1">Demanded</th>
                      <th className="text-right py-1">Done</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.delivery_lines?.map(line => (
                      <tr key={line.id} className="border-t border-gray-800">
                        <td className="py-1.5 text-gray-300">{line.products?.name}</td>
                        <td className="py-1.5 text-gray-500 font-mono">{line.products?.sku}</td>
                        <td className="py-1.5 text-right text-gray-300">{line.quantity_demanded}</td>
                        <td className="py-1.5 text-right text-red-400">{line.quantity_done}</td>
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
        <Modal title="New Delivery" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Customer</label>
              <input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Reliance Industries" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Source Location *</label>
              <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— Select location —</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.warehouses?.name} → {l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Scheduled Date</label>
              <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Products *</label>
                <button onClick={addLine} className="text-xs text-indigo-400 hover:text-indigo-300">+ Add line</button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={line.product_id} onChange={e => updateLine(i, 'product_id', e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500">
                      <option value="">— Product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    <input type="number" min="1" value={line.quantity_demanded}
                      onChange={e => updateLine(i, 'quantity_demanded', e.target.value)}
                      className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                    {form.lines.length > 1 && (
                      <button onClick={() => removeLine(i)}><X className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleCreate} disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating...' : 'Create Delivery'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}