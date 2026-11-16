// Student Portal — Windows shell.
// Shows the app in a native window, keeps a single copy running, and updates itself:
// on start-up the app asks GitHub for the newest release and, if it is newer than this build,
// offers to download and run the new installer. Student data never passes through here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const REPO: &str = "01IM/student-portal";
// Set by the GitHub build (the build number). Local builds report 0 and never update.
const BUILD: Option<&str> = option_env!("SP_BUILD");

fn this_build() -> u64 {
    BUILD.and_then(|b| b.parse().ok()).unwrap_or(0)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("StudentPortal-Updater")
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct UpdateInfo {
    build: u64,
    name: String,
    url: String,
    notes: String,
}

// Opens WhatsApp Desktop, the default email app, or a web link.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let ok = ["whatsapp://", "mailto:", "https://", "tel:"].iter().any(|p| url.starts_with(p));
    if !ok {
        return Err("This kind of link can't be opened".into());
    }
    open::that_detached(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_build() -> u64 {
    this_build()
}

#[tauri::command]
async fn check_update() -> Result<Option<UpdateInfo>, String> {
    let current = this_build();
    if current == 0 {
        return Ok(None);
    }
    let rel: serde_json::Value = client()?
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let tag = rel["tag_name"].as_str().unwrap_or_default();
    let remote: u64 = tag.rsplit("-build").next().and_then(|n| n.parse().ok()).unwrap_or(0);
    if remote <= current {
        return Ok(None);
    }
    let asset = rel["assets"].as_array().and_then(|a| {
        a.iter().find(|x| x["name"].as_str().map_or(false, |n| n.ends_with("-setup.exe")))
    });
    Ok(asset.map(|a| UpdateInfo {
        build: remote,
        name: rel["name"].as_str().unwrap_or(tag).to_string(),
        url: a["browser_download_url"].as_str().unwrap_or_default().to_string(),
        notes: rel["body"].as_str().unwrap_or_default().to_string(),
    }))
}

#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with(&format!("https://github.com/{REPO}/releases/download/")) {
        return Err("Unexpected download address".into());
    }
    let bytes = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let path = std::env::temp_dir().join("StudentPortal-update-setup.exe");
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    std::process::Command::new(&path).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![open_external, app_build, check_update, install_update])
        .run(tauri::generate_context!())
        .expect("error while running Student Portal");
}
