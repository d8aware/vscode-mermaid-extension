use crate::shop::order::Order;

/// Keeps orders. storage::memstore::MemStore implements it.
pub trait Store {
    fn save(&mut self, order: Order);
    fn find(&self, id: &str) -> Option<&Order>;
}
