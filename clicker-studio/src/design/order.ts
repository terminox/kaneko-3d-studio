// An Order: a customer's Designs with quantities. Saved as `.order.json`.
import type { Design } from "./types.ts";
import { price, switchesOf } from "./price.ts";

export type OrderItem = { design: Design; qty: number; thumb?: string };

export type Order = {
  version: 1;
  customer: string;
  note: string;
  created: string;
  items: OrderItem[];
};

export function newOrder(): Order {
  return { version: 1, customer: "", note: "", created: new Date().toISOString(), items: [] };
}

export function orderTotal(o: Order): number {
  return o.items.reduce((s, it) => s + price(it.design) * it.qty, 0);
}

export function switchCount(d: Design): number {
  if (d.parts === "caps" || d.parts === "az-set") return 0;
  return switchesOf(d);
}
