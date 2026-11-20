<?php

namespace Shop;

/** An amount in minor units of one currency. */
class Money
{
    public function __construct(public int $amount = 0, public string $currency = 'USD')
    {
    }

    public function add(Money $other): Money
    {
        return new Money($this->amount + $other->amount, $this->currency);
    }
}
