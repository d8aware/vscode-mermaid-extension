package shop

// Money is an amount in minor units of one currency.
type Money struct {
	Amount   int64
	Currency string
}

// Add returns the sum; both must share a currency.
func (m Money) Add(other Money) Money {
	return Money{Amount: m.Amount + other.Amount, Currency: m.Currency}
}
