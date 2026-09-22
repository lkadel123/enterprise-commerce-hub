import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * NASB brand constants — single source of truth for the storefront identity.
 *
 * All business/registration details below are the company's public information
 * and are intentionally not invented or modified. Reference this module instead
 * of hard-coding "NASB" or company details across components.
 */
export const BRAND = {
  /** Short brand mark. */
  name: "NASB",
  /** Full legal company name. */
  company: "Neupane Aakosh Samik Brothers Pvt. Ltd.",
  /** Tagline. */
  tagline: "QUALITY WITHOUT COMPROMISE.",
  /** Brand statement. */
  statement: "MADE IN NEPAL",
  /** Establishment year. */
  year: "2026",
  /** Registered office address. */
  address: "Kalika-03, Betini, Rasuwa, Bagmati, Nepal",
  addressLines: ["Kalika-03, Betini, Rasuwa,", "Bagmati, Nepal"],
  /** Complaints officer. */
  complaintsOfficer: "Mandira Gautam",
  /** Contact phone. */
  phone: "9851370933",
  /** Registration numbers. */
  ocrRegistration: "368202/81/82",
  docRegistration: "001-2136",
  irdPan: "622375182",
} as const;

/** Humanized site name / metadata suffix, e.g. "Products — NASB". */
export const SITE_SUFFIX = "NASB";

/** One entry per social platform shown in the footer. */
export interface SocialLink {
  /** Platform display name (also used in the link's aria-label). */
  platform: string;
  /**
   * Official company profile URL.
   *
   * IMPORTANT: currently a configuration placeholder — no invented profile
   * URLs are shipped. Replace `url` with the real NASB profile link per
   * platform once confirmed (e.g. "https://www.facebook.com/<official-handle>").
   * The footer only emits a working external link once a value is supplied.
   */
  url: string;
  /** Recognizable brand icon for the platform (lucide-react). */
  icon: LucideIcon;
}

/**
 * Social media configuration — single source of truth for the footer's
 * "Social" links. The URLs are intentionally empty placeholders until the
 * company's official profiles are confirmed; see `SocialLink.url`.
 */
export const SOCIAL_LINKS: ReadonlyArray<SocialLink> = [
  { platform: "Facebook", url: "https://www.facebook.com/share/1DeNFcN3NN/", icon: Facebook },
  { platform: "Instagram", url: "https://www.instagram.com/nasbonlinemart.23?stkn=MXdiN3p6M3Jub2F2cA==", icon: Instagram },
  { platform: "LinkedIn", url: "https://www.tiktok.com/@nasbonlinemart", icon: Linkedin },
] as const;
