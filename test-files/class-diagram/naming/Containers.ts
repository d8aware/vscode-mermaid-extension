// Generic classes keep their type parameters in the box title. Classes inside
// a namespace are included. Enums and object-shaped type aliases appear too.
import { Address as BillingAddress } from "./billing/Address";
import { Address as ShippingAddress } from "./shipping/Address";

export class Repository<TEntity, TKey> {
  items: Map<TKey, TEntity>;
}

export namespace Geo {
  export class Coordinates {
    lat: number;
    lng: number;
  }
}

export enum Status {
  Active,
  Archived,
}

export type Contact = {
  billing: BillingAddress;
  shipping: ShippingAddress;
  status: Status;
};
