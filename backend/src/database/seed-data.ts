import type { OrderStatus } from "../modules/orders/order.model.js";

export const CATEGORY_NAMES = [
  "Electronics",
  "Fashion",
  "Home & Living",
  "Beauty",
  "Sports",
  "Grocery",
];

export const BRAND_NAMES = [
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

export const PRODUCT_CATALOG: [string, string, string, number, number][] = [
  ['Aurora 27" 4K Monitor', "Electronics", "Northlight", 549, 318],
  ["Vertex Pro Mechanical Keyboard", "Electronics", "Northlight", 189, 110],
  ["Halo Wireless Earbuds Gen 3", "Electronics", "Sonora", 149, 86],
  ["Meridian Laptop Stand", "Electronics", "Kestrel", 79, 44],
  ["Atlas Travel Backpack 32L", "Fashion", "Ridgeline", 168, 97],
  ["Corsair Merino Wool Coat", "Fashion", "Bellweather", 420, 244],
  ["Lumen Linen Shirt", "Fashion", "Bellweather", 89, 49],
  ["Trailhead Running Shoes", "Sports", "Ridgeline", 134, 72],
  ["Solstice Ceramic Dinner Set", "Home & Living", "Terra Nova", 210, 118],
  ["Nordic Oak Coffee Table", "Home & Living", "Terra Nova", 645, 371],
  ["Ember Cast Iron Skillet", "Home & Living", "Terra Nova", 96, 52],
  ["Verdant Botanical Serum", "Beauty", "Lumière", 72, 38],
  ["Silk Renewal Night Cream", "Beauty", "Lumière", 118, 61],
  ["Peak Performance Yoga Mat", "Sports", "Ridgeline", 68, 34],
  ["Cadence Adjustable Dumbbells", "Sports", "Ironhold", 379, 217],
  ["Harvest Organic Coffee 1kg", "Grocery", "Copperfield", 34, 18],
  ["Cellar Reserve Olive Oil", "Grocery", "Copperfield", 42, 19],
  ["Pulse Smart Fitness Watch", "Electronics", "Sonora", 259, 142],
  ["Cirrus Desk Lamp", "Home & Living", "Kestrel", 112, 58],
  ["Nimbus Down Duvet", "Home & Living", "Terra Nova", 289, 151],
  ["Onyx Leather Wallet", "Fashion", "Bellweather", 95, 43],
  ["Aegis Phone Case Pro", "Electronics", "Kestrel", 39, 16],
  ["Glacier Insulated Bottle", "Sports", "Ironhold", 45, 22],
  ["Rosewood Diffuser Set", "Beauty", "Lumière", 58, 27],
];

export const CUSTOMER_SEEDS: [string, string, string, string, string, string][] = [
  [
    "Amelia Whitfield",
    "amelia.w@northpeak.com",
    "+1 (415) 208-4412",
    "San Francisco",
    "VIP",
    "Wholesale",
  ],
  ["Elena Petrov", "elena.petrov@example.com", "+1 (646) 321-8890", "New York", "Active", "Retail"],
  ["Marcus Osei", "marcus.osei@example.com", "+49 30 555 0123", "Berlin", "Active", "Loyalty"],
  ["Priya Nair", "priya.nair@example.com", "+65 6511 2233", "Singapore", "New", "Retail"],
  [
    "Liam Kowalski",
    "liam.kowalski@example.com",
    "+1 (305) 889-2210",
    "Toronto",
    "Active",
    "Loyalty",
  ],
  [
    "Sofia Marchetti",
    "sofia.marchetti@example.com",
    "+39 02 555 7788",
    "Milan",
    "Active",
    "Retail",
  ],
  ["Yuki Tanaka", "yuki.tanaka@example.com", "+81 3 5555 0192", "Tokyo", "New", "Retail"],
  [
    "Noah Lindqvist",
    "noah.lindqvist@example.com",
    "+1 (206) 444-9981",
    "Seattle",
    "Blocked",
    "Retail",
  ],
];

export const ORDER_STATUSES: OrderStatus[] = [
  "Delivered",
  "Shipped",
  "Processing",
  "Pending",
  "Delivered",
  "Cancelled",
  "Delivered",
  "Refunded",
  "Shipped",
  "Processing",
  "Delivered",
  "Pending",
];

export const REGIONS = [
  "North America",
  "Europe",
  "Asia Pacific",
  "North America",
  "Europe",
] as const;

export const TEAM_SEEDS: [string, string, string][] = [
  ["Daniel Brennan", "daniel.b@northpeak.com", "Customer Support"],
  ["Priya Nair", "priya.n@northpeak.com", "Inventory Manager"],
  ["Hannah Reyes", "hannah.r@northpeak.com", "Accountant"],
];

export const COUPON_SEEDS: {
  code: string;
  type: "Percentage" | "Fixed" | "Free Shipping";
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
}[] = [
  {
    code: "SUMMER25",
    type: "Percentage",
    value: 25,
    minOrder: 120,
    maxDiscount: 80,
    usageLimit: 5000,
  },
  { code: "WELCOME10", type: "Fixed", value: 10, minOrder: 45, maxDiscount: 10, usageLimit: 2000 },
  {
    code: "FREESHIP",
    type: "Free Shipping",
    value: 0,
    minOrder: 60,
    maxDiscount: 0,
    usageLimit: 10000,
  },
];
