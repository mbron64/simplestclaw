//! Node.js Runtime Manager
//!
//! Downloads and manages a bundled Node.js runtime so users don't need
//! to install Node.js separately. This makes the app work for "normal folk".
//!
//! The runtime is downloaded from official Node.js releases on first launch.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
// sha2 can be used for checksum verification if needed
#[allow(unused_imports)]
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Node.js version to bundle
/// NOTE: Node 25+ is required to fix fetch timeout bugs in Node 22's undici implementation
/// See: https://github.com/nodejs/undici/issues/3410
const NODE_VERSION: &str = "25.6.0";

/// Download URLs for different platforms
fn get_node_url() -> Option<(&'static str, &'static str)> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return Some((
        concat!("https://nodejs.org/dist/v25.6.0/node-v25.6.0-darwin-arm64.tar.gz"),
        "node-v25.6.0-darwin-arm64",
    ));

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return Some((
        concat!("https://nodejs.org/dist/v25.6.0/node-v25.6.0-darwin-x64.tar.gz"),
        "node-v25.6.0-darwin-x64",
    ));

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return Some((
        concat!("https://nodejs.org/dist/v25.6.0/node-v25.6.0-linux-x64.tar.gz"),
        "node-v25.6.0-linux-x64",
    ));

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return Some((
        concat!("https://nodejs.org/dist/v25.6.0/node-v25.6.0-linux-arm64.tar.gz"),
        "node-v25.6.0-linux-arm64",
    ));

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return Some((
        concat!("https://nodejs.org/dist/v25.6.0/node-v25.6.0-win-x64.zip"),
        "node-v25.6.0-win-x64",
    ));

    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    return None;
}

/// Runtime status for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub node_path: Option<String>,
    pub npx_path: Option<String>,
    pub downloading: bool,
    pub download_progress: f32,
    pub error: Option<String>,
}

/// Download progress for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub percent: f32,
    pub status: String,
}

/// State for tracking downloads
pub struct RuntimeState {
    pub downloading: bool,
    pub progress: f32,
    pub error: Option<String>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            downloading: false,
            progress: 0.0,
            error: None,
        }
    }
}

pub struct RuntimeManager {
    pub state: Arc<Mutex<RuntimeState>>,
}

impl Default for RuntimeManager {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(RuntimeState::default())),
        }
    }
}

impl RuntimeManager {
    /// Get the runtime directory
    pub fn runtime_dir() -> Option<PathBuf> {
        dirs::data_local_dir().map(|d| d.join("simplestclaw").join("runtime"))
    }

    /// Get path to bundled node binary
    pub fn node_path() -> Option<PathBuf> {
        let runtime_dir = Self::runtime_dir()?;
        let (_, folder_name) = get_node_url()?;

        #[cfg(target_os = "windows")]
        let node = runtime_dir.join(folder_name).join("node.exe");

        #[cfg(not(target_os = "windows"))]
        let node = runtime_dir.join(folder_name).join("bin").join("node");

        if node.exists() {
            Some(node)
        } else {
            None
        }
    }

    /// Get path to bundled npx binary
    pub fn npx_path() -> Option<PathBuf> {
        let runtime_dir = Self::runtime_dir()?;
        let (_, folder_name) = get_node_url()?;

        #[cfg(target_os = "windows")]
        let npx = runtime_dir.join(folder_name).join("npx.cmd");

        #[cfg(not(target_os = "windows"))]
        let npx = runtime_dir.join(folder_name).join("bin").join("npx");

        if npx.exists() {
            Some(npx)
        } else {
            None
        }
    }

    /// Check if runtime is installed with the correct version
    pub fn is_installed() -> bool {
        Self::node_path().is_some() && Self::npx_path().is_some()
    }

    /// Check if installed version matches required version
    /// Returns false if version mismatch (needs upgrade)
    pub fn is_correct_version() -> bool {
        let runtime_dir = match Self::runtime_dir() {
            Some(d) => d,
            None => return false,
        };

        let (_, expected_folder) = match get_node_url() {
            Some(info) => info,
            None => return false,
        };

        // Check if the expected version folder exists
        let expected_path = runtime_dir.join(expected_folder);
        expected_path.exists()
    }

    /// Remove old Node.js versions to free space and force upgrade
    pub async fn cleanup_old_versions() -> Result<(), String> {
        let runtime_dir = Self::runtime_dir().ok_or("Could not determine runtime directory")?;

        if !runtime_dir.exists() {
            return Ok(());
        }

        let (_, current_folder) = get_node_url().ok_or("Unsupported platform")?;

        // Read all entries in runtime dir
        let mut entries = tokio::fs::read_dir(&runtime_dir)
            .await
            .map_err(|e| format!("Failed to read runtime dir: {}", e))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read entry: {}", e))?
        {
            let name = entry.file_name().to_string_lossy().to_string();

            // Remove old node versions (starts with "node-v" but isn't current)
            if name.starts_with("node-v") && name != current_folder {
                println!("[runtime] Removing old Node.js version: {}", name);
                let path = entry.path();
                if path.is_dir() {
                    let _ = tokio::fs::remove_dir_all(&path).await;
                }
            }
        }

        Ok(())
    }

    /// Get runtime status
    pub async fn status(&self) -> RuntimeStatus {
        let state = self.state.lock().await;

        RuntimeStatus {
            installed: Self::is_installed(),
            version: if Self::is_installed() {
                Some(NODE_VERSION.to_string())
            } else {
                None
            },
            node_path: Self::node_path().map(|p| p.to_string_lossy().to_string()),
            npx_path: Self::npx_path().map(|p| p.to_string_lossy().to_string()),
            downloading: state.downloading,
            download_progress: state.progress,
            error: state.error.clone(),
        }
    }

    /// Download and install the Node.js runtime
    /// Will also upgrade if an older version is detected
    pub async fn install(&self) -> Result<(), String> {
        // Check if already installed with correct version
        if Self::is_installed() && Self::is_correct_version() {
            return Ok(());
        }

        // Clean up old versions before installing new one
        if let Err(e) = Self::cleanup_old_versions().await {
            println!("[runtime] Warning: Failed to cleanup old versions: {}", e);
        }

        let (url, folder_name) = get_node_url()
            .ok_or("Unsupported platform")?;

        let runtime_dir = Self::runtime_dir()
            .ok_or("Could not determine runtime directory")?;

        // Create runtime directory
        tokio::fs::create_dir_all(&runtime_dir)
            .await
            .map_err(|e| format!("Failed to create runtime directory: {}", e))?;

        // Update state
        {
            let mut state = self.state.lock().await;
            state.downloading = true;
            state.progress = 0.0;
            state.error = None;
        }

        // Download
        let result = self.download_and_extract(url, folder_name, &runtime_dir).await;

        // Update state
        {
            let mut state = self.state.lock().await;
            state.downloading = false;
            if let Err(ref e) = result {
                state.error = Some(e.clone());
            }
        }

        result
    }

    async fn download_and_extract(
        &self,
        url: &str,
        folder_name: &str,
        runtime_dir: &PathBuf,
    ) -> Result<(), String> {
        println!("[runtime] Downloading Node.js from {}", url);

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Download failed: {}", e))?;

        let total_size = response.content_length();
        let mut downloaded: u64 = 0;

        // Download to temp file
        let temp_file = runtime_dir.join("download.tmp");
        let mut file = tokio::fs::File::create(&temp_file)
            .await
            .map_err(|e| format!("Failed to create temp file: {}", e))?;

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
            downloaded += chunk.len() as u64;

            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
                .await
                .map_err(|e| format!("Write error: {}", e))?;

            // Update progress
            if let Some(total) = total_size {
                let progress = (downloaded as f32 / total as f32) * 100.0;
                let mut state = self.state.lock().await;
                state.progress = progress;
            }
        }

        drop(file);
        println!("[runtime] Download complete, extracting...");

        // Update progress to show extracting
        {
            let mut state = self.state.lock().await;
            state.progress = 100.0;
        }

        // Extract based on file type
        let is_zip = url.ends_with(".zip");

        if is_zip {
            self.extract_zip(&temp_file, runtime_dir).await?;
        } else {
            self.extract_tar_gz(&temp_file, runtime_dir).await?;
        }

        // Clean up temp file
        let _ = tokio::fs::remove_file(&temp_file).await;

        // Verify installation
        if !Self::is_installed() {
            return Err("Installation verification failed".to_string());
        }

        // Make binaries executable on Unix
        #[cfg(not(target_os = "windows"))]
        {
            let bin_dir = runtime_dir.join(folder_name).join("bin");
            for entry in std::fs::read_dir(&bin_dir).map_err(|e| e.to_string())? {
                if let Ok(entry) = entry {
                    let _ = std::fs::set_permissions(
                        entry.path(),
                        std::os::unix::fs::PermissionsExt::from_mode(0o755),
                    );
                }
            }
        }

        println!("[runtime] Node.js {} installed successfully", NODE_VERSION);
        Ok(())
    }

    async fn extract_tar_gz(&self, archive_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
        let archive_path = archive_path.clone();
        let dest = dest.clone();

        tokio::task::spawn_blocking(move || {
            let file = std::fs::File::open(&archive_path)
                .map_err(|e| format!("Failed to open archive: {}", e))?;
            let decoder = flate2::read::GzDecoder::new(file);
            let mut archive = tar::Archive::new(decoder);
            archive
                .unpack(&dest)
                .map_err(|e| format!("Failed to extract: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("Task error: {}", e))?
    }

    async fn extract_zip(&self, archive_path: &PathBuf, dest: &PathBuf) -> Result<(), String> {
        let archive_path = archive_path.clone();
        let dest = dest.clone();

        tokio::task::spawn_blocking(move || {
            let file = std::fs::File::open(&archive_path)
                .map_err(|e| format!("Failed to open archive: {}", e))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("Failed to read zip: {}", e))?;
            archive
                .extract(&dest)
                .map_err(|e| format!("Failed to extract: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("Task error: {}", e))?
    }
}

// Tauri Commands

#[tauri::command]
pub async fn get_runtime_status(
    manager: tauri::State<'_, RuntimeManager>,
) -> Result<RuntimeStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn install_runtime(
    manager: tauri::State<'_, RuntimeManager>,
) -> Result<(), String> {
    manager.install().await
}

#[tauri::command]
pub fn is_runtime_installed() -> bool {
    RuntimeManager::is_installed() && RuntimeManager::is_correct_version()
}

#[tauri::command]
pub fn needs_runtime_upgrade() -> bool {
    // Has some Node installed but not the correct version
    RuntimeManager::is_installed() && !RuntimeManager::is_correct_version()
}
