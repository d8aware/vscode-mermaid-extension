export abstract class Entity<TId> {
  protected constructor(public readonly id: TId) {}

  abstract validate(): void;

  equals(other?: Entity<TId>): boolean {
    return other?.id === this.id;
  }
}
