//! OpenClaw Gateway Management
//!
//! Uses the bundled Node.js runtime to run OpenClaw gateway.
//! No global Node.js installation required - works for everyone!
//!
//! The app automatically downloads a portable Node.js runtime on first launch,
//! making it work for "normal folk" who don't have Node.js installed.
//!
//! References:
//! - OpenClaw gateway: https://docs.clawd.bot/cli/gateway

use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

use crate::config::Config;
use crate::runtime::RuntimeManager;

/// Gateway connection info returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayInfo {
    pub url: String,
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub running: bool,
    pub info: Option<GatewayInfo>,
    pub error: Option<String>,
}

pub struct SidecarState {
    pub child: Option<Child>,
    pub info: Option<GatewayInfo>,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self {
            child: None,
            info: None,
        }
    }
}

pub struct SidecarManager {
    pub state: Mutex<SidecarState>,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self {
            state: Mutex::new(SidecarState::default()),
        }
    }
}

impl SidecarManager {
    /// Start the OpenClaw gateway using bundled Node.js runtime
    ///
    /// Uses the bundled Node.js runtime so users don't need to install
    /// anything. On first launch, the runtime is automatically downloaded.
    pub fn start(&self, _app: &AppHandle) -> Result<GatewayInfo, String> {
        // First, clean up any orphaned processes from previous runs
        kill_orphaned_gateway_processes();
        
        let mut state = self.state.lock().map_err(|e| e.to_string())?;

        // Check if already running
        if let Some(ref mut child) = state.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    state.child = None;
                    state.info = None;
                }
                Ok(None) => {
                    if let Some(ref info) = state.info {
                        return Ok(info.clone());
                    }
                }
                Err(_) => {
                    state.child = None;
                    state.info = None;
                }
            }
        }

        // Check if runtime is installed
        if !RuntimeManager::is_installed() {
            return Err(
                "Node.js runtime not installed. Please wait for the download to complete, \
                 or click 'Install Runtime' in Settings.".to_string()
            );
        }

        // Load config
        let config = Config::load().map_err(|e| format!("Failed to load config: {}", e))?;
        let api_key = config
            .anthropic_api_key
            .ok_or("No API key configured. Please enter your Anthropic API key in Settings.")?;

        let token = generate_token();
        let port = config.gateway_port;

        // Get bundled npx path (prioritize bundled over system)
        let npx_cmd = find_npx().ok_or(
            "Node.js runtime not found. Please click 'Install Runtime' in Settings."
        )?;

        println!("[openclaw] Starting gateway via bundled Node.js...");
        println!("[openclaw] Using npx at: {}", npx_cmd);

        // Get the bin directory for PATH (npx needs node in PATH)
        let npx_path = std::path::Path::new(&npx_cmd);
        let bin_dir = npx_path.parent().map(|p| p.to_string_lossy().to_string());
        
        // Build PATH with node bin directory first
        let path_env = if let Some(ref bin) = bin_dir {
            let existing_path = std::env::var("PATH").unwrap_or_default();
            format!("{}:{}", bin, existing_path)
        } else {
            std::env::var("PATH").unwrap_or_default()
        };

        println!("[openclaw] PATH: {}", path_env.chars().take(200).collect::<String>());

        // Spawn npx openclaw gateway
        // npx will download and cache openclaw automatically
        let mut cmd = Command::new(&npx_cmd);
        cmd.args([
                "--yes",  // Auto-confirm package installation
                "openclaw",
                "gateway",
                "--port",
                &port.to_string(),
                "--token",
                &token,
                "--allow-unconfigured",
            ])
            .env("PATH", &path_env)
            .env("ANTHROPIC_API_KEY", &api_key)
            .env("OPENCLAW_GATEWAY_TOKEN", &token)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        
        // On Unix, create a new process group so we can kill all children
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to start gateway: {}", e))?;

        let info = GatewayInfo {
            url: format!("ws://localhost:{}", port),
            port,
            token: token.clone(),
        };

        println!("[openclaw] Gateway process started, waiting for it to be ready...");

        // Wait for gateway to be ready (check if port is listening)
        // Give it up to 30 seconds to start
        let mut ready = false;
        for attempt in 0..60 {
            // Check if process is still running
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!(
                        "Gateway process exited unexpectedly with status: {}. \
                         This may happen if another gateway is already running. \
                         Try restarting the app.",
                        status
                    ));
                }
                Ok(None) => {} // Still running, good
                Err(e) => {
                    return Err(format!("Failed to check gateway status: {}", e));
                }
            }

            // Try to connect to the port
            if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok() {
                ready = true;
                println!("[openclaw] Gateway ready after {} attempts", attempt + 1);
                break;
            }

            // Wait 500ms before retrying
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        if !ready {
            // Kill the process if it never became ready
            let _ = child.kill();
            return Err(
                "Gateway failed to start within 30 seconds. \
                 Please check your internet connection and try again.".to_string()
            );
        }

        state.child = Some(child);
        state.info = Some(info.clone());

        println!("[openclaw] Gateway running at {}", info.url);
        Ok(info)
    }

    /// Stop the gateway
    pub fn stop(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut child) = state.child {
            println!("[openclaw] Stopping gateway...");
            
            // Kill the process and all its children
            kill_process_tree(child);
            
            println!("[openclaw] Gateway stopped");
        }
        state.child = None;
        state.info = None;

        // Also kill any orphaned openclaw processes
        kill_orphaned_gateway_processes();

        Ok(())
    }

    /// Get gateway status
    pub fn status(&self) -> GatewayStatus {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return GatewayStatus { 
                running: false, 
                info: None,
                error: Some("Lock error".to_string()),
            },
        };

        // Check if runtime is installed
        if !RuntimeManager::is_installed() {
            return GatewayStatus {
                running: false,
                info: None,
                error: Some("runtime_not_installed".to_string()),
            };
        }

        if let Some(ref mut child) = state.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    state.child = None;
                    state.info = None;
                }
                Ok(None) => {}
                Err(_) => {
                    state.child = None;
                    state.info = None;
                }
            }
        }

        GatewayStatus {
            running: state.child.is_some(),
            info: state.info.clone(),
            error: None,
        }
    }
}

/// Find npx command - prioritizes bundled runtime over system
/// 
/// Order of preference:
/// 1. Bundled Node.js runtime (for normal users)
/// 2. System Node.js (for developers who prefer their own)
fn find_npx() -> Option<String> {
    // First, try the bundled runtime (preferred for normal users)
    if let Some(bundled_npx) = RuntimeManager::npx_path() {
        return Some(bundled_npx.to_string_lossy().to_string());
    }

    // Fall back to system Node.js for developers
    find_system_npx()
}

/// Find system-installed npx (fallback for developers)
fn find_system_npx() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, try where.exe first
        let output = Command::new("where.exe")
            .arg("npx")
            .output()
            .ok()?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }

        // Try common Windows locations
        let appdata = std::env::var("APPDATA").ok()?;
        let locations = [
            format!("{}\\npm\\npx.cmd", appdata),
            format!("{}\\fnm\\aliases\\default\\npx.cmd", appdata),
            "C:\\Program Files\\nodejs\\npx.cmd".to_string(),
        ];

        for loc in locations {
            if std::path::Path::new(&loc).exists() {
                return Some(loc);
            }
        }
        
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, try which first
        let output = Command::new("which")
            .arg("npx")
            .output()
            .ok()?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }

        // Try common Unix locations (GUI apps often don't have full PATH)
        let home = std::env::var("HOME").ok()?;
        let locations = [
            // nvm (most common)
            format!("{}/.nvm/current/bin/npx", home),
            // volta
            format!("{}/.volta/bin/npx", home),
            // fnm
            format!("{}/.local/share/fnm/aliases/default/bin/npx", home),
            format!("{}/.fnm/aliases/default/bin/npx", home),
            // asdf
            format!("{}/.asdf/shims/npx", home),
            // mise (formerly rtx)
            format!("{}/.local/share/mise/shims/npx", home),
            // System locations
            "/usr/local/bin/npx".to_string(),
            "/opt/homebrew/bin/npx".to_string(), // Homebrew on Apple Silicon
            "/usr/bin/npx".to_string(),
        ];

        for loc in locations {
            if std::path::Path::new(&loc).exists() {
                return Some(loc);
            }
        }

        // Last resort: try to find the newest Node version in nvm
        let nvm_dir = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            let mut versions: Vec<_> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .collect();
            versions.sort();
            if let Some(newest) = versions.last() {
                let npx_path = newest.join("bin/npx");
                if npx_path.exists() {
                    return Some(npx_path.to_string_lossy().to_string());
                }
            }
        }

        None
    }
}

/// Kill a process and all its children
fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    
    #[cfg(unix)]
    {
        // On Unix, kill the process group
        // First try SIGTERM for graceful shutdown
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
        
        // Give it a moment to shut down
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Then SIGKILL to make sure it's dead
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    
    #[cfg(windows)]
    {
        // On Windows, use taskkill with /T to kill child processes
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    
    // Also kill via the standard method
    let _ = child.kill();
    let _ = child.wait();
}

/// Kill any orphaned openclaw gateway processes from previous runs
pub fn kill_orphaned_gateway_processes() {
    #[cfg(unix)]
    {
        // Find and kill processes listening on our gateway port
        let output = Command::new("lsof")
            .args(["-ti", ":18789"])
            .output();
        
        if let Ok(output) = output {
            if output.status.success() {
                let pids = String::from_utf8_lossy(&output.stdout);
                for pid in pids.lines() {
                    if let Ok(pid_num) = pid.trim().parse::<i32>() {
                        println!("[openclaw] Killing orphaned process: {}", pid_num);
                        unsafe {
                            libc::kill(pid_num, libc::SIGKILL);
                        }
                    }
                }
            }
        }
        
        // Also kill any openclaw-gateway processes
        let _ = Command::new("pkill")
            .args(["-9", "-f", "openclaw-gateway"])
            .output();
        
        let _ = Command::new("pkill")
            .args(["-9", "-f", "openclaw gateway"])
            .output();
    }
    
    #[cfg(windows)]
    {
        // On Windows, kill by process name
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "openclaw*"])
            .output();
    }
}

/// Generate auth token
fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("sclw-{:x}{:x}", duration.as_secs(), duration.subsec_nanos())
}

// Tauri Commands

#[tauri::command]
pub fn start_gateway(app: AppHandle) -> Result<GatewayInfo, String> {
    let manager = app.state::<SidecarManager>();
    manager.start(&app)
}

#[tauri::command]
pub fn stop_gateway(app: AppHandle) -> Result<(), String> {
    let manager = app.state::<SidecarManager>();
    manager.stop()
}

#[tauri::command]
pub fn get_gateway_status(app: AppHandle) -> GatewayStatus {
    let manager = app.state::<SidecarManager>();
    manager.status()
}
