// Start here: Explore Classes From Here on this file lights Status, Line and
// Order. Order's fields lead out to Money; Store and Service lead in.
package shop

import "errors"

// Status is where an order is in its life.
type Status int

const (
	Open Status = iota
	Paid
)

// Line is one product on an order.
type Line struct {
	SKU   string
	Price Money
}

// Order collects lines until it is paid.
type Order struct {
	ID     string
	Lines  []Line
	Total  Money
	status Status
}

// Add appends a line to an open order.
func (o *Order) Add(line Line) error {
	if o.status != Open {
		return errors.New("order is closed")
	}
	o.Lines = append(o.Lines, line)
	o.Total = o.Total.Add(line.Price)
	return nil
}

// IsPaid reports whether the order has been paid.
func (o Order) IsPaid() bool { return o.status == Paid }
