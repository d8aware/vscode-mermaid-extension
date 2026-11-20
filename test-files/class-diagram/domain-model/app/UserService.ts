import { User } from "../domain/User";

export interface UserRepository {
  findAll(): Promise<User[]>;
}

export class Logger {
  log(message: string): void {}
}

export class AppError extends Error {}

export class UserService {
  constructor(private readonly repo: UserRepository, logger: Logger) {}

  async findAll(): Promise<User[]> {
    return this.repo.findAll();
  }
}
