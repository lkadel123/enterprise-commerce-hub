import { FonepayProvider } from "./providers/fonepay/fonepay.provider.js";
import { isFonepayConfigured } from "./providers/fonepay/fonepay.config.js";
import { CybersourceProvider } from "./providers/cybersource/cybersource.provider.js";
import { isCybersourceConfigured } from "./providers/cybersource/cybersource.config.js";
import type { PaymentProviderInterface } from "./payment.provider.js";
import type { PaymentProvider } from "./payment.types.js";

/**
 * Active online gateways.
 *
 * The application talks to the providers DIRECTLY — there is no intermediary
 * payment aggregator:
 *
 * - "FONEPAY" (QR / Intent Checkout) and "CYBERSOURCE" (Unified Checkout card
 *   payments) are registered ONLY when their credentials are fully configured
 *   (see config/env.ts: optional at boot, all-or-nothing in production).
 *   Otherwise `getPaymentProvider(...)` fails closed with a 503 rather than
 *   silently falling back to another gateway.
 *
 * Retired providers ("PAYBRIDGE", "KHALTI", "ESEWA") are NOT registered — they
 * remain in the provider type/order enum ONLY so historical order documents
 * continue to validate. `getPaymentProvider("PAYBRIDGE")` etc. fail closed, so
 * neither legacy data nor a spoofed request can reach a gateway through them.
 */
type SupportedProviders = Extract<PaymentProvider, "FONEPAY" | "CYBERSOURCE">;

const registry: Partial<Record<SupportedProviders, PaymentProviderInterface>> = {
  // Registered only when FONEPAY_* env credentials are fully configured
  // (optional at boot, all-or-nothing in production — see config/env.ts).
  ...(isFonepayConfigured() ? { FONEPAY: new FonepayProvider() as PaymentProviderInterface } : {}),
  // Registered only when CYBERSOURCE_* env credentials are fully configured
  // (optional at boot, all-or-nothing in production — see config/env.ts).
  ...(isCybersourceConfigured()
    ? { CYBERSOURCE: new CybersourceProvider() as PaymentProviderInterface }
    : {}),
};

/** Registry mapping provider keys to singleton provider instances. */
export const paymentProviderMap = registry as Partial<
  Record<SupportedProviders, PaymentProviderInterface>
>;

/** Whether a provider currently has a registered (usable) instance. */
export function isProviderEnabled(provider: string): boolean {
  return Boolean(paymentProviderMap[provider.toUpperCase() as SupportedProviders]);
}

export function getPaymentProvider(provider: string): PaymentProviderInterface {
  const key = provider.toUpperCase() as SupportedProviders;
  const instance = paymentProviderMap[key];
  if (!instance) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  return instance;
}
