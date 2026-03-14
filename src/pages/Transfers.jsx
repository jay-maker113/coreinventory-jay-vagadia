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
  from_location_id: '',
  to_location_id: '',
  scheduled_date: '',
  lines: [{ product_id: '', quantity: 1 }]
}

export default function Transfers() {
  const [transfers, setTransfers] = useState([])
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
    const [{ data: tr }, { data: prod }, { data: loc }, { data: stock }] = await Promise.all([
      supabase.from('transfers').select(`
        *, 
        from_loc:locations!transfers_from_location_id_fkey(name),
        to_loc:locations!transfers_to_location_id_fkey(name),
        transfer_lines(*, products(name, sku))
      `).order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, sku').order('name'),
      supabase.from('locations').select('id, name, warehouses(name)').order('name'),
      supabase.from('stock_levels').select('product_id, location_id, quantity_on_hand'),
    ])
    setTransfers(tr ?? [])
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
    setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', quantity: 1 }] }))
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
    if (!form.from_location_id || !form.to_location_id) { setError('Select both locations.'); return }
    if (form.from_location_id === form.to_location_id) { setError('Source and destination must be different.'); return }
    if (form.lines.some(l => !l.product_id)) { setError('All lines must have a product.'); return }
    setSaving(true)
    setError('')

    const { data: tr, error: trErr } = await supabase
      .from('transfers')
      .insert({
        reference: 'TRF-' + Date.now().toString().slice(-6),
        from_location_id: form.from_location_id,
        to_location_id: form.to_location_id,
        scheduled_date: form.scheduled_date || null,
        status: 'ready',
      })
      .select().single()

    if (trErr) { setError(trErr.message); setSaving(false); return }

    const { error: lineErr } = await supabase.from('transfer_lines').insert(
      form.lines.map(l => ({
        transfer_id: tr.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
      }))
    )
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
    setSaving(false)
  }

  async function handleValidate(transfer) {
    // Check stock at source location
    for (const line of transfer.transfer_lines) {
      const available = stockMap[`${line.product_id}__${transfer.from_location_id}`] ?? 0
      if (available < line.quantity) {
        alert(`Insufficient stock for "${line.products?.name}" at source. Available: ${available}, Required: ${line.quantity}`)
        return
      }
    }
    if (!confirm(`Validate transfer ${transfer.reference}? Stock will move between locations.`)) return
    setValidating(transfer.id)

    // Two ledger entries per line: deduct from source, add to destination
    const ledgerEntries = transfer.transfer_lines.flatMap(line => [
      {
        product_id: line.product_id,
        location_id: transfer.from_location_id,
        quantity_change: -Number(line.quantity),
        reference: transfer.reference,
        operation_type: 'transfer',
        note: `Transfer out to ${transfer.to_loc?.name}`,
      },
      {
        product_id: line.product_id,
        location_id: transfer.to_location_id,
        quantity_change: Number(line.quantity),
        reference: transfer.reference,
        operation_type: 'transfer',
        note: `Transfer in from ${transfer.from_loc?.name}`,
      },
    ])

    const { error: ledgerErr } = await supabase.from('stock_ledger').insert(ledgerEntries)
    if (ledgerErr) { alert(ledgerErr.message); setValidating(null); return }

    await supabase.from('transfers').update({
      status: 'done',
      validated_at: new Date().toISOString()
    }).eq('id', transfer.id)

    fetchAll()
    setValidating(null)
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this transfer?')) return
    await supabase.from('transfers').update({ status: 'cancelled' }).eq('id', id)
    fetchAll()
  }

  const filtered = transfers.filter(t =>
    t.reference.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Internal Transfers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Move stock between locations</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Transfer
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-10 text-center text-gray-500 text-sm">
            No transfers yet.
          </div>
        )}
        {filtered.map(t => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
            >
              <div className="flex items-center gap-3">
                {expanded === t.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div>
                  <p className="text-sm font-mono font-medium text-white">{t.reference}</p>
                  <p className="text-xs text-gray-400">
                    {t.from_loc?.name ?? '—'} → {t.to_loc?.name ?? '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</span>
                <StatusBadge status={t.status} />
                {t.status !== 'done' && t.status !== 'cancelled' && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleValidate(t)} disabled={validating === t.id}
                      className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors">
                      {validating === t.id ? 'Validating...' : 'Validate'}
                    </button>
                    <button onClick={() => handleCancel(t.id)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
            {expanded === t.id && (
              <div className="border-t border-gray-800 px-4 py-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-1">Product</th>
                      <th className="text-left py-1">SKU</th>
                      <th className="text-right py-1">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.transfer_lines?.map(line => (
                      <tr key={line.id} className="border-t border-gray-800">
                        <td className="py-1.5 text-gray-300">{line.products?.name}</td>
                        <td className="py-1.5 text-gray-500 font-mono">{line.products?.sku}</td>
                        <td className="py-1.5 text-right text-blue-400">{line.quantity}</td>
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
        <Modal title="New Transfer" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">From Location *</label>
              <select value={form.from_location_id} onChange={e => setForm(f => ({ ...f, from_location_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— Select source —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.warehouses?.name} → {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">To Location *</label>
              <select value={form.to_location_id} onChange={e => setForm(f => ({ ...f, to_location_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— Select destination —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.warehouses?.name} → {l.name}</option>)}
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
                    <input type="number" min="1" value={line.quantity}
                      onChange={e => updateLine(i, 'quantity', e.target.value)}
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
              {saving ? 'Creating...' : 'Create Transfer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}