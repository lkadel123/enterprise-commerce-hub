import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch, adminUpload, buildQuery, type ApiEnvelope } from "./client";
import type {
  BannerDto,
  BannerListParams,
  CouponDto,
  CouponListParams,
  CreateBannerInput,
  CreateCouponInput,
  CreateCustomerInput,
  CustomerDetailDto,
  CustomerDto,
  CustomerListParams,
  CreateUserInput,
  MediaDto,
  MediaListParams,
  OrderDto,
  OrderListParams,
  PaymentStatus,
  RoleDto,
  UpdateBannerInput,
  UpdateCouponInput,
  UpdateCustomerInput,
  UpdateMediaInput,
  UpdateUserInput,
  UserDto,
  UserListParams,
} from "./types";

export const ordersApi = {
  list(params: OrderListParams = {}): Promise<ApiEnvelope<OrderDto[]>> {
    return adminFetch<OrderDto[]>(`/orders${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<ApiEnvelope<OrderDto>> {
    return adminFetch<OrderDto>(`/orders/${encodeURIComponent(id)}`);
  },
  setStatus(id: string, body: { status: string }): Promise<ApiEnvelope<OrderDto>> {
    return adminFetch<OrderDto>(`/orders/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body,
    });
  },
  setPaymentStatus(
    id: string,
    body: { paymentStatus: PaymentStatus; transactionId?: string },
  ): Promise<ApiEnvelope<OrderDto>> {
    return adminFetch<OrderDto>(`/orders/${encodeURIComponent(id)}/payment`, {
      method: "PATCH",
      body,
    });
  },
  cancel(id: string, body?: { reason?: string }): Promise<ApiEnvelope<OrderDto>> {
    return adminFetch<OrderDto>(`/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: body ?? undefined,
    });
  },
  refund(id: string, body?: { reason?: string; amount?: number }): Promise<ApiEnvelope<OrderDto>> {
    return adminFetch<OrderDto>(`/orders/${encodeURIComponent(id)}/refund`, {
      method: "POST",
      body: body ?? undefined,
    });
  },
  expirePending(): Promise<ApiEnvelope<{ expired: number }>> {
    return adminFetch<{ expired: number }>("/orders/expire-pending", { method: "POST" });
  },

  // TanStack Query hooks
  useList: (params: OrderListParams = {}, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "orders", params],
      queryFn: () => ordersApi.list(params),
      ...options,
    }),
  useDetail: (id: string, options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number }) =>
    useQuery({
      queryKey: ["admin", "orders", id],
      queryFn: () => ordersApi.getById(id),
      ...options,
    }),
  useUpdateStatus: () =>
    useMutation({
      mutationFn: ({ id, status }: { id: string; status: string }) =>
        ordersApi.setStatus(id, { status }).then((r) => r.data),
    }),
  useSetPayment: () =>
    useMutation({
      mutationFn: ({ id, ...body }: { id: string; paymentStatus: PaymentStatus; transactionId?: string }) =>
        ordersApi.setPaymentStatus(id, body).then((r) => r.data),
    }),
  useCancel: () =>
    useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
        ordersApi.cancel(id, reason === undefined ? {} : { reason }).then((r) => r.data),
    }),
  useRefund: () =>
    useMutation({
      mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) =>
        ordersApi.refund(id, { ...(amount === undefined ? {} : { amount }), ...(reason === undefined ? {} : { reason }) }).then((r) => r.data),
    }),
};

/** Customers â€” mirrors `backend/src/modules/customers` (customers RBAC). */
export const customersApi = {
  list(params: CustomerListParams = {}): Promise<ApiEnvelope<CustomerDto[]>> {
    return adminFetch<CustomerDto[]>(`/customers${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<ApiEnvelope<CustomerDetailDto>> {
    return adminFetch<CustomerDetailDto>(`/customers/${encodeURIComponent(id)}`);
  },
  create(body: CreateCustomerInput): Promise<ApiEnvelope<CustomerDto>> {
    return adminFetch<CustomerDto>("/customers", { method: "POST", body });
  },
  update(id: string, body: UpdateCustomerInput): Promise<ApiEnvelope<CustomerDto>> {
    return adminFetch<CustomerDto>(`/customers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

/** Coupons â€” mirrors `backend/src/modules/coupons` (marketing RBAC). */
export const couponsApi = {
  list(params: { q?: string; type?: string; page?: number; pageSize?: number; sort?: string } = {}): Promise<ApiEnvelope<CouponDto[]>> {
    return adminFetch<CouponDto[]>(`/coupons${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<ApiEnvelope<CouponDto>> {
    return adminFetch<CouponDto>(`/coupons/${encodeURIComponent(id)}`);
  },
  create(body: CreateCouponInput): Promise<ApiEnvelope<CouponDto>> {
    return adminFetch<CouponDto>("/coupons", { method: "POST", body });
  },
  update(id: string, body: UpdateCouponInput): Promise<ApiEnvelope<CouponDto>> {
    return adminFetch<CouponDto>(`/coupons/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/coupons/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};
/** Banners â€” mirrors `backend/src/modules/banners` (marketing RBAC). */
export const bannersApi = {
  list(params: BannerListParams = {}): Promise<ApiEnvelope<BannerDto[]>> {
    return adminFetch<BannerDto[]>(`/banners${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<ApiEnvelope<BannerDto>> {
    return adminFetch<BannerDto>(`/banners/${encodeURIComponent(id)}`);
  },
  create(body: CreateBannerInput): Promise<ApiEnvelope<BannerDto>> {
    return adminFetch<BannerDto>("/banners", { method: "POST", body });
  },
  update(id: string, body: UpdateBannerInput): Promise<ApiEnvelope<BannerDto>> {
    return adminFetch<BannerDto>(`/banners/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/banners/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

/** Media library â€” mirrors `backend/src/modules/media` (marketing RBAC). */
export const mediaApi = {
  list(params: MediaListParams = {}): Promise<ApiEnvelope<MediaDto[]>> {
    return adminFetch<MediaDto[]>(`/media${buildQuery({ ...params })}`);
  },
  getById(id: string): Promise<ApiEnvelope<MediaDto>> {
    return adminFetch<MediaDto>(`/media/${encodeURIComponent(id)}`);
  },
  upload(file: File, alt?: string): Promise<ApiEnvelope<MediaDto>> {
    return adminUpload<MediaDto>("/media", file, {
      ...(alt ? { alt } : {}),
    });
  },
  update(id: string, body: UpdateMediaInput): Promise<ApiEnvelope<MediaDto>> {
    return adminFetch<MediaDto>(`/media/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/media/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

/** Admin users â€” mirrors `backend/src/modules/users` (administration RBAC). */
export const usersApi = {
  list(params: UserListParams = {}): Promise<ApiEnvelope<UserDto[]>> {
    return adminFetch<UserDto[]>(`/users${buildQuery({ ...params })}`);
  },
  roles(): Promise<ApiEnvelope<RoleDto[]>> {
    return adminFetch<RoleDto[]>("/users/roles");
  },
  getById(id: string): Promise<ApiEnvelope<UserDto>> {
    return adminFetch<UserDto>(`/users/${encodeURIComponent(id)}`);
  },
  create(body: CreateUserInput): Promise<ApiEnvelope<UserDto>> {
    return adminFetch<UserDto>("/users", { method: "POST", body });
  },
  update(id: string, body: UpdateUserInput): Promise<ApiEnvelope<UserDto>> {
    return adminFetch<UserDto>(`/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  resetPassword(id: string, newPassword: string): Promise<unknown> {
    return adminFetch(`/users/${encodeURIComponent(id)}/reset-password`, {
      method: "POST",
      body: { newPassword },
    });
  },
  remove(id: string): Promise<unknown> {
    return adminFetch(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// TanStack Query hooks (query keys follow src/lib/api/queryKeys.ts)
// ---------------------------------------------------------------------------

type HookOptions = { enabled?: boolean; refetchInterval?: number | false; staleTime?: number; retry?: boolean | number };

export const customersQueryApi = {
  useList: (params: CustomerListParams = {}, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "customers", params],
      queryFn: () => customersApi.list(params).then((r) => r.data),
      ...options,
    }),
  useDetail: (id: string, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "customers", id],
      queryFn: () => customersApi.getById(id).then((r) => r.data),
      ...(id ? {} : { enabled: false }),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateCustomerInput) => customersApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...body }: UpdateCustomerInput & { id: string }) =>
        customersApi.update(id, body).then((r) => r.data),
      onSuccess: (_data, variables) => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "customers", variables.id] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => customersApi.remove(id),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "reports", "overview"] });
      },
    });
  },
};

export const couponsQueryApi = {
  useList: (params: CouponListParams = {}, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "coupons", params],
      queryFn: () => couponsApi.list(params).then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateCouponInput) => couponsApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...body }: UpdateCouponInput & { id: string }) =>
        couponsApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => couponsApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] }),
    });
  },
};

export const bannersQueryApi = {
  useList: (params: BannerListParams = {}, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "banners", params],
      queryFn: () => bannersApi.list(params).then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateBannerInput) => bannersApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...body }: UpdateBannerInput & { id: string }) =>
        bannersApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => bannersApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "banners"] }),
    });
  },
};

export const mediaQueryApi = {
  useList: (params: MediaListParams = {}, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "media", params],
      queryFn: () => mediaApi.list(params).then((r) => r.data),
      ...options,
    }),
  useUpload: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ file, alt }: { file: File; alt?: string }) => mediaApi.upload(file, alt).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "media"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...body }: UpdateMediaInput & { id: string }) =>
        mediaApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "media"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => mediaApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "media"] }),
    });
  },
};

export const usersQueryApi = {
  useList: (params: UserListParams = {}, options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "users", params],
      queryFn: () => usersApi.list(params).then((r) => r.data),
      ...options,
    }),
  useRoles: (options?: HookOptions) =>
    useQuery({
      queryKey: ["admin", "users", "roles"],
      queryFn: () => usersApi.roles().then((r) => r.data),
      ...options,
    }),
  useCreate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: CreateUserInput) => usersApi.create(body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    });
  },
  useUpdate: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...body }: UpdateUserInput & { id: string }) =>
        usersApi.update(id, body).then((r) => r.data),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    });
  },
  useRemove: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => usersApi.remove(id),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    });
  },
};
