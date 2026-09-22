import type { Response } from "express";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { path?: string; message: string }[];
  };
}

export function sendSuccess<T>(res: Response, data: T, message?: string, status = 200): void {
  const body: ApiSuccessBody<T> = { success: true, data };
  if (message) body.message = message;
  res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, message, 201);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  message?: string,
): void {
  const body: ApiSuccessBody<T[]> = { success: true, data, meta };
  if (message) body.message = message;
  res.status(200).json(body);
}
