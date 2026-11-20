// Fields that reference other classes become association arrows, labelled
// with the field name. Arrays, generics, Promise<...> and unions are looked
// through, and imports via tsconfig path aliases resolve too.
import { Product } from "@catalog/Product";

export class Customer {
  name: string;
}

export class CartItem {
  product: Product;
  quantity: number;
}

export class Cart {
  owner: Customer;
  items: CartItem[];
  saved: Map<string, CartItem>;
  recommended: Promise<Product[]>;
  coupon: Coupon | undefined;
  parent?: Cart;
}

export class Coupon {
  code: string;
}
