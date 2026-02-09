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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// The selected AI provider
    #[serde(default)]
    pub provider: Provider,
    /// API key (used for the selected provider)
    pub anthropic_api_key: Option<String>,
    #[serde(default = "default_port")]
    pub gateway_port: u16,
    #[serde(default = "default_auto_start")]
    pub auto_start_gateway: bool,
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

// Tauri commands
#[tauri::command]
pub fn get_config() -> Result<Config, String> {
    Config::load().map_err(|e| e.to_string())
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
    Ok(config.anthropic_api_key.is_some())
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

/// Delete all app data - config, runtime, and activity log
/// This will reset the app to a fresh state
#[tauri::command]
pub async fn delete_all_app_data() -> Result<(), String> {
    let config_dir = get_config_app_dir();
    let data_dir = get_data_app_dir();

    tokio::task::spawn_blocking(move || {
        // Delete config directory
        if let Some(path) = config_dir {
            if path.exists() {
                println!("[reset] Deleting config directory: {:?}", path);
                if let Err(e) = fs::remove_dir_all(&path) {
                    eprintln!("[reset] Failed to delete config directory: {}", e);
                    return Err(format!("Failed to delete config directory: {}", e));
                }
            }
        }

        // Delete data directory (if different from config)
        if let Some(path) = data_dir {
            if path.exists() {
                // Check if this is different from config_dir
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

        println!("[reset] All app data deleted successfully");
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
