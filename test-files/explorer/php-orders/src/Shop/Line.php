<?php

namespace Shop;

/** One product on an order. */
class Line
{
    public string $sku = '';
    public Money $price;
}
