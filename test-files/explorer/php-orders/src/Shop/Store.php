<?php

namespace Shop;

/** Keeps orders. Storage\MemStore implements it. */
interface Store
{
    public function save(Order $order): void;

    public function find(string $id): ?Order;
}
