use rust_obfstr::{crate_marker, formatting::obf_fmt};

#[test]
fn formats_text() {
    crate_marker();
    assert_eq!(obf_fmt(), "fmt");
}
