import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser)
    })
  }, [])

  async function handlePasswordChange(event) {
    event.preventDefault()

    if (newPassword.length < 6) {
      setError('Minimum 6 characters.')
      return
    }

    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Password updated successfully.')
      setNewPassword('')
      setConfirm('')
    }

    setLoading(false)
  }

  if (!user) {
    return null
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">My Profile</h1>
        <p className="text-sm text-gray-400 mt-0.5">Account details and security</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-medium">{user.email}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Member since {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">User ID</p>
            <p className="text-gray-300 font-mono text-xs truncate">{user.id}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs mb-1">Email verified</p>
            <p className={`text-xs font-medium ${user.email_confirmed_at ? 'text-green-400' : 'text-yellow-400'}`}>
              {user.email_confirmed_at ? 'Verified' : 'Pending verification'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Change Password</h2>

        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Min. 6 characters"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Repeat password"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {message && <p className="text-green-400 text-xs">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
