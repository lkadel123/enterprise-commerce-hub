export interface CartItemDto {
  id: string; // cart item identifier (productId)
  productId: string;
  quantity: number;
  price: number;
  name: string;
  slug: string;
  image: string | null;
  availableStock: number;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  itemCount: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddToCartInput {
  productId: string;
  quantity?: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface CartListParams {
  page?: number;
  pageSize?: number;
}
