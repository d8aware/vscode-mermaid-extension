// Overview example: a small domain model using most features together.
// Money comes from shared/ through the "@shared/*" tsconfig path alias.
// User.spec.ts (a test file) and globals.d.ts are not in the diagram.
import { Money } from "@shared/Money";
import { Entity } from "./Entity";
import { Auditable } from "./Auditable";
import type { Order } from "./Order";

export interface Address {
  street: string;
  city: string;
}

export interface UserProps {
  email: string;
  address?: Address;
}

export class User extends Entity<string> implements Auditable {
  static count = 0;
  createdAt = new Date();
  balance: Money;
  orders: Order[] = [];
  private props: UserProps;
  #secret = "";

  constructor(id: string, props: UserProps) {
    super(id);
    this.props = props;
  }

  get email(): string {
    return this.props.email;
  }

  set email(value: string) {
    this.props.email = value;
  }

  validate(): void {}

  updateAddress({ street, city = "Unknown" }: Partial<Address>, ...tags: string[]): void {}

  async deposit(amount: Money, note = ""): Promise<Money> {
    return amount;
  }

  private recalculate() {
    return this.orders.length;
  }

  protected touch(): void {}
}
