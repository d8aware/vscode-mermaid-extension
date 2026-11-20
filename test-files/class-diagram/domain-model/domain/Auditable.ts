export interface Auditable {
  createdAt: Date;
}

export interface SoftDeletable extends Auditable {
  deletedAt?: Date;
}
