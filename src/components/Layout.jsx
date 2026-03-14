import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <footer className="border-t border-gray-800 px-6 py-2 flex items-center justify-between">
          <p className="text-xs text-gray-600">CoreInventory</p>
          <p className="text-xs text-gray-600">Built by Jay Vagadia · Odoo x Indus University Hackathon '26</p>
        </footer>
      </div>
    </div>
  )
}
