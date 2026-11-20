package shop

// Store keeps orders. memstore.MemStore implements it without saying so
// (Go interfaces are satisfied implicitly); the language server finds it.
type Store interface {
	Save(order *Order) error
	Find(id string) (*Order, bool)
}
