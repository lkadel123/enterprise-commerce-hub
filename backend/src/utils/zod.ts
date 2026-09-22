import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

export const dateInputSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date string");
