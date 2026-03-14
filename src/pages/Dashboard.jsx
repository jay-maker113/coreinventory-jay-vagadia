import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  Package, AlertTriangle, ArrowDownCircle,
  ArrowUpCircle, ArrowLeftRight, RefreshCw
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

function KPICard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4 ${onClick ? 'cursor-pointer hover:border-indigo-600 transition-colors' : ''}`}
    >
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    outOfStock: 0,
    pendingReceipts: 0,
    pendingDeliveries: 0,
    pendingTransfers: 0,
  })
  const [stockChart, setStockChart] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchStats() {
    setLoading(true)
    const [
      { count: totalProducts },
      { data: stockData },
      { count: pendingReceipts },
      { count: pendingDeliveries },
      { count: pendingTransfers },
    ] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('stock_levels').select('product_name, quantity_on_hand, reorder_point'),
      supabase.from('receipts').select('*', { count: 'exact', head: true }).in('status', ['draft', 'ready']),
      supabase.from('deliveries').select('*', { count: 'exact', head: true }).in('status', ['draft', 'waiting', 'ready']),
      supabase.from('transfers').select('*', { count: 'exact', head: true }).in('status', ['draft', 'ready']),
    ])

    const uniqueStock = {}
    stockData?.forEach(row => {
      if (!uniqueStock[row.product_name]) uniqueStock[row.product_name] = { product_name: row.product_name, quantity_on_hand: 0, reorder_point: row.reorder_point }
      uniqueStock[row.product_name].quantity_on_hand += Number(row.quantity_on_hand)
    })
    const stockArr = Object.values(uniqueStock)
    const lowStock = stockArr.filter(p => p.quantity_on_hand > 0 && p.quantity_on_hand <= p.reorder_point).length
    const outOfStock = stockArr.filter(p => p.quantity_on_hand <= 0).length

    setStats({
      totalProducts: totalProducts ?? 0,
      lowStock,
      outOfStock,
      pendingReceipts: pendingReceipts ?? 0,
      pendingDeliveries: pendingDeliveries ?? 0,
      pendingTransfers: pendingTransfers ?? 0,
    })

    setStockChart(stockArr.slice(0, 8).map(p => ({
      name: p.product_name.length > 12 ? p.product_name.slice(0, 12) + '…' : p.product_name,
      qty: Number(p.quantity_on_hand),
      low: p.quantity_on_hand <= p.reorder_point && p.quantity_on_hand > 0,
    })))

    setLoading(false)
  }

  useEffect(() => {
    fetchStats()

    // Realtime: re-fetch on any stock_ledger insert
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_ledger' }, fetchStats)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Live inventory snapshot</p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <KPICard icon={Package} label="Total Products" value={stats.totalProducts} color="bg-indigo-600" onClick={() => navigate('/products')} />
        <div className={stats.lowStock > 0 ? 'animate-pulse' : ''}>
          <KPICard icon={AlertTriangle} label="Low Stock" value={stats.lowStock} sub="At or below reorder point" color="bg-yellow-600" onClick={() => navigate('/products')} />
        </div>
        <div className={stats.outOfStock > 0 ? 'animate-pulse' : ''}>
          <KPICard icon={AlertTriangle} label="Out of Stock" value={stats.outOfStock} sub="Zero quantity" color="bg-red-600" onClick={() => navigate('/products')} />
        </div>
        <KPICard icon={ArrowDownCircle} label="Pending Receipts" value={stats.pendingReceipts} color="bg-blue-600" onClick={() => navigate('/receipts')} />
        <KPICard icon={ArrowUpCircle} label="Pending Deliveries" value={stats.pendingDeliveries} color="bg-purple-600" onClick={() => navigate('/deliveries')} />
        <KPICard icon={ArrowLeftRight} label="Pending Transfers" value={stats.pendingTransfers} color="bg-teal-600" onClick={() => navigate('/transfers')} />
      </div>

      {/* Stock Chart */}
      {stockChart.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Stock Levels by Product</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockChart} barSize={32}>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f9fafb' }}
                itemStyle={{ color: '#a5b4fc' }}
              />
              <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                {stockChart.map((entry, i) => (
                  <Cell key={i} fill={entry.low ? '#ca8a04' : '#4f46e5'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-600 mt-2">Yellow bars = at or below reorder point</p>
        </div>
      )}

      {stockChart.length === 0 && !loading && (
        <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-10 text-center text-gray-500 text-sm">
          No stock data yet. Add products and validate receipts to see chart.
        </div>
      )}
    </div>
  )
}