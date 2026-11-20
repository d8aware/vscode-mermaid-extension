<?php

namespace Shop;

/** Checks orders out through a Store (constructor injection). */
class Service
{
    private Store $store;

    public function __construct(Store $store)
    {
        $this->store = $store;
    }

    public function checkout(Order $order): Money
    {
        $order->markPaid();
        $this->store->save($order);
        return $order->total;
    }
}
