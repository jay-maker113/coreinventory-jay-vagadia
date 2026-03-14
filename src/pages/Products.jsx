import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Pencil, Trash2 } from 'lucide-react'

const UOM_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'box', 'roll', 'set']

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-white" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const empty = { name: '', sku: '', category_id: '', unit_of_measure: 'pcs', reorder_point: 0 }

export default function Products() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [stockMap, setStockMap] = useState({})
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchAll() {
    const [{ data: prods }, { data: cats }, { data: stock }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('stock_levels').select('product_id, quantity_on_hand'),
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])

    // Sum qty per product across all locations
    const map = {}
    stock?.forEach(row => {
      map[row.product_id] = (map[row.product_id] ?? 0) + Number(row.quantity_on_hand)
    })
    setStockMap(map)
  }

  useEffect(() => { fetchAll() }, [])

  function openCreate() {
    setForm(empty)
    setEditId(null)
    setError('')
    setShowModal(true)
  }

  function openEdit(p) {
    setForm({
      name: p.name,
      sku: p.sku,
      category_id: p.category_id ?? '',
      unit_of_measure: p.unit_of_measure,
      reorder_point: p.reorder_point,
    })
    setEditId(p.id)
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.sku.trim()) { setError('Name and SKU are required.'); return }
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      category_id: form.category_id || null,
      unit_of_measure: form.unit_of_measure,
      reorder_point: Number(form.reorder_point),
    }
    const { error } = editId
      ? await supabase.from('products').update(payload).eq('id', editId)
      : await supabase.from('products').insert(payload)

    if (error) setError(error.message)
    else { setShowModal(false); fetchAll() }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return
    await supabase.from('products').delete().eq('id', id)
    fetchAll()
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-sm text-gray-400 mt-0.5">{products.length} total products</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Product
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or SKU..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">SKU</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">UOM</th>
              <th className="text-right px-4 py-3">On Hand</th>
              <th className="text-right px-4 py-3">Reorder At</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-500 py-12">
                  {search ? 'No products match your search.' : 'No products yet. Create one.'}
                </td>
              </tr>
            )}
            {filtered.map(p => {
              const qty = stockMap[p.id] ?? 0
              const isLow = qty > 0 && qty <= p.reorder_point
              const isOut = qty <= 0
              return (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-gray-400">{p.categories?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{p.unit_of_measure}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${isOut ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-green-400'}`}>
                      {qty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{p.reorder_point}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editId ? 'Edit Product' : 'New Product'} onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Product Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Steel Rod" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">SKU / Code *</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="e.g. STL-ROD-001" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Unit of Measure</label>
                <select value={form.unit_of_measure} onChange={e => setForm(f => ({ ...f, unit_of_measure: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Reorder Point</label>
                <input type="number" min="0" value={form.reorder_point} onChange={e => setForm(f => ({ ...f, reorder_point: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors mt-1">
              {saving ? 'Saving...' : editId ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}