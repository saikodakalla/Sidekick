import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import "./App.css";

const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "products", label: "Products", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "finances", label: "Finances", icon: CircleDollarSign },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "discounts", label: "Discounts", icon: BadgePercent },
];

const salesChannels = [
  { label: "Online Store", icon: Globe },
  { label: "Point of Sale", icon: Store },
];

const appItems = [
  { label: "Shopify Email", icon: Mail },
  { label: "Shopify Search & Discovery", icon: SearchCheck },
  { label: "Shopify Flow", icon: Sparkles },
];

const orders = [
  {
    id: "#1049",
    customer: "Mina Chen",
    channel: "Online Store",
    amount: "$184.00",
    payment: "Paid",
    fulfillment: "Unfulfilled",
  },
  {
    id: "#1048",
    customer: "Rafael Alvarez",
    channel: "Shop",
    amount: "$76.50",
    payment: "Paid",
    fulfillment: "Fulfilled",
  },
  {
    id: "#1047",
    customer: "Priya Nair",
    channel: "POS",
    amount: "$249.99",
    payment: "Pending",
    fulfillment: "On hold",
  },
  {
    id: "#1046",
    customer: "Jordan Smith",
    channel: "Online Store",
    amount: "$42.00",
    payment: "Paid",
    fulfillment: "Archived",
  },
];

const initialProducts = [
  {
    id: "seed-1",
    title: "Voyager Canvas Tote",
    status: "Active",
    inventory: "126 in stock",
    type: "Bags",
  },
  {
    id: "seed-2",
    title: "Trail Merino Hoodie",
    status: "Active",
    inventory: "18 low stock",
    type: "Apparel",
  },
  {
    id: "seed-3",
    title: "Recharge Bottle",
    status: "Draft",
    inventory: "88 in stock",
    type: "Accessories",
  },
];

const customers = [
  { name: "Mina Chen", orders: 9, spend: "$1,248", segment: "VIP" },
  { name: "Rafael Alvarez", orders: 3, spend: "$342", segment: "Returning" },
  { name: "Priya Nair", orders: 1, spend: "$249", segment: "New" },
];

const sectionDetails = {
  content: {
    title: "Content",
    eyebrow: "Metaobjects, files, and store media",
    cards: [
      [
        "Metaobjects",
        "Manage structured entries for size guides, product highlights, and reusable content.",
      ],
      [
        "Files",
        "Upload images, videos, CSVs, and documents for products, themes, and Sidekick analysis.",
      ],
      [
        "Blog content",
        "Create posts and pages that support search, discovery, and customer education.",
      ],
    ],
  },
  analytics: {
    title: "Analytics",
    eyebrow: "Performance overview and reports",
    cards: [
      ["Total sales", "$48,920 across all channels this week."],
      ["Top product", "Voyager Canvas Tote generated $8,420 in revenue."],
      [
        "Live view",
        "42 active visitors, 6 active carts, and 2 checkouts started.",
      ],
      [
        "Reports",
        "Sales, acquisition, customer behavior, sessions, and device performance.",
      ],
    ],
  },
  marketing: {
    title: "Marketing",
    eyebrow: "Campaigns, channels, and automations",
    cards: [
      [
        "Campaigns",
        "Email, ads, and promotion calendars with attributed sales.",
      ],
      [
        "Automations",
        "Abandoned cart, back-in-stock, post-purchase, and win-back templates.",
      ],
      [
        "Recommendations",
        "Suggested apps and channels based on store activity.",
      ],
    ],
  },
  discounts: {
    title: "Discounts",
    eyebrow: "Codes and automatic promotions",
    cards: [
      ["WELCOME15", "15% off for first-time customers. Ends May 8."],
      ["Free shipping", "Automatic discount for orders over $75."],
      ["BOGO Socks", "Buy one, get one 50% off selected accessories."],
    ],
  },
  sales: {
    title: "Sales channels",
    eyebrow: "Online, offline, and marketplace selling",
    cards: [
      [
        "Online Store",
        "Themes, blog posts, pages, navigation, and preferences.",
      ],
      [
        "Shop App",
        "Mobile discovery, customer profiles, and Shop Pay performance.",
      ],
      [
        "Point of Sale",
        "Retail inventory, registers, locations, and staff permissions.",
      ],
      ["Inbox", "Customer conversations and chat availability."],
    ],
  },
  apps: {
    title: "Apps",
    eyebrow: "Installed apps and recommendations",
    cards: [
      [
        "Pinned apps",
        "Flow, Inbox, Email, Reviews, and Loyalty appear in the sidebar.",
      ],
      [
        "App Store",
        "Browse marketing, shipping, analytics, subscriptions, and merchandising apps.",
      ],
      [
        "Settings",
        "Manage permissions, support links, and app removals from settings.",
      ],
    ],
  },
  finances: {
    title: "Finances",
    eyebrow: "Payouts, balances, billing, and tax",
    cards: [
      ["Summary", "$12,840 pending payout with next transfer on Friday."],
      ["Balance", "Shopify Balance card ending 4921 has $8,604 available."],
      [
        "Billing",
        "Review subscription, transaction fees, app charges, and invoices.",
      ],
      ["Taxes", "Configure regions, registrations, and auto-calculated rates."],
    ],
  },
};

function App() {
  const [active, setActive] = useState("home");
  const [sidekickOpen, setSidekickOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState(initialProducts);
  const isDark = theme === "dark";

  const activeLabel = useMemo(
    () => navItems.find((item) => item.id === active)?.label ?? "Home",
    [active],
  );

  const selectSection = (section) => {
    setActive(section);
    setMobileNavOpen(false);
  };

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const entries = [
      ...navItems.map((item) => ({
        label: item.label,
        type: "Section",
        section: item.id,
      })),
      ...orders.map((order) => ({
        label: `${order.id} · ${order.customer}`,
        type: "Order",
        section: "orders",
      })),
      ...products.map((product) => ({
        label: product.title,
        type: "Product",
        section: "products",
      })),
      ...customers.map((customer) => ({
        label: customer.name,
        type: "Customer",
        section: "customers",
      })),
      ...salesChannels.map((channel) => ({
        label: channel.label,
        type: "Sales channel",
        section: "sales",
      })),
      ...appItems.map((app) => ({
        label: app.label,
        type: "App",
        section: "apps",
      })),
      {
        label: "Grow your audience",
        type: "Dashboard task",
        section: "home",
      },
      {
        label: "Sales over time",
        type: "Analytics",
        section: "home",
      },
    ];

    return entries
      .filter((entry) =>
        `${entry.label} ${entry.type}`.toLowerCase().includes(query),
      )
      .slice(0, 7);
  }, [searchQuery]);

  const openSearchResult = (result) => {
    setActive(result.section);
    setSearchQuery("");
  };

  const submitSearch = (event) => {
    event.preventDefault();
    if (searchResults[0]) openSearchResult(searchResults[0]);
  };

  return (
    <div className={`admin-shell ${isDark ? "theme-dark" : "theme-light"}`}>
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
          <img
            src="/png-clipart-shopify-logo-e-commerce-business-super-sale-angle-text.png"
            alt=""
          />
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
                  <button
                    key={`${result.type}-${result.label}`}
                    type="button"
                    onClick={() => openSearchResult(result)}
                  >
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
          <button
            className="icon-button"
            type="button"
            aria-label="Create new item"
          >
            <Plus size={20} />
          </button>
          <button
            className="icon-button theme-toggle"
            type="button"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
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
          <button
            className="topbar-square"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={20} />
            <span className="dot" />
          </button>
          <button className="account-pill" type="button">
            <span>Sai Kodakalla</span>
            <strong aria-hidden="true">SK</strong>
          </button>
        </div>
      </header>

      <aside className={`sidebar ${mobileNavOpen ? "is-open" : ""}`}>
        <div className="store-switcher">
          <div>
            <strong>Showcase Boards</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${active === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.count ? <em>{item.count}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="nav-group">
          <button className="nav-heading" type="button">
            <span>Sales channels</span>
            <ChevronRight size={15} />
          </button>
          {salesChannels.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="nav-item subtle"
                key={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="nav-group apps-group">
          <button className="nav-heading" type="button">
            <span>Apps</span>
            <ChevronRight size={15} />
          </button>
          {appItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="nav-item subtle"
                key={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button className="nav-item settings-link" type="button">
          <Settings size={18} />
          <span>Settings</span>
        </button>
      </aside>

      <div className="main-frame">
        <main className="workspace">
          <div
            className={`workspace-header ${active === "home" ? "home-title-hidden" : ""}`}
          >
            <div>
              <span className="breadcrumb">Admin / {activeLabel}</span>
              <h1>{active === "home" ? "Home" : activeLabel}</h1>
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

          {active === "home" ? <HomeDashboard /> : null}
          {active === "orders" ? <OrdersSection /> : null}
          {active === "products" ? (
            <ProductsSection products={products} />
          ) : null}
          {active === "customers" ? <CustomersSection /> : null}
          {sectionDetails[active] ? (
            <DetailSection section={sectionDetails[active]} />
          ) : null}
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

      <SidekickPanel
        isOpen={sidekickOpen}
        onClose={() => setSidekickOpen(false)}
        setProducts={setProducts}
        onNavigateProducts={() => {
          setActive("products");
          setSidekickOpen(false);
        }}
      />
    </div>
  );
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
            ["Sessions", "264", "2%"],
            ["Total sales", "$226.11", "1.25%"],
            ["Total orders", "5", "1.25%"],
            ["Conversion rate", "15.79%", "1.50%"],
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
            <path className="chart-grid" d="M24 48H796M24 115H796M24 182H796" />
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
          ["5 orders to fulfill", ShoppingBag],
          ["1 payment to capture", CreditCard],
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
              Up to 95% of sales can come from upsells if they&apos;re offered
              and they cost less than acquiring a new customer. Turn your
              customers into repeat buyers by automating your first purchase
              upsell offers.
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
          "Increase store visibility with SEO",
          "Reward customers for referrals",
          "Promote your products on TikTok",
          "Collaborate with influencers",
        ].map((task) => (
          <button className="audience-task" type="button" key={task}>
            <CircleCheck size={23} />
            <span>{task}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

function OrdersSection() {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Orders"
        label="Open, unfulfilled, paid, and archived orders"
        filters={["All", "Open", "Unfulfilled", "Paid", "Archived"]}
      />
      <DataTable
        columns={[
          "Order",
          "Customer",
          "Channel",
          "Amount",
          "Payment",
          "Fulfillment",
        ]}
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
          <p>
            Purchased 2 items. Shipping to Brooklyn, NY. Timeline includes
            payment capture, risk check, and staff notes.
          </p>
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
  );
}

function ProductsSection({ products }) {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Products"
        label="Product listings, inventory, collections, and gift cards"
        filters={["All", "Active", "Draft", "Low stock", "Collections"]}
      />
      <DataTable
        columns={["Product", "Status", "Inventory", "Type"]}
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
          <p>
            Title, description, media, pricing, inventory, shipping weight,
            variants, metafields, and SEO preview.
          </p>
        </article>
        <article>
          <span className="eyebrow">Inventory</span>
          <h2>4 locations tracked</h2>
          <p>
            Continue selling rules, low-stock alerts, and transfer history are
            visible from the inventory subsection.
          </p>
        </article>
      </div>
    </section>
  );
}

function CustomersSection() {
  return (
    <section className="table-panel">
      <SectionToolbar
        title="Customers"
        label="Profiles, order history, segments, and B2B companies"
        filters={["All", "VIP", "Returning", "New", "Companies"]}
      />
      <DataTable
        columns={["Customer", "Orders", "Total spend", "Segment"]}
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
          <p>
            Create segments from purchase history, tags, behavior, location, and
            lifetime value.
          </p>
        </article>
        <article className="insight-card">
          <span className="eyebrow">Companies</span>
          <strong>Manage B2B buyers</strong>
          <p>
            Company profiles include contacts, locations, terms, tax IDs, and
            wholesale-specific notes.
          </p>
        </article>
      </div>
    </section>
  );
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
  );
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
          <button
            className={index === 0 ? "filter active" : "filter"}
            key={filter}
            type="button"
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
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
            <tr key={row.join("-")}>
              {row.map((cell) => (
                <td key={cell}>
                  {String(cell).includes("Paid") ||
                  String(cell).includes("Active") ||
                  String(cell).includes("VIP") ? (
                    <span className="status-pill positive">{cell}</span>
                  ) : String(cell).includes("Unfulfilled") ||
                    String(cell).includes("Pending") ||
                    String(cell).includes("low") ? (
                    <span className="status-pill warning">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
              <td>
                <button
                  className="row-action"
                  type="button"
                  aria-label="Row actions"
                >
                  <MoreHorizontal size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SidekickPanel({ isOpen, onClose, setProducts, onNavigateProducts }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [connections, setConnections] = useState(null);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/status")
      .then((response) => response.json())
      .then(setConnections)
      .catch(() => {
        setConnections({
          ok: false,
          anthropic: false,
          google: false,
          microsoft: false,
        });
      });
  }, [isOpen]);

  const createAssistantMessage = (text) => {
    const normalized = text.toLowerCase();
    if (
      normalized.includes("sales") ||
      normalized.includes("dropoff") ||
      normalized.includes("analyze")
    ) {
      return {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        chart: true,
        text: "The dip in sales is probably due to minimal snow. These are summer months in many regions, so it's natural for sales to decrease.",
      };
    }

    if (normalized.includes("discount")) {
      return {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: "I can draft a discount for you. Choose the percentage, customer eligibility, and dates, then I will ask for confirmation before creating it.",
      };
    }

    return {
      id: `assistant-${Date.now()}`,
      sender: "assistant",
      text: "I can help with store tasks, analytics, products, orders, theme edits, and discounts. Tell me what you want to change or understand.",
    };
  };

  const sendPrompt = async (text = prompt) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: trimmed,
    };
    const assistantId = `assistant-${Date.now()}`;
    const placeholder = {
      id: assistantId,
      sender: "assistant",
      pending: "thinking",
      text: "",
    };
    setMessages((current) => [...current, userMessage, placeholder]);
    setPrompt("");
    setIsThinking(true);

    const updateAssistant = (patchOrFn) =>
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== assistantId) return m;
          const patch = typeof patchOrFn === "function" ? patchOrFn(m) : patchOrFn;
          return { ...m, ...patch };
        }),
      );

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-6),
        }),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "plan") {
            const isStorefront = event.plan?.intent === "storefront_agent";
            const needsDrive =
              !isStorefront &&
              (event.plan?.needsFiles || event.plan?.intent === "product_create");
            updateAssistant({
              pending: isStorefront ? "storefront" : needsDrive ? "drive" : "thinking",
            });
          } else if (event.type === "tool_call") {
            updateAssistant((m) => ({
              actions: [
                ...(m.actions || []),
                { name: event.name, input: event.input, done: false },
              ],
            }));
          } else if (event.type === "tool_result") {
            updateAssistant((m) => {
              const actions = [...(m.actions || [])];
              const idx = actions.map((a) => a.name).lastIndexOf(event.name);
              if (idx !== -1) actions[idx] = { ...actions[idx], done: true };
              return { actions };
            });
          } else if (event.type === "agent_text") {
            // intermediate agent narration — ignore, final answer covers it
          } else if (event.type === "final") {
            updateAssistant({
              pending: null,
              text: event.display?.answer || "",
              files: event.display?.files || [],
              visual: event.display?.visual || null,
              product: event.display?.product || null,
              raw: event.raw || null,
            });
          }
        }
      }
    } catch {
      updateAssistant({
        pending: null,
        text: createAssistantMessage(trimmed).text,
      });
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <aside
      className={`sidekick-panel ${isOpen ? "is-open" : ""}`}
      aria-label="Shopify Sidekick"
    >
      <div className="sidekick-header">
        <strong>Sidekick</strong>
        <div className="sidekick-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="Close Sidekick"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="chat-stream">
        {messages.length === 0 ? (
          <div className="sidekick-start">
            <AssistantBubble>
              <p>
                I&apos;m Sidekick, your Shopify assistant. Ask questions and get
                help with your to-do list. I&apos;m still learning and can
                sometimes make mistakes, so trust your expertise. What would you
                like help with?
              </p>
            </AssistantBubble>
            {!connections?.google ? (
              <div className="connection-row">
                <a href="/api/oauth/google/start">Connect Google Drive</a>
              </div>
            ) : null}
          </div>
        ) : (
          messages.map((message) =>
            message.sender === "assistant" ? (
              <AssistantBubble key={message.id}>
                {message.pending === "drive" ? (
                  <DriveLoading />
                ) : message.pending === "storefront" ? (
                  <StorefrontLoading actions={message.actions} />
                ) : message.pending === "thinking" ? (
                  <ThinkingLoading />
                ) : (
                  <>
                    {message.actions?.length > 0 && (
                      <AgentActionFeed actions={message.actions} />
                    )}
                    <MarkdownText text={message.text} />
                    {message.product ? (
                      <ProductDraftCard
                        draft={message.product}
                        files={message.files}
                        setProducts={setProducts}
                        onNavigateProducts={onNavigateProducts}
                        shopifyConfigured={Boolean(
                          connections?.shopifyConfigured,
                        )}
                      />
                    ) : (
                      <>
                        {message.files?.length ? (
                          <SourceFiles files={message.files} />
                        ) : null}
                        {message.visual ? (
                          <VisualSummary visual={message.visual} />
                        ) : null}
                        {message.chart ? <SalesReportCard /> : null}
                      </>
                    )}
                  </>
                )}
              </AssistantBubble>
            ) : (
              <div className="message-row user-row" key={message.id}>
                <span className="user-avatar">SK</span>
                <div className="message user">{message.text}</div>
              </div>
            ),
          )
        )}
      </div>

      <form
        className="sidekick-composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendPrompt();
        }}
      >
        <label>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask anything..."
          />
          <button
            className="composer-icon"
            type="button"
            aria-label="Regenerate"
          >
            <RefreshCw size={19} />
          </button>
          <button
            className="composer-send"
            type="submit"
            aria-label="Send prompt"
          >
            <Send size={21} />
          </button>
        </label>
      </form>
    </aside>
  );
}

function MarkdownText({ text }) {
  if (!text) return null;
  // Split on double newlines for paragraphs, single newlines for line breaks
  const paragraphs = text.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, i) => {
        // Render inline: **bold**, *italic*, [text](url), bare URLs
        const parts = [];
        let remaining = para;
        let key = 0;
        const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https?:\/\/[^\)]+)\)|(https?:\/\/\S+))/g;
        let lastIndex = 0;
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(remaining)) !== null) {
          if (match.index > lastIndex) {
            parts.push(remaining.slice(lastIndex, match.index));
          }
          if (match[2]) {
            parts.push(<strong key={key++}>{match[2]}</strong>);
          } else if (match[3]) {
            parts.push(<em key={key++}>{match[3]}</em>);
          } else if (match[4]) {
            parts.push(<a key={key++} href={match[5]} target="_blank" rel="noreferrer">{match[4]}</a>);
          } else if (match[6]) {
            parts.push(<a key={key++} href={match[6]} target="_blank" rel="noreferrer">{match[6]}</a>);
          }
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex));
        return <p key={i}>{parts}</p>;
      })}
    </>
  );
}

function AssistantBubble({ children }) {
  return (
    <div className="message-row assistant-row">
      <span className="sidekick-avatar">
        <img src="/sidekick-icon.svg" alt="" />
      </span>
      <div className="message assistant">{children}</div>
    </div>
  );
}

function DriveLoading() {
  return (
    <div className="drive-loading" role="status" aria-live="polite">
      <img src="/8630399.png" alt="" />
      <span>Checking Google Drive…</span>
    </div>
  );
}

function ThinkingLoading() {
  return (
    <div className="thinking-loading" role="status" aria-live="polite">
      <span>Thinking…</span>
    </div>
  );
}

const TOOL_LABELS = {
  get_storefront_audit: "Auditing store",
  scan_drive_for_product: "Scanning Drive",
  create_shopify_product: "Creating product",
  publish_product: "Publishing product",
  unpublish_product: "Unpublishing product",
  delete_product: "Deleting product",
  update_product: "Updating product",
  get_pages: "Reading pages",
  create_or_update_page: "Updating page",
  delete_page: "Deleting page",
  get_theme_settings: "Reading theme",
  update_theme_settings: "Updating theme",
  create_collection: "Creating collection",
  delete_collection: "Deleting collection",
  add_product_to_collection: "Adding to collection",
  get_menus: "Reading menus",
};

function StorefrontLoading({ actions }) {
  const current = actions?.filter((a) => !a.done).at(-1);
  const label = current ? (TOOL_LABELS[current.name] ?? current.name) : "Working on your store…";
  return (
    <div className="thinking-loading" role="status" aria-live="polite">
      <span>{label}</span>
    </div>
  );
}

function AgentActionFeed({ actions }) {
  return (
    <div className="agent-action-feed">
      {actions.map((a, i) => (
        <div key={i} className={`agent-action-item ${a.done ? "done" : "pending"}`}>
          <span className="agent-action-icon">{a.done ? "✓" : "○"}</span>
          <span>{TOOL_LABELS[a.name] ?? a.name}</span>
        </div>
      ))}
    </div>
  );
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
        <text x="12" y="28">
          $5k
        </text>
        <text x="12" y="99">
          $4k
        </text>
        <text x="12" y="164">
          $3k
        </text>
        <text x="72" y="184">
          Mar 1
        </text>
        <text x="185" y="184">
          Apr 1
        </text>
        <text x="302" y="184">
          Jul 1
        </text>
      </svg>
      <div>
        <div>
          <strong>Sales over time</strong>
          <span>Mar 1-Jul 30, 2023</span>
        </div>
        <button type="button">View report</button>
      </div>
    </div>
  );
}

function SourceFiles({ files }) {
  return (
    <div className="source-files">
      {files.slice(0, 4).map((file) => (
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          key={`${file.provider}-${file.title}`}
        >
          <strong>{file.title}</strong>
          <span>
            {file.provider} · {file.reason || "Relevant source"}
          </span>
        </a>
      ))}
    </div>
  );
}

function VisualSummary({ visual }) {
  if (!visual || visual.type === "null" || visual.type === null) return null;

  if (
    visual.type === "table" &&
    Array.isArray(visual.headers) &&
    Array.isArray(visual.rows)
  ) {
    return (
      <div className="visual-summary">
        {visual.title ? <strong>{visual.title}</strong> : null}
        <table className="visual-table">
          <thead>
            <tr>
              {visual.headers.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visual.rows.slice(0, 50).map((row, rowIndex) => (
              <tr key={rowIndex}>
                {(Array.isArray(row) ? row : []).map((cell, cellIndex) => (
                  <td key={cellIndex}>{String(cell ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!Array.isArray(visual.points) || visual.points.length === 0) return null;

  const points = visual.points.slice(0, 8);
  const max = Math.max(...points.map((point) => Number(point.value) || 0), 1);

  if (visual.type === "line") {
    const width = 100;
    const height = 40;
    const stepX = points.length > 1 ? width / (points.length - 1) : 0;
    const path = points
      .map((point, index) => {
        const x = index * stepX;
        const y = height - ((Number(point.value) || 0) / max) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <div className="visual-summary">
        <strong>{visual.title || "Visual summary"}</strong>
        <svg
          className="visual-line"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <div className="visual-line-labels">
          {points.map((point) => (
            <span key={point.label}>
              <em>{point.label}</em>
              <b>{point.value}</b>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="visual-summary">
      <strong>{visual.title || "Visual summary"}</strong>
      <div>
        {points.map((point) => (
          <span key={point.label}>
            <em>{point.label}</em>
            <i
              style={{
                width: `${Math.max(8, ((Number(point.value) || 0) / max) * 100)}%`,
              }}
            />
            <b>{point.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function ProductDraftCard({
  draft,
  files,
  setProducts,
  onNavigateProducts,
  shopifyConfigured,
}) {
  const [title, setTitle] = useState(draft.title || "");
  const [price, setPrice] = useState(draft.price || "");
  const [vendor, setVendor] = useState(draft.vendor || "");
  const [mediaItems, setMediaItems] = useState(draft.media || []);

  // Mock store state
  const [mockCreating, setMockCreating] = useState(false);
  const [mockCreated, setMockCreated] = useState(false);
  const [mockError, setMockError] = useState(null);

  // Shopify dev store state
  const [shopifyCreating, setShopifyCreating] = useState(false);
  const [shopifyResult, setShopifyResult] = useState(null);
  const [shopifyError, setShopifyError] = useState(null);
  const [shopifyMediaErrors, setShopifyMediaErrors] = useState([]);

  const editedDraft = {
    ...draft,
    title,
    price: price || null,
    vendor,
    media: mediaItems,
  };
  const validation = validateDraftClient(editedDraft);
  const sourceFile = files?.[0];

  const handleMockCreate = async () => {
    setMockCreating(true);
    setMockError(null);
    try {
      const response = await fetch("/api/products/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: editedDraft }),
      });
      const data = await response.json();
      if (data.ok) {
        setProducts((prev) => [...prev, data.product]);
        setMockCreated(true);
      } else {
        setMockError(data.error || "Failed to create product.");
      }
    } catch {
      setMockError("Network error — could not create product.");
    } finally {
      setMockCreating(false);
    }
  };

  const handleShopifyCreate = async () => {
    setShopifyCreating(true);
    setShopifyError(null);
    setShopifyMediaErrors([]);
    try {
      const response = await fetch("/api/shopify/products/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: editedDraft }),
      });
      const data = await response.json();
      if (data.success) {
        setShopifyResult(data.product);
        if (data.mediaErrors?.length) {
          setShopifyMediaErrors(data.mediaErrors);
        }
      } else {
        const msg =
          data.errors?.map((e) => e.message).join("; ") ||
          "Failed to create product in Shopify.";
        setShopifyError(msg);
      }
    } catch {
      setShopifyError("Network error — could not reach Shopify.");
    } finally {
      setShopifyCreating(false);
    }
  };

  const variantPreview = draft.variants
    ?.slice(0, 4)
    .map((v) => v.title)
    .join(", ");
  const hasMoreVariants = (draft.variants?.length || 0) > 4;
  const tagPreview = draft.tags?.slice(0, 5).join(", ");

  return (
    <div className="product-draft-card">
      <div className="draft-card-badges">
        <span className="draft-badge">DRAFT</span>
        {sourceFile && (
          <a
            className="gdrive-badge"
            href={sourceFile.url}
            target="_blank"
            rel="noreferrer"
          >
            {sourceFile.provider === "google" ? "Google Drive" : "OneDrive"} ·{" "}
            {sourceFile.title}
          </a>
        )}
      </div>

      <div className="draft-field-row">
        <label className="draft-field-label">Title</label>
        <input
          className="draft-field-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Product title"
        />
      </div>

      <div className="draft-fields-inline">
        <div className="draft-field-row">
          <label className="draft-field-label">Price ($)</label>
          <input
            className="draft-field-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="draft-field-row">
          <label className="draft-field-label">Vendor</label>
          <input
            className="draft-field-input"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Vendor name"
          />
        </div>
        {draft.productType && (
          <div className="draft-field-row">
            <label className="draft-field-label">Type</label>
            <span className="draft-field-value">{draft.productType}</span>
          </div>
        )}
      </div>

      {variantPreview && (
        <div className="draft-meta-row">
          <span className="draft-meta-label">Variants</span>
          <span className="draft-meta-value">
            {variantPreview}
            {hasMoreVariants ? ` + ${draft.variants.length - 4} more` : ""}
          </span>
        </div>
      )}

      {tagPreview && (
        <div className="draft-meta-row">
          <span className="draft-meta-label">Tags</span>
          <span className="draft-meta-value">{tagPreview}</span>
        </div>
      )}

      {draft.seo?.title && (
        <div className="draft-meta-row">
          <span className="draft-meta-label">SEO title</span>
          <span className="draft-meta-value">{draft.seo.title}</span>
        </div>
      )}

      {/* Media section */}
      <div className="draft-media-section">
        <span className="draft-field-label">
          Images{" "}
          {mediaItems.length > 0 ? `(${mediaItems.length} from Drive)` : ""}
        </span>

        {mediaItems.length > 0 ? (
          <>
            <div className="draft-media-grid">
              {mediaItems.map((item, index) => (
                <div
                  className="draft-media-item"
                  key={item.driveFileId || index}
                >
                  <div className="draft-media-thumb">
                    {item.driveFileId ? (
                      <img
                        src={`/api/drive/thumbnail/${item.driveFileId}`}
                        alt={item.alt || item.sourceFileName}
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="draft-media-placeholder"
                      style={item.driveFileId ? { display: "none" } : {}}
                    >
                      🖼
                    </div>
                  </div>
                  <span
                    className="draft-media-filename"
                    title={item.sourceFileName}
                  >
                    {item.sourceFileName?.replace(/\.[^.]+$/, "")}
                  </span>
                  <button
                    type="button"
                    className="draft-media-remove"
                    onClick={() =>
                      setMediaItems((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove ${item.sourceFileName}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="draft-no-images-hint">
            No product images found in Drive. Add images to your product folder
            to include them.
          </p>
        )}
      </div>

      {/* Mock store row */}
      {/* Shopify dev store row */}
      {shopifyResult ? (
        <div className="shopify-success-card">
          <div className="shopify-success-header">
            <span className="shopify-success-badge">Shopify Dev Store</span>
            <span className="shopify-status-pill">{shopifyResult.status}</span>
          </div>
          <strong className="shopify-product-title">
            {shopifyResult.title}
          </strong>
          <div className="shopify-product-meta">
            <span>
              ID:{" "}
              <code>
                {shopifyResult.id.replace("gid://shopify/Product/", "")}
              </code>
            </span>
            <span>
              Handle: <code>{shopifyResult.handle}</code>
            </span>
            {shopifyResult.media?.length > 0 && (
              <span>
                Media: {shopifyResult.media.length} image
                {shopifyResult.media.length > 1 ? "s" : ""} attached
              </span>
            )}
          </div>
          <div className="shopify-action-links">
            {shopifyResult.adminUrl && (
              <a
                className="shopify-admin-link"
                href={shopifyResult.adminUrl}
                target="_blank"
                rel="noreferrer"
              >
                View in Shopify Admin →
              </a>
            )}
            {shopifyResult.previewUrl && (
              <a
                className="shopify-preview-link"
                href={shopifyResult.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Preview storefront →
              </a>
            )}
          </div>
          {shopifyMediaErrors.length > 0 && (
            <p className="draft-media-upload-error">
              Product created, but images could not be attached — make your
              Drive images public ("Anyone with the link") and try again.
            </p>
          )}
          <p className="shopify-post-create-note">
            Created as DRAFT in your Shopify Admin.
          </p>
        </div>
      ) : (
        <>{shopifyError && <p className="draft-error">{shopifyError}</p>}</>
      )}

      {/* Action button */}
      {!shopifyResult && (
        <div className="draft-buttons-row">
          <button
            type="button"
            className="shopify-create-button"
            onClick={handleShopifyCreate}
            disabled={shopifyCreating || !title}
          >
            {shopifyCreating ? "Creating…" : "Create Product"}
          </button>
        </div>
      )}
    </div>
  );
}

function StorefrontSection() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const feedRef = useState(null);

  const feedEl = feedRef[0];

  const appendEvent = (ev) => setEvents((prev) => [...prev, ev]);

  const runAgent = async () => {
    const trimmed = input.trim();
    if (!trimmed || running) return;

    setInput("");
    setRunning(true);
    setEvents([]);

    try {
      const response = await fetch("/api/storefront/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            appendEvent(ev);
            if (ev.type === "final") {
              finalAnswer = ev.answer || "";
            }
          } catch {
            // skip malformed line
          }
        }
      }

      // Add exchange to history for follow-up
      setHistory((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: finalAnswer || "Done." },
      ]);
    } catch (err) {
      appendEvent({ type: "final", answer: "Network error: " + err.message });
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runAgent();
    }
  };

  return (
    <section className="storefront-section">
      <div className="storefront-input-row">
        <textarea
          className="storefront-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the storefront agent… e.g. 'Audit my store', 'Scan Drive for a product and publish it', 'List all pages'"
          rows={3}
          disabled={running}
        />
        <button
          className="storefront-run-button"
          type="button"
          onClick={runAgent}
          disabled={running || !input.trim()}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {history.length > 0 && (
        <div className="storefront-history">
          {history
            .filter((h) => h.role === "user")
            .slice(-3)
            .map((h, i) => (
              <span key={i} className="storefront-history-chip">
                {h.content.slice(0, 60)}
                {h.content.length > 60 ? "…" : ""}
              </span>
            ))}
        </div>
      )}

      {(running || events.length > 0) && (
        <div className="storefront-feed">
          {running && events.length === 0 && (
            <div className="storefront-event agent-text">
              <span className="storefront-spinner" />
              Starting agent…
            </div>
          )}
          {events.map((ev, i) => {
            if (ev.type === "tool_call") {
              return (
                <div key={i} className="storefront-event tool-call">
                  <strong>calling {ev.name}</strong>
                  {ev.input && Object.keys(ev.input).length > 0 && (
                    <span className="storefront-event-meta">
                      {JSON.stringify(ev.input).slice(0, 120)}
                    </span>
                  )}
                </div>
              );
            }
            if (ev.type === "tool_result") {
              const summary = ev.error
                ? "Error: " + (ev.result?.error || "failed")
                : typeof ev.result === "object"
                ? JSON.stringify(ev.result).slice(0, 160)
                : String(ev.result).slice(0, 160);
              return (
                <div key={i} className="storefront-event tool-result">
                  <strong>{ev.name}</strong>
                  <span className="storefront-event-meta">{summary}</span>
                </div>
              );
            }
            if (ev.type === "agent_text") {
              return (
                <div key={i} className="storefront-event agent-text">
                  {ev.text}
                </div>
              );
            }
            if (ev.type === "final") {
              return (
                <div key={i} className="storefront-event final">
                  <strong className="storefront-final-label">Result</strong>
                  <p>{ev.answer}</p>
                </div>
              );
            }
            return null;
          })}
          {running && events.length > 0 && (
            <div className="storefront-event agent-text">
              <span className="storefront-spinner" />
              Agent is working…
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function validateDraftClient(draft) {
  const warnings = [...(draft.warnings || [])];
  const missingRequired = [];
  if (!draft.title) missingRequired.push("title");
  if (!draft.price) missingRequired.push("price");
  if (
    !draft.options?.length &&
    !warnings.some((w) => w.toLowerCase().includes("variant"))
  ) {
    warnings.push("No product variants defined");
  }
  return { warnings, missingRequired };
}

function ValidationChecklist({ warnings, missingRequired }) {
  if (!warnings.length && !missingRequired.length) return null;
  return (
    <div className="validation-checklist">
      <span className="checklist-heading">Review before publishing</span>
      {missingRequired.map((field) => (
        <div className="checklist-item error" key={`req-${field}`}>
          <span className="checklist-icon">✕</span>
          <span>Required: {field} is missing</span>
        </div>
      ))}
      {warnings
        .filter(
          (w) => !missingRequired.some((f) => w.toLowerCase().includes(f)),
        )
        .map((warning, index) => (
          <div className="checklist-item warning" key={`warn-${index}`}>
            <span className="checklist-icon">⚠</span>
            <span>{warning}</span>
          </div>
        ))}
    </div>
  );
}

export default App;
