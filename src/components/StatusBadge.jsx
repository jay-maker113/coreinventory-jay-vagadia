const colors = {
  draft: 'bg-gray-700 text-gray-300',
  waiting: 'bg-yellow-900 text-yellow-300',
  ready: 'bg-blue-900 text-blue-300',
  done: 'bg-green-900 text-green-300',
  cancelled: 'bg-red-900 text-red-300',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${colors[status] ?? colors.draft}`}>
      {status}
    </span>
  )
}