<?php

namespace Storage;

use Shop\Order;
use Shop\Store;

/** An in-memory Store. */
class MemStore implements Store
{
    /** @var array<string, Order> */
    private array $orders = [];

    public function save(Order $order): void
    {
        $this->orders[$order->id] = $order;
    }

    public function find(string $id): ?Order
    {
        return $this->orders[$id] ?? null;
    }
}
