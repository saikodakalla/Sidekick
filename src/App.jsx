import { useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDollarSign,
  CreditCard,
  Globe,
  Home,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Megaphone,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SearchCheck,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
  RefreshCw,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'finances', label: 'Finances', icon: CircleDollarSign },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'discounts', label: 'Discounts', icon: BadgePercent },
]

const salesChannels = [
  { label: 'Online Store', icon: Globe },
  { label: 'Point of Sale', icon: Store },
]

const appItems = [
  { label: 'Shopify Email', icon: Mail },
  { label: 'Shopify Search & Discovery', icon: SearchCheck },
  { label: 'Shopify Flow', icon: Sparkles },
]

const orders = [
  {
    id: '#1049',
    customer: 'Mina Chen',
    channel: 'Online Store',
    amount: '$184.00',
    payment: 'Paid',
    fulfillment: 'Unfulfilled',
  },
  {
    id: '#1048',
    customer: 'Rafael Alvarez',
    channel: 'Shop',
    amount: '$76.50',
    payment: 'Paid',
    fulfillment: 'Fulfilled',
  },
  {
    id: '#1047',
    customer: 'Priya Nair',
    channel: 'POS',
    amount: '$249.99',
    payment: 'Pending',
    fulfillment: 'On hold',
  },
  {
    id: '#1046',
    customer: 'Jordan Smith',
    channel: 'Online Store',
    amount: '$42.00',
    payment: 'Paid',
    fulfillment: 'Archived',
  },
]

const products = [
  {
    title: 'Voyager Canvas Tote',
    status: 'Active',
    inventory: '126 in stock',
    type: 'Bags',
  },
  {
    title: 'Trail Merino Hoodie',
    status: 'Active',
    inventory: '18 low stock',
    type: 'Apparel',
  },
  {
    title: 'Recharge Bottle',
    status: 'Draft',
    inventory: '88 in stock',
    type: 'Accessories',
  },
]

const customers = [
  { name: 'Mina Chen', orders: 9, spend: '$1,248', segment: 'VIP' },
  { name: 'Rafael Alvarez', orders: 3, spend: '$342', segment: 'Returning' },
  { name: 'Priya Nair', orders: 1, spend: '$249', segment: 'New' },
]

const sectionDetails = {
  content: {
    title: 'Content',
    eyebrow: 'Metaobjects, files, and store media',
    cards: [
      ['Metaobjects', 'Manage structured entries for size guides, product highlights, and reusable content.'],
      ['Files', 'Upload images, videos, CSVs, and documents for products, themes, and Sidekick analysis.'],
      ['Blog content', 'Create posts and pages that support search, discovery, and customer education.'],
    ],
  },
  analytics: {
    title: 'Analytics',
    eyebrow: 'Performance overview and reports',
    cards: [
      ['Total sales', '$48,920 across all channels this week.'],
      ['Top product', 'Voyager Canvas Tote generated $8,420 in revenue.'],
      ['Live view', '42 active visitors, 6 active carts, and 2 checkouts started.'],
      ['Reports', 'Sales, acquisition, customer behavior, sessions, and device performance.'],
    ],
  },
  marketing: {
    title: 'Marketing',
    eyebrow: 'Campaigns, channels, and automations',
    cards: [
      ['Campaigns', 'Email, ads, and promotion calendars with attributed sales.'],
      ['Automations', 'Abandoned cart, back-in-stock, post-purchase, and win-back templates.'],
      ['Recommendations', 'Suggested apps and channels based on store activity.'],
    ],
  },
  discounts: {
    title: 'Discounts',
    eyebrow: 'Codes and automatic promotions',
    cards: [
      ['WELCOME15', '15% off for first-time customers. Ends May 8.'],
      ['Free shipping', 'Automatic discount for orders over $75.'],
      ['BOGO Socks', 'Buy one, get one 50% off selected accessories.'],
    ],
  },
  sales: {
    title: 'Sales channels',
    eyebrow: 'Online, offline, and marketplace selling',
    cards: [
      ['Online Store', 'Themes, blog posts, pages, navigation, and preferences.'],
      ['Shop App', 'Mobile discovery, customer profiles, and Shop Pay performance.'],
      ['Point of Sale', 'Retail inventory, registers, locations, and staff permissions.'],
      ['Inbox', 'Customer conversations and chat availability.'],
    ],
  },
  apps: {
    title: 'Apps',
    eyebrow: 'Installed apps and recommendations',
    cards: [
      ['Pinned apps', 'Flow, Inbox, Email, Reviews, and Loyalty appear in the sidebar.'],
      ['App Store', 'Browse marketing, shipping, analytics, subscriptions, and merchandising apps.'],
      ['Settings', 'Manage permissions, support links, and app removals from settings.'],
    ],
  },
  finances: {
    title: 'Finances',
    eyebrow: 'Payouts, balances, billing, and tax',
    cards: [
      ['Summary', '$12,840 pending payout with next transfer on Friday.'],
      ['Balance', 'Shopify Balance card ending 4921 has $8,604 available.'],
      ['Billing', 'Review subscription, transaction fees, app charges, and invoices.'],
      ['Taxes', 'Configure regions, registrations, and auto-calculated rates.'],
    ],
  },
}

function App() {
  const [active, setActive] = useState('home')
  const [sidekickOpen, setSidekickOpen] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState('light')
  const [searchQuery, setSearchQuery] = useState('')
  const isDark = theme === 'dark'

  const activeLabel = useMemo(
    () => navItems.find((item) => item.id === active)?.label ?? 'Home',
    [active],
  )

  const selectSection = (section) => {
    setActive(section)
    setMobileNavOpen(false)
  }

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []

    const entries = [
      ...navItems.map((item) => ({
        label: item.label,
        type: 'Section',
        section: item.id,
      })),
      ...orders.map((order) => ({
        label: `${order.id} · ${order.customer}`,
        type: 'Order',
        section: 'orders',
      })),
      ...products.map((product) => ({
        label: product.title,
        type: 'Product',
        section: 'products',
      })),
      ...customers.map((customer) => ({
        label: customer.name,
        type: 'Customer',
        section: 'customers',
      })),
      ...salesChannels.map((channel) => ({
        label: channel.label,
        type: 'Sales channel',
        section: 'sales',
      })),
      ...appItems.map((app) => ({
        label: app.label,
        type: 'App',
        section: 'apps',
      })),
      {
        label: 'Grow your audience',
        type: 'Dashboard task',
        section: 'home',
      },
      {
        label: 'Sales over time',
        type: 'Analytics',
        section: 'home',
      },
    ]

    return entries
      .filter((entry) => `${entry.label} ${entry.type}`.toLowerCase().includes(query))
      .slice(0, 7)
  }, [searchQuery])

  const openSearchResult = (result) => {
    setActive(result.section)
    setSearchQuery('')
  }

  const submitSearch = (event) => {
    event.preventDefault()
    if (searchResults[0]) openSearchResult(searchResults[0])
  }

  return (
    <div className={`admin-shell ${isDark ? 'theme-dark' : 'theme-light'}`}>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="shopify-logo" aria-label="Shopify">
          <img src="/png-clipart-shopify-logo-e-commerce-business-super-sale-angle-text.png" alt="" />
          <strong>shopify</strong>
        </div>
        <form className="command-bar" role="search" onSubmit={submitSearch}>
          <button type="submit" aria-label="Search">
            <Search size={18} />
          </button>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
          />
          <kbd>⌘K</kbd>
          {searchQuery ? (
            <div className="search-results">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button key={`${result.type}-${result.label}`} type="button" onClick={() => openSearchResult(result)}>
                    <span>{result.label}</span>
                    <em>{result.type}</em>
                  </button>
                ))
              ) : (
                <p>No results for "{searchQuery}"</p>
              )}
            </div>
          ) : null}
        </form>
        <div className="top-actions">
          <button className="icon-button" type="button" aria-label="Create new item">
            <Plus size={20} />
          </button>
          <button
            className="icon-button theme-toggle"
            type="button"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            className="sidekick-trigger"
            type="button"
            aria-label="Open Sidekick"
            onClick={() => setSidekickOpen(true)}
          >
            <img src="/sidekick-icon.svg" alt="" />
          </button>
          <button className="topbar-square" type="button" aria-label="Notifications">
            <Bell size={20} />
            <span className="dot" />
          </button>
          <button className="account-pill" type="button">
            <span>Sai Kodakalla</span>
            <strong aria-hidden="true">SK</strong>
          </button>
        </div>
      </header>

      <aside className={`sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="store-switcher">
          <div>
            <strong>Showcase Boards</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={`nav-item ${active === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.count ? <em>{item.count}</em> : null}
              </button>
            )
          })}
        </nav>

        <div className="nav-group">
          <button className="nav-heading" type="button">
            <span>Sales channels</span>
            <ChevronRight size={15} />
          </button>
          {salesChannels.map((item) => {
            const Icon = item.icon
            return (
              <button className="nav-item subtle" key={item.label} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="nav-group apps-group">
          <button className="nav-heading" type="button">
            <span>Apps</span>
            <ChevronRight size={15} />
          </button>
          {appItems.map((item) => {
            const Icon = item.icon
            return (
              <button className="nav-item subtle" key={item.label} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <button className="nav-item settings-link" type="button">
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </aside>

      <div className="main-frame">
        <main className="workspace">
          <div className={`workspace-header ${active === 'home' ? 'home-title-hidden' : ''}`}>
            <div>
              <span className="breadcrumb">Admin / {activeLabel}</span>
              <h1>{active === 'home' ? 'Home' : activeLabel}</h1>
            </div>
            <div className="header-actions">
              <button className="secondary-button" type="button">
                Export
              </button>
              <button className="primary-button" type="button">
                <Plus size={16} />
                Create
              </button>
            </div>
          </div>

          {active === 'home' ? <HomeDashboard /> : null}
          {active === 'orders' ? <OrdersSection /> : null}
          {active === 'products' ? <ProductsSection /> : null}
          {active === 'customers' ? <CustomersSection /> : null}
          {sectionDetails[active] ? <DetailSection section={sectionDetails[active]} /> : null}
        </main>
      </div>

      {mobileNavOpen ? (
        <button
          className="scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <SidekickPanel isOpen={sidekickOpen} onClose={() => setSidekickOpen(false)} />
    </div>
  )
}

function HomeDashboard() {
  return (
    <div className="home-dashboard">
      <div className="home-controls">
        <button type="button">
          Today
          <ChevronDown size={14} />
        </button>
        <button type="button">
          All channels
          <ChevronDown size={14} />
        </button>
        <span className="live-pill">
          <i />
          123 live visitors
        </span>
        <span className="payout-pill">Next payout: $123.45</span>
      </div>

      <section className="analytics-card">
        <div className="analytics-metrics">
          {[
            ['Sessions', '264', '2%'],
            ['Total sales', '$226.11', '1.25%'],
            ['Total orders', '5', '1.25%'],
            ['Conversion rate', '15.79%', '1.50%'],
          ].map(([label, value, delta]) => (
            <div className="analytics-metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <em>↗ {delta}</em>
            </div>
          ))}
          <ChevronDown className="collapse-icon" size={18} />
        </div>
        <div className="chart-area" aria-label="Sales chart">
          <div className="chart-y-axis">
            <span>12K</span>
            <span>6K</span>
            <span>0K</span>
          </div>
          <svg viewBox="0 0 820 230" role="presentation" aria-hidden="true">
            <path
              className="chart-grid"
              d="M24 48H796M24 115H796M24 182H796"
            />
            <path
              className="chart-line"
              d="M26 164C82 160 118 130 164 118C210 106 230 94 282 96C336 98 354 96 398 88C444 80 459 35 512 38C562 40 580 66 625 74C682 84 692 142 744 153C770 158 788 162 800 162"
            />
          </svg>
          <div className="chart-x-axis">
            <span>12:00 AM</span>
            <span>6:00 AM</span>
            <span>12:00 PM</span>
            <span>6:00 PM</span>
            <span>12:00 AM</span>
          </div>
        </div>
      </section>

      <section className="todo-card">
        <h2>Things to do next</h2>
        {[
          ['5 orders to fulfill', ShoppingBag],
          ['1 payment to capture', CreditCard],
        ].map(([label, Icon]) => (
          <button className="todo-row" type="button" key={label}>
            <Icon size={19} />
            <span>{label}</span>
            <ChevronRight size={18} />
          </button>
        ))}
      </section>

      <section className="audience-card">
        <div className="audience-header">
          <div>
            <h2>Grow your audience</h2>
            <p>Reach more shoppers and increase traffic to your store</p>
          </div>
          <div className="card-tools">
            <MoreHorizontal size={18} />
            <ChevronDown size={18} />
          </div>
        </div>
        <div className="progress-row">
          <span>0 of 5 tasks complete</span>
          <div>
            <i />
          </div>
        </div>
        <div className="featured-task">
          <Circle size={24} />
          <div>
            <h3>Offer a first purchase upsell</h3>
            <p>
              Up to 95% of sales can come from upsells if they&apos;re offered and they cost less
              than acquiring a new customer. Turn your customers into repeat buyers by automating
              your first purchase upsell offers.
            </p>
            <button className="dark-action" type="button">
              Enable upsell automation workflow
            </button>
          </div>
          <div className="mini-preview" aria-hidden="true">
            <div className="mini-top" />
            <div className="mini-body">
              <span />
              <span />
              <strong />
            </div>
            <div className="mini-cart">+</div>
          </div>
        </div>
        {[
          'Increase store visibility with SEO',
          'Reward customers for referrals',
          'Promote your products on TikTok',
          'Collaborate with influencers',
        ].map((task) => (
          <button className="audience-task" type="button" key={task}>
            <CircleCheck size={23} />
            <span>{task}</span>
          </button>
        ))}
      </section>
    </div>
  )
}

function OrdersSection() {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Orders"
        label="Open, unfulfilled, paid, and archived orders"
        filters={['All', 'Open', 'Unfulfilled', 'Paid', 'Archived']}
      />
      <DataTable
        columns={['Order', 'Customer', 'Channel', 'Amount', 'Payment', 'Fulfillment']}
        rows={orders.map((order) => [
          order.id,
          order.customer,
          order.channel,
          order.amount,
          order.payment,
          order.fulfillment,
        ])}
      />
      <div className="detail-preview">
        <div>
          <span className="eyebrow">Order details preview</span>
          <h2>#1049 · Mina Chen</h2>
          <p>Purchased 2 items. Shipping to Brooklyn, NY. Timeline includes payment capture, risk check, and staff notes.</p>
        </div>
        <div className="preview-actions">
          <button className="primary-button" type="button">
            Fulfill items
          </button>
          <button className="secondary-button" type="button">
            Refund
          </button>
          <button className="secondary-button" type="button">
            Duplicate
          </button>
        </div>
      </div>
    </section>
  )
}

function ProductsSection() {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Products"
        label="Product listings, inventory, collections, and gift cards"
        filters={['All', 'Active', 'Draft', 'Low stock', 'Collections']}
      />
      <DataTable
        columns={['Product', 'Status', 'Inventory', 'Type']}
        rows={products.map((product) => [
          product.title,
          product.status,
          product.inventory,
          product.type,
        ])}
      />
      <div className="product-form-preview">
        <article>
          <span className="eyebrow">Product detail fields</span>
          <h2>Trail Merino Hoodie</h2>
          <p>Title, description, media, pricing, inventory, shipping weight, variants, metafields, and SEO preview.</p>
        </article>
        <article>
          <span className="eyebrow">Inventory</span>
          <h2>4 locations tracked</h2>
          <p>Continue selling rules, low-stock alerts, and transfer history are visible from the inventory subsection.</p>
        </article>
      </div>
    </section>
  )
}

function CustomersSection() {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Customers"
        label="Profiles, order history, segments, and B2B companies"
        filters={['All', 'VIP', 'Returning', 'New', 'Companies']}
      />
      <DataTable
        columns={['Customer', 'Orders', 'Total spend', 'Segment']}
        rows={customers.map((customer) => [
          customer.name,
          customer.orders,
          customer.spend,
          customer.segment,
        ])}
      />
      <div className="cards-row">
        <article className="insight-card">
          <span className="eyebrow">Segments</span>
          <strong>Build targeted audiences</strong>
          <p>Create segments from purchase history, tags, behavior, location, and lifetime value.</p>
        </article>
        <article className="insight-card">
          <span className="eyebrow">Companies</span>
          <strong>Manage B2B buyers</strong>
          <p>Company profiles include contacts, locations, terms, tax IDs, and wholesale-specific notes.</p>
        </article>
      </div>
    </section>
  )
}

function DetailSection({ section }) {
  return (
    <section className="detail-section">
      <div className="section-intro">
        <span className="eyebrow">{section.eyebrow}</span>
        <h2>{section.title} workspace</h2>
      </div>
      <div className="detail-card-grid">
        {section.cards.map(([title, detail]) => (
          <article className="detail-card" key={title}>
            <LayoutDashboard size={20} />
            <strong>{title}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function SectionToolbar({ title, label, filters }) {
  return (
    <div className="section-toolbar">
      <div>
        <span className="eyebrow">{label}</span>
        <h2>{title}</h2>
      </div>
      <div className="filter-row">
        {filters.map((filter, index) => (
          <button className={index === 0 ? 'filter active' : 'filter'} key={filter} type="button">
            {filter}
          </button>
        ))}
      </div>
    </div>
  )
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('-')}>
              {row.map((cell) => (
                <td key={cell}>
                  {String(cell).includes('Paid') ||
                  String(cell).includes('Active') ||
                  String(cell).includes('VIP') ? (
                    <span className="status-pill positive">{cell}</span>
                  ) : String(cell).includes('Unfulfilled') ||
                    String(cell).includes('Pending') ||
                    String(cell).includes('low') ? (
                    <span className="status-pill warning">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
              <td>
                <button className="row-action" type="button" aria-label="Row actions">
                  <MoreHorizontal size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SidekickPanel({ isOpen, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [connections, setConnections] = useState(null)
  const [isThinking, setIsThinking] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/status')
      .then((response) => response.json())
      .then(setConnections)
      .catch(() => {
        setConnections({ ok: false, anthropic: false, google: false, microsoft: false })
      })
  }, [isOpen])

  const createAssistantMessage = (text) => {
    const normalized = text.toLowerCase()
    if (normalized.includes('sales') || normalized.includes('dropoff') || normalized.includes('analyze')) {
      return {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        chart: true,
        text:
          "The dip in sales is probably due to minimal snow. These are summer months in many regions, so it's natural for sales to decrease.",
      }
    }

    if (normalized.includes('discount')) {
      return {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text:
          'I can draft a discount for you. Choose the percentage, customer eligibility, and dates, then I will ask for confirmation before creating it.',
      }
    }

    return {
      id: `assistant-${Date.now()}`,
      sender: 'assistant',
      text:
        'I can help with store tasks, analytics, products, orders, theme edits, and discounts. Tell me what you want to change or understand.',
    }
  }

  const sendPrompt = async (text = prompt) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    }
    setMessages((current) => [...current, userMessage])
    setPrompt('')
    setIsThinking(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-6),
        }),
      })
      const data = await response.json()
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.display?.answer || data.error || createAssistantMessage(trimmed).text,
        files: data.display?.files || [],
        visual: data.display?.visual || null,
        raw: data.raw || null,
      }
      setMessages((current) => [...current, assistantMessage])
    } catch {
      setMessages((current) => [...current, createAssistantMessage(trimmed)])
    } finally {
      setIsThinking(false)
    }
  }

  return (
    <aside className={`sidekick-panel ${isOpen ? 'is-open' : ''}`} aria-label="Shopify Sidekick">
      <div className="sidekick-header">
        <strong>Sidekick</strong>
        <div className="sidekick-controls">
          <button className="icon-button" type="button" aria-label="Close Sidekick" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="chat-stream">
        {messages.length === 0 ? (
          <div className="sidekick-start">
            <AssistantBubble>
              <p>
                I&apos;m Sidekick, your Shopify assistant. Ask questions and get help with your
                to-do list. I&apos;m still learning and can sometimes make mistakes, so trust your
                expertise. What would you like help with?
              </p>
            </AssistantBubble>
            <div className="connection-row">
              <a className={connections?.google ? 'connected' : ''} href="/api/oauth/google/start">
                {connections?.google ? 'Google Drive connected' : 'Connect Google Drive'}
              </a>
              <a className={connections?.microsoft ? 'connected' : ''} href="/api/oauth/microsoft/start">
                {connections?.microsoft ? 'OneDrive connected' : 'Connect OneDrive'}
              </a>
            </div>
            <div className="prompt-chips">
              <button type="button" onClick={() => sendPrompt('Create a discount')}>
                Create a discount
              </button>
              <button type="button" onClick={() => sendPrompt('Analyze store sales')}>
                Analyze store
              </button>
              <button type="button" onClick={() => sendPrompt('Edit theme')}>
                Edit theme
              </button>
              <button className="chip-icon" type="button" aria-label="More suggestions">
                <Lightbulb size={20} />
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.sender === 'assistant' ? (
              <AssistantBubble key={message.id}>
                <p>{message.text}</p>
                {message.files?.length ? <SourceFiles files={message.files} /> : null}
                {message.visual ? <VisualSummary visual={message.visual} /> : null}
                {message.chart ? <SalesReportCard /> : null}
              </AssistantBubble>
            ) : (
              <div className="message-row user-row" key={message.id}>
                <span className="user-avatar">SK</span>
                <div className="message user">{message.text}</div>
              </div>
            ),
          )
        )}
        {isThinking ? (
          <AssistantBubble>
            <p>Searching connected files and checking the most relevant results...</p>
          </AssistantBubble>
        ) : null}
      </div>

      <form
        className="sidekick-composer"
        onSubmit={(event) => {
          event.preventDefault()
          sendPrompt()
        }}
      >
        <label>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask anything..."
          />
          <button className="composer-icon" type="button" aria-label="Regenerate">
            <RefreshCw size={19} />
          </button>
          <button className="composer-send" type="submit" aria-label="Send prompt">
            <Send size={21} />
          </button>
        </label>
      </form>
    </aside>
  )
}

function AssistantBubble({ children }) {
  return (
    <div className="message-row assistant-row">
      <span className="sidekick-avatar">
        <img src="/sidekick-icon.svg" alt="" />
      </span>
      <div className="message assistant">{children}</div>
    </div>
  )
}

function SalesReportCard() {
  return (
    <div className="sidekick-report-card">
      <svg viewBox="0 0 360 190" aria-hidden="true" role="presentation">
        <path className="report-grid" d="M28 32H340M28 95H340M28 158H340" />
        <path
          className="report-dotted"
          d="M72 100C96 82 118 70 142 55C165 43 181 39 196 58C212 79 205 106 221 124C245 151 267 106 291 99C314 92 329 111 340 122"
        />
        <path
          className="report-line"
          d="M72 82C96 80 118 61 142 42C164 25 184 22 197 42C211 64 205 102 221 121C244 149 268 98 293 93C315 89 329 108 340 118"
        />
        <text x="12" y="28">$5k</text>
        <text x="12" y="99">$4k</text>
        <text x="12" y="164">$3k</text>
        <text x="72" y="184">Mar 1</text>
        <text x="185" y="184">Apr 1</text>
        <text x="302" y="184">Jul 1</text>
      </svg>
      <div>
        <div>
          <strong>Sales over time</strong>
          <span>Mar 1-Jul 30, 2023</span>
        </div>
        <button type="button">View report</button>
      </div>
    </div>
  )
}

function SourceFiles({ files }) {
  return (
    <div className="source-files">
      {files.slice(0, 4).map((file) => (
        <a href={file.url} target="_blank" rel="noreferrer" key={`${file.provider}-${file.title}`}>
          <strong>{file.title}</strong>
          <span>{file.provider} · {file.reason || 'Relevant source'}</span>
        </a>
      ))}
    </div>
  )
}

function VisualSummary({ visual }) {
  if (!visual || visual.type === 'null' || !Array.isArray(visual.points) || visual.points.length === 0) {
    return null
  }

  const max = Math.max(...visual.points.map((point) => Number(point.value) || 0), 1)

  return (
    <div className="visual-summary">
      <strong>{visual.title || 'Visual summary'}</strong>
      <div>
        {visual.points.slice(0, 6).map((point) => (
          <span key={point.label}>
            <em>{point.label}</em>
            <i style={{ width: `${Math.max(8, ((Number(point.value) || 0) / max) * 100)}%` }} />
            <b>{point.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export default App
