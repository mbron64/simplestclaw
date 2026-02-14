mod activity;
mod config;
pub mod runtime;
mod sidecar;

use activity::ActivityManager;
use config::ApiMode;
use runtime::RuntimeManager;
use sidecar::{SidecarManager, kill_orphaned_gateway_processes};
use tauri::{Emitter, Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Clean up any orphaned gateway processes from previous runs
    // This handles cases where the app crashed or was force-quit
    println!("[startup] Cleaning up any orphaned gateway processes...");
    kill_orphaned_gateway_processes();
    
    // Small delay to ensure processes are fully killed
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Initialize managers
            app.manage(SidecarManager::default());
            app.manage(RuntimeManager::default());
            app.manage(ActivityManager::default());

            // Register deep link handler for simplestclaw:// URLs
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                let payload = event.payload();
                println!("[deep-link] Received: {}", payload);
                handle_deep_link(&handle, payload);
            });

            // Auto-install runtime in background if not installed
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if !RuntimeManager::is_installed() {
                    println!("[runtime] Node.js runtime not found, starting download...");
                    if let Some(manager) = app_handle.try_state::<RuntimeManager>() {
                        if let Err(e) = manager.install().await {
                            eprintln!("[runtime] Failed to install: {}", e);
                        }
                    }
                } else {
                    println!("[runtime] Node.js runtime already installed");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Stop the gateway when the window close is requested
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!("[window] Window close requested, stopping gateway...");
                if let Some(manager) = window.app_handle().try_state::<SidecarManager>() {
                    let _ = manager.stop();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Config
            config::get_config,
            config::set_api_key,
            config::set_provider,
            config::has_api_key,
            config::get_api_mode,
            config::set_api_mode,
            config::set_license_key,
            config::set_user_email,
            config::set_selected_model,
            config::get_app_data_info,
            config::delete_all_app_data,
            // Gateway
            sidecar::start_gateway,
            sidecar::stop_gateway,
            sidecar::get_gateway_status,
            // Runtime
            runtime::get_runtime_status,
            runtime::install_runtime,
            runtime::is_runtime_installed,
            runtime::needs_runtime_upgrade,
            // Activity
            activity::get_activity_log,
            activity::clear_activity_log,
            activity::add_activity_entry,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Use run() with event handler for proper cleanup on exit
    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } => {
                println!("[app] Exit requested, cleaning up...");
                if let Some(manager) = app_handle.try_state::<SidecarManager>() {
                    let _ = manager.stop();
                }
                // Also run the orphan cleanup
                kill_orphaned_gateway_processes();
            }
            tauri::RunEvent::Exit => {
                println!("[app] Exiting, final cleanup...");
                // Final cleanup attempt
                kill_orphaned_gateway_processes();
            }
            _ => {}
        }
    });
}

/// Decode a percent-encoded URL component (RFC 3986).
/// Handles all standard %XX sequences, not just a hardcoded few.
fn url_decode(input: &str) -> String {
    let mut result = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (
                hex_val(bytes[i + 1]),
                hex_val(bytes[i + 2]),
            ) {
                result.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            result.push(b' ');
        } else {
            result.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8(result).unwrap_or_else(|_| input.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Validate that a license key matches the expected format: "sclw_" + base64url characters.
/// Keys are generated by generateLicenseKey() in proxy auth.ts as sclw_ + 32 bytes of base64url.
fn is_valid_license_key(key: &str) -> bool {
    if !key.starts_with("sclw_") {
        return false;
    }
    let suffix = &key[5..];
    // 32 random bytes encoded as base64url = 43 characters (with no padding or = padding)
    // Be lenient on length (24-64 chars) but strict on character set
    if suffix.is_empty() || suffix.len() > 64 {
        return false;
    }
    suffix.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'=')
}

/// Handle deep link URLs (simplestclaw://auth/callback?key=...&email=...)
/// Parses the URL, saves credentials to config, and emits an event to the frontend.
fn handle_deep_link(app: &tauri::AppHandle, payload: &str) {
    // The payload from the deep-link plugin is a JSON array of URLs
    let urls: Vec<String> = match serde_json::from_str(payload) {
        Ok(urls) => urls,
        Err(_) => {
            // Try as a plain string
            vec![payload.trim_matches('"').to_string()]
        }
    };

    for url in urls {
        if !url.starts_with("simplestclaw://auth/callback") {
            println!("[deep-link] Ignoring non-auth URL: {}", url);
            continue;
        }

        println!("[deep-link] Processing auth callback");

        // Parse query parameters from the URL
        let query = url.splitn(2, '?').nth(1).unwrap_or("");
        let mut key = String::new();
        let mut email = String::new();

        for param in query.split('&') {
            let mut parts = param.splitn(2, '=');
            let name = parts.next().unwrap_or("");
            let value = parts.next().unwrap_or("");
            let decoded = url_decode(value);
            match name {
                "key" => key = decoded,
                "email" => email = decoded,
                _ => {}
            }
        }

        if key.is_empty() {
            println!("[deep-link] No license key found in callback URL");
            continue;
        }

        // Validate license key format to prevent injection from malicious deep links
        if !is_valid_license_key(&key) {
            eprintln!("[deep-link] Rejected invalid license key format");
            continue;
        }

        // Save to config
        if let Ok(mut config) = config::Config::load() {
            config.api_mode = ApiMode::Managed;
            config.license_key = Some(key.clone());
            config.user_email = if email.is_empty() { None } else { Some(email.clone()) };
            config.selected_model = Some("claude-sonnet-4-5-20250929".to_string());
            if let Err(e) = config.save() {
                eprintln!("[deep-link] Failed to save config: {}", e);
                continue;
            }
        }

        // Emit event to frontend
        let auth_payload = serde_json::json!({
            "key": key,
            "email": email,
        });

        if let Err(e) = app.emit("auth-complete", auth_payload) {
            eprintln!("[deep-link] Failed to emit auth-complete event: {}", e);
        } else {
            println!("[deep-link] Auth complete, credentials saved for {}", email);
        }

        // Focus the main window
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }

        break; // Only process the first auth callback
    }
}
