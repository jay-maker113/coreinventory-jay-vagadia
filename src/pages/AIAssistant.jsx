import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, Bot, User, Trash2 } from 'lucide-react'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY

// Pre-defined query intents — AI picks one, we execute it safely
const QUERY_INTENTS = {
  low_stock: 'Products at or below reorder point',
  out_of_stock: 'Products with zero quantity',
  all_products: 'All products with current stock levels',
  pending_receipts: 'Receipts with status ready or draft',
  pending_deliveries: 'Deliveries with status ready, waiting, or draft',
  pending_transfers: 'Transfers with status ready or draft',
  recent_moves: 'Last 10 stock movements in move history',
  receipts_done: 'All validated receipts',
  deliveries_done: 'All validated deliveries',
  all_adjustments: 'All stock adjustments',
  warehouses: 'All warehouses and their locations',
  categories: 'All product categories',
  unknown: 'Cannot determine intent',
}

async function fetchDataForIntent(intent) {
  switch (intent) {
    case 'low_stock': {
      const { data } = await supabase
        .from('stock_levels')
        .select('product_name, sku, quantity_on_hand, reorder_point, location_name, warehouse_name')
      const grouped = {}
      data?.forEach(r => {
        if (!grouped[r.product_name]) grouped[r.product_name] = { ...r, quantity_on_hand: 0 }
        grouped[r.product_name].quantity_on_hand += Number(r.quantity_on_hand)
      })
      return Object.values(grouped).filter(p => p.quantity_on_hand > 0 && p.quantity_on_hand <= p.reorder_point)
    }
    case 'out_of_stock': {
      const { data } = await supabase.from('stock_levels').select('product_name, sku, quantity_on_hand, reorder_point')
      const grouped = {}
      data?.forEach(r => {
        if (!grouped[r.product_name]) grouped[r.product_name] = { ...r, quantity_on_hand: 0 }
        grouped[r.product_name].quantity_on_hand += Number(r.quantity_on_hand)
      })
      return Object.values(grouped).filter(p => p.quantity_on_hand <= 0)
    }
    case 'all_products': {
      const { data } = await supabase.from('stock_levels').select('product_name, sku, quantity_on_hand, unit_of_measure, location_name, warehouse_name')
      return data ?? []
    }
    case 'pending_receipts': {
      const { data } = await supabase.from('receipts').select('reference, supplier, status, scheduled_date, locations(name)').in('status', ['draft', 'ready'])
      return data ?? []
    }
    case 'pending_deliveries': {
      const { data } = await supabase.from('deliveries').select('reference, customer, status, scheduled_date, locations(name)').in('status', ['draft', 'waiting', 'ready'])
      return data ?? []
    }
    case 'pending_transfers': {
      const { data } = await supabase.from('transfers').select('reference, status, scheduled_date, from_loc:locations!transfers_from_location_id_fkey(name), to_loc:locations!transfers_to_location_id_fkey(name)').in('status', ['draft', 'ready'])
      return data ?? []
    }
    case 'recent_moves': {
      const { data } = await supabase.from('stock_ledger').select('*, products(name, sku), locations(name, warehouses(name))').order('created_at', { ascending: false }).limit(10)
      return data ?? []
    }
    case 'receipts_done': {
      const { data } = await supabase.from('receipts').select('reference, supplier, status, validated_at, locations(name)').eq('status', 'done')
      return data ?? []
    }
    case 'deliveries_done': {
      const { data } = await supabase.from('deliveries').select('reference, customer, status, validated_at, locations(name)').eq('status', 'done')
      return data ?? []
    }
    case 'all_adjustments': {
      const { data } = await supabase.from('adjustments').select('reference, status, note, created_at, locations(name)')
      return data ?? []
    }
    case 'warehouses': {
      const { data } = await supabase.from('warehouses').select('*, locations(name, short_code)')
      return data ?? []
    }
    case 'categories': {
      const { data } = await supabase.from('categories').select('*')
      return data ?? []
    }
    default:
      return null
  }
}

async function classifyIntent(userMessage) {
  const intentList = Object.entries(QUERY_INTENTS)
    .filter(([k]) => k !== 'unknown')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 20,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are an intent classifier for an inventory management system. Given a user question, respond with ONLY the intent key that best matches. Available intents:\n${intentList}\n\nRespond with only the key, nothing else. If nothing matches, respond: unknown`,
        },
        { role: 'user', content: userMessage },
      ],
    }),
  })
  const json = await res.json()
  const raw = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'unknown'
  return Object.keys(QUERY_INTENTS).includes(raw) ? raw : 'unknown'
}

async function generateResponse(userMessage, intent, data) {
  const dataStr = data ? JSON.stringify(data, null, 2) : 'No data found.'
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are an inventory assistant for CoreInventory.
You receive real database query results and must report them accurately.

CRITICAL RULES:
- If the data array has items, those items EXIST. Report them.
- "Ready" and "draft" statuses ARE pending. Never say "no pending" if records exist.
- Never contradict the data. Empty array [] = none. Has items = report them.

FORMATTING RULES:
- Always use bullet points for lists of records.
- Each bullet: bold the reference number, then key details on the same line.
- For stock items: show product name, quantity, unit, location.
- For operations: show reference, status, location, date.
- For move history: show reference, product, quantity change (+/-), note.
- Start directly with the answer. No preamble like "Here are the results:".
- End with one short summary line if helpful. No filler sentences.
- Max 200 words.`,
        },
        {
          role: 'user',
          content: `User question: "${userMessage}"\n\nDatabase data:\n${dataStr}`,
        },
      ],
    }),
  })
  const json = await res.json()
  return json.choices?.[0]?.message?.content?.trim() ?? 'Sorry, I could not generate a response.'
}

const SUGGESTIONS = [
  'Which products are low on stock?',
  'Show me pending deliveries',
  'What are the recent stock movements?',
  'Are there any out of stock items?',
  'Show pending transfers',
  'What products do we have?',
]

export default function AIAssistant({ messages, setMessages }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(text) {
    const message = text ?? input.trim()
    if (!message || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    try {
      const intent = await classifyIntent(message)
      const data = intent !== 'unknown' ? await fetchDataForIntent(intent) : null
      const response = await generateResponse(message, intent, data)
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Check your API key or network connection.',
      }])
    }
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-full" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
          <p className="text-sm text-gray-400 mt-0.5">Ask questions about your inventory in plain English</p>
        </div>
        <button
          onClick={() => setMessages([{ role: 'assistant', content: 'Hi! Ask me anything about your inventory.' }])}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-900 border border-gray-800 text-gray-200'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => handleSend(s)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about your inventory..."
          disabled={loading}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
