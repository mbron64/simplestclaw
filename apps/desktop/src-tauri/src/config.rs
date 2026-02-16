use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to get config directory")]
    NoConfigDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

/// Information about app data stored on disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDataInfo {
    pub config_path: Option<String>,
    pub data_path: Option<String>,
    pub total_size_bytes: u64,
    pub total_size_formatted: String,
}

/// Supported AI providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    Openai,
    Google,
    Openrouter,
}

impl Default for Provider {
    fn default() -> Self {
        Provider::Anthropic
    }
}

/// API mode: managed (simplestclaw proxy) or bring-your-own key
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ApiMode {
    /// User's own API key, direct to provider (existing behavior)
    Byo,
    /// Managed via simplestclaw proxy with license key
    Managed,
}

impl Default for ApiMode {
    fn default() -> Self {
        ApiMode::Byo // Existing users unaffected
    }
}

/// Tool access profile — maps directly to OpenClaw's tools.profile config.
/// Controls which tool groups the agent can use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ToolProfile {
    /// No restrictions: read, write, edit, exec, web, browser, etc.
    Full,
    /// Filesystem + runtime + sessions + memory. No web, browser, or messaging.
    Coding,
    /// Conversation only. No file access, no commands.
    Minimal,
}

impl Default for ToolProfile {
    fn default() -> Self {
        ToolProfile::Full
    }
}

fn default_tool_profile() -> ToolProfile {
    ToolProfile::Full
}

fn default_allow_exec() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// The selected AI provider
    #[serde(default)]
    pub provider: Provider,
    /// API key (used for the selected provider in BYO mode)
    pub anthropic_api_key: Option<String>,
    #[serde(default = "default_port")]
    pub gateway_port: u16,
    #[serde(default = "default_auto_start")]
    pub auto_start_gateway: bool,
    /// API mode: "byo" (bring your own key) or "managed" (simplestclaw proxy)
    #[serde(default)]
    pub api_mode: ApiMode,
    /// License key for managed mode (issued on signup)
    #[serde(default)]
    pub license_key: Option<String>,
    /// User email for managed mode (display in settings)
    #[serde(default)]
    pub user_email: Option<String>,
    /// Selected model for managed mode (e.g. "claude-sonnet-4-5-20250929")
    #[serde(default)]
    pub selected_model: Option<String>,
    /// Tool access profile: full, coding, or minimal
    #[serde(default = "default_tool_profile")]
    pub tool_profile: ToolProfile,
    /// Whether shell commands (exec, bash, process) are allowed
    #[serde(default = "default_allow_exec")]
    pub allow_exec: bool,
}

fn default_port() -> u16 {
    18789
}

fn default_auto_start() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Self {
            provider: Provider::default(),
            anthropic_api_key: None,
            gateway_port: default_port(),
            auto_start_gateway: default_auto_start(),
            api_mode: ApiMode::default(),
            license_key: None,
            user_email: None,
            selected_model: None,
            tool_profile: ToolProfile::default(),
            allow_exec: true,
        }
    }
}

impl Config {
    fn config_path() -> Result<PathBuf, ConfigError> {
        let config_dir = dirs::config_dir().ok_or(ConfigError::NoConfigDir)?;
        let app_dir = config_dir.join("simplestclaw");
        fs::create_dir_all(&app_dir)?;
        Ok(app_dir.join("config.json"))
    }

    pub fn load() -> Result<Self, ConfigError> {
        let path = Self::config_path()?;
        if path.exists() {
            let contents = fs::read_to_string(&path)?;
            let config: Config = serde_json::from_str(&contents)?;
            Ok(config)
        } else {
            Ok(Config::default())
        }
    }

    pub fn save(&self) -> Result<(), ConfigError> {
        let path = Self::config_path()?;
        let contents = serde_json::to_string_pretty(self)?;
        fs::write(path, contents)?;
        Ok(())
    }
}

/// A filtered view of Config that excludes sensitive secrets from the IPC boundary.
/// The frontend should never receive raw API keys -- use has_api_key() for boolean checks.
/// License key IS included because the frontend needs it for Bearer auth against the proxy.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeConfig {
    pub provider: Provider,
    /// true if a BYO API key is configured, but the actual key value is NOT exposed
    pub has_api_key: bool,
    pub gateway_port: u16,
    pub auto_start_gateway: bool,
    pub api_mode: ApiMode,
    /// License key is needed by the frontend for Bearer auth against the proxy
    pub license_key: Option<String>,
    pub user_email: Option<String>,
    pub selected_model: Option<String>,
    pub tool_profile: ToolProfile,
    pub allow_exec: bool,
}

impl SafeConfig {
    pub fn from_config(config: &Config) -> Self {
        SafeConfig {
            provider: config.provider.clone(),
            has_api_key: config.anthropic_api_key.is_some(),
            gateway_port: config.gateway_port,
            auto_start_gateway: config.auto_start_gateway,
            api_mode: config.api_mode.clone(),
            license_key: config.license_key.clone(),
            user_email: config.user_email.clone(),
            selected_model: config.selected_model.clone(),
            tool_profile: config.tool_profile.clone(),
            allow_exec: config.allow_exec,
        }
    }
}

// Tauri commands
#[tauri::command]
pub fn get_config() -> Result<SafeConfig, String> {
    let config = Config::load().map_err(|e| e.to_string())?;
    Ok(SafeConfig::from_config(&config))
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.anthropic_api_key = if key.is_empty() { None } else { Some(key) };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_provider(provider: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.provider = match provider.to_lowercase().as_str() {
        "anthropic" => Provider::Anthropic,
        "openai" => Provider::Openai,
        "google" => Provider::Google,
        "openrouter" => Provider::Openrouter,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key() -> Result<bool, String> {
    let config = Config::load().map_err(|e| e.to_string())?;
    // In managed mode, having a license key counts as "configured"
    if config.api_mode == ApiMode::Managed {
        return Ok(config.license_key.is_some());
    }
    Ok(config.anthropic_api_key.is_some())
}

#[tauri::command]
pub fn get_api_mode() -> Result<String, String> {
    let config = Config::load().map_err(|e| e.to_string())?;
    match config.api_mode {
        ApiMode::Byo => Ok("byo".to_string()),
        ApiMode::Managed => Ok("managed".to_string()),
    }
}

#[tauri::command]
pub fn set_api_mode(mode: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.api_mode = match mode.to_lowercase().as_str() {
        "byo" => ApiMode::Byo,
        "managed" => ApiMode::Managed,
        _ => return Err(format!("Unknown API mode: {}. Use 'byo' or 'managed'.", mode)),
    };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_license_key(key: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.license_key = if key.is_empty() { None } else { Some(key) };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_user_email(email: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.user_email = if email.is_empty() { None } else { Some(email) };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_selected_model(model: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.selected_model = if model.is_empty() { None } else { Some(model) };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tool_profile(profile: String) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.tool_profile = match profile.to_lowercase().as_str() {
        "full" => ToolProfile::Full,
        "coding" => ToolProfile::Coding,
        "minimal" => ToolProfile::Minimal,
        _ => return Err(format!("Unknown tool profile: {}. Use 'full', 'coding', or 'minimal'.", profile)),
    };
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_allow_exec(allow: bool) -> Result<(), String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.allow_exec = allow;
    config.save().map_err(|e| e.to_string())
}

/// Get the config directory path for the app
fn get_config_app_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("simplestclaw"))
}

/// Get the data directory path for the app (may be same as config on macOS)
fn get_data_app_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("simplestclaw"))
}

/// Calculate directory size recursively
fn calculate_dir_size(path: &PathBuf) -> u64 {
    if !path.exists() {
        return 0;
    }

    let mut total = 0u64;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                total += calculate_dir_size(&entry_path);
            } else if let Ok(metadata) = entry.metadata() {
                total += metadata.len();
            }
        }
    }

    total
}

/// Format bytes into human-readable string
fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} bytes", bytes)
    }
}

/// Get information about all app data stored on disk
#[tauri::command]
pub async fn get_app_data_info() -> Result<AppDataInfo, String> {
    let config_dir = get_config_app_dir();
    let data_dir = get_data_app_dir();

    // Calculate sizes (use spawn_blocking for potentially slow I/O)
    let config_dir_clone = config_dir.clone();
    let data_dir_clone = data_dir.clone();

    let (config_size, data_size) = tokio::task::spawn_blocking(move || {
        let config_size = config_dir_clone
            .as_ref()
            .map(|p| calculate_dir_size(p))
            .unwrap_or(0);

        let data_size = data_dir_clone
            .as_ref()
            .map(|p| {
                // On macOS, config_dir and data_local_dir point to the same place
                // Only count data_dir if it's different from config_dir
                if config_dir_clone.as_ref() == Some(p) {
                    0
                } else {
                    calculate_dir_size(p)
                }
            })
            .unwrap_or(0);

        (config_size, data_size)
    })
    .await
    .map_err(|e| format!("Failed to calculate sizes: {}", e))?;

    let total_size = config_size + data_size;

    Ok(AppDataInfo {
        config_path: config_dir.map(|p| p.to_string_lossy().to_string()),
        data_path: data_dir.map(|p| p.to_string_lossy().to_string()),
        total_size_bytes: total_size,
        total_size_formatted: format_bytes(total_size),
    })
}

/// Delete all app data - config, runtime, openclaw package, and openclaw data
/// This will reset the app to a completely fresh state
#[tauri::command]
pub async fn delete_all_app_data() -> Result<(), String> {
    let config_dir = get_config_app_dir();
    let data_dir = get_data_app_dir();

    tokio::task::spawn_blocking(move || {
        // Delete config directory (includes runtime on macOS)
        if let Some(path) = config_dir {
            if path.exists() {
                println!("[reset] Deleting config directory: {:?}", path);
                if let Err(e) = fs::remove_dir_all(&path) {
                    eprintln!("[reset] Failed to delete config directory: {}", e);
                    return Err(format!("Failed to delete config directory: {}", e));
                }
            }
        }

        // Delete data directory (if different from config, e.g. on Linux/Windows)
        if let Some(path) = data_dir {
            if path.exists() {
                let config_dir_check = get_config_app_dir();
                if config_dir_check.as_ref() != Some(&path) {
                    println!("[reset] Deleting data directory: {:?}", path);
                    if let Err(e) = fs::remove_dir_all(&path) {
                        eprintln!("[reset] Failed to delete data directory: {}", e);
                        return Err(format!("Failed to delete data directory: {}", e));
                    }
                }
            }
        }

        // Delete openclaw package from npx cache
        delete_openclaw_from_npx_cache();

        // Delete openclaw's own data directory (sessions, memory, conversation history)
        // This is created by openclaw itself at ~/.openclaw/
        delete_openclaw_data_directory();

        println!("[reset] All app data deleted successfully");
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Delete OpenClaw's own data directory
/// OpenClaw creates ~/.openclaw/ (and legacy ~/.clawdbot/) to store:
/// - sessions.json (session metadata)
/// - *.jsonl files (conversation transcripts)
/// - workspace/ (memory, prompts, skills)
/// - openclaw.json (config)
fn delete_openclaw_data_directory() {
    let Some(home) = dirs::home_dir() else {
        println!("[reset] Could not determine home directory");
        return;
    };

    // Primary OpenClaw data directory: ~/.openclaw/
    let openclaw_dir = home.join(".openclaw");
    if openclaw_dir.exists() {
        println!("[reset] Deleting OpenClaw data directory: {:?}", openclaw_dir);
        if let Err(e) = fs::remove_dir_all(&openclaw_dir) {
            eprintln!("[reset] Warning: Failed to delete OpenClaw data: {}", e);
        } else {
            println!("[reset] Deleted OpenClaw data directory successfully");
        }
    }

    // Legacy OpenClaw data directory: ~/.clawdbot/
    let legacy_dir = home.join(".clawdbot");
    if legacy_dir.exists() {
        println!("[reset] Deleting legacy OpenClaw directory: {:?}", legacy_dir);
        if let Err(e) = fs::remove_dir_all(&legacy_dir) {
            eprintln!("[reset] Warning: Failed to delete legacy OpenClaw data: {}", e);
        } else {
            println!("[reset] Deleted legacy OpenClaw directory successfully");
        }
    }

    // Legacy workspace directory: ~/clawd/
    let legacy_workspace = home.join("clawd");
    if legacy_workspace.exists() {
        println!("[reset] Deleting legacy workspace: {:?}", legacy_workspace);
        if let Err(e) = fs::remove_dir_all(&legacy_workspace) {
            eprintln!("[reset] Warning: Failed to delete legacy workspace: {}", e);
        } else {
            println!("[reset] Deleted legacy workspace successfully");
        }
    }
}

/// Delete only openclaw-related entries from the npx cache
/// This is safe because we only delete folders that contain openclaw,
/// leaving other npx-cached packages untouched
fn delete_openclaw_from_npx_cache() {
    // Get npx cache directory
    let npx_cache = if cfg!(windows) {
        // Windows: %LocalAppData%/npm-cache/_npx
        dirs::data_local_dir().map(|d| d.join("npm-cache").join("_npx"))
    } else {
        // macOS/Linux: ~/.npm/_npx
        dirs::home_dir().map(|d| d.join(".npm").join("_npx"))
    };

    let Some(npx_cache) = npx_cache else {
        println!("[reset] Could not determine npx cache location");
        return;
    };

    if !npx_cache.exists() {
        println!("[reset] No npx cache found at {:?}", npx_cache);
        return;
    }

    println!("[reset] Scanning npx cache for openclaw: {:?}", npx_cache);

    // Iterate through hash-named folders in _npx
    let Ok(entries) = fs::read_dir(&npx_cache) else {
        println!("[reset] Could not read npx cache directory");
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // Check if this folder contains openclaw in node_modules
        let openclaw_path = path.join("node_modules").join("openclaw");
        if openclaw_path.exists() {
            println!("[reset] Found openclaw cache, deleting: {:?}", path);
            if let Err(e) = fs::remove_dir_all(&path) {
                eprintln!("[reset] Warning: Failed to delete openclaw cache: {}", e);
            } else {
                println!("[reset] Deleted openclaw cache successfully");
            }
        }
    }
}
