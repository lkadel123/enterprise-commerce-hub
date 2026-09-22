import type { Express } from "express";
import { hashPassword } from "../../src/utils/password.js";
import { signAccessToken } from "../../src/utils/jwt.js";
import type { RoleName } from "../../src/constants/roles.js";
import { UserModel } from "../../src/modules/users/user.model.js";
import { BrandModel } from "../../src/modules/brands/brand.model.js";
import { CategoryModel } from "../../src/modules/categories/category.model.js";
import { ProductModel } from "../../src/modules/products/product.model.js";
import { InventoryModel } from "../../src/modules/inventory/inventory.model.js";
import { CustomerModel } from "../../src/modules/customers/customer.model.js";
import { CustomerAccountModel } from "../../src/modules/customer-auth/customerAccount.model.js";
import { signCustomerAccessToken } from "../../src/modules/customer-auth/customer-token.js";
import { CouponModel } from "../../src/modules/coupons/coupon.model.js";
import { createApp } from "../../src/app.js";

export const TEST_PASSWORD = "Testpass123!";

let app: Express | null = null;

/** Builds (once) the same Express app instance used by the server. */
export function getApp(): Express {
  if (!app) app = createApp();
  return app;
}

export async function seedUser(
  overrides: Partial<{ name: string; email: string; role: RoleName; status: string }> = {},
) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return UserModel.create({
    name: overrides.name ?? "Test Admin",
    email: overrides.email ?? `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    role: overrides.role ?? "Super Admin",
    status: overrides.status ?? "Active",
  });
}

export async function seedCatalog() {
  const category = await CategoryModel.create({
    name: "Electronics",
    slug: "electronics",
    status: "Active",
  });
  const brand = await BrandModel.create({
    name: "Northlight",
    slug: "northlight",
    status: "Active",
  });
  return { category, brand };
}

export async function seedProduct(
  categoryId: unknown,
  brandId: unknown,
  overrides: Partial<{
    name: string;
    slug: string;
    sku: string;
    price: number;
    cost: number;
    status: string;
  }> = {},
) {
  return ProductModel.create({
    name: overrides.name ?? "Aurora Monitor",
    slug: overrides.slug ?? "aurora-monitor",
    sku: overrides.sku ?? "SKU-001",
    category: categoryId ?? null,
    brand: brandId ?? null,
    price: overrides.price ?? 100,
    cost: overrides.cost ?? 50,
    status: overrides.status ?? "Active",
  });
}

export async function seedInventory(productId: unknown, sku: string) {
  return InventoryModel.create({
    product: productId,
    sku,
    warehouse: "Rotterdam DC",
    stock: 100,
    reserved: 0,
    incoming: 0,
    reorderLevel: 10,
    adjustments: [],
  });
}

export async function seedCustomer() {
  return CustomerModel.create({
    name: "Test Customer",
    email: `cust-${Math.random().toString(36).slice(2)}@test.com`,
    group: "Retail",
    status: "Active",
  });
}

export async function seedCoupon(
  overrides: Partial<{
    code: string;
    type: "Percentage" | "Fixed" | "Free Shipping";
    value: number;
    minOrder: number;
    maxDiscount: number;
    usageLimit: number;
    perCustomerLimit: number;
    applicableCategoryIds?: string[];
    startAt?: Date;
    endAt?: Date;
  }> = {},
) {
  const now = Date.now();
  const day = 86_400_000;
  return CouponModel.create({
    code: overrides.code ?? "TEST10",
    type: overrides.type ?? "Percentage",
    value: overrides.value ?? 10,
    minOrder: overrides.minOrder ?? 0,
    maxDiscount: overrides.maxDiscount ?? 0,
    usageLimit: overrides.usageLimit ?? 0,
    perCustomerLimit: overrides.perCustomerLimit ?? 1,
    applicableCategories: overrides.applicableCategoryIds ?? [],
    startAt: overrides.startAt ?? new Date(now - day),
    endAt: overrides.endAt ?? new Date(now + day),
    used: 0,
  });
}

/** Seeds an admin user and returns a real access-token header tied to it. */
export async function userTokenFor(
  role: RoleName = "Super Admin",
  status: string = "Active",
): Promise<{ header: Record<string, string>; user: InstanceType<typeof UserModel> }> {
  const user = await seedUser({ role, status });
  const token = signAccessToken({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  });
  return { header: { Authorization: `Bearer ${token}` }, user };
}

/** Seeds a `CustomerAccount` (customer identity) for auth-flow tests. */
export async function seedCustomerAccount(
  overrides: Partial<{ email: string; password: string; name: string; status: string }> = {},
) {
  const email = overrides.email ?? `cust-${Math.random().toString(36).slice(2)}@test.com`;
  const passwordHash = await hashPassword(overrides.password ?? TEST_PASSWORD);
  return CustomerAccountModel.create({
    name: overrides.name ?? "Test Customer",
    email,
    passwordHash,
    customer: null,
    status: overrides.status ?? "Active",
  });
}

/** Builds a customer Bearer header tied to the given account. */
export function customerAccessTokenFor(account: { _id: { toString(): string } }): {
  header: Record<string, string>;
} {
  const token = signCustomerAccessToken(account._id.toString());
  return { header: { Authorization: `Bearer ${token}` } };
}

/** Extracts the `customer_refresh_token` cookie value from a Set-Cookie header. */
export function customerRefreshCookie(setCookie: string | string[] | undefined): string {
  const headers = Array.isArray(setCookie) ? setCookie.join(";") : (setCookie ?? "");
  const match = headers.match(/customer_refresh_token=([^;]+)/);
  return match ? match[1] : "";
}
