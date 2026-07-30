//! The desktop shell.
//!
//! Six commands, and no decisions. Everything that judges anything — what the concordance
//! says, what changed, which parts that touches, what the change log reads like — is in
//! TypeScript, where it is covered by the test suite. This layer exists only because a
//! webview cannot reach census.gov (no CORS header on that host) and cannot write a file
//! the operator can open afterwards.
//!
//! No plugins, deliberately. Everything the shell can do is one of the commands below, so
//! the whole native surface of an application that holds shipment data is auditable in one
//! file — which matters more than the convenience of a dependency on a machine somebody's
//! IT department is responsible for.
//!
//! Keeping it this thin is the point: the packaged binary is the one artifact that cannot
//! be verified from a test run here, so as little as possible depends on it being right.

use std::fs;
use std::io::Read;
use std::path::PathBuf;

use tauri::Manager;

/// The only URL this app will fetch.
///
/// Fixed here rather than passed from the webview on purpose. A command that took a URL
/// would be a general-purpose proxy sitting inside a desktop app that also holds shipment
/// data — worth avoiding for a feature that only ever needs one address.
const CONCORDANCE_URL: &str =
    "https://www.census.gov/foreign-trade/aes/documentlibrary/concordance/expaes.txt";

/// The concordance is ~1.7 MB. This ceiling is generous enough for years of growth and
/// still refuses to buffer a response that is clearly not the file we asked for.
const MAX_DOWNLOAD_BYTES: u64 = 32 * 1024 * 1024;

fn data_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not locate the application data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Where generated documents go: the user's Downloads folder.
///
/// A blob download from the webview was landing somewhere the app could not name — on Linux
/// the process working directory, on Windows wherever WebView2 decided — and the operator
/// was told nothing either way. Writing it here means the app knows the full path and can
/// say it, and can open the file afterwards.
///
/// Falls back to the data directory, which is not where anyone would look but is at least a
/// place that certainly exists and is certainly writable.
fn output_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = match app.path().download_dir() {
        Ok(dir) => dir,
        Err(_) => return data_directory(app),
    };
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// `name.pdf`, or `name (2).pdf` when that is taken.
///
/// Regenerating a shipment must not overwrite the copy already saved: it may have been
/// signed, annotated or filed. Browsers do this for the same reason, and an operator who
/// has just clicked the button twice should end up with two files rather than a silently
/// replaced one.
fn unique_path(dir: &PathBuf, name: &str) -> Result<PathBuf, String> {
    let first = safe_join(dir, name)?;
    if !first.exists() {
        return Ok(first);
    }
    let path = PathBuf::from(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let suffix = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 2..1000 {
        let candidate = safe_join(dir, &format!("{stem} ({n}){suffix}"))?;
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!("Too many files named {name} already exist."))
}

/// Rejects anything that is not a plain file name.
///
/// The webview picks these names, so a path separator or a `..` in one would let a bug in
/// the page write outside the data directory.
fn safe_join(dir: &PathBuf, name: &str) -> Result<PathBuf, String> {
    let looks_like_a_path = name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || PathBuf::from(name).components().count() != 1;
    if looks_like_a_path {
        return Err(format!("\"{name}\" is not a plain file name."));
    }
    Ok(dir.join(name))
}

/// Builds the HTTP agent, honouring however this machine reaches the internet.
///
/// Two accommodations for a corporate network, both learned by running this rather than
/// reasoning about it. TLS goes through the platform stack (schannel on Windows), so a CA
/// that IT installed for traffic inspection is trusted like any other; and an explicit
/// proxy is picked up from the environment, since a workstation that can only reach the
/// internet through one would otherwise just time out.
fn build_agent() -> Result<ureq::Agent, String> {
    let connector = native_tls::TlsConnector::new()
        .map_err(|e| format!("Could not initialise TLS: {e}"))?;
    let mut builder = ureq::AgentBuilder::new()
        .tls_connector(std::sync::Arc::new(connector))
        .timeout(std::time::Duration::from_secs(120));

    let configured = ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
        .iter()
        .find_map(|key| std::env::var(key).ok())
        .filter(|value| !value.trim().is_empty());

    if let Some(url) = configured {
        // A malformed proxy setting is worth reporting rather than silently ignoring: the
        // alternative is a connection that hangs until it times out for no stated reason.
        let proxy = ureq::Proxy::new(url.trim())
            .map_err(|e| format!("The configured proxy ({url}) could not be used: {e}"))?;
        builder = builder.proxy(proxy);
    }

    Ok(builder.build())
}

#[tauri::command]
async fn fetch_concordance() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let response = build_agent()?
            .get(CONCORDANCE_URL)
            .call()
            .map_err(|e| format!("Could not reach the Census Bureau: {e}"))?;

        let mut body = String::new();
        response
            .into_reader()
            .take(MAX_DOWNLOAD_BYTES)
            .read_to_string(&mut body)
            .map_err(|e| format!("Could not read the download: {e}"))?;
        Ok(body)
    })
    .await
    .map_err(|e| format!("The download did not complete: {e}"))?
}

#[tauri::command]
fn write_data_file(app: tauri::AppHandle, name: String, contents: String) -> Result<String, String> {
    let dir = data_directory(&app)?;
    let path = safe_join(&dir, &name)?;
    fs::write(&path, contents).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_data_file(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let dir = data_directory(&app)?;
    let path = safe_join(&dir, &name)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

/// Writes a generated document and returns where it went, for the caller to show.
#[tauri::command]
fn save_output(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = output_directory(&app)?;
    let path = unique_path(&dir, &name)?;
    fs::write(&path, bytes).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Hands a file we just wrote to whatever the system opens that type with.
///
/// Takes a path rather than a name because the caller has one — `save_output` returned it,
/// possibly with a `(2)` the caller did not choose. It is checked to sit inside the output
/// directory and to exist before anything is launched, so this cannot be pointed at an
/// arbitrary file on the machine by a bug in the page.
///
/// No shell in either branch: the path is passed as a single argument, so a space in
/// `C:\Users\Firstname Lastname\Downloads` is quoted by the standard library rather than
/// resplit by a command interpreter.
#[tauri::command]
fn open_output(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = output_directory(&app)?;
    let inside = target.parent().map(|p| p == dir.as_path()).unwrap_or(false);
    if !inside {
        return Err(format!("{path} is not a file this application wrote."));
    }
    if !target.is_file() {
        return Err(format!("{path} is no longer there."));
    }

    #[cfg(target_os = "windows")]
    let launched = std::process::Command::new("explorer.exe").arg(&target).spawn();
    #[cfg(target_os = "macos")]
    let launched = std::process::Command::new("open").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let launched = std::process::Command::new("xdg-open").arg(&target).spawn();

    // `explorer.exe` exits non-zero even when it has opened the file, so the spawn
    // succeeding is as much as can be checked without waiting on the reader itself.
    launched
        .map(|_| ())
        .map_err(|e| format!("Could not open {}: {e}", target.display()))
}

#[tauri::command]
fn output_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(output_directory(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn data_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_directory(&app)?.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fetch_concordance,
            write_data_file,
            read_data_file,
            data_dir,
            save_output,
            open_output,
            output_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running FormWaypoint");
}

#[cfg(test)]
mod tests {
    use super::{safe_join, unique_path};
    use std::path::PathBuf;

    #[test]
    fn uniquifies_rather_than_overwriting() {
        let dir = std::env::temp_dir().join("formwaypoint-unique-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let first = unique_path(&dir, "S1_SLI_ceva.pdf").unwrap();
        assert_eq!(first.file_name().unwrap(), "S1_SLI_ceva.pdf");
        std::fs::write(&first, b"x").unwrap();

        let second = unique_path(&dir, "S1_SLI_ceva.pdf").unwrap();
        assert_eq!(second.file_name().unwrap(), "S1_SLI_ceva (2).pdf");
        std::fs::write(&second, b"x").unwrap();

        let third = unique_path(&dir, "S1_SLI_ceva.pdf").unwrap();
        assert_eq!(third.file_name().unwrap(), "S1_SLI_ceva (3).pdf");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_uniquified_name_still_cannot_escape_the_directory() {
        let dir = PathBuf::from("/data");
        assert!(unique_path(&dir, "../evil.pdf").is_err());
    }

    #[test]
    fn accepts_a_plain_file_name() {
        let dir = PathBuf::from("/data");
        assert_eq!(
            safe_join(&dir, "schedule-b-changes-2026-07-28.md").unwrap(),
            PathBuf::from("/data/schedule-b-changes-2026-07-28.md")
        );
    }

    #[test]
    fn refuses_anything_that_could_escape_the_directory() {
        let dir = PathBuf::from("/data");
        for name in [
            "",
            "..",
            "../secrets",
            "sub/dir.md",
            "sub\\dir.md",
            "/etc/passwd",
            "C:\\Windows\\System32\\drivers\\etc\\hosts",
        ] {
            assert!(safe_join(&dir, name).is_err(), "should have refused {name:?}");
        }
    }
}
