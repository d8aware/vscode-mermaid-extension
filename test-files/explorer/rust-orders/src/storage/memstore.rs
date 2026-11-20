use std::collections::HashMap;

use crate::shop::entity::Entity;
use crate::shop::order::Order;
use crate::shop::store::Store;

/// An in-memory Store.
#[derive(Default)]
pub struct MemStore {
    orders: HashMap<String, Order>,
}

impl Store for MemStore {
    fn save(&mut self, order: Order) {
        self.orders.insert(order.id().to_string(), order);
    }

    fn find(&self, id: &str) -> Option<&Order> {
        self.orders.get(id)
    }
}
