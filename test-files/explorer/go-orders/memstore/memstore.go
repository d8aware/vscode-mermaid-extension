// Package memstore keeps orders in memory.
package memstore

import "example.com/orders/shop"

// MemStore is an in-memory shop.Store.
type MemStore struct {
	orders map[string]*shop.Order
}

// New returns an empty store.
func New() *MemStore { return &MemStore{orders: map[string]*shop.Order{}} }

func (m *MemStore) Save(order *shop.Order) error {
	m.orders[order.ID] = order
	return nil
}

func (m *MemStore) Find(id string) (*shop.Order, bool) {
	order, ok := m.orders[id]
	return order, ok
}
