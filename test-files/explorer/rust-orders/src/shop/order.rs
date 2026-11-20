// Start here: Explore Classes From Here on this file lights Status, Line and
// Order. Order implements Entity; its fields lead out to Line, Money and Status.
use crate::shop::entity::Entity;
use crate::shop::money::Money;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Status {
    Open,
    Paid,
}

#[derive(Clone, Debug)]
pub struct Line {
    pub sku: String,
    pub price: Money,
}

#[derive(Clone, Debug)]
pub struct Order {
    id: String,
    pub lines: Vec<Line>,
    pub total: Money,
    status: Status,
}

impl Order {
    pub fn add(&mut self, line: Line) -> Result<(), String> {
        if self.status != Status::Open {
            return Err("order is closed".into());
        }
        self.total = self.total.add(&line.price);
        self.lines.push(line);
        Ok(())
    }

    pub fn is_paid(&self) -> bool {
        self.status == Status::Paid
    }

    pub(crate) fn mark_paid(&mut self) {
        self.status = Status::Paid;
    }
}

impl Entity for Order {
    fn id(&self) -> &str {
        &self.id
    }
}
