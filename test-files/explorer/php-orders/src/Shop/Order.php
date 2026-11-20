<?php

// Start here: Explore Classes From Here on this file lights Order. It extends
// Entity; its typed properties lead out to Money and Status.

namespace Shop;

/** Collects lines until it is paid. */
class Order extends Entity
{
    /** @var Line[] */
    public array $lines = [];
    public Money $total;
    private Status $status = Status::Open;

    public function add(Line $line): void
    {
        $this->lines[] = $line;
        $this->total = $this->total->add($line->price);
    }

    public function isPaid(): bool
    {
        return $this->status === Status::Paid;
    }

    public function markPaid(): void
    {
        $this->status = Status::Paid;
    }
}
