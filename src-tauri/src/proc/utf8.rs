//! Streaming UTF-8 decoding for child-process output.
//!
//! Pipes hand us arbitrary byte chunks, so a multi-byte character can be split
//! across two reads. `Utf8Stream` keeps the incomplete tail of each chunk and
//! prepends it to the next one, so the frontend only ever sees whole characters.

#[derive(Default)]
pub struct Utf8Stream {
    tail: Vec<u8>,
}

impl Utf8Stream {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decode `bytes`, returning every complete character. Invalid sequences
    /// become U+FFFD rather than dropping data; an incomplete trailing sequence
    /// is held back for the next call.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        let mut buf = std::mem::take(&mut self.tail);
        buf.extend_from_slice(bytes);

        match std::str::from_utf8(&buf) {
            Ok(s) => s.to_owned(),
            Err(err) => {
                let valid_up_to = err.valid_up_to();
                match err.error_len() {
                    // `None` means the bytes after `valid_up_to` are the start
                    // of a sequence that may complete in the next chunk.
                    None => {
                        self.tail = buf[valid_up_to..].to_vec();
                        // Safe: the prefix is valid by construction.
                        String::from_utf8_lossy(&buf[..valid_up_to]).into_owned()
                    }
                    // A genuinely invalid byte run: decode lossily and keep
                    // going, but still hold back any incomplete tail after it.
                    Some(_) => {
                        let (head, rest) = split_incomplete_tail(&buf);
                        self.tail = rest.to_vec();
                        String::from_utf8_lossy(head).into_owned()
                    }
                }
            }
        }
    }

    /// Flush whatever is left at end of stream, decoding lossily.
    pub fn finish(&mut self) -> String {
        let tail = std::mem::take(&mut self.tail);
        String::from_utf8_lossy(&tail).into_owned()
    }
}

/// Split off a trailing incomplete UTF-8 sequence, if any.
fn split_incomplete_tail(buf: &[u8]) -> (&[u8], &[u8]) {
    match std::str::from_utf8(buf) {
        Ok(_) => (buf, &[]),
        Err(err) => match err.error_len() {
            None => buf.split_at(err.valid_up_to()),
            Some(_) => {
                // Invalid somewhere in the middle; check only the last few
                // bytes for an incomplete sequence.
                let start = buf.len().saturating_sub(3);
                for i in start..buf.len() {
                    if std::str::from_utf8(&buf[i..]).is_err()
                        && std::str::from_utf8(&buf[i..])
                            .err()
                            .and_then(|e| e.error_len())
                            .is_none()
                    {
                        return buf.split_at(i);
                    }
                }
                (buf, &[])
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_ascii_through() {
        let mut s = Utf8Stream::new();
        assert_eq!(s.push(b"hello"), "hello");
        assert_eq!(s.finish(), "");
    }

    #[test]
    fn joins_a_character_split_across_chunks() {
        // "é" is 0xC3 0xA9
        let mut s = Utf8Stream::new();
        assert_eq!(s.push(b"caf\xC3"), "caf");
        assert_eq!(s.push(b"\xA9!"), "é!");
    }

    #[test]
    fn joins_a_four_byte_emoji_split_three_ways() {
        // "🐸" is F0 9F 90 B8
        let mut s = Utf8Stream::new();
        assert_eq!(s.push(b"\xF0"), "");
        assert_eq!(s.push(b"\x9F\x90"), "");
        assert_eq!(s.push(b"\xB8 toad"), "🐸 toad");
    }

    #[test]
    fn replaces_invalid_bytes_without_losing_following_text() {
        let mut s = Utf8Stream::new();
        assert_eq!(s.push(b"a\xFFb"), "a\u{FFFD}b");
    }

    #[test]
    fn finish_flushes_a_dangling_tail_lossily() {
        let mut s = Utf8Stream::new();
        assert_eq!(s.push(b"x\xC3"), "x");
        assert_eq!(s.finish(), "\u{FFFD}");
    }
}
