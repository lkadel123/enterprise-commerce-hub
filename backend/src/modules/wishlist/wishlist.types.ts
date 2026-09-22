export interface WishlistItemDto {
  id: string; // productId
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  inStock: boolean;
  addedAt: string;
}

export interface WishlistDto {
  id: string;
  items: WishlistItemDto[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddToWishlistInput {
  productId: string;
}

export interface WishlistListParams {
  page?: number;
  pageSize?: number;
}
