import { Money } from "@shared/Money";
import { User } from "./User";

export type OrderLine = {
  product: string;
  quantity: number;
  price: Money;
};

export class Order {
  lines: Map<string, OrderLine[]> = new Map();
  owner: Promise<User> | undefined;
  onChange: (order: Order) => void;
  meta: { source: string };
}
