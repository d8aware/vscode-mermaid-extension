mod engine;
mod parse;
// mod ignored;  (comments do not count)

use crate::engine::run;

fn main() {
    run("1 + 2");
}
