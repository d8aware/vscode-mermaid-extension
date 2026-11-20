package shop

import "testing"

func TestAdd(t *testing.T) {
	var order Order
	if err := order.Add(Line{SKU: "a", Price: Money{Amount: 1}}); err != nil {
		t.Fatal(err)
	}
}
