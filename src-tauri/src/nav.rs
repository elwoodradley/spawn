//! Keep the window on SPAWN's own pages.
//!
//! A link in a .docx handout (or any other rendered content) would otherwise
//! navigate the whole window to a web page: the IDE disappears, there is no
//! back button, and unsaved edits are lost. Navigation away from the app's
//! own origin is cancelled.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Runtime, Url};

pub fn guard<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(|_, url| is_app_url(url))
        .build()
}

/// The bundled frontend (`tauri://localhost`, or `http(s)://tauri.localhost`
/// on Windows), about: pages such as an iframe's `about:srcdoc`, and the
/// Vite dev server in debug builds.
pub fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" => true,
        "http" | "https" => {
            let dev =
                cfg!(debug_assertions) && matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
            url.host_str() == Some("tauri.localhost") || dev
        }
        _ => false,
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).expect("url")
    }

    #[test]
    fn stays_on_the_app() {
        assert!(is_app_url(&url("tauri://localhost/")));
        assert!(is_app_url(&url("tauri://localhost/#footnote-1")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("https://tauri.localhost/")));
        assert!(is_app_url(&url("about:srcdoc")));
        assert!(is_app_url(&url("about:blank")));
    }

    #[test]
    fn refuses_the_web() {
        assert!(!is_app_url(&url("https://docs.python.org/3/")));
        assert!(!is_app_url(&url("http://tauri.localhost.evil.example/")));
        assert!(!is_app_url(&url("mailto:teacher@example.edu")));
        assert!(!is_app_url(&url("file:///etc/passwd")));
        assert!(!is_app_url(&url("data:text/html,<h1>hi</h1>")));
    }
}
