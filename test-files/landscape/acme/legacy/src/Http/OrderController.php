<?php
namespace Acme\Legacy\Http;

use Acme\Legacy\Domain\Order;
// use Acme\Legacy\Domain\Ignored;  (comments do not count)

class OrderController { public function show(): Order { return new Order(); } }
