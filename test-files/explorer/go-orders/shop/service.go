package shop

// Service checks orders out through a Store.
type Service struct {
	store Store
}

// NewService is a constructor function: a function, not a method.
func NewService(store Store) *Service { return &Service{store: store} }

// Checkout marks the order paid and saves it.
func (s *Service) Checkout(order *Order) (Money, error) {
	order.status = Paid
	return order.Total, s.store.Save(order)
}
