// extends between classes and between interfaces: solid arrow, hollow head.
// implements: dotted arrow. A base class from outside the folder (here the
// built-in Error) is shown as an empty box.
export interface Drawable {
  draw(): void;
}

export interface Resizable extends Drawable {
  resize(factor: number): void;
}

export abstract class Shape implements Drawable {
  abstract area(): number;
  draw(): void {}
}

export class Circle extends Shape implements Resizable {
  radius = 1;
  area(): number {
    return Math.PI * this.radius ** 2;
  }
  resize(factor: number): void {}
}

export class Square extends Shape {
  side = 1;
  area(): number {
    return this.side ** 2;
  }
}

export class ShapeError extends Error {}
