use shop::{billing::total, crate_marker, errors::existing};

#[test]
fn baseline() {
    crate_marker();
    assert_eq!(total(), 1);
    assert_eq!(existing(), "existing");
}
