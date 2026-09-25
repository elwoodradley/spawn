//! One error type for every command the frontend can invoke.
//!
//! Tauri serialises command errors for the webview, so this type implements
//! `Serialize` as a plain message string. Rust callers still get the typed enum.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("no such process: {0}")]
    NoSuchProcess(u32),

    #[error("stdin is closed for process {0}")]
    StdinClosed(u32),

    #[error("{0}")]
    Message(String),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
