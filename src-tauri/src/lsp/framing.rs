//! `Content-Length` framing for JSON-RPC over stdio, as LSP uses it.
//!
//! Byte-accurate: the length counts UTF-8 bytes of the body, so framing has
//! to happen before any text decoding. `Deframer::push` takes raw bytes and
//! yields whole bodies; `frame` wraps a body for sending.

/// Incremental parser for a byte stream of framed messages.
#[derive(Default)]
pub struct Deframer {
    buf: Vec<u8>,
}

impl Deframer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed bytes; return every complete body they complete, in order.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(bytes);
        let mut out = Vec::new();
        while let Some(header_end) = find(&self.buf, b"\r\n\r\n") {
            let Some(len) = content_length(&self.buf[..header_end]) else {
                // Unparseable header: drop it so one bad frame cannot wedge the stream.
                self.buf.drain(..header_end + 4);
                continue;
            };
            let start = header_end + 4;
            if self.buf.len() < start + len {
                break;
            }
            let body = String::from_utf8_lossy(&self.buf[start..start + len]).into_owned();
            self.buf.drain(..start + len);
            out.push(body);
        }
        out
    }
}

/// Wrap a JSON body in a header.
pub fn frame(body: &str) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
    out.extend_from_slice(body.as_bytes());
    out
}

fn content_length(header: &[u8]) -> Option<usize> {
    for line in header.split(|&b| b == b'\n') {
        let line = std::str::from_utf8(line).ok()?.trim();
        if let Some(rest) = line
            .strip_prefix("Content-Length:")
            .or_else(|| line.strip_prefix("content-length:"))
        {
            return rest.trim().parse().ok();
        }
    }
    None
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_and_deframes_round_trip() {
        let mut d = Deframer::new();
        let bytes = frame(r#"{"id":1}"#);
        assert_eq!(d.push(&bytes), vec![r#"{"id":1}"#.to_owned()]);
    }

    #[test]
    fn handles_a_frame_split_anywhere() {
        let bytes = frame(r#"{"method":"x","params":"héllo"}"#);
        for cut in 1..bytes.len() {
            let mut d = Deframer::new();
            assert!(d.push(&bytes[..cut]).is_empty(), "cut {cut} yielded early");
            assert_eq!(d.push(&bytes[cut..]).len(), 1, "cut {cut} did not complete");
        }
    }

    #[test]
    fn yields_several_messages_from_one_chunk() {
        let mut bytes = frame("a");
        bytes.extend(frame("bb"));
        bytes.extend(frame("ccc"));
        let mut d = Deframer::new();
        assert_eq!(d.push(&bytes), vec!["a", "bb", "ccc"]);
    }

    #[test]
    fn counts_utf8_bytes_not_characters() {
        let body = "{\"s\":\"🐸🐸\"}"; // 4-byte characters
        let bytes = frame(body);
        assert!(
            String::from_utf8_lossy(&bytes).starts_with(&format!("Content-Length: {}", body.len()))
        );
        let mut d = Deframer::new();
        assert_eq!(d.push(&bytes), vec![body]);
    }

    #[test]
    fn tolerates_extra_headers_and_case() {
        let raw = b"content-type: application/vscode-jsonrpc; charset=utf-8\r\ncontent-length: 2\r\n\r\n{}";
        let mut d = Deframer::new();
        assert_eq!(d.push(raw), vec!["{}"]);
    }

    #[test]
    fn skips_a_broken_header() {
        let mut raw = b"garbage\r\n\r\n".to_vec();
        raw.extend(frame("{}"));
        let mut d = Deframer::new();
        assert_eq!(d.push(&raw), vec!["{}"]);
    }
}
