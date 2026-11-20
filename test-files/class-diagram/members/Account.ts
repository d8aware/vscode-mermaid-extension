// Visibility markers: + public, - private (also #private), # protected.
// Static members are underlined ($), abstract methods italic (*).
// Getters/setters appear as fields; optional fields keep their "?".
export abstract class Account {
  static openAccounts = 0;
  readonly id: string;
  nickname?: string;
  protected balance = 0;
  private history: number[] = [];
  #pin = "0000";

  constructor(id: string) {
    this.id = id;
  }

  get total(): number {
    return this.balance;
  }

  set limit(value: number) {}

  static create(id: string): void {}

  abstract interestRate(): number;

  deposit(amount: number, note = "", ...tags: string[]): void {}

  transfer({ to, amount = 0 }: { to: string; amount?: number }): boolean {
    return true;
  }

  private audit(): void {}

  protected notify(): Promise<void> {
    return Promise.resolve();
  }
}
