/// Anything with an identity.
pub trait Entity {
    fn id(&self) -> &str;
}
