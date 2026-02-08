use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;

const MAX_ENTRIES: usize = 500;

#[derive(Error, Debug)]
pub enum ActivityError {
    #[error("Failed to get data directory")]
    NoDataDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Lock error")]
    LockError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLogEntry {
    pub id: String,
    pub timestamp: i64,
    pub operation_type: String,
    pub details: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActivityLog {
    entries: Vec<ActivityLogEntry>,
}

impl ActivityLog {
    fn activity_path() -> Result<PathBuf, ActivityError> {
        let data_dir = dirs::data_local_dir().ok_or(ActivityError::NoDataDir)?;
        let app_dir = data_dir.join("simplestclaw");
        fs::create_dir_all(&app_dir)?;
        Ok(app_dir.join("activity.json"))
    }

    fn load() -> Result<Self, ActivityError> {
        let path = Self::activity_path()?;
        if path.exists() {
            let contents = fs::read_to_string(&path)?;
            let log: ActivityLog = serde_json::from_str(&contents)?;
            Ok(log)
        } else {
            Ok(ActivityLog::default())
        }
    }

    fn save(&self) -> Result<(), ActivityError> {
        let path = Self::activity_path()?;
        let contents = serde_json::to_string_pretty(self)?;
        fs::write(path, contents)?;
        Ok(())
    }

    fn add_entry(&mut self, entry: ActivityLogEntry) {
        // Insert at the beginning (most recent first)
        self.entries.insert(0, entry);
        // Keep only the last MAX_ENTRIES
        self.entries.truncate(MAX_ENTRIES);
    }

    fn clear(&mut self) {
        self.entries.clear();
    }
}

// Global activity log manager with mutex for thread safety
pub struct ActivityManager {
    log: Mutex<ActivityLog>,
}

impl Default for ActivityManager {
    fn default() -> Self {
        let log = ActivityLog::load().unwrap_or_default();
        Self {
            log: Mutex::new(log),
        }
    }
}

impl ActivityManager {
    pub fn add_entry(&self, entry: ActivityLogEntry) -> Result<(), ActivityError> {
        let mut log = self.log.lock().map_err(|_| ActivityError::LockError)?;
        log.add_entry(entry);
        log.save()?;
        Ok(())
    }

    pub fn get_entries(&self) -> Result<Vec<ActivityLogEntry>, ActivityError> {
        let log = self.log.lock().map_err(|_| ActivityError::LockError)?;
        Ok(log.entries.clone())
    }

    pub fn clear(&self) -> Result<(), ActivityError> {
        let mut log = self.log.lock().map_err(|_| ActivityError::LockError)?;
        log.clear();
        log.save()?;
        Ok(())
    }
}

// Helper function to generate unique IDs
fn generate_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let millis = timestamp.as_millis();
    let nanos = timestamp.subsec_nanos();
    format!("activity-{}-{}", millis, nanos)
}

// Helper function to get current timestamp
fn current_timestamp() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// Public helper to log activity (can be called from other modules)
pub fn log_activity(
    manager: &ActivityManager,
    operation_type: &str,
    details: &str,
    status: &str,
    path: Option<&str>,
) {
    let entry = ActivityLogEntry {
        id: generate_id(),
        timestamp: current_timestamp(),
        operation_type: operation_type.to_string(),
        details: details.to_string(),
        status: status.to_string(),
        path: path.map(|s| s.to_string()),
    };
    
    if let Err(e) = manager.add_entry(entry) {
        eprintln!("[activity] Failed to log activity: {}", e);
    }
}

// Tauri commands
#[tauri::command]
pub fn get_activity_log(
    manager: tauri::State<'_, ActivityManager>,
) -> Result<Vec<ActivityLogEntry>, String> {
    manager.get_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_activity_log(
    manager: tauri::State<'_, ActivityManager>,
) -> Result<(), String> {
    manager.clear().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_activity_entry(
    manager: tauri::State<'_, ActivityManager>,
    operation_type: String,
    details: String,
    status: String,
    path: Option<String>,
) -> Result<(), String> {
    let entry = ActivityLogEntry {
        id: generate_id(),
        timestamp: current_timestamp(),
        operation_type,
        details,
        status,
        path,
    };
    manager.add_entry(entry).map_err(|e| e.to_string())
}
