export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Refunded";

export type Order = {
  id: string;
  customer: string;
  email: string;
  product: string;
  items: number;
  date: string;
  amount: number;
  payment: "Credit Card" | "Cash on Delivery" | "Digital Wallet" | "Bank Transfer";
  paymentStatus: "Paid" | "Pending" | "Refunded" | "Failed";
  /** Gateway provider when the method is gateway-settled (Fonepay QR). */
  provider?: "FONEPAY" | "CYBERSOURCE";
  status: OrderStatus;
  region: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  cost: number;
  stock: number;
  status: "Active" | "Draft" | "Out of Stock" | "Archived";
  rating: number;
  reviews: number;
  created: string;
  warehouse: string;
  reserved: number;
  incoming: number;
  reorder: number;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  orders: number;
  spent: number;
  lastOrder: string;
  status: "Active" | "New" | "VIP" | "Blocked";
  joined: string;
  group: string;
  city: string;
};

export const currency = (n: number, digits = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

const firstNames = [
  "Amelia", "Marcus", "Priya", "Daniel", "Sofia", "Liam", "Hannah", "Noah",
  "Elena", "Jonas", "Yuki", "Omar", "Clara", "Ethan", "Maya", "Victor",
  "Isabelle", "Andre", "Nina", "Tobias", "Ruth", "Felix", "Aisha", "Peter",
];
const lastNames = [
  "Whitfield", "Osei", "Nair", "Brennan", "Marchetti", "Kowalski", "Reyes",
  "Lindqvist", "Petrov", "Haugen", "Tanaka", "Farouk", "Dubois", "Novak",
  "Castillo", "Almeida", "Fischer", "Okafor", "Bergman", "Hayes",
];

const productCatalog: [string, string, string, number][] = [
  ["Aurora 27\" 4K Monitor", "Electronics", "Northlight", 549],
  ["Vertex Pro Mechanical Keyboard", "Electronics", "Northlight", 189],
  ["Halo Wireless Earbuds Gen 3", "Electronics", "Sonora", 149],
  ["Meridian Laptop Stand", "Electronics", "Kestrel", 79],
  ["Atlas Travel Backpack 32L", "Fashion", "Ridgeline", 168],
  ["Corsair Merino Wool Coat", "Fashion", "Bellweather", 420],
  ["Lumen Linen Shirt", "Fashion", "Bellweather", 89],
  ["Trailhead Running Shoes", "Sports", "Ridgeline", 134],
  ["Solstice Ceramic Dinner Set", "Home & Living", "Terra Nova", 210],
  ["Nordic Oak Coffee Table", "Home & Living", "Terra Nova", 645],
  ["Ember Cast Iron Skillet", "Home & Living", "Terra Nova", 96],
  ["Verdant Botanical Serum", "Beauty", "Lumière", 72],
  ["Silk Renewal Night Cream", "Beauty", "Lumière", 118],
  ["Peak Performance Yoga Mat", "Sports", "Ridgeline", 68],
  ["Cadence Adjustable Dumbbells", "Sports", "Ironhold", 379],
  ["Harvest Organic Coffee 1kg", "Grocery", "Copperfield", 34],
  ["Cellar Reserve Olive Oil", "Grocery", "Copperfield", 42],
  ["Pulse Smart Fitness Watch", "Electronics", "Sonora", 259],
  ["Cirrus Desk Lamp", "Home & Living", "Kestrel", 112],
  ["Nimbus Down Duvet", "Home & Living", "Terra Nova", 289],
  ["Onyx Leather Wallet", "Fashion", "Bellweather", 95],
  ["Aegis Phone Case Pro", "Electronics", "Kestrel", 39],
  ["Glacier Insulated Bottle", "Sports", "Ironhold", 45],
  ["Rosewood Diffuser Set", "Beauty", "Lumière", 58],
];

export const categories = [
  "Electronics",
  "Fashion",
  "Home & Living",
  "Beauty",
  "Sports",
  "Grocery",
];

export const brands = [
  "Northlight",
  "Sonora",
  "Kestrel",
  "Ridgeline",
  "Bellweather",
  "Terra Nova",
  "Lumière",
  "Ironhold",
  "Copperfield",
];

export const regions = [
  "North America",
  "Europe",
  "Asia Pacific",
  "Latin America",
  "Middle East",
];

// Deterministic pseudo-random so server and client render identically.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const at = <T,>(a: readonly T[], i: number): T => a[Math.abs(i) % a.length] as T;

const pad = (n: number, len = 4) => String(n).padStart(len, "0");

function dateStr(daysAgo: number) {
  const base = Date.UTC(2026, 7, 9);
  const d = new Date(base - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

const orderStatuses: OrderStatus[] = [
  "Delivered", "Shipped", "Processing", "Pending", "Delivered",
  "Cancelled", "Delivered", "Refunded", "Shipped", "Processing",
];

const payments: Order["payment"][] = [
  "Credit Card", "Credit Card", "Digital Wallet", "Cash on Delivery", "Bank Transfer",
];

export const orders: Order[] = (() => {
  const r = rng(42);
  return Array.from({ length: 64 }, (_, i) => {
    const p = at(productCatalog, Math.floor(r() * productCatalog.length));
    const first = at(firstNames, Math.floor(r() * firstNames.length));
    const last = at(lastNames, Math.floor(r() * lastNames.length));
    const items = 1 + Math.floor(r() * 3);
    const status = at(orderStatuses, Math.floor(r() * orderStatuses.length));
    const method = at(payments, Math.floor(r() * payments.length));
    // Digital Wallet orders are gateway-settled through the Fonepay QR
    // gateway (the store's online wallet/QR payment method).
    const provider = method === "Digital Wallet" ? "FONEPAY" : undefined;
    return {
      id: `ORD-${10284 + i}`,
      customer: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      product: p[0],
      items,
      date: dateStr(Math.floor(r() * 30)),
      amount: Math.round(p[3] * items * (0.9 + r() * 0.3) * 100) / 100,
      payment: method,
      paymentStatus:
        status === "Refunded" ? "Refunded" : status === "Pending" ? "Pending" : "Paid",
      ...(provider ? { provider } : {}),
      status,
      region: at(regions, Math.floor(r() * regions.length)),
    } satisfies Order;
  });
})();

const productStatuses: Product["status"][] = [
  "Active", "Active", "Active", "Draft", "Active", "Out of Stock", "Active", "Archived",
];

export const products: Product[] = (() => {
  const r = rng(7);
  return productCatalog.map((p, i) => {
    const stock = Math.floor(r() * 320);
    const status = stock === 0 ? ("Out of Stock" as const) : at(productStatuses, i);
    return {
      id: `p-${i + 1}`,
      name: p[0],
      sku: `SKU-${pad(1024 + i * 7)}`,
      category: p[1],
      brand: p[2],
      price: p[3],
      cost: Math.round(p[3] * 0.58 * 100) / 100,
      stock,
      status,
      rating: Math.round((3.6 + r() * 1.4) * 10) / 10,
      reviews: 8 + Math.floor(r() * 480),
      created: dateStr(20 + Math.floor(r() * 500)),
      warehouse: at(["Rotterdam DC", "Newark DC", "Singapore DC"], i),
      reserved: Math.floor(r() * 24),
      incoming: Math.floor(r() * 140),
      reorder: 25 + Math.floor(r() * 40),
    } satisfies Product;
  });
})();

export const customers: Customer[] = (() => {
  const r = rng(99);
  return Array.from({ length: 36 }, (_, i) => {
    const first = at(firstNames, i);
    const last = at(lastNames, i * 3);
    const count = 1 + Math.floor(r() * 42);
    const spent = Math.round(count * (60 + r() * 260) * 100) / 100;
    return {
      id: `CUST-${pad(4821 + i)}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: `+1 (415) ${200 + Math.floor(r() * 700)}-${pad(Math.floor(r() * 9999))}`,
      orders: count,
      spent,
      lastOrder: dateStr(Math.floor(r() * 60)),
      status: spent > 6000 ? "VIP" : count <= 2 ? "New" : i % 17 === 0 ? "Blocked" : "Active",
      joined: dateStr(60 + Math.floor(r() * 900)),
      group: spent > 6000 ? "Wholesale" : count > 10 ? "Loyalty" : "Retail",
      city: at(["San Francisco", "Berlin", "Singapore", "Toronto", "Dubai", "São Paulo"], i),
    } satisfies Customer;
  });
})();

export const revenueSeries = [
  { label: "Jan", revenue: 82400, orders: 5120, profit: 24300 },
  { label: "Feb", revenue: 91200, orders: 5610, profit: 27100 },
  { label: "Mar", revenue: 88650, orders: 5380, profit: 25900 },
  { label: "Apr", revenue: 104300, orders: 6420, profit: 31800 },
  { label: "May", revenue: 98900, orders: 6110, profit: 29400 },
  { label: "Jun", revenue: 112450, orders: 7020, profit: 35200 },
  { label: "Jul", revenue: 121800, orders: 7640, profit: 38100 },
  { label: "Aug", revenue: 128450, orders: 8426, profit: 41250 },
  { label: "Sep", revenue: 118200, orders: 7380, profit: 36400 },
  { label: "Oct", revenue: 132900, orders: 8710, profit: 42800 },
  { label: "Nov", revenue: 158600, orders: 10240, profit: 51900 },
  { label: "Dec", revenue: 176300, orders: 11480, profit: 58600 },
];

export const dailySeries = [
  { label: "Mon", revenue: 16420, orders: 1042, profit: 5210 },
  { label: "Tue", revenue: 18930, orders: 1188, profit: 6040 },
  { label: "Wed", revenue: 17240, orders: 1096, profit: 5480 },
  { label: "Thu", revenue: 21380, orders: 1342, profit: 6890 },
  { label: "Fri", revenue: 24610, orders: 1560, profit: 7920 },
  { label: "Sat", revenue: 19870, orders: 1268, profit: 6310 },
  { label: "Sun", revenue: 14200, orders: 930, profit: 4400 },
];

export const weeklySeries = [
  { label: "W1", revenue: 28400, orders: 1810, profit: 9100 },
  { label: "W2", revenue: 31250, orders: 1980, profit: 10050 },
  { label: "W3", revenue: 29840, orders: 1890, profit: 9520 },
  { label: "W4", revenue: 38960, orders: 2746, profit: 12580 },
];

export const yearlySeries = [
  { label: "2022", revenue: 842000, orders: 52100, profit: 248000 },
  { label: "2023", revenue: 1042000, orders: 64800, profit: 318000 },
  { label: "2024", revenue: 1268000, orders: 78900, profit: 402000 },
  { label: "2025", revenue: 1414200, orders: 89578, profit: 462750 },
];

export const categorySales = [
  { name: "Electronics", value: 42850 },
  { name: "Fashion", value: 31240 },
  { name: "Home & Living", value: 24610 },
  { name: "Beauty", value: 14980 },
  { name: "Sports", value: 10420 },
  { name: "Grocery", value: 4350 },
];

export const paymentSplit = [
  { name: "Credit/Debit Card", value: 58.4 },
  { name: "Digital Wallet", value: 22.1 },
  { name: "Cash on Delivery", value: 12.7 },
  { name: "Bank Transfer", value: 6.8 },
];

export const regionSales = [
  { name: "North America", value: 54200, share: 42.2 },
  { name: "Europe", value: 36800, share: 28.6 },
  { name: "Asia Pacific", value: 21400, share: 16.7 },
  { name: "Latin America", value: 9800, share: 7.6 },
  { name: "Middle East", value: 6250, share: 4.9 },
];

export const activityLog = [
  { user: "Amelia Whitfield", role: "Super Admin", action: "Updated", module: "Catalog", description: "Updated product SKU-1024 pricing to $549.00", ip: "192.168.14.22", time: "2026-08-09 08:42" },
  { user: "Marcus Osei", role: "Sales Manager", action: "Changed", module: "Orders", description: "Changed order #ORD-10284 status to Shipped", ip: "10.44.2.190", time: "2026-08-09 08:12" },
  { user: "Priya Nair", role: "Inventory Manager", action: "Adjusted", module: "Inventory", description: "Adjusted stock for SKU-1052 (+120 units, Rotterdam DC)", ip: "10.44.2.77", time: "2026-08-09 07:55" },
  { user: "Daniel Brennan", role: "Customer Support", action: "Approved", module: "Returns", description: "Approved refund request for order #ORD-10310", ip: "172.16.8.4", time: "2026-08-08 19:31" },
  { user: "Sofia Marchetti", role: "Marketing Manager", action: "Created", module: "Marketing", description: "Created coupon SUMMER25 (25% off, expires 2026-09-01)", ip: "192.168.14.61", time: "2026-08-08 16:04" },
  { user: "Liam Kowalski", role: "Content Manager", action: "Published", module: "Content", description: "Published homepage banner 'Autumn Collection'", ip: "192.168.14.9", time: "2026-08-08 14:20" },
  { user: "Hannah Reyes", role: "Accountant", action: "Exported", module: "Reports", description: "Exported July sales report (CSV, 8,426 rows)", ip: "10.44.2.15", time: "2026-08-08 11:48" },
  { user: "Noah Lindqvist", role: "Admin", action: "Deleted", module: "Administration", description: "Removed user account t.hansen@company.com", ip: "192.168.14.30", time: "2026-08-07 17:22" },
];

export const notifications = [
  { type: "order", title: "New order #ORD-10348", body: "Elena Petrov placed an order for $1,284.00", time: "2 min ago" },
  { type: "stock", title: "Low stock alert", body: "Halo Wireless Earbuds Gen 3 — 6 units left", time: "18 min ago" },
  { type: "payment", title: "Payment received", body: "$4,210.00 settled via Fonepay QR payment", time: "1 hr ago" },
  { type: "refund", title: "Refund requested", body: "Order #ORD-10310 — customer reported damage", time: "3 hrs ago" },
  { type: "customer", title: "New customer registered", body: "Tobias Bergman joined the Loyalty group", time: "5 hrs ago" },
  { type: "review", title: "New review pending", body: "4.0★ on Nordic Oak Coffee Table", time: "Yesterday" },
];

export const reviews = [
  { id: "REV-2841", customer: "Elena Petrov", product: "Aurora 27\" 4K Monitor", rating: 5, body: "Colour accuracy out of the box is excellent. Stand feels premium.", date: "2026-08-08", status: "Approved" },
  { id: "REV-2840", customer: "Omar Farouk", product: "Trailhead Running Shoes", rating: 4, body: "Great grip on wet trails, sizing runs half a size small.", date: "2026-08-08", status: "Pending" },
  { id: "REV-2839", customer: "Maya Castillo", product: "Silk Renewal Night Cream", rating: 5, body: "Noticeable difference after two weeks. Will reorder.", date: "2026-08-07", status: "Approved" },
  { id: "REV-2838", customer: "Victor Novak", product: "Cadence Adjustable Dumbbells", rating: 2, body: "Locking mechanism rattles under load.", date: "2026-08-07", status: "Pending" },
  { id: "REV-2837", customer: "Nina Fischer", product: "Nordic Oak Coffee Table", rating: 4, body: "Beautiful grain, assembly took longer than expected.", date: "2026-08-06", status: "Approved" },
  { id: "REV-2836", customer: "Andre Dubois", product: "Harvest Organic Coffee 1kg", rating: 1, body: "Bag arrived unsealed.", date: "2026-08-05", status: "Rejected" },
];

export const coupons = [
  { code: "SUMMER25", type: "Percentage", value: "25%", min: 120, max: 80, used: 1842, limit: 5000, start: "2026-06-01", end: "2026-09-01", status: "Active" },
  { code: "FREESHIP", type: "Free Shipping", value: "—", min: 60, max: 0, used: 4210, limit: 10000, start: "2026-01-01", end: "2026-12-31", status: "Active" },
  { code: "WELCOME10", type: "Fixed", value: "$10", min: 45, max: 10, used: 928, limit: 2000, start: "2026-03-15", end: "2026-08-31", status: "Active" },
  { code: "VIP15", type: "Percentage", value: "15%", min: 200, max: 150, used: 316, limit: 500, start: "2026-05-01", end: "2026-08-15", status: "Expiring" },
  { code: "BLACKFRI", type: "Percentage", value: "40%", min: 80, max: 400, used: 0, limit: 25000, start: "2026-11-25", end: "2026-12-02", status: "Scheduled" },
  { code: "CLEARANCE5", type: "Fixed", value: "$5", min: 25, max: 5, used: 6710, limit: 6710, start: "2026-02-01", end: "2026-04-30", status: "Expired" },
];

export const roles = [
  "Super Admin", "Admin", "Manager", "Sales Manager", "Inventory Manager",
  "Customer Support", "Content Manager", "Marketing Manager", "Accountant",
];

export const permissionModules = [
  "Catalog", "Orders", "Customers", "Inventory", "Marketing", "Reports", "Settings",
];

export const teamUsers = [
  { name: "Amelia Whitfield", email: "amelia.w@northpeak.com", role: "Super Admin", status: "Active", lastActive: "2 min ago" },
  { name: "Marcus Osei", email: "marcus.o@northpeak.com", role: "Sales Manager", status: "Active", lastActive: "12 min ago" },
  { name: "Priya Nair", email: "priya.n@northpeak.com", role: "Inventory Manager", status: "Active", lastActive: "1 hr ago" },
  { name: "Daniel Brennan", email: "daniel.b@northpeak.com", role: "Customer Support", status: "Active", lastActive: "3 hrs ago" },
  { name: "Sofia Marchetti", email: "sofia.m@northpeak.com", role: "Marketing Manager", status: "Active", lastActive: "Yesterday" },
  { name: "Liam Kowalski", email: "liam.k@northpeak.com", role: "Content Manager", status: "Invited", lastActive: "—" },
  { name: "Hannah Reyes", email: "hannah.r@northpeak.com", role: "Accountant", status: "Active", lastActive: "2 days ago" },
  { name: "Noah Lindqvist", email: "noah.l@northpeak.com", role: "Admin", status: "Suspended", lastActive: "3 weeks ago" },
];

export const categoryRows = categories.map((name, i) => ({
  id: `cat-${i + 1}`,
  name,
  parent: i > 3 ? "Retail" : "—",
  description: `${name} assortment across all storefronts`,
  products: products.filter((p) => p.category === name).length * 14 + 12,
  status: i === 5 ? "Hidden" : "Active",
  sort: i + 1,
}));

export const brandRows = brands.map((name, i) => ({
  id: `brand-${i + 1}`,
  name,
  description: `${name} — supplier partner since ${2014 + (i % 9)}`,
  products: 8 + i * 5,
  status: i === 7 ? "Hidden" : "Active",
}));
