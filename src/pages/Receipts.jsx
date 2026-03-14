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
  supplier: '',
  location_id: '',
  scheduled_date: '',
  lines: [{ product_id: '', quantity_expected: 1 }]
}

export default function Receipts() {
  const [receipts, setReceipts] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [validating, setValidating] = useState(null)

  async function fetchAll() {
    const [{ data: rec }, { data: prod }, { data: loc }] = await Promise.all([
      supabase.from('receipts').select('*, locations(name), receipt_lines(*, products(name, sku))').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, sku').order('name'),
      supabase.from('locations').select('id, name, warehouse_id, warehouses(name)').order('name'),
    ])
    setReceipts(rec ?? [])
    setProducts(prod ?? [])
    setLocations(loc ?? [])
  }

  useEffect(() => { fetchAll() }, [])

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { product_id: '', quantity_expected: 1 }] }))
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
    return 'REC-' + Date.now().toString().slice(-6)
  }

  async function handleCreate() {
    if (!form.location_id) { setError('Select a destination location.'); return }
    if (form.lines.some(l => !l.product_id)) { setError('All lines must have a product.'); return }
    setSaving(true)
    setError('')

    const { data: rec, error: recErr } = await supabase
      .from('receipts')
      .insert({
        reference: generateRef(),
        supplier: form.supplier.trim() || null,
        location_id: form.location_id,
        scheduled_date: form.scheduled_date || null,
        status: 'ready',
      })
      .select()
      .single()

    if (recErr) { setError(recErr.message); setSaving(false); return }

    const lines = form.lines.map(l => ({
      receipt_id: rec.id,
      product_id: l.product_id,
      quantity_expected: Number(l.quantity_expected),
      quantity_received: Number(l.quantity_expected),
    }))

    const { error: lineErr } = await supabase.from('receipt_lines').insert(lines)
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    setShowModal(false)
    setForm(emptyForm)
    fetchAll()
    setSaving(false)
  }

  async function handleValidate(receipt) {
    if (!confirm(`Validate receipt ${receipt.reference}? This will add stock.`)) return
    setValidating(receipt.id)

    const ledgerEntries = receipt.receipt_lines.map(line => ({
      product_id: line.product_id,
      location_id: receipt.location_id,
      quantity_change: Number(line.quantity_received),
      reference: receipt.reference,
      operation_type: 'receipt',
      note: `Receipt from ${receipt.supplier ?? 'vendor'}`,
    }))

    const { error: ledgerErr } = await supabase.from('stock_ledger').insert(ledgerEntries)
    if (ledgerErr) { alert(ledgerErr.message); setValidating(null); return }

    await supabase.from('receipts').update({
      status: 'done',
      validated_at: new Date().toISOString()
    }).eq('id', receipt.id)

    fetchAll()
    setValidating(null)
  }

  async function handleCancel(id) {
    if (!confirm('Cancel this receipt?')) return
    await supabase.from('receipts').update({ status: 'cancelled' }).eq('id', id)
    fetchAll()
  }

  const filtered = receipts.filter(r =>
    r.reference.toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Receipts</h1>
          <p className="text-sm text-gray-400 mt-0.5">Incoming stock from vendors</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Receipt
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by reference or supplier..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-10 text-center text-gray-500 text-sm">
            No receipts yet.
          </div>
        )}
        {filtered.map(r => (
          <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/50"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div className="flex items-center gap-3">
                {expanded === r.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div>
                  <p className="text-sm font-mono font-medium text-white">{r.reference}</p>
                  <p className="text-xs text-gray-400">{r.supplier ?? 'No supplier'} · {r.locations?.name ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
                <StatusBadge status={r.status} />
                {r.status !== 'done' && r.status !== 'cancelled' && (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleValidate(r)}
                      disabled={validating === r.id}
                      className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      {validating === r.id ? 'Validating...' : 'Validate'}
                    </button>
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {expanded === r.id && (
              <div className="border-t border-gray-800 px-4 py-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-1">Product</th>
                      <th className="text-left py-1">SKU</th>
                      <th className="text-right py-1">Expected</th>
                      <th className="text-right py-1">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.receipt_lines?.map(line => (
                      <tr key={line.id} className="border-t border-gray-800">
                        <td className="py-1.5 text-gray-300">{line.products?.name}</td>
                        <td className="py-1.5 text-gray-500 font-mono">{line.products?.sku}</td>
                        <td className="py-1.5 text-right text-gray-300">{line.quantity_expected}</td>
                        <td className="py-1.5 text-right text-green-400">{line.quantity_received}</td>
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
        <Modal title="New Receipt" onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Supplier</label>
              <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Tata Steel Ltd" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Destination Location *</label>
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
                    <input type="number" min="1" value={line.quantity_expected}
                      onChange={e => updateLine(i, 'quantity_expected', e.target.value)}
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
              {saving ? 'Creating...' : 'Create Receipt'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}