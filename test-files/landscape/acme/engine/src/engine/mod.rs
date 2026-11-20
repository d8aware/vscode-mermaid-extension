use super::parse::tokens;

pub fn run(input: &str) {
    println!("{}", tokens(input).len());
}
