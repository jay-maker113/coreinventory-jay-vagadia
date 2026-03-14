# StockFlow: CoreInventory

> A real-time Inventory Management System built for the Odoo x Indus University Hackathon '26.

![Dashboard](https://img.shields.io/badge/Status-Live-brightgreen) ![React](https://img.shields.io/badge/React-19-blue) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-cyan) ![Groq](https://img.shields.io/badge/AI-Groq%20Llama-orange)

---

## What It Does

StockFlow replaces paper registers and Excel sheets with a centralized, real-time inventory platform. Every stock movement - incoming, outgoing, internal, or corrected - is logged in an append-only ledger. Current stock is always the sum of all ledger entries, never a mutable field. This is how real ERP systems like Odoo work.

---

## Live Demo

- **App:** https://stockflow-alpha.vercel.app
- **Demo Video:** https://www.loom.com/share/82a306487f5940359853d71267b11923
- **GitHub:** [https://github.com/jay-maker113/coreinventory-jay-vagadia](https://github.com/jay-maker113/coreinventory-jay-vagadia)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Styling | Tailwind CSS v4 |
| Auth + Database | Supabase (PostgreSQL + Realtime) |
| State | React useState (local) |
| Routing | React Router v6 |
| Charts | Recharts |
| Icons | Lucide React |
| AI | Groq (Llama 3.1 8B Instant) |
| Notifications | React Hot Toast |
| Hosting | Vercel |

---

## Features

### Core Operations
- **Receipts** — Incoming stock from vendors. Validate to increase stock automatically.
- **Delivery Orders** — Outgoing stock to customers. Stock sufficiency enforced before validation.
- **Internal Transfers** — Move stock between locations. Dual ledger entry on validation — total stock unchanged, location updated.
- **Stock Adjustments** — Fix physical count discrepancies. Live difference preview before committing.
- **Move History** — Complete audit trail. Every operation logged with timestamp, reference, product, location, and quantity delta.

### Dashboard
- Live KPIs: Total Products, Low Stock, Out of Stock, Pending Receipts, Pending Deliveries, Pending Transfers
- Real-time stock bar chart via Supabase Realtime subscriptions — updates without page refresh
- Pulsing alerts for low stock and out-of-stock items
- Quick navigation filter chips

### Products & Settings
- Full product catalog with SKU, category, UOM, reorder point
- Live on-hand quantity per product across all locations
- Color-coded stock status: green (healthy), yellow (low), red (zero)
- Multi-warehouse and multi-location support
- Product categories management

### Auth
- Email signup and login
- OTP-based password reset with dedicated `/reset-password` page
- Session persistence via Supabase Auth

### AI Assistant
- Natural language inventory queries powered by Groq Llama 3.1
- Intent classification → live Supabase data fetch → structured response
- Never hallucinates — only reports what the database returns
- Persistent chat state across navigation

---

## Architecture

```
User (Browser)
    │
    ├── React App (Vite)
    │       ├── Auth → Supabase Auth
    │       ├── Pages → supabase.from() queries
    │       └── AI Assistant → Groq API
    │                              │
    │                         Intent classify
    │                              │
    │                         Fetch real data from Supabase
    │                              │
    │                         Generate natural language response
    │
    └── Supabase
            ├── PostgreSQL (13 tables + 1 view)
            ├── stock_ledger (append-only, source of truth)
            ├── stock_levels (view — SUM of ledger)
            └── Realtime subscriptions
```

**Stock Ledger Pattern:** Stock is never stored as a mutable number. Every operation writes a `+qty` or `-qty` entry. Current stock = `SUM(quantity_change)` for that product at that location. Immutable audit trail by design.

---

## Database Schema

```
warehouses → locations → stock_ledger ← products ← categories
                              ↑
receipts / deliveries / transfers / adjustments
(all validate by writing to stock_ledger)
                              ↓
                       stock_levels (view)
```

---

## Local Setup

```bash
# Clone
git clone https://github.com/jay-maker113/coreinventory-jay-vagadia.git
cd coreinventory-jay-vagadia

# Install
npm install

# Environment variables
cp .env.example .env
# Fill in your Supabase URL, anon key, and Groq API key

# Run
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GROQ_API_KEY=your-groq-key
```

### Database Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor
3. Copy the entire contents of `schema.sql` from this repo
4. Paste and run it - creates all 13 tables, the `stock_levels` view, and seeds a default warehouse
5. Go to Project Settings -> API -> copy your Project URL and anon key into `.env`
6. Go to Authentication -> URL Configuration -> set Site URL to `http://localhost:5173` and add `http://localhost:5173/reset-password` to Redirect URLs
7. Get a free Groq API key at [console.groq.com](https://console.groq.com) and add it to `.env`

---

## Inventory Flow

```
Vendor → Receipt (validate) → +stock at location
                                      │
                              Transfer (validate) → stock moves location
                                      │
                              Delivery (validate) → -stock at location
                                      │
                              Adjustment (validate) → ±stock correction
                                      │
                              Move History → permanent audit trail
```

---

## Project Structure

```
src/
├── lib/
│   └── supabase.js          # Supabase client
├── components/
│   ├── Layout.jsx            # App shell
│   ├── Sidebar.jsx           # Navigation
│   └── StatusBadge.jsx       # Status pill component
├── pages/
│   ├── Auth.jsx              # Login / signup
│   ├── ResetPassword.jsx     # OTP password reset
│   ├── Dashboard.jsx         # KPIs + realtime chart
│   ├── Products.jsx          # Product catalog + stock
│   ├── Receipts.jsx          # Incoming stock
│   ├── Deliveries.jsx        # Outgoing stock
│   ├── Transfers.jsx         # Internal moves
│   ├── Adjustments.jsx       # Stock corrections
│   ├── MoveHistory.jsx       # Full audit ledger
│   ├── AIAssistant.jsx       # Natural language queries
│   ├── Settings.jsx          # Warehouses + locations
│   └── Profile.jsx           # Account management
└── App.jsx                   # Routing + auth state
```

---

## Built By

**Jay Vagadia**
Odoo x Indus University Hackathon '26
March 2026
