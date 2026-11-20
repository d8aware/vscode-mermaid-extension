use crate::shop::money::Money;
use crate::shop::order::Order;
use crate::shop::store::Store;

/// Checks orders out through a Store (constructor injection).
pub struct Service {
    store: Box<dyn Store>,
}

impl Service {
    pub fn new(store: Box<dyn Store>) -> Self {
        Service { store }
    }

    pub fn checkout(&mut self, mut order: Order) -> Money {
        order.mark_paid();
        let total = order.total.clone();
        self.store.save(order);
        total
    }
}
