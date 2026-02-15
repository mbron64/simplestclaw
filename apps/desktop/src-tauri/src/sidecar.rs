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
        let mut state = self.state.lock().map_err(|e| e.to_string())?;

        // Check if already running and healthy
        if let Some(ref mut child) = state.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process exited, clear state
                    println!("[openclaw] Previous gateway process has exited, clearing state");
                    state.child = None;
                    state.info = None;
                }
                Ok(None) => {
                    // Still running, return existing info
                    if let Some(ref info) = state.info {
                        println!("[openclaw] Gateway already running, returning existing connection");
                        return Ok(info.clone());
                    }
                }
                Err(_) => {
                    state.child = None;
                    state.info = None;
                }
            }
        }

        // Check if port is already in use (another instance might be running)
        let config = Config::load().map_err(|e| format!("Failed to load config: {}", e))?;
        let port = config.gateway_port;
        
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok() {
            println!("[openclaw] Port {} already in use, cleaning up...", port);
            // Port is in use, kill orphaned processes
            drop(state); // Release lock before cleanup
            kill_orphaned_gateway_processes();
            std::thread::sleep(std::time::Duration::from_millis(1500));
            state = self.state.lock().map_err(|e| e.to_string())?;
            
            // Check again
            if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok() {
                return Err(format!(
                    "Port {} is still in use. Another gateway may be running. \
                     Please close all simplestclaw windows and try again.",
                    port
                ));
            }
        }

        // Check if runtime is installed
        if !RuntimeManager::is_installed() {
            return Err(
                "Node.js runtime not installed. Please wait for the download to complete, \
                 or click 'Install Runtime' in Settings.".to_string()
            );
        }

        use crate::config::{ApiMode, Provider};

        // Validate credentials based on API mode
        match config.api_mode {
            ApiMode::Managed => {
                if config.license_key.is_none() {
                    return Err("No license key configured. Please sign up or log in.".to_string());
                }
            }
            ApiMode::Byo => {
                if config.anthropic_api_key.is_none() {
                    return Err("No API key configured. Please enter your API key in Settings.".to_string());
                }
            }
        }

        let token = generate_token();

        // Get bundled node path (prioritize bundled over system)
        let (node_cmd, npx_cli_path) = find_node_and_npx().ok_or(
            "Node.js runtime not found. Please click 'Install Runtime' in Settings."
        )?;

        println!("[openclaw] Starting gateway via bundled Node.js...");
        println!("[openclaw] Using node at: {}", node_cmd);
        println!("[openclaw] Using npx-cli at: {}", npx_cli_path);
        println!("[openclaw] API mode: {:?}", config.api_mode);

        // Clear npx cache to prevent corrupted package issues
        // The npx cache at ~/.npm/_npx can become corrupted and cause
        // "Cannot find package" errors with dependencies like axios
        clear_npx_cache();

        // Get the bin directory for PATH
        let node_path = std::path::Path::new(&node_cmd);
        let bin_dir = node_path.parent().map(|p| p.to_string_lossy().to_string());
        
        // Build PATH with node bin directory first
        let path_env = if let Some(ref bin) = bin_dir {
            let existing_path = std::env::var("PATH").unwrap_or_default();
            format!("{}:{}", bin, existing_path)
        } else {
            std::env::var("PATH").unwrap_or_default()
        };

        println!("[openclaw] PATH: {}", path_env.chars().take(200).collect::<String>());

        // Spawn node directly with npx-cli.js to avoid shebang issues
        // This ensures we use our bundled node, not whatever is in /usr/bin/env
        let mut cmd = Command::new(&node_cmd);
        cmd.args([
                &npx_cli_path,
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
            .env("OPENCLAW_GATEWAY_TOKEN", &token);
        
        // Configure provider credentials based on API mode
        match config.api_mode {
            ApiMode::Managed => {
                // Write openclaw.json with models.providers pointing at our proxy.
                // The license key is used as the "apiKey" for the custom provider.
                let license_key = config.license_key.as_deref().unwrap_or("");
                let model = config.selected_model.as_deref().unwrap_or("claude-sonnet-4-5-20250929");
                let openclaw_config = write_managed_openclaw_config(license_key, model)?;
                cmd.env("OPENCLAW_CONFIG_PATH", &openclaw_config);
                // In managed mode, requests route through the SimplestClaw proxy which
                // swaps in the real provider API key. We set a placeholder here because
                // OpenClaw requires the env var to be present at startup.
                cmd.env("ANTHROPIC_API_KEY", "managed-via-proxy");
            }
            ApiMode::Byo => {
                // Write ~/.openclaw/openclaw.json with gateway.mode=local, tools.profile=full,
                // and the default model. This gives the operator full tool access and fixes
                // "missing scope: operator.write" errors.
                let api_key = config.anthropic_api_key.as_deref().unwrap_or("");
                let selected = config.selected_model.as_deref();
                write_byo_openclaw_config(api_key, &config.provider, selected)?;
                // No OPENCLAW_CONFIG_PATH -- we write to the default ~/.openclaw/openclaw.json
                // so OpenClaw's full runtime (workspace, credentials, scopes) initialises.

                // Set the provider env var so OpenClaw picks up the API key natively
                match config.provider {
                    Provider::Anthropic => { cmd.env("ANTHROPIC_API_KEY", api_key); }
                    Provider::Openai => { cmd.env("OPENAI_API_KEY", api_key); }
                    Provider::Google => { cmd.env("GOOGLE_API_KEY", api_key); }
                    Provider::Openrouter => { cmd.env("OPENROUTER_API_KEY", api_key); }
                }
            }
        }
        
        cmd
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

        println!("[openclaw] Gateway process started (PID: {:?}), waiting for it to be ready...", child.id());

        // Wait for gateway to be ready (check if port is listening)
        // Give it up to 30 seconds to start
        let mut ready = false;
        for attempt in 0..60 {
            // Check if process is still running
            match child.try_wait() {
                Ok(Some(status)) => {
                    // Try to read stderr for more info
                    let mut stderr_output = String::new();
                    if let Some(ref mut stderr) = child.stderr {
                        use std::io::Read;
                        let _ = stderr.read_to_string(&mut stderr_output);
                    }
                    
                    let exit_code = status.code().unwrap_or(-1);
                    println!("[openclaw] Process exited with code: {}", exit_code);
                    println!("[openclaw] stderr: {}", stderr_output);
                    
                    // Exit code 127 = command not found
                    if exit_code == 127 {
                        return Err(format!(
                            "Gateway failed: command not found (exit code 127). \
                             Node path: {}. This usually means the Node.js binary couldn't execute. \
                             stderr: {}",
                            node_cmd, stderr_output
                        ));
                    }
                    
                    return Err(format!(
                        "Gateway process exited unexpectedly with status: {}. \
                         stderr: {}",
                        status, stderr_output
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

/// Find node and npx-cli.js paths - prioritizes bundled runtime over system
/// 
/// Returns (node_path, npx_cli_path) tuple
/// 
/// Order of preference:
/// 1. Bundled Node.js runtime (for normal users)
/// 2. System Node.js (for developers who prefer their own)
fn find_node_and_npx() -> Option<(String, String)> {
    // First, try the bundled runtime (preferred for normal users)
    if let Some(node_path) = RuntimeManager::node_path() {
        let node_str = node_path.to_string_lossy().to_string();
        
        // npx-cli.js is at ../lib/node_modules/npm/bin/npx-cli.js relative to node binary
        let npx_cli = node_path
            .parent()? // bin/
            .parent()? // node-vX.X.X-platform/
            .join("lib/node_modules/npm/bin/npx-cli.js");
        
        if npx_cli.exists() {
            return Some((node_str, npx_cli.to_string_lossy().to_string()));
        }
    }

    // Fall back to system Node.js for developers
    find_system_node_and_npx()
}

/// Find system-installed node and npx (fallback for developers)
fn find_system_node_and_npx() -> Option<(String, String)> {
    // Try to find system node
    let node_path = find_system_command("node")?;
    let npx_path = find_system_command("npx")?;
    
    // For system npx, we can just run it directly since it's properly installed
    // Return node path and npx path (we'll handle this specially)
    Some((node_path, npx_path))
}

/// Find a system command by name
fn find_system_command(cmd: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("where.exe")
            .arg(cmd)
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
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, try which first
        let output = Command::new("which")
            .arg(cmd)
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
            format!("{}/.nvm/current/bin/{}", home, cmd),
            // volta
            format!("{}/.volta/bin/{}", home, cmd),
            // fnm
            format!("{}/.local/share/fnm/aliases/default/bin/{}", home, cmd),
            format!("{}/.fnm/aliases/default/bin/{}", home, cmd),
            // asdf
            format!("{}/.asdf/shims/{}", home, cmd),
            // mise (formerly rtx)
            format!("{}/.local/share/mise/shims/{}", home, cmd),
            // System locations
            format!("/usr/local/bin/{}", cmd),
            format!("/opt/homebrew/bin/{}", cmd), // Homebrew on Apple Silicon
            format!("/usr/bin/{}", cmd),
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
                let cmd_path = newest.join("bin").join(cmd);
                if cmd_path.exists() {
                    return Some(cmd_path.to_string_lossy().to_string());
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

/// Clear the npx cache to prevent corrupted package issues.
/// The npx cache at ~/.npm/_npx can become corrupted and cause
/// "Cannot find package" errors (e.g., with axios dependency).
/// This is a known npm issue - the cache doesn't auto-update.
fn clear_npx_cache() {
    if let Some(home) = dirs::home_dir() {
        // Primary location: ~/.npm/_npx
        let npx_cache = home.join(".npm").join("_npx");
        if npx_cache.exists() {
            println!("[openclaw] Clearing npx cache at {:?}", npx_cache);
            if let Err(e) = std::fs::remove_dir_all(&npx_cache) {
                println!("[openclaw] Warning: Failed to clear npx cache: {}", e);
            } else {
                println!("[openclaw] npx cache cleared successfully");
            }
        }
        
        // Secondary location: ~/.npx (older npm versions)
        let npx_alt = home.join(".npx");
        if npx_alt.exists() {
            println!("[openclaw] Clearing alternate npx cache at {:?}", npx_alt);
            let _ = std::fs::remove_dir_all(&npx_alt);
        }
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

/// Write an openclaw.json config file for managed mode.
/// This configures the gateway to route all LLM requests through our proxy,
/// using the user's license key as the API key for the custom provider.
/// Returns the path to the written config file.
fn write_managed_openclaw_config(license_key: &str, model: &str) -> Result<String, String> {
    let config_dir = dirs::config_dir()
        .ok_or("Failed to get config directory")?
        .join("simplestclaw");
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let config_path = config_dir.join("openclaw-managed.json");

    // Determine the provider prefix and API type from the model name
    let (provider_name, _api_type) = if model.contains("gpt") || model.contains("o1") || model.contains("o3") {
        ("simplestclaw-openai", "openai-completions")
    } else if model.contains("gemini") {
        ("simplestclaw-google", "openai-completions")
    } else {
        // Default to Anthropic (Claude models)
        ("simplestclaw-anthropic", "anthropic-messages")
    };

    let proxy_base = "https://proxy.simplestclaw.com";

    // Model IDs must stay in sync with packages/models/src/index.ts
    let config_json = format!(
        r#"{{
  "gateway": {{
    "mode": "local"
  }},
  "models": {{
    "mode": "merge",
    "providers": {{
      "simplestclaw-anthropic": {{
        "baseUrl": "{proxy_base}/v1/anthropic",
        "apiKey": "{license_key}",
        "api": "anthropic-messages",
        "models": [
          {{ "id": "claude-opus-4-5-20251124", "name": "Claude Opus 4.5" }},
          {{ "id": "claude-sonnet-4-5-20250929", "name": "Claude Sonnet 4.5" }},
          {{ "id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5" }}
        ]
      }},
      "simplestclaw-openai": {{
        "baseUrl": "{proxy_base}/v1/openai",
        "apiKey": "{license_key}",
        "api": "openai-completions",
        "models": [
          {{ "id": "gpt-5.2", "name": "GPT-5.2" }},
          {{ "id": "gpt-5-mini", "name": "GPT-5 Mini" }}
        ]
      }},
      "simplestclaw-google": {{
        "baseUrl": "{proxy_base}/v1/google",
        "apiKey": "{license_key}",
        "api": "openai-completions",
        "models": [
          {{ "id": "gemini-3-pro-preview", "name": "Gemini 3 Pro" }},
          {{ "id": "gemini-3-flash-preview", "name": "Gemini 3 Flash" }}
        ]
      }}
    }}
  }},
  "agents": {{
    "defaults": {{
      "model": {{ "primary": "{provider_name}/{model}" }}
    }}
  }}
}}"#,
        proxy_base = proxy_base,
        license_key = license_key,
        provider_name = provider_name,
        model = model,
    );

    std::fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write openclaw config: {}", e))?;

    println!("[openclaw] Wrote managed config to {:?}", config_path);

    Ok(config_path.to_string_lossy().to_string())
}

/// Write an openclaw.json config file for BYO (bring-your-own-key) mode.
/// Write an openclaw.json config for BYO (bring-your-own-key) mode.
///
/// Writes to `~/.openclaw/openclaw.json` (the default location OpenClaw expects)
/// instead of a custom path, so that OpenClaw's full runtime initialisation
/// works correctly (workspace, credentials, scopes).
///
/// Also creates `~/.openclaw/workspace` if missing and explicitly sets
/// `tools.profile: "full"` + `gateway.mode: "local"` to ensure the operator
/// has full tool access (fixes "missing scope: operator.write").
fn write_byo_openclaw_config(_api_key: &str, provider: &crate::config::Provider, selected_model: Option<&str>) -> Result<String, String> {
    use crate::config::Provider;

    // Write to the default OpenClaw config location so the full runtime
    // (workspace, credentials, scopes) initialises correctly.
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let openclaw_dir = home.join(".openclaw");
    std::fs::create_dir_all(&openclaw_dir)
        .map_err(|e| format!("Failed to create .openclaw dir: {}", e))?;

    // Ensure workspace directory exists (OpenClaw needs it for file operations)
    let workspace_dir = openclaw_dir.join("workspace");
    std::fs::create_dir_all(&workspace_dir)
        .map_err(|e| format!("Failed to create workspace dir: {}", e))?;

    let config_path = openclaw_dir.join("openclaw.json");

    // Map provider to OpenClaw's built-in provider name and a sensible default model.
    let (provider_key, default_model) = match provider {
        Provider::Anthropic => ("anthropic", "claude-sonnet-4-5-20250929"),
        Provider::Openai => ("openai", "gpt-4o"),
        Provider::Google => ("google", "gemini-2.5-pro-preview"),
        Provider::Openrouter => ("openrouter", "anthropic/claude-sonnet-4-5"),
    };

    let model = selected_model.unwrap_or(default_model);

    // For OpenRouter, the model already includes the sub-provider prefix
    let primary_model = if matches!(provider, Provider::Openrouter) && model.contains('/') {
        format!("openrouter/{}", model)
    } else {
        format!("{}/{}", provider_key, model)
    };

    let config_json = format!(
        r#"{{
  "gateway": {{
    "mode": "local"
  }},
  "tools": {{
    "profile": "full"
  }},
  "agents": {{
    "defaults": {{
      "workspace": "~/.openclaw/workspace",
      "model": {{ "primary": "{primary_model}" }}
    }}
  }}
}}"#,
        primary_model = primary_model,
    );

    std::fs::write(&config_path, config_json)
        .map_err(|e| format!("Failed to write BYO openclaw config: {}", e))?;

    println!("[openclaw] Wrote BYO config to {:?} (provider={}, model={})", config_path, provider_key, primary_model);

    Ok(config_path.to_string_lossy().to_string())
}

// Tauri Commands

/// Start gateway in a background thread to avoid blocking the UI.
/// The startup process involves waiting for the gateway to be ready,
/// which can take several seconds.
#[tauri::command]
pub async fn start_gateway(app: AppHandle) -> Result<GatewayInfo, String> {
    // Run the blocking startup in a separate thread
    // We clone the AppHandle which is cheap (Arc internally)
    tokio::task::spawn_blocking(move || {
        let manager = app.state::<SidecarManager>();
        manager.start(&app)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
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
