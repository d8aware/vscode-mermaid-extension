/// An amount in minor units of one currency.
#[derive(Clone, Debug, Default)]
pub struct Money {
    pub amount: i64,
    pub currency: String,
}

impl Money {
    pub fn add(&self, other: &Money) -> Money {
        Money { amount: self.amount + other.amount, currency: self.currency.clone() }
    }
}
