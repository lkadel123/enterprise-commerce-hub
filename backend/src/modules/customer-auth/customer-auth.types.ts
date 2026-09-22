import type { CustomerAccountStatus } from "./customerAccount.model.js";

export interface CustomerAuthContext {
  ua?: string;
  ip?: string;
}

export interface CustomerRegisterInput {
  name: string;
  email: string;
  password: string;
  /** Required explicit acceptance; the schema only ever yields `true`. */
  acceptedTerms: true;
}

export interface CustomerLoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface CustomerChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CustomerAuthProfile {
  id: string;
  name: string;
  email: string;
  customerId: string | null;
  status: CustomerAccountStatus;
}

export interface CustomerAuthSessionResult {
  customer: CustomerAuthProfile;
  accessToken: string;
  /** Delivered to the client only via httpOnly cookie by the controller. */
  refreshToken: string;
  remember: boolean;
}

export interface CustomerProfileResult {
  customer: CustomerAuthProfile;
  customerProfile: { name: string; email: string; phone: string | null } | null;
}
