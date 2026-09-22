import { z } from "zod";
import { ROLE_NAMES } from "../../constants/roles.js";
import { objectIdSchema } from "../../utils/zod.js";

const USER_STATUSES = ["Active", "Invited", "Suspended"] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must not exceed 128 characters.");

export const userIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120, "Search query must not exceed 120 characters.").optional(),

  role: z.enum(ROLE_NAMES).optional(),

  status: z.enum(USER_STATUSES).optional(),

  page: z.coerce.number().int().min(1).max(10_000).default(1),

  pageSize: z.coerce.number().int().min(1).max(100).default(10),

  sort: z.string().trim().max(100).optional(),
});

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name must not exceed 120 characters."),

  email: z.string().trim().toLowerCase().email("Invalid email address.").max(254),

  password: passwordSchema,

  role: z.enum(ROLE_NAMES),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120).optional(),

    role: z.enum(ROLE_NAMES).optional(),

    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
