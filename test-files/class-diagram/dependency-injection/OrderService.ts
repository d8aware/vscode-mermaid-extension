// Constructor injection. A constructor parameter property
// (`private readonly repo: ...`) is a field: association arrow labelled with
// its name. A plain constructor parameter is a dependency: dashed arrow.
// A plain parameter that is stored in a field is shown once, as the field.
export interface OrderRepository {
  save(order: Order): Promise<void>;
}

export class Order {
  id: string;
}

export class Clock {
  now(): Date {
    return new Date();
  }
}

export class Mailer {
  send(to: string): void {}
}

export class Logger {
  log(message: string): void {}
}

export class OrderService {
  private readonly logger: Logger;

  constructor(
    private readonly repo: OrderRepository,
    public mailer: Mailer,
    clock: Clock,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  async place(order: Order): Promise<void> {
    await this.repo.save(order);
  }
}
