import { Line, Order } from "./order";

// A test file: left out of the explorer unless classDiagram.includeTestFiles is on.
export function testAdd(): void {
  new Order().add(new Line());
}
