import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, X, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

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

export default function Settings() {
  const [warehouses, setWarehouses] = useState([])
  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [expanded, setExpanded] = useState(null)

  // Warehouse modal
  const [showWH, setShowWH] = useState(false)
  const [whForm, setWhForm] = useState({ name: '', short_code: '', address: '' })
  const [whEditId, setWhEditId] = useState(null)
  const [whError, setWhError] = useState('')
  const [whSaving, setWhSaving] = useState(false)

  // Location modal
  const [showLoc, setShowLoc] = useState(false)
  const [locForm, setLocForm] = useState({ name: '', short_code: '', warehouse_id: '' })
  const [locEditId, setLocEditId] = useState(null)
  const [locError, setLocError] = useState('')
  const [locSaving, setLocSaving] = useState(false)

  // Category modal
  const [showCat, setShowCat] = useState(false)
  const [catForm, setCatForm] = useState({ name: '' })
  const [catEditId, setCatEditId] = useState(null)
  const [catError, setCatError] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  async function fetchAll() {
    const [{ data: wh }, { data: loc }, { data: cat }] = await Promise.all([
      supabase.from('warehouses').select('*').order('created_at'),
      supabase.from('locations').select('*, warehouses(name)').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setWarehouses(wh ?? [])
    setLocations(loc ?? [])
    setCategories(cat ?? [])
  }

  useEffect(() => { fetchAll() }, [])

  // --- Warehouse CRUD ---
  async function saveWarehouse() {
    if (!whForm.name.trim() || !whForm.short_code.trim()) { setWhError('Name and short code required.'); return }
    setWhSaving(true); setWhError('')
    const payload = { name: whForm.name.trim(), short_code: whForm.short_code.trim().toUpperCase(), address: whForm.address.trim() || null }
    const { error } = whEditId
      ? await supabase.from('warehouses').update(payload).eq('id', whEditId)
      : await supabase.from('warehouses').insert(payload)
    if (error) setWhError(error.message)
    else { setShowWH(false); fetchAll() }
    setWhSaving(false)
  }

  async function deleteWarehouse(id) {
    if (!confirm('Delete warehouse? All its locations will also be deleted.')) return
    await supabase.from('warehouses').delete().eq('id', id)
    fetchAll()
  }

  // --- Location CRUD ---
  async function saveLocation() {
    if (!locForm.name.trim() || !locForm.warehouse_id) { setLocError('Name and warehouse required.'); return }
    setLocSaving(true); setLocError('')
    const payload = { name: locForm.name.trim(), short_code: locForm.short_code.trim().toUpperCase() || null, warehouse_id: locForm.warehouse_id }
    const { error } = locEditId
      ? await supabase.from('locations').update(payload).eq('id', locEditId)
      : await supabase.from('locations').insert(payload)
    if (error) setLocError(error.message)
    else { setShowLoc(false); fetchAll() }
    setLocSaving(false)
  }

  async function deleteLocation(id) {
    if (!confirm('Delete this location?')) return
    await supabase.from('locations').delete().eq('id', id)
    fetchAll()
  }

  // --- Category CRUD ---
  async function saveCategory() {
    if (!catForm.name.trim()) { setCatError('Name required.'); return }
    setCatSaving(true); setCatError('')
    const { error } = catEditId
      ? await supabase.from('categories').update({ name: catForm.name.trim() }).eq('id', catEditId)
      : await supabase.from('categories').insert({ name: catForm.name.trim() })
    if (error) setCatError(error.message)
    else { setShowCat(false); fetchAll() }
    setCatSaving(false)
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return
    await supabase.from('categories').delete().eq('id', id)
    fetchAll()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Manage warehouses, locations, and categories</p>
      </div>

      {/* Warehouses */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Warehouses</h2>
            <p className="text-xs text-gray-500 mt-0.5">{warehouses.length} configured</p>
          </div>
          <button
            onClick={() => { setWhForm({ name: '', short_code: '', address: '' }); setWhEditId(null); setWhError(''); setShowWH(true) }}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Warehouse
          </button>
        </div>
        {warehouses.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-8">No warehouses yet.</p>
        )}
        {warehouses.map(wh => {
          const whLocs = locations.filter(l => l.warehouses?.name === wh.name || locations.find(loc => loc.id && loc.warehouse_id === wh.id))
          const locList = locations.filter(l => l.warehouse_id === wh.id)
          return (
            <div key={wh.id} className="border-b border-gray-800 last:border-0">
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-800/50"
                onClick={() => setExpanded(expanded === wh.id ? null : wh.id)}
              >
                <div className="flex items-center gap-3">
                  {expanded === wh.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  <div>
                    <p className="text-sm font-medium text-white">{wh.name}</p>
                    <p className="text-xs text-gray-500">{wh.short_code}{wh.address ? ` · ${wh.address}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <span className="text-xs text-gray-500">{locList.length} location{locList.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => { setWhForm({ name: wh.name, short_code: wh.short_code, address: wh.address ?? '' }); setWhEditId(wh.id); setWhError(''); setShowWH(true) }}
                    className="text-gray-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteWarehouse(wh.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {expanded === wh.id && (
                <div className="px-5 pb-4 bg-gray-800/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Locations</p>
                    <button
                      onClick={() => { setLocForm({ name: '', short_code: '', warehouse_id: wh.id }); setLocEditId(null); setLocError(''); setShowLoc(true) }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Location
                    </button>
                  </div>
                  {locList.length === 0 && <p className="text-xs text-gray-600">No locations in this warehouse.</p>}
                  <div className="space-y-1">
                    {locList.map(loc => (
                      <div key={loc.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-800 rounded-lg">
                        <div>
                          <span className="text-sm text-white">{loc.name}</span>
                          {loc.short_code && <span className="text-xs text-gray-500 ml-2 font-mono">{loc.short_code}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setLocForm({ name: loc.name, short_code: loc.short_code ?? '', warehouse_id: loc.warehouse_id }); setLocEditId(loc.id); setLocError(''); setShowLoc(true) }}
                            className="text-gray-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteLocation(loc.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Categories */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Product Categories</h2>
            <p className="text-xs text-gray-500 mt-0.5">{categories.length} configured</p>
          </div>
          <button
            onClick={() => { setCatForm({ name: '' }); setCatEditId(null); setCatError(''); setShowCat(true) }}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Category
          </button>
        </div>
        <div className="divide-y divide-gray-800">
          {categories.length === 0 && <p className="text-center text-gray-500 text-sm py-8">No categories yet.</p>}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/50">
              <span className="text-sm text-white">{cat.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCatForm({ name: cat.name }); setCatEditId(cat.id); setCatError(''); setShowCat(true) }}
                  className="text-gray-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteCategory(cat.id)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warehouse Modal */}
      {showWH && (
        <Modal title={whEditId ? 'Edit Warehouse' : 'New Warehouse'} onClose={() => setShowWH(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Warehouse Name *</label>
              <input value={whForm.name} onChange={e => setWhForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Main Warehouse" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Short Code *</label>
              <input value={whForm.short_code} onChange={e => setWhForm(f => ({ ...f, short_code: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                placeholder="e.g. WH-MAIN" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Address</label>
              <input value={whForm.address} onChange={e => setWhForm(f => ({ ...f, address: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Plot 12, GIDC, Ahmedabad" />
            </div>
            {whError && <p className="text-red-400 text-xs">{whError}</p>}
            <button onClick={saveWarehouse} disabled={whSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {whSaving ? 'Saving...' : whEditId ? 'Update Warehouse' : 'Create Warehouse'}
            </button>
          </div>
        </Modal>
      )}

      {/* Location Modal */}
      {showLoc && (
        <Modal title={locEditId ? 'Edit Location' : 'New Location'} onClose={() => setShowLoc(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Location Name *</label>
              <input value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Production Floor" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Short Code</label>
              <input value={locForm.short_code} onChange={e => setLocForm(f => ({ ...f, short_code: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                placeholder="e.g. LOC-PROD" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Warehouse *</label>
              <select value={locForm.warehouse_id} onChange={e => setLocForm(f => ({ ...f, warehouse_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">— Select warehouse —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {locError && <p className="text-red-400 text-xs">{locError}</p>}
            <button onClick={saveLocation} disabled={locSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {locSaving ? 'Saving...' : locEditId ? 'Update Location' : 'Create Location'}
            </button>
          </div>
        </Modal>
      )}

      {/* Category Modal */}
      {showCat && (
        <Modal title={catEditId ? 'Edit Category' : 'New Category'} onClose={() => setShowCat(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category Name *</label>
              <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Electronics" />
            </div>
            {catError && <p className="text-red-400 text-xs">{catError}</p>}
            <button onClick={saveCategory} disabled={catSaving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {catSaving ? 'Saving...' : catEditId ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}