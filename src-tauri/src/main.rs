// src-tauri/src/main.rs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use walkdir::WalkDir;
use ini::Ini;
use std::collections::HashMap;
use regex::Regex;
use lazy_static::lazy_static;
use rusqlite::{Connection, OptionalExtension, Result as SqlResult, params};
use serde::{Serialize, Deserialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Arc};
use tauri::{
    command, generate_context, generate_handler, AppHandle, Manager, State, api::dialog,
    api::process::Command
};
use thiserror::Error;
use once_cell::sync::Lazy;
use tauri::async_runtime;
use toml;
use tauri::api::file::read_binary;
use std::io::{Read, Seek, Cursor}; // For reading zip files
use zip::ZipArchive;

// --- Structs for Deserializing Definitions ---
#[derive(Deserialize, Debug, Clone)]
struct EntityDefinition {
    name: String,
    slug: String,
    description: Option<String>,
    details: Option<String>,
    base_image: Option<String>,
}

#[derive(Deserialize, Debug)]
struct CategoryDefinition {
    name: String,
    entities: Vec<EntityDefinition>,
}

// Type alias for the top-level structure (HashMap: category_slug -> CategoryDefinition)
type Definitions = HashMap<String, CategoryDefinition>;

// --- Constants for Settings Keys ---
const SETTINGS_KEY_MODS_FOLDER: &str = "mods_folder_path";
const OTHER_ENTITY_SUFFIX: &str = "-other";
const OTHER_ENTITY_NAME: &str = "Other/Unknown";
const DB_NAME: &str = "app_data.sqlite";
const DISABLED_PREFIX: &str = "DISABLED_";
const TARGET_IMAGE_FILENAME: &str = "preview.png";

// --- Error Handling ---
#[derive(Debug, Error)]
enum AppError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON serialization/deserialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Tauri path resolution error: {0}")]
    TauriPath(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Mod operation failed: {0}")]
    ModOperation(String),
    #[error("Resource not found: {0}")]
    NotFound(String),
    #[error("Operation cancelled by user")]
    UserCancelled,
    #[error("Shell command failed: {0}")]
    ShellCommand(String),
    #[error("Zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
}

// --- Event Payload Struct ---
#[derive(Clone, serde::Serialize)]
struct ScanProgress {
  processed: usize,
  total: usize,
  current_path: Option<String>,
  message: String,
}

// --- Event Names ---
const SCAN_PROGRESS_EVENT: &str = "scan://progress";
const SCAN_COMPLETE_EVENT: &str = "scan://complete";
const SCAN_ERROR_EVENT: &str = "scan://error";

type CmdResult<T> = Result<T, String>;

struct DbState(Arc<Mutex<Connection>>);

static DB_CONNECTION: Lazy<Mutex<SqlResult<Connection>>> = Lazy::new(|| {
    Mutex::new(Err(rusqlite::Error::InvalidPath("DB not initialized yet".into())))
});

lazy_static! {
    static ref MOD_NAME_CLEANUP_REGEX: Regex = Regex::new(r"(?i)(_v\d+(\.\d+)*|_DISABLED|DISABLED_|\(disabled\)|^DISABLED_)").unwrap();
    static ref CHARACTER_NAME_REGEX: Regex = Regex::new(r"(?i)(Raiden|Shogun|HuTao|Tao|Zhongli|Ganyu|Ayaka|Kazuha|Yelan|Eula|Klee|Nahida)").unwrap();
}

#[derive(Debug)]
struct DeducedInfo {
    entity_slug: String,
    mod_name: String,
    mod_type_tag: Option<String>,
    author: Option<String>,
    description: Option<String>,
    image_filename: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)] struct Category { id: i64, name: String, slug: String }
#[derive(Serialize, Deserialize, Debug)] struct Entity { id: i64, category_id: i64, name: String, slug: String, description: Option<String>, details: Option<String>, base_image: Option<String>, mod_count: i32 }
#[derive(Serialize, Deserialize, Debug, Clone)] struct Asset { id: i64, entity_id: i64, name: String, description: Option<String>, folder_name: String, image_filename: Option<String>, author: Option<String>, category_tag: Option<String>, is_enabled: bool }

// Structs for Import/Analysis
#[derive(Serialize, Debug, Clone)]
struct ArchiveEntry {
    path: String,
    is_dir: bool,
    is_likely_mod_root: bool,
}

#[derive(Serialize, Debug, Clone)]
struct ArchiveAnalysisResult {
    file_path: String,
    entries: Vec<ArchiveEntry>,
    deduced_mod_name: Option<String>,
    deduced_author: Option<String>,
    deduced_category_slug: Option<String>, // Keep for potential future backend use
    deduced_entity_slug: Option<String>,   // Keep for potential future backend use
    // --> Added Raw INI fields <--
    raw_ini_type: Option<String>,          // e.g., "Character", "Weapon"
    raw_ini_target: Option<String>,        // e.g., "Nahida", "Raiden Shogun", "Aqua Simulacra"
    // --------------------------
    detected_preview_internal_path: Option<String>,
}

// --- Helper Functions for Deduction ---

fn has_ini_file(dir_path: &PathBuf) -> bool {
    if !dir_path.is_dir() { return false; }
    // Use walkdir limited to depth 1 to avoid iterating too deep if not needed
    for entry in WalkDir::new(dir_path).max_depth(1).min_depth(1).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                if ext.to_ascii_lowercase() == "ini" {
                    return true;
                }
            }
        }
    }
    false
}

fn find_preview_image(dir_path: &PathBuf) -> Option<String> {
    let common_names = ["preview.png", "preview.jpg", "icon.png", "icon.jpg", "thumbnail.png", "thumbnail.jpg"];
     if !dir_path.is_dir() { return None; }
    // Use walkdir limited to depth 1
    for entry in WalkDir::new(dir_path).max_depth(1).min_depth(1).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
             if let Some(filename) = entry.path().file_name().and_then(|n| n.to_str()) {
                 if common_names.contains(&filename.to_lowercase().as_str()) {
                     return Some(filename.to_string());
                 }
             }
        }
    }
    None
}

fn deduce_mod_info(
    mod_folder_path: &PathBuf,
    base_mods_path: &PathBuf,
    entities_map: &HashMap<String, i64>, // slug -> id
    categories_map: &HashMap<String, i64> // slug -> id
) -> Option<DeducedInfo> {
    let mut info = DeducedInfo {
        entity_slug: format!("{}{}", "characters", OTHER_ENTITY_SUFFIX), // Default to Character>Other
        mod_name: mod_folder_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        mod_type_tag: None,
        author: None,
        description: None,
        image_filename: find_preview_image(mod_folder_path),
    };

    let mut ini_entity: Option<String> = None;
    let mut ini_type: Option<String> = None;

    // 1. Try finding and parsing .ini file (only look in the current directory)
    let ini_path_option = WalkDir::new(mod_folder_path)
        .max_depth(1)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .find(|entry| {
            entry.file_type().is_file() &&
            entry.path().extension().map_or(false, |ext| ext.eq_ignore_ascii_case("ini"))
        })
        .map(|e| e.into_path()); // Get the PathBuf if found

    if let Some(ini_path) = ini_path_option {
        if let Ok(ini_content) = fs::read_to_string(&ini_path) {
             if let Ok(ini) = Ini::load_from_str(&ini_content) {
                // Look in common sections like [Mod], [Settings], [Info]
                for section_name in ["Mod", "Settings", "Info", "General"] {
                     if let Some(section) = ini.section(Some(section_name)) {
                        info.mod_name = section.get("Name").or_else(|| section.get("ModName")).unwrap_or(&info.mod_name).trim().to_string();
                        info.author = section.get("Author").map(|s| s.trim().to_string()).or(info.author);
                        info.description = section.get("Description").map(|s| s.trim().to_string()).or(info.description);
                        ini_type = section.get("Type").or_else(|| section.get("Category")).map(|s| s.trim().to_string()).or(ini_type);
                        ini_entity = section.get("Target").or_else(|| section.get("Entity")).or_else(|| section.get("Character")).map(|s| s.trim().to_string()).or(ini_entity);
                        // Break if we found entity/type in a good section? Maybe not, let last one win.
                     }
                 }
             }
        }
    }


    info.mod_type_tag = ini_type; // Assign type found from ini

    // 2. Deduce Entity based on Ini, Parent Folder, Mod Folder Name
    let mut found_entity = false;
    // Priority 1: Ini entity name/slug
    if let Some(entity_key) = ini_entity {
        // Check if it's a known slug
        if entities_map.contains_key(&entity_key) {
             info.entity_slug = entity_key;
             found_entity = true;
        } else {
            // Check if it's a known NAME (less reliable, needs mapping name->slug)
             // For now, just log if not found as slug
             println!("WARN: Entity '{}' from ini not found as known slug.", entity_key);
        }
    }

    // Priority 2: Parent folder name (if structure is <base>/<entity_slug>/<mod>)
    // This deduction is unreliable if mods are not nested directly under an entity folder.
    // Let's remove it or make it less prioritized. For scan, we only care about *finding* mods.
    // Entity assignment happens here, but could be refined later.

    // if !found_entity {
    //     if let Some(parent_path) = mod_folder_path.parent() {
    //          // Check if the parent is directly the base mods path
    //          if parent_path != base_mods_path {
    //              if let Some(parent_name) = parent_path.file_name().and_then(|n| n.to_str()) {
    //                  if entities_map.contains_key(parent_name) {
    //                      info.entity_slug = parent_name.to_string();
    //                      found_entity = true;
    //                      println!("Deduced entity '{}' from parent folder.", info.entity_slug);
    //                  }
    //              }
    //          }
    //     }
    // }

     // Priority 3: Mod folder name contains character name?
     // This is also potentially unreliable but can be a heuristic.
     if !found_entity {
         let mod_folder_name_str = mod_folder_path.file_name().unwrap_or_default().to_string_lossy();
         if let Some(cap) = CHARACTER_NAME_REGEX.captures(&mod_folder_name_str) {
            let matched_name = cap.get(1).map_or("", |m| m.as_str());
            // This is basic. Need to map matched_name to actual slug.
            // Example simple mapping (needs proper implementation):
            let slug_guess = match matched_name.to_lowercase().as_str() {
                 "raiden" | "shogun" => "raiden-shogun",
                 "hutao" | "tao" => "hu-tao", // Assuming slug is hu-tao
                 "zhongli" => "zhongli",
                 // ... add mappings for all names in regex ...
                 _ => ""
            };
            if entities_map.contains_key(slug_guess) {
                info.entity_slug = slug_guess.to_string();
                found_entity = true;
                println!("Deduced entity '{}' from mod folder name.", info.entity_slug);
            }
         }
     }

    // If still no specific entity, assign to "Other" of the most likely CATEGORY
    // Let's default to "characters-other" for now, unless we have stronger signals.
    if !found_entity {
        // // Basic guess: if parent folder IS a category slug, use that category's other
        // let mut category_slug = "characters"; // Default category
        //  if let Some(parent_path) = mod_folder_path.parent() {
        //      if parent_path != base_mods_path {
        //          if let Some(parent_name) = parent_path.file_name().and_then(|n| n.to_str()) {
        //              if categories_map.contains_key(parent_name) {
        //                  category_slug = parent_name;
        //              }
        //          }
        //      }
        //  }
        //  info.entity_slug = format!("{}{}", category_slug, OTHER_ENTITY_SUFFIX);
        // Use the default determined at the start ("characters-other") unless overridden
         println!("Assigning mod '{}' to fallback entity '{}'", info.mod_name, info.entity_slug);
    }


    // 3. Clean up Mod Name (remove versioning etc.)
    info.mod_name = MOD_NAME_CLEANUP_REGEX.replace_all(&info.mod_name, "").trim().to_string();
    if info.mod_name.is_empty() { // Use original folder name if cleanup resulted in empty
        info.mod_name = mod_folder_path.file_name().unwrap_or_default().to_string_lossy().to_string();
    }

    Some(info)
}


// --- Database Initialization (Result type uses AppError internally) ---
fn initialize_database(app_handle: &AppHandle) -> Result<(), AppError> {
    let data_dir = get_app_data_dir(app_handle)?;
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)?;
    }
    let db_path = data_dir.join(DB_NAME);
    println!("Database path: {}", db_path.display());
    let conn = Connection::open(&db_path)?;

    // --- Create Tables ---
    conn.execute_batch(
        "BEGIN;
         CREATE TABLE IF NOT EXISTS categories ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL );
         CREATE TABLE IF NOT EXISTS entities ( id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, details TEXT, base_image TEXT, FOREIGN KEY (category_id) REFERENCES categories (id) );
         -- Removed UNIQUE constraint from folder_name temporarily, need better handling for duplicates during scan
         CREATE TABLE IF NOT EXISTS assets ( id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, folder_name TEXT NOT NULL, image_filename TEXT, author TEXT, category_tag TEXT, FOREIGN KEY (entity_id) REFERENCES entities (id) );
         CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL );
         COMMIT;",
    )?;
    println!("Database tables verified/created.");

    // --- Load and Parse Definitions ---
    println!("Loading base entity definitions...");
    // Embed the TOML file content at compile time
    let definitions_toml_str = include_str!("../definitions/base_entities.toml");
    let definitions: Definitions = toml::from_str(definitions_toml_str)
        .map_err(|e| AppError::Config(format!("Failed to parse base_entities.toml: {}", e)))?;
    println!("Loaded {} categories from definitions.", definitions.len());


    // --- Populate Database from Definitions ---
    println!("Populating database from definitions...");
    let mut categories_processed = 0;
    let mut entities_processed = 0;

    for (category_slug, category_def) in definitions.iter() {
        // 1. Insert Category (Ignore if exists)
        let cat_insert_res = conn.execute(
            "INSERT OR IGNORE INTO categories (name, slug) VALUES (?1, ?2)",
            params![category_def.name, category_slug],
        );
        if let Err(e) = cat_insert_res {
             eprintln!("Error inserting category '{}': {}", category_slug, e);
             continue; // Skip this category if insert fails critically
        }
        categories_processed += 1;

        // 2. Get Category ID (must exist now)
        let category_id: i64 = conn.query_row(
            "SELECT id FROM categories WHERE slug = ?1",
            params![category_slug],
            |row| row.get(0),
        ).map_err(|e| AppError::Config(format!("Failed to get category ID for '{}': {}", category_slug, e)))?;

        // 3. Ensure "Other" Entity for this Category
        let other_slug = format!("{}{}", category_slug, OTHER_ENTITY_SUFFIX);
        conn.execute(
            "INSERT OR IGNORE INTO entities (category_id, name, slug, description, details, base_image)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![ category_id, OTHER_ENTITY_NAME, other_slug, "Uncategorized assets.", "{}", None::<String> ]
        ).map_err(|e| AppError::Config(format!("Failed to insert 'Other' entity for category '{}': {}", category_slug, e)))?;


        // 4. Insert Entities defined in TOML (Ignore if exists based on slug)
        for entity_def in category_def.entities.iter() {
            let ent_insert_res = conn.execute(
                 "INSERT OR IGNORE INTO entities (category_id, name, slug, description, details, base_image)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                 params![
                     category_id,
                     entity_def.name,
                     entity_def.slug,
                     entity_def.description,
                     entity_def.details.as_ref().map(|s| s.to_string()).unwrap_or("{}".to_string()), // Default to empty JSON string if None
                     entity_def.base_image,
                 ]
            );
             if let Err(e) = ent_insert_res {
                 eprintln!("Error inserting entity '{}' for category '{}': {}", entity_def.slug, category_slug, e);
                 // Continue to next entity even if one fails
             } else {
                  entities_processed += 1; // Count attempted inserts
             }
        }
    }
    println!("Finished populating. Processed {} categories and {} entities from definitions.", categories_processed, entities_processed);

    // --- Finalize DB Connection Setup for State ---
    let mut db_lock = DB_CONNECTION.lock().expect("Failed to lock DB mutex during init");
    *db_lock = Ok(conn); // Store the connection we used

    println!("Database initialization and definition sync complete.");
    Ok(())
}

// --- Utility Functions ---
fn get_app_data_dir(app_handle: &AppHandle) -> Result<PathBuf, AppError> { // Internal error type
    app_handle.path_resolver()
        .app_data_dir()
        .ok_or_else(|| AppError::TauriPath("Failed to resolve app data directory".to_string()))
}

// Helper to get a setting value (Internal error type)
fn get_setting_value(conn: &Connection, key: &str) -> Result<Option<String>, AppError> { // Internal error type
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let result = stmt.query_row(params![key], |row| row.get(0)).optional()?;
    Ok(result)
}

// Helper to get the configured mods base path (Internal error type)
fn get_mods_base_path_from_settings(db_state: &DbState) -> Result<PathBuf, AppError> { // Internal error type
    let conn = db_state.0.lock().map_err(|_| AppError::Config("DB lock poisoned".into()))?;
    get_setting_value(&conn, SETTINGS_KEY_MODS_FOLDER)?
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Config("Mods folder path not set".to_string()))
}

// Helper to get entity mods path using settings (Internal error type)
// FIX: Removed unused app_handle parameter
fn get_entity_mods_path(db_state: &DbState, entity_slug: &str) -> Result<PathBuf, AppError> {
    let base_path = get_mods_base_path_from_settings(db_state)?;
    Ok(base_path.join(entity_slug))
}

// --- Tauri Commands (Return CmdResult<T> = Result<T, String>) ---

// == Settings Commands ==

#[command]
fn get_setting(key: String, db_state: State<DbState>) -> CmdResult<Option<String>> {
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    get_setting_value(&conn, &key).map_err(|e| e.to_string()) // Convert internal error to string
}

#[command]
fn set_setting(key: String, value: String, db_state: State<DbState>) -> CmdResult<()> { // Returns Result<(), String>
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    ).map_err(|e| e.to_string())?; // Convert error
    println!("Set setting '{}' to '{}'", key, value);
    Ok(())
}

#[command]
async fn select_directory() -> CmdResult<Option<PathBuf>> { // Removed AppHandle
    // FIX: Remove AppHandle from new(), use blocking dialog directly
    let result = dialog::blocking::FileDialogBuilder::new()
        .set_title("Select Mods Folder")
        .pick_folder();

    match result {
        Some(path) => Ok(Some(path)),
        None => Ok(None), // User cancelled
    }
}

#[command]
async fn select_file() -> CmdResult<Option<PathBuf>> { // Removed AppHandle
    // FIX: Use add_filter instead of dialog::Filter struct
    let result = dialog::blocking::FileDialogBuilder::new() // FIX: Remove AppHandle
        .set_title("Select Quick Launch Executable")
        .add_filter("Executable", &["exe", "bat", "cmd", "sh", "app"]) // FIX: Use add_filter
        .add_filter("All Files", &["*"]) // FIX: Use add_filter
        .pick_file();

    match result {
        Some(path) => Ok(Some(path)),
        None => Ok(None), // User cancelled
    }
}

#[command]
async fn launch_executable(path: String, _app_handle: AppHandle) -> CmdResult<()> { // app_handle might not be needed now
    println!("Attempting to launch via Command::new: {}", path);

    // FIX: Use Command::new for launching executables
    let cmd = Command::new(path) // Use the path directly as the command
        // .args([]) // Add arguments if needed later
        .spawn(); // Spawn the process

    match cmd {
        Ok((mut rx, _child)) => {
            // You can optionally read stdout/stderr here if needed
             while let Some(event) = rx.recv().await {
                 match event {
                    tauri::api::process::CommandEvent::Stdout(line) => {
                        println!("Launcher stdout: {}", line);
                    }
                    tauri::api::process::CommandEvent::Stderr(line) => {
                        eprintln!("Launcher stderr: {}", line);
                    }
                    tauri::api::process::CommandEvent::Error(e) => {
                         eprintln!("Launcher error event: {}", e);
                         // Decide if this constitutes a failure
                         // return Err(format!("Launcher process event error: {}", e));
                    }
                     tauri::api::process::CommandEvent::Terminated(payload) => {
                        println!("Launcher terminated: {:?}", payload);
                        if let Some(code) = payload.code {
                             if code != 0 {
                                println!("Launcher exited with non-zero code: {}", code);
                                // Optionally return error based on exit code
                                // return Err(format!("Launcher exited with code {}", code));
                             }
                         } else {
                             println!("Launcher terminated without exit code (possibly killed).");
                         }
                         // Process terminated, break the loop
                         break;
                     }
                    _ => {} // Ignore other events like Terminated
                }
             }
             println!("Launcher process finished or detached.");
             Ok(()) // Assume success if spawn worked and process finished/detached
        }
        Err(e) => {
            eprintln!("Failed to spawn launcher: {}", e);
            Err(format!("Failed to spawn executable: {}", e)) // Convert error to string
        }
    }
}


// == Core Commands (Return CmdResult<T>) ==

#[command]
fn get_categories(db_state: State<DbState>) -> CmdResult<Vec<Category>> {
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, slug FROM categories ORDER BY name")
        .map_err(|e| e.to_string())?; // Convert error
    let category_iter = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?, name: row.get(1)?, slug: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?; // Convert error
    category_iter.collect::<SqlResult<Vec<Category>>>().map_err(|e| e.to_string()) // Convert error
}

#[command]
fn get_entities_by_category(category_slug: String, db_state: State<DbState>) -> CmdResult<Vec<Entity>> {
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
     let category_id: i64 = conn.query_row(
        "SELECT id FROM categories WHERE slug = ?1",
        params![category_slug],
        |row| row.get(0),
    ).map_err(|e| match e { // Map specific internal errors to String
        rusqlite::Error::QueryReturnedNoRows => format!("Category '{}' not found", category_slug),
        _ => e.to_string(),
    })?;

     let mut stmt = conn.prepare(
        "SELECT e.id, e.category_id, e.name, e.slug, e.description, e.details, e.base_image, COUNT(a.id) as mod_count
         FROM entities e LEFT JOIN assets a ON e.id = a.entity_id
         WHERE e.category_id = ?1 GROUP BY e.id ORDER BY e.name"
    ).map_err(|e| e.to_string())?;

    let entity_iter = stmt.query_map(params![category_id], |row| {
        Ok(Entity {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?,
            slug: row.get(3)?, description: row.get(4)?, details: row.get(5)?,
            base_image: row.get(6)?, mod_count: row.get(7)?
        })
    }).map_err(|e| e.to_string())?;
    entity_iter.collect::<SqlResult<Vec<Entity>>>().map_err(|e| e.to_string())
}


#[command]
fn get_entity_details(entity_slug: String, db_state: State<DbState>) -> CmdResult<Entity> {
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
     let mut stmt = conn.prepare(
        "SELECT e.id, e.category_id, e.name, e.slug, e.description, e.details, e.base_image, COUNT(a.id) as mod_count
         FROM entities e LEFT JOIN assets a ON e.id = a.entity_id
         WHERE e.slug = ?1 GROUP BY e.id"
    ).map_err(|e| e.to_string())?;
    stmt.query_row(params![entity_slug], |row| {
         Ok(Entity {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?,
            slug: row.get(3)?, description: row.get(4)?, details: row.get(5)?,
            base_image: row.get(6)?, mod_count: row.get(7)?
        })
    }).map_err(|e| match e { // Map specific internal errors to String
        rusqlite::Error::QueryReturnedNoRows => format!("Entity '{}' not found", entity_slug),
        _ => e.to_string(),
    })
}

#[command]
fn get_assets_for_entity(entity_slug: String, db_state: State<DbState>, _app_handle: AppHandle) -> CmdResult<Vec<Asset>> {
    println!("[get_assets_for_entity {}] Start command.", entity_slug);

    let base_mods_path = get_mods_base_path_from_settings(&db_state)
                             .map_err(|e| format!("[get_assets_for_entity {}] Error getting base mods path: {}", entity_slug, e))?; // Keep detailed error here
    println!("[get_assets_for_entity {}] Base mods path: {}", entity_slug, base_mods_path.display());

    let conn_guard = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let conn = &*conn_guard;
    println!("[get_assets_for_entity {}] DB lock acquired for asset query.", entity_slug);

    // --- Entity ID Lookup ---
    let entity_id: i64 = conn.query_row(
        "SELECT id FROM entities WHERE slug = ?1",
        params![entity_slug],
        |row| row.get(0),
    ).map_err(|e| match e { // More specific error mapping here
        rusqlite::Error::QueryReturnedNoRows => format!("[get_assets_for_entity {}] Entity not found for assets lookup", entity_slug),
        _ => format!("[get_assets_for_entity {}] DB Error getting entity ID: {}", entity_slug, e),
    })?;
    println!("[get_assets_for_entity {}] Found entity ID: {}", entity_slug, entity_id);

    // --- Prepare Statement ---
    let mut stmt = conn.prepare(
        "SELECT id, entity_id, name, description, folder_name, image_filename, author, category_tag
         FROM assets WHERE entity_id = ?1 ORDER BY name"
    ).map_err(|e| format!("[get_assets_for_entity {}] DB Error preparing asset statement: {}", entity_slug, e))?; // Use detailed error
    println!("[get_assets_for_entity {}] Prepared asset statement.", entity_slug);

    // --- Query Rows ---
    let asset_rows_result = stmt.query_map(params![entity_id], |row| {
        // Ensure forward slashes consistently when reading from DB
        let folder_name_raw: String = row.get(4)?;
        Ok(Asset {
            id: row.get(0)?,
            entity_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            folder_name: folder_name_raw.replace("\\", "/"), // Ensure forward slashes
            image_filename: row.get(5)?,
            author: row.get(6)?,
            category_tag: row.get(7)?,
            is_enabled: false, // Default
        })
    }); // No map_err needed directly on query_map if the closure returns SqlResult

    let mut assets_to_return = Vec::new();
    println!("[get_assets_for_entity {}] Starting iteration over asset rows from DB...", entity_slug);

    // Handle potential error from preparing the iterator itself
    match asset_rows_result {
        Ok(asset_iter) => {
             // Iterate through the results
             for (index, asset_result) in asset_iter.enumerate() {
                 println!("[get_assets_for_entity {}] Processing asset row index: {}", entity_slug, index);
                 // Handle potential error for each row
                 match asset_result {
                     Ok(mut asset_from_db) => {
                         // Logic as corrected in the previous step...
                         let clean_relative_path_from_db = PathBuf::from(&asset_from_db.folder_name); // Should be clean path now
                         println!("[get_assets_for_entity {}] Asset from DB: ID={}, Name='{}', Clean RelPath='{}'", entity_slug, asset_from_db.id, asset_from_db.name, clean_relative_path_from_db.display());

                         let filename_osstr = clean_relative_path_from_db.file_name().unwrap_or_default();
                         let filename_str = filename_osstr.to_string_lossy();
                         if filename_str.is_empty() {
                             println!("[get_assets_for_entity {}] WARN: Cannot get filename from clean relative path '{}'. Skipping asset ID {}.", entity_slug, clean_relative_path_from_db.display(), asset_from_db.id);
                             continue;
                         }
                         let disabled_filename = format!("{}{}", DISABLED_PREFIX, filename_str);
                         let relative_parent_path = clean_relative_path_from_db.parent();

                         let full_path_if_enabled = base_mods_path.join(&clean_relative_path_from_db);
                         let full_path_if_disabled = match relative_parent_path {
                            Some(parent) if parent.as_os_str().len() > 0 => base_mods_path.join(parent).join(&disabled_filename),
                            _ => base_mods_path.join(&disabled_filename),
                         };

                         println!("[get_assets_for_entity {}] Checking enabled path: {}", entity_slug, full_path_if_enabled.display());
                         println!("[get_assets_for_entity {}] Checking disabled path: {}", entity_slug, full_path_if_disabled.display());

                         if full_path_if_enabled.is_dir() {
                             asset_from_db.is_enabled = true;
                             asset_from_db.folder_name = clean_relative_path_from_db.to_string_lossy().to_string().replace("\\", "/"); // Ensure forward slashes
                             println!("[get_assets_for_entity {}] Mod state determined: ENABLED. Actual folder name on disk: {}", entity_slug, asset_from_db.folder_name);
                         } else if full_path_if_disabled.is_dir() {
                             asset_from_db.is_enabled = false;
                              asset_from_db.folder_name = match relative_parent_path {
                                 Some(parent) if parent.as_os_str().len() > 0 => parent.join(&disabled_filename).to_string_lossy().to_string(),
                                 _ => disabled_filename,
                             };
                             asset_from_db.folder_name = asset_from_db.folder_name.replace("\\", "/"); // Ensure forward slashes
                             println!("[get_assets_for_entity {}] Mod state determined: DISABLED. Actual folder name on disk: {}", entity_slug, asset_from_db.folder_name);
                         } else {
                             println!("[get_assets_for_entity {}] WARN: Mod folder for base name '{}' not found on disk (checked {} and {}). Skipping asset ID {}.", entity_slug, clean_relative_path_from_db.display(), full_path_if_enabled.display(), full_path_if_disabled.display(), asset_from_db.id);
                             continue;
                         }

                         println!("[get_assets_for_entity {}] Pushing valid asset to results: ID={}, Name='{}', Folder='{}', Enabled={}",
                                  entity_slug, asset_from_db.id, asset_from_db.name, asset_from_db.folder_name, asset_from_db.is_enabled);
                         assets_to_return.push(asset_from_db);
                     }
                     Err(e) => {
                         // Error converting a specific row
                         eprintln!("[get_assets_for_entity {}] Error processing asset row index {}: {}", entity_slug, index, e);
                         // Optionally continue to next row or return error immediately
                         // return Err(format!("[get_assets_for_entity {}] Error processing asset row: {}", entity_slug, e));
                     }
                 }
             }
             println!("[get_assets_for_entity {}] Finished iterating over asset rows.", entity_slug);
        }
        Err(e) => {
             // Error preparing the MappedRows iterator itself
             let err_msg = format!("[get_assets_for_entity {}] DB Error preparing asset iterator: {}", entity_slug, e);
             eprintln!("{}", err_msg);
             return Err(err_msg);
        }
    }

    // Lock is released automatically when conn_guard goes out of scope here
    println!("[get_assets_for_entity {}] Command finished successfully. Returning {} assets.", entity_slug, assets_to_return.len());
    Ok(assets_to_return)
}

#[command]
fn toggle_asset_enabled(entity_slug: String, asset: Asset, db_state: State<DbState>) -> CmdResult<bool> {
    // Note: asset.folder_name passed from frontend is the CURRENT name on disk.
    // We use the asset.id to get the CLEAN relative path from DB for robust path construction.
    println!("[toggle_asset_enabled] Toggling asset: ID={}, Name={}, UI Folder='{}', UI Enabled State={}", asset.id, asset.name, asset.folder_name, asset.is_enabled);

    // Get BASE mods path
    let base_mods_path = get_mods_base_path_from_settings(&db_state).map_err(|e| e.to_string())?;

    // Fetch the CLEAN STORED relative path from DB using asset ID
    let clean_relative_path_from_db_str = {
         let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
         conn.query_row::<String, _, _>(
            "SELECT folder_name FROM assets WHERE id = ?1", // Expecting clean path here
            params![asset.id],
            |row| row.get(0),
         ).map_err(|e| format!("Failed to get relative path from DB for asset ID {}: {}", asset.id, e))?
    };
     // Ensure forward slashes for PathBuf consistency
     let clean_relative_path_from_db_str = clean_relative_path_from_db_str.replace("\\", "/");
     let clean_relative_path_from_db = PathBuf::from(&clean_relative_path_from_db_str);
     println!("[toggle_asset_enabled] Clean relative path from DB: '{}'", clean_relative_path_from_db.display());


    // --- FIX: Construct potential paths correctly ---
    let filename_osstr = clean_relative_path_from_db.file_name().ok_or_else(|| format!("Could not extract filename from DB path: {}", clean_relative_path_from_db.display()))?;
    let filename_str = filename_osstr.to_string_lossy();
    if filename_str.is_empty() {
        return Err(format!("Filename extracted from DB path is empty: {}", clean_relative_path_from_db.display()));
    }
    let disabled_filename = format!("{}{}", DISABLED_PREFIX, filename_str);
    let relative_parent_path = clean_relative_path_from_db.parent();

    // Full path if enabled = base / clean_relative_path
    let full_path_if_enabled = base_mods_path.join(&clean_relative_path_from_db);

    // Full path if disabled = base / relative_parent / disabled_filename
    let full_path_if_disabled = match relative_parent_path {
       Some(parent) if parent.as_os_str().len() > 0 => base_mods_path.join(parent).join(&disabled_filename),
       _ => base_mods_path.join(&disabled_filename), // No parent or parent is root
    };

    println!("[toggle_asset_enabled] Constructed enabled path check: {}", full_path_if_enabled.display());
    println!("[toggle_asset_enabled] Constructed disabled path check: {}", full_path_if_disabled.display());


    // Determine the CURRENT full path and the TARGET full path based on the *actual* state on disk
    let (current_full_path, target_full_path, new_enabled_state) =
        if full_path_if_enabled.is_dir() { // Check if the ENABLED path exists
            // It's currently enabled on disk, target is the disabled path
             println!("[toggle_asset_enabled] Detected state on disk: ENABLED (found {})", full_path_if_enabled.display());
            (full_path_if_enabled, full_path_if_disabled, false) // New state will be disabled
        } else if full_path_if_disabled.is_dir() { // Check if the DISABLED path exists
            // It's currently disabled on disk, target is the enabled path
             println!("[toggle_asset_enabled] Detected state on disk: DISABLED (found {})", full_path_if_disabled.display());
            (full_path_if_disabled, full_path_if_enabled, true) // New state will be enabled
        } else {
            // Neither exists, something is wrong. Error based on DB path.
             println!("[toggle_asset_enabled] Error: Mod folder not found on disk based on DB relative path!");
            // Use the better error message from before
             return Err(format!(
                "Cannot toggle mod '{}': Folder not found at expected locations derived from DB path '{}' (Checked {} and {}). Did the folder get moved or deleted?",
                asset.name, // Use the display name from the asset object
                clean_relative_path_from_db.display(), // Show the clean path we checked against
                full_path_if_enabled.display(),
                full_path_if_disabled.display()
            ));
        };

    println!("[toggle_asset_enabled] Current actual path: {}", current_full_path.display());
    println!("[toggle_asset_enabled] Target path for rename: {}", target_full_path.display());

    // Perform the rename
    fs::rename(&current_full_path, &target_full_path)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", current_full_path.display(), target_full_path.display(), e))?;

    println!("[toggle_asset_enabled] Renamed successfully. New logical state should be: {}", new_enabled_state);

    // Return the actual NEW state after the rename
    Ok(new_enabled_state)
}


#[command]
fn get_asset_image_path(
    _entity_slug: String, // Mark unused, not needed if we have actual folder name
    folder_name_on_disk: String, // The current name on disk (e.g., "ModName" or "DISABLED_ModName")
    image_filename: String,
    db_state: State<DbState> // Need db_state to get base path
) -> CmdResult<String> {
    // Log with relevant info
    println!("[get_asset_image_path] Getting image '{}' from disk folder '{}'", image_filename, folder_name_on_disk);

    // Get the base path from settings
    let base_mods_path = get_mods_base_path_from_settings(&db_state).map_err(|e| e.to_string())?;

    // Construct the FULL path to the mod folder using the name ON DISK
    // This assumes folder_name_on_disk is just the final component.
    let mod_folder_full_path = base_mods_path.join(&folder_name_on_disk);
    println!("[get_asset_image_path] Checking mod folder path: {}", mod_folder_full_path.display());


    // Check if the folder itself exists before looking for the image inside
    if !mod_folder_full_path.is_dir() {
        return Err(format!("Mod folder '{}' not found at expected location: {}", folder_name_on_disk, mod_folder_full_path.display()));
    }

    // Construct the FULL path to the image file
    let image_full_path = mod_folder_full_path.join(&image_filename);
    println!("[get_asset_image_path] Checking image path: {}", image_full_path.display());

    if !image_full_path.is_file() {
        return Err(format!("Image file '{}' not found in mod folder '{}'. Searched: {}", image_filename, folder_name_on_disk, image_full_path.display()));
    }

    // Return the absolute path string for the frontend
    Ok(image_full_path.to_string_lossy().into_owned())
}

#[command]
fn open_mods_folder(_app_handle: AppHandle, db_state: State<DbState>) -> CmdResult<()> { // Mark app_handle unused
    let mods_path = get_mods_base_path_from_settings(&db_state).map_err(|e| e.to_string())?;
    println!("Opening mods folder: {}", mods_path.display());

    if !mods_path.exists() || !mods_path.is_dir() { // Check it's a directory
        eprintln!("Configured mods folder does not exist or is not a directory: {}", mods_path.display());
        return Err(format!("Configured mods folder does not exist or is not a directory: {}", mods_path.display()));
    }

    let command_name;
    let arg; // Variable to hold the single argument string

    // Determine OS-specific command and prepare the argument
    if cfg!(target_os = "windows") {
        command_name = "explorer";
        // Windows explorer doesn't always handle forward slashes well, especially in UNC paths, canonicalize might help sometimes
        // Or just ensure it's a string representation
         arg = mods_path.to_string_lossy().to_string();
    } else if cfg!(target_os = "macos") {
        command_name = "open";
         arg = mods_path.to_str().ok_or("Invalid path string for macOS")?.to_string();
    } else { // Assume Linux/Unix-like
        command_name = "xdg-open";
         arg = mods_path.to_str().ok_or("Invalid path string for Linux")?.to_string();
    }

    println!("Executing: {} \"{}\"", command_name, arg); // Log with quotes for clarity

    // FIX: Use .args() with a slice containing the single argument
    match Command::new(command_name).args(&[arg]).spawn() {
        Ok((_, _child)) => {
             println!("File explorer command spawned successfully.");
             Ok(())
        },
        Err(e) => {
             eprintln!("Failed to spawn file explorer command '{}': {}", command_name, e);
             Err(format!("Failed to open folder using '{}': {}", command_name, e))
        }
    }
}

#[command]
async fn scan_mods_directory(db_state: State<'_, DbState>, app_handle: AppHandle) -> CmdResult<()> {
    println!("Starting mod directory scan...");
    let base_mods_path = get_mods_base_path_from_settings(&db_state).map_err(|e| e.to_string())?;
    println!("Scanning base path: {}", base_mods_path.display());

    if !base_mods_path.is_dir() {
        let err_msg = format!("Mods directory path is not a valid directory: {}", base_mods_path.display());
        app_handle.emit_all(SCAN_ERROR_EVENT, &err_msg).unwrap_or_else(|e| eprintln!("Failed to emit scan error event: {}", e));
        return Err(err_msg);
    }

    // --- Preparation ---
    // Pre-fetch maps using the incoming connection *before* spawning task
    let (entities_map, categories_map) = {
        let conn_guard = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
        let conn = &*conn_guard;

        let mut entities = HashMap::new();
        let mut entity_stmt = conn.prepare("SELECT slug, id FROM entities").map_err(|e| e.to_string())?;
        let entity_rows = entity_stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
        for row in entity_rows { if let Ok((slug, id)) = row { entities.insert(slug, id); } }

        let mut categories = HashMap::new();
        let mut cat_stmt = conn.prepare("SELECT slug, id FROM categories").map_err(|e| e.to_string())?;
        let cat_rows = cat_stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
        for row in cat_rows { if let Ok((slug, id)) = row { categories.insert(slug, id); } }

        (entities, categories)
    };

    // --- Get DB Path and Clone necessary data for the task ---
    let db_path = {
        let data_dir = get_app_data_dir(&app_handle).map_err(|e| e.to_string())?;
        data_dir.join(DB_NAME)
    };
    let db_path_str = db_path.to_string_lossy().to_string();
    let base_mods_path_clone = base_mods_path.clone();
    let app_handle_clone = app_handle.clone();

    // --- Calculate total expected mods *before* the main walk ---
    // Walk the directory, find folders containing .ini files directly inside them.
    // This count is used for progress reporting.
    println!("[Scan Prep] Calculating total potential mod folders...");
    let potential_mod_folders_for_count: Vec<PathBuf> = WalkDir::new(&base_mods_path)
        .min_depth(1) // Don't count the base path itself
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && has_ini_file(&e.path().to_path_buf())) // It's a dir and contains an ini
        .map(|e| e.path().to_path_buf())
        .collect();

    let total_to_process = potential_mod_folders_for_count.len();
    println!("[Scan Prep] Found {} potential mod folders for progress total.", total_to_process);

    // --- Emit initial progress ---
     app_handle.emit_all(SCAN_PROGRESS_EVENT, ScanProgress {
            processed: 0, total: total_to_process, current_path: None, message: "Starting scan...".to_string()
        }).unwrap_or_else(|e| eprintln!("Failed to emit initial scan progress: {}", e));


    // --- Process folders in a blocking task ---
    let scan_task = async_runtime::spawn_blocking(move || {
        // Open a new connection inside the blocking task
        let conn = Connection::open(&db_path_str).map_err(|e| format!("Failed to open DB connection in scan task: {}", e))?;

        let mut processed_count = 0; // Counts folders *identified* as mods and processed
        let mut mods_added_count = 0;
        let mut mods_updated_count = 0; // Track updates (optional)
        let mut errors_count = 0;

        // --- Iterate using WalkDir again, using skip_current_dir ---
        // We iterate through *all* entries, but only process directories containing .ini
        let mut walker = WalkDir::new(&base_mods_path_clone).min_depth(1).into_iter();

        while let Some(entry_result) = walker.next() {
            match entry_result {
                Ok(entry) => {
                    let path = entry.path().to_path_buf();

                    // Check if it's a directory *and* directly contains an ini file
                    if entry.file_type().is_dir() && has_ini_file(&path) {
                        // *** Found a Mod Folder - Process it ***
                        processed_count += 1; // Increment count of mods processed
                        let path_display = path.display().to_string();
                        let folder_name_only = path.file_name().unwrap_or_default().to_string_lossy();
                        println!("[Scan Task] Processing identified mod folder #{}: {}", processed_count, path_display);

                        // Emit progress event (use processed_count and total_to_process)
                        app_handle_clone.emit_all(SCAN_PROGRESS_EVENT, ScanProgress {
                             processed: processed_count,    // Use count of identified mods processed
                             total: total_to_process,       // Use total from pre-calculation
                             current_path: Some(path_display.clone()),
                             message: format!("Processing: {}", folder_name_only)
                         }).unwrap_or_else(|e| eprintln!("Failed to emit scan progress: {}", e));

                        // Deduce and insert/update logic
                         match deduce_mod_info(&path, &base_mods_path_clone, &entities_map, &categories_map) {
                            Some(deduced) => {
                                 if let Some(target_entity_id) = entities_map.get(&deduced.entity_slug) {
                                     // --- Calculate clean relative path correctly ---
                                    let relative_path_buf = match path.strip_prefix(&base_mods_path_clone) {
                                        Ok(p) => p.to_path_buf(),
                                        Err(_) => {
                                            eprintln!("[Scan Task] Error: Could not strip base path prefix from '{}'. Skipping.", path.display());
                                            errors_count += 1;
                                            walker.skip_current_dir(); // Also skip if stripping fails
                                            continue; // Go to next item from walker
                                        }
                                    };
                                    let filename_osstr = relative_path_buf.file_name().unwrap_or_default();
                                    let filename_str = filename_osstr.to_string_lossy();
                                    let clean_filename = filename_str.trim_start_matches(DISABLED_PREFIX);
                                    let relative_parent_path = relative_path_buf.parent();
                                    let relative_path_to_store = match relative_parent_path {
                                        Some(parent) => parent.join(clean_filename).to_string_lossy().to_string(),
                                        None => clean_filename.to_string(),
                                    };
                                    // Ensure forward slashes for consistency in DB
                                    let relative_path_to_store = relative_path_to_store.replace("\\", "/");
                                    println!("[Scan Task] Storing clean relative path: {}", relative_path_to_store);

                                    // Check if this clean relative path already exists for the entity
                                    let existing_id: Option<i64> = conn.query_row(
                                        "SELECT id FROM assets WHERE entity_id = ?1 AND folder_name = ?2",
                                        params![target_entity_id, relative_path_to_store],
                                        |row| row.get(0),
                                    ).optional().map_err(|e| format!("DB error checking for existing asset '{}': {}", relative_path_to_store, e))?;

                                    if existing_id.is_none() {
                                         // Insert new asset
                                         let insert_result = conn.execute(
                                            "INSERT INTO assets (entity_id, name, description, folder_name, image_filename, author, category_tag) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                                            params![
                                                target_entity_id,
                                                deduced.mod_name, // Use deduced name for display
                                                deduced.description,
                                                relative_path_to_store, // Store the CLEAN relative path
                                                deduced.image_filename,
                                                deduced.author,
                                                deduced.mod_type_tag
                                            ]
                                         );
                                         match insert_result {
                                             Ok(changes) => { if changes > 0 { mods_added_count += 1; println!("[Scan Task] Added New: {}", relative_path_to_store); } }
                                             Err(e) => { eprintln!("[Scan Task] Error inserting NEW mod from path '{}' with clean relative path '{}': {}", path_display, relative_path_to_store, e); errors_count += 1; }
                                         }
                                     } else {
                                        println!("[Scan Task] Exists (based on clean path): {}", relative_path_to_store);
                                         // Optionally update existing asset data here if needed
                                         // mods_updated_count += 1;
                                    }
                                 } else {
                                      eprintln!("[Scan Task] Error: Deduced entity slug '{}' not found for mod '{}'. Skipping.", deduced.entity_slug, path.display());
                                      errors_count += 1;
                                 }
                            }
                            None => {
                                 eprintln!("[Scan Task] Error: Could not deduce info for mod folder '{}'. Skipping.", path.display());
                                 errors_count += 1;
                            }
                        } // End deduce_mod_info match

                        // *** CRUCIAL: Tell WalkDir not to descend into this mod folder ***
                        println!("[Scan Task] Skipping descent into: {}", path.display());
                        walker.skip_current_dir();

                    } else if entry.file_type().is_dir() {
                        // It's a directory, but NOT identified as a mod folder (no ini).
                        // Continue descending into it implicitly by doing nothing here.
                    } // else it's a file, WalkDir handles it, just continue.

                } // End Ok(entry)
                Err(e) => {
                     eprintln!("[Scan Task] Error accessing path during scan: {}", e);
                     errors_count += 1;
                     // It might be beneficial to skip the current directory if access fails
                     // walker.skip_current_dir(); // Consider adding this?
                }
            } // End match entry_result
        } // End while loop

        // TODO: Add logic here to prune assets from DB that no longer exist on disk?

        // Return summary info from the blocking task
        Ok::<_, String>((processed_count, mods_added_count, mods_updated_count, errors_count))
    }); // End spawn_blocking

    // --- Handle Task Result ---
     match scan_task.await {
         Ok(Ok((processed, added, _updated, errors))) => { // Ignore updated count for now in summary
             // Use total_to_process for a potentially more accurate summary of intent vs success
             let summary = format!(
                 "Scan complete. Processed {} identified mod folders. Added {} new mods. {} errors occurred.",
                 processed, added, errors
            );
             println!("{}", summary);
             // Emit completion event using the *original* app_handle
             app_handle.emit_all(SCAN_COMPLETE_EVENT, summary.clone()).unwrap_or_else(|e| eprintln!("Failed to emit scan complete event: {}", e));
             Ok(()) // Command succeeded
         }
         Ok(Err(e)) => { // Task completed, but returned an internal error string
             eprintln!("Scan task failed internally: {}", e);
              // Emit error event using the *original* app_handle
              app_handle.emit_all(SCAN_ERROR_EVENT, e.clone()).unwrap_or_else(|e| eprintln!("Failed to emit scan error event: {}", e));
             Err(e) // Propagate error string
         }
         Err(e) => { // Task panicked or was cancelled (JoinError)
             let err_msg = format!("Scan task panicked or failed to join: {}", e);
             eprintln!("{}", err_msg);
              // Emit error event using the *original* app_handle
             app_handle.emit_all(SCAN_ERROR_EVENT, err_msg.clone()).unwrap_or_else(|e| eprintln!("Failed to emit scan error event: {}", e));
             Err(err_msg)
         }
     }
}

#[command]
fn get_total_asset_count(db_state: State<DbState>) -> CmdResult<i64> {
    let conn = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    conn.query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[command]
fn update_asset_info(
    asset_id: i64,
    name: String,
    description: Option<String>,
    author: Option<String>,
    category_tag: Option<String>,
    selected_image_absolute_path: Option<String>,
    db_state: State<DbState> // Keep state to acquire lock initially
) -> CmdResult<()> {
    println!("[update_asset_info] Start for asset ID: {}", asset_id);

    // Acquire the single lock needed for this operation
    let conn_guard = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let conn = &*conn_guard; // Get a reference to the Connection from the guard
    println!("[update_asset_info] DB lock acquired.");

    // --- 1. Get Current Asset Info (Uses 'conn') ---
    let (clean_relative_path_str, current_image_filename): (String, Option<String>) = conn.query_row(
        "SELECT folder_name, image_filename FROM assets WHERE id = ?1",
        params![asset_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Failed to query current asset info for ID {}: {}", asset_id, e))?;
    let clean_relative_path_str = clean_relative_path_str.replace("\\", "/");
    let clean_relative_path = PathBuf::from(&clean_relative_path_str);
    println!("[update_asset_info] Found clean relative path: {}", clean_relative_path.display());

    // --- 2. Get Base Mods Path (Uses 'conn' via get_setting_value directly) ---
    let base_mods_path_str = get_setting_value(conn, SETTINGS_KEY_MODS_FOLDER) // Pass 'conn' directly
        .map_err(|e| format!("Failed to query mods folder setting: {}", e))? // Convert AppError to String
        .ok_or_else(|| "Mods folder path not set".to_string())?; // Convert Option error to String
    let base_mods_path = PathBuf::from(base_mods_path_str);
    println!("[update_asset_info] Found base mods path: {}", base_mods_path.display());

    // --- 3. Construct & Check Full Mod Folder Path ---
    let mod_folder_path = base_mods_path.join(&clean_relative_path);
    println!("[update_asset_info] Constructed mod folder path: {}", mod_folder_path.display());
    // **** CRITICAL FIX: Check if the path is actually a directory ****
    // The path stored is still bad (ends in .rar), so this check MUST fail
    if !mod_folder_path.is_dir() {
         // Check if the *parent* exists instead, might be more useful info
         let parent_dir = mod_folder_path.parent().unwrap_or(&base_mods_path); // Fallback
          let parent_exists = parent_dir.is_dir();
         eprintln!("[update_asset_info] Error: Target path is not a directory (Parent exists: {}). Path: {}", parent_exists, mod_folder_path.display());
         // Inform the user that the stored path is invalid (likely from a bad scan)
         return Err(format!(
            "Cannot update mod: The stored path '{}' is not a valid directory. Please rescan the mods folder to correct the database.",
            clean_relative_path.display()
        ));
    }
    println!("[update_asset_info] Mod folder path confirmed as directory.");

    // --- 4. Handle Image Copying ---
    let mut image_filename_to_save = current_image_filename;
    println!("[update_asset_info] Checking if new image was selected...");

    if let Some(source_path_str) = selected_image_absolute_path {
        println!("[update_asset_info] New image selected: {}", source_path_str);
        let source_path = PathBuf::from(&source_path_str);
        println!("[update_asset_info] Checking source image path: {}", source_path.display());
        if !source_path.is_file() {
             eprintln!("[update_asset_info] Error: Selected source image file does not exist.");
             return Err(format!("Selected image file does not exist: {}", source_path.display()));
        }
        println!("[update_asset_info] Source image path exists.");

        let target_image_path = mod_folder_path.join(TARGET_IMAGE_FILENAME);
        println!("[update_asset_info] Target image path: {}", target_image_path.display());

        println!("[update_asset_info] Attempting to copy image...");
        match fs::copy(&source_path, &target_image_path) {
            Ok(_) => {
                println!("[update_asset_info] Image copied successfully.");
                image_filename_to_save = Some(TARGET_IMAGE_FILENAME.to_string());
            }
            Err(e) => {
                eprintln!("[update_asset_info] Failed to copy image: {}", e);
                return Err(format!("Failed to copy image to mod folder: {}", e));
            }
        }
    } else {
         println!("[update_asset_info] No new image selected.");
    }
    println!("[update_asset_info] Image handling complete. Filename to save: {:?}", image_filename_to_save);

    // --- 5. Update Database (Uses 'conn') ---
    println!("[update_asset_info] Attempting DB update for asset ID {}", asset_id);
    let changes = conn.execute(
        "UPDATE assets SET name = ?1, description = ?2, author = ?3, category_tag = ?4, image_filename = ?5 WHERE id = ?6",
        params![
            name,
            description,
            author,
            category_tag,
            image_filename_to_save,
            asset_id
        ]
    ).map_err(|e| format!("Failed to update asset info in DB for ID {}: {}", asset_id, e))?;
    println!("[update_asset_info] DB update executed. Changes: {}", changes);

    if changes == 0 {
        eprintln!("[update_asset_info] Warning: DB update affected 0 rows for asset ID {}.", asset_id);
        // Don't necessarily error out, maybe the ID was wrong but flow continued? Log is sufficient.
    }

    println!("[update_asset_info] Asset ID {} updated successfully. END", asset_id);
    Ok(()) // Lock ('conn_guard') is released automatically when function returns
}

#[command]
async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    println!("[read_binary_file] Reading path: {}", path);
    // Keep the original path for potential error reporting
    let path_for_error = path.clone(); // Clone the path *before* it's moved

    read_binary(PathBuf::from(path)) // 'path' is moved here
        .map_err(|e| {
            // Use the cloned path 'path_for_error' in the error message
            eprintln!("[read_binary_file] Error reading file '{}': {}", path_for_error, e);
            format!("Failed to read file: {}", e)
        })
}

#[command]
async fn select_archive_file() -> CmdResult<Option<PathBuf>> {
    println!("[select_archive_file] Opening file dialog...");
    let result = dialog::blocking::FileDialogBuilder::new()
        .set_title("Select Mod Archive")
        .add_filter("Archives", &["zip"]) // Start with just zip
        // .add_filter("Archives", &["zip", "rar", "7z"]) // Add others later if needed
        .add_filter("All Files", &["*"])
        .pick_file();

    match result {
        Some(path) => {
            println!("[select_archive_file] File selected: {}", path.display());
            Ok(Some(path))
        },
        None => {
            println!("[select_archive_file] Dialog cancelled.");
            Ok(None)
        }, // User cancelled
    }
}

#[command]
fn analyze_archive(file_path_str: String, db_state: State<DbState>) -> CmdResult<ArchiveAnalysisResult> { // Added db_state (currently unused here, but available)
    println!("[analyze_archive] Analyzing: {}", file_path_str);
    let file_path = PathBuf::from(&file_path_str);
    if !file_path.is_file() {
        return Err(format!("Archive file not found: {}", file_path.display()));
     }

    let file = fs::File::open(&file_path)
        .map_err(|e| format!("Failed to open archive file {}: {}", file_path.display(), e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive {}: {}", file_path.display(), e))?;

    let mut entries = Vec::new();
    let mut ini_contents: HashMap<String, String> = HashMap::new(); // Store path -> content
    let preview_candidates = ["preview.png", "icon.png", "thumbnail.png", "preview.jpg", "icon.jpg", "thumbnail.jpg"];

    // --- Pass 1: Collect entries and read INI files ---
    println!("[analyze_archive] Pass 1: Collecting entries & reading INIs...");
    for i in 0..archive.len() {
        let mut file_entry = match archive.by_index(i) {
            Ok(fe) => fe,
            Err(e) => {
                 println!("[analyze_archive] Warn: Failed read entry #{}: {}", i, e);
                 continue; // Skip this entry if reading fails
            }
        };
        let path_str_opt = file_entry.enclosed_name().map(|p| p.to_string_lossy().replace("\\", "/"));
        if path_str_opt.is_none() {
             println!("[analyze_archive] Warning: Entry #{} has invalid path, skipping.", i);
             continue;
        }
        let path_str = path_str_opt.unwrap();
        let is_dir = file_entry.is_dir();

        // Read content if it's an INI file
        if !is_dir && path_str.to_lowercase().ends_with(".ini") {
            let mut content = String::new();
            if file_entry.read_to_string(&mut content).is_ok() {
                ini_contents.insert(path_str.clone(), content);
            } else {
                 println!("[analyze_archive] Warning: Failed to read content of INI file '{}'", path_str);
            }
        }

        entries.push(ArchiveEntry {
            path: path_str.clone(),
            is_dir,
            is_likely_mod_root: false,
        });
    }
    println!("[analyze_archive] Found {} entries. Found {} INI files.", entries.len(), ini_contents.len());

    // --- Pass 2: Find indices of likely roots (based on INI) ---
    let mut likely_root_indices = HashSet::new();
    println!("[analyze_archive] Pass 2: Finding roots containing INIs...");
    for (ini_index, ini_entry) in entries.iter().enumerate() {
        if !ini_entry.is_dir && ini_entry.path.to_lowercase().ends_with(".ini") {
            // Find its parent directory path within the archive entries
            let parent_path_obj = Path::new(&ini_entry.path).parent();
            if let Some(parent_path_ref) = parent_path_obj {
                 let parent_path_str_norm = parent_path_ref.to_string_lossy().replace("\\", "/");
                 if parent_path_str_norm.is_empty() { continue; } // Skip INI in root

                 // Find the index of the parent directory entry in our list.
                 let found_parent = entries.iter().position(|dir_entry| {
                      if !dir_entry.is_dir { return false; }
                      // Normalize directory entry path (remove trailing slash if present)
                      let dir_entry_path_norm = dir_entry.path.strip_suffix('/').unwrap_or(&dir_entry.path);
                      dir_entry_path_norm == parent_path_str_norm
                 });

                 if let Some(parent_index) = found_parent {
                     println!("[analyze_archive] Found INI '{}' inside potential root '{}' (index {})", ini_entry.path, parent_path_str_norm, parent_index);
                     likely_root_indices.insert(parent_index);
                 } else {
                     println!("[analyze_archive] WARN: Could not find directory entry for parent path '{}' of INI file '{}'", parent_path_str_norm, ini_entry.path);
                 }
            } else {
                  println!("[analyze_archive] WARN: Could not get parent path for INI file '{}'", ini_entry.path);
             }
        }
    }
    println!("[analyze_archive] Identified {} likely root indices: {:?}", likely_root_indices.len(), likely_root_indices);


    // --- Pass 3: Find detected previews inside *potential* roots (Immutable) ---
    println!("[analyze_archive] Pass 3: Checking for preview images in likely roots...");
    let mut root_to_preview_map: HashMap<usize, String> = HashMap::new(); // Map root index -> preview path
    for root_index in likely_root_indices.iter() {
         if let Some(root_entry) = entries.get(*root_index) { // Get immutable ref to root entry
             let root_prefix = if root_entry.path.ends_with('/') { root_entry.path.clone() } else { format!("{}/", root_entry.path) };
             for candidate in preview_candidates.iter() {
                 let potential_preview_path = format!("{}{}", root_prefix, candidate);
                 // Check immutably if this preview exists
                 if entries.iter().any(|e| !e.is_dir && e.path.eq_ignore_ascii_case(&potential_preview_path)) {
                      println!("[analyze_archive] Found potential preview '{}' inside root index {}.", potential_preview_path, root_index);
                     root_to_preview_map.insert(*root_index, potential_preview_path);
                     break; // Found one for this root, move to next root
                 }
             }
         }
    }
     println!("[analyze_archive] Found previews for {} roots.", root_to_preview_map.len());


    // --- Pass 4: Mark roots & attempt deduction (Mutable + DB Access) ---
    println!("[analyze_archive] Pass 4: Marking roots and extracting/deducing info...");
    let mut deduced_mod_name: Option<String> = None;
    let mut deduced_author: Option<String> = None;
    let mut deduced_category_slug: Option<String> = None; // <-- Will try to set this
    let mut deduced_entity_slug: Option<String> = None;   // <-- Will try to set this
    let mut raw_ini_type_found: Option<String> = None;
    let mut raw_ini_target_found: Option<String> = None;
    let mut detected_preview_internal_path : Option<String> = None;
    let mut first_likely_root_processed = false;

    // Acquire lock *once* if we need DB access for deduction
    let conn_guard_opt = if !likely_root_indices.is_empty() {
         Some(db_state.0.lock().map_err(|_| "DB lock poisoned during analysis".to_string())?)
     } else {
         None // No roots found, no need to lock/deduce further
     };
     let conn_opt = conn_guard_opt.as_deref(); // Get Option<&Connection>


    for (index, entry) in entries.iter_mut().enumerate() {
        if likely_root_indices.contains(&index) {
            entry.is_likely_mod_root = true;
             // Only perform deduction using the first likely root encountered
             if !first_likely_root_processed {
                 first_likely_root_processed = true;
                 println!("[analyze_archive] Attempting deduction based on first root: {}", entry.path);
                 let root_prefix = if entry.path.ends_with('/') { entry.path.clone() } else { format!("{}/", entry.path) };

                 // --- Process INI if found ---
                 if let Some((ini_path, ini_content)) = ini_contents.iter().find(|(p, _)| p.starts_with(&root_prefix) && p.trim_start_matches(&root_prefix).find('/') == None) {
                      println!("[analyze_archive] Found INI '{}' inside root for deduction.", ini_path);
                     if let Ok(ini) = Ini::load_from_str(ini_content) {
                        for section_name in ["Mod", "Settings", "Info", "General"] {
                             if let Some(section) = ini.section(Some(section_name)) {
                                 // Deduce Name/Author
                                 let name_val = section.get("Name").or_else(|| section.get("ModName"));
                                 if name_val.is_some() { deduced_mod_name = name_val.map(|s| MOD_NAME_CLEANUP_REGEX.replace_all(s, "").trim().to_string()); }
                                 let author_val = section.get("Author");
                                  if author_val.is_some() { deduced_author = author_val.map(String::from); }

                                 // Extract Raw Type/Target
                                  let target_val = section.get("Target").or_else(|| section.get("Entity")).or_else(|| section.get("Character"));
                                  if target_val.is_some() { raw_ini_target_found = target_val.map(|s| s.trim().to_string()); }
                                  let type_val = section.get("Type").or_else(|| section.get("Category"));
                                  if type_val.is_some() { raw_ini_type_found = type_val.map(|s| s.trim().to_string()); }

                                  // If any relevant field found, break section search
                                 if deduced_mod_name.is_some() || deduced_author.is_some() || raw_ini_target_found.is_some() || raw_ini_type_found.is_some() { break; }
                             }
                         }
                     }
                 } // End INI processing

                 // --- DB Deductions (if lock acquired) ---
                 if let Some(conn) = conn_opt {
                      // 1. Deduce Category Slug
                      if let Some(ref raw_type) = raw_ini_type_found {
                          let lower_raw_type = raw_type.to_lowercase();
                          println!("[analyze_archive] Querying category for raw type: {}", raw_type);
                          let query = "SELECT slug FROM categories WHERE LOWER(slug) = ?1 OR LOWER(name) = ?1 LIMIT 1";
                           match conn.query_row(query, params![lower_raw_type], |row| row.get::<_, String>(0)).optional() {
                               Ok(Some(slug)) => {
                                   println!("[analyze_archive] Deduced category slug: {}", slug);
                                   deduced_category_slug = Some(slug);
                               }
                               Ok(None) => { println!("[analyze_archive] Raw type '{}' not found in categories.", raw_type); }
                               Err(e) => { println!("[analyze_archive] Warn: DB error querying category for type '{}': {}", raw_type, e); } // Log error but continue
                           }
                      }

                      // 2. Deduce Entity Slug (only if target and category found)
                      if let (Some(ref raw_target), Some(ref cat_slug)) = (&raw_ini_target_found, &deduced_category_slug) {
                           let lower_raw_target = raw_target.to_lowercase();
                           println!("[analyze_archive] Querying entity for raw target: {} in category: {}", raw_target, cat_slug);
                            // Query within the specific category first for better accuracy
                           let query = "SELECT e.slug FROM entities e JOIN categories c ON e.category_id = c.id WHERE c.slug = ?1 AND (LOWER(e.slug) = ?2 OR LOWER(e.name) = ?2) LIMIT 1";
                            match conn.query_row(query, params![cat_slug, lower_raw_target], |row| row.get::<_, String>(0)).optional() {
                                Ok(Some(slug)) => {
                                    println!("[analyze_archive] Deduced entity slug: {}", slug);
                                    deduced_entity_slug = Some(slug);
                                }
                                Ok(None) => { println!("[analyze_archive] Raw target '{}' not found in category '{}'.", raw_target, cat_slug); }
                                Err(e) => { println!("[analyze_archive] Warn: DB error querying entity for target '{}': {}", raw_target, e); } // Log error but continue
                            }
                      }
                 } // End DB Deductions

                 // Get the pre-calculated preview path for this root index
                 if let Some(preview_path) = root_to_preview_map.get(&index) {
                      detected_preview_internal_path = Some(preview_path.clone());
                 }
             } // End processing first root
        } // End if root index found
    } // End main mutable loop


     // Fallback name deduction
     if deduced_mod_name.is_none() || deduced_mod_name.as_deref() == Some("") {
         deduced_mod_name = Some(file_path.file_stem().unwrap_or_default().to_string_lossy().to_string());
     }
     // Clean final deduced name
     if let Some(name) = &deduced_mod_name {
          let cleaned = MOD_NAME_CLEANUP_REGEX.replace_all(name, "").trim().to_string();
          if !cleaned.is_empty() { deduced_mod_name = Some(cleaned); }
     }

    println!("[analyze_archive] Final deduction: Name={:?}, Author={:?}, CategorySlug={:?}, EntitySlug={:?}, RawType={:?}, RawTarget={:?}, Preview={:?}",
        deduced_mod_name, deduced_author, deduced_category_slug, deduced_entity_slug, raw_ini_type_found, raw_ini_target_found, detected_preview_internal_path);

    // Lock guard (conn_guard_opt) goes out of scope here if it was acquired

    Ok(ArchiveAnalysisResult {
        file_path: file_path_str,
        entries,
        deduced_mod_name,
        deduced_author,
        deduced_category_slug,
        deduced_entity_slug,
        raw_ini_type: raw_ini_type_found,
        raw_ini_target: raw_ini_target_found,
        detected_preview_internal_path,
    })
}

#[command]
fn read_archive_file_content(archive_path_str: String, internal_file_path: String) -> CmdResult<Vec<u8>> {
    println!("[read_archive_file_content] Reading '{}' from archive '{}'", internal_file_path, archive_path_str);
    let archive_path = PathBuf::from(&archive_path_str);
    if !archive_path.is_file() {
        return Err(format!("Archive file not found: {}", archive_path.display()));
    }

    let file = fs::File::open(&archive_path)
        .map_err(|e| format!("Failed to open archive file {}: {}", archive_path.display(), e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive {}: {}", archive_path.display(), e))?;

    let internal_path_normalized = internal_file_path.replace("\\", "/");

    // --- Apply compiler suggestion: Store result in a variable ---
    let result = match archive.by_name(&internal_path_normalized) {
        Ok(mut file_in_zip) => {
            let mut buffer = Vec::with_capacity(file_in_zip.size() as usize);
            match file_in_zip.read_to_end(&mut buffer) {
                 Ok(_) => {
                     println!("[read_archive_file_content] Successfully read {} bytes.", buffer.len());
                     Ok(buffer) // Ok(Vec<u8>)
                 }
                 Err(e) => {
                      Err(format!("Failed to read internal file content '{}': {}", internal_file_path, e)) // Err(String)
                 }
            }
        },
        Err(zip::result::ZipError::FileNotFound) => {
             Err(format!("Internal file '{}' not found in archive.", internal_file_path)) // Err(String)
        },
        Err(e) => {
             Err(format!("Error accessing internal file '{}': {}", internal_file_path, e)) // Err(String)
        }
    }; // Semicolon here forces the temporary borrow from by_name to end

    result // Return the stored result
}

#[command]
fn import_archive(
    archive_path_str: String,
    target_entity_slug: String,
    selected_internal_root: String,
    mod_name: String,
    description: Option<String>,
    author: Option<String>,
    category_tag: Option<String>,
    selected_preview_absolute_path: Option<String>, // Added
    db_state: State<DbState>
) -> CmdResult<()> {
    println!("[import_archive] Importing '{}', internal path '{}' for entity '{}'", archive_path_str, selected_internal_root, target_entity_slug);
    println!("[import_archive] User provided preview path: {:?}", selected_preview_absolute_path);

     // --- Basic Validation ---
     if mod_name.trim().is_empty() { return Err("Mod Name cannot be empty.".to_string()); }
     if target_entity_slug.trim().is_empty() { return Err("Target Entity must be selected.".to_string()); }
     let archive_path = PathBuf::from(&archive_path_str);
     if !archive_path.is_file() { return Err(format!("Archive file not found: {}", archive_path.display())); }
     println!("[import_archive] Validations passed.");

     // --- Acquire Lock and Get DB Info & Paths ---
     let conn_guard = db_state.0.lock().map_err(|_| "DB lock poisoned".to_string())?;
     let conn = &*conn_guard;
     println!("[import_archive] DB lock acquired.");

     // Get Base Mods Path
     let base_mods_path_str = get_setting_value(conn, SETTINGS_KEY_MODS_FOLDER)
         .map_err(|e| format!("Failed to query mods folder setting: {}", e))?
         .ok_or_else(|| "Mods folder path not set".to_string())?;
     let base_mods_path = PathBuf::from(base_mods_path_str);
     println!("[import_archive] Found base mods path: {}", base_mods_path.display());

     // Get Category Slug AND Entity ID
     let (target_category_slug, target_entity_id): (String, i64) = conn.query_row(
         "SELECT c.slug, e.id FROM entities e JOIN categories c ON e.category_id = c.id WHERE e.slug = ?1",
         params![target_entity_slug],
         |row| Ok((row.get(0)?, row.get(1)?)),
     ).map_err(|e| match e {
          rusqlite::Error::QueryReturnedNoRows => format!("Target entity '{}' not found.", target_entity_slug),
          _ => format!("DB Error getting target entity/category info: {}", e)
      })?;
     println!("[import_archive] Found target entity ID: {}, Category Slug: {}", target_entity_id, target_category_slug);

    // Determine target mod folder name
    let target_mod_folder_name = mod_name.trim().replace(" ", "_").replace(".", "_");
    if target_mod_folder_name.is_empty() { return Err("Mod Name results in invalid folder name after cleaning.".to_string()); }
     println!("[import_archive] Target folder name: {}", target_mod_folder_name);

     // Construct the CORRECT final destination path including category
     let final_mod_dest_path = base_mods_path
          .join(&target_category_slug) // Add category slug
          .join(&target_entity_slug)   // Add entity slug
          .join(&target_mod_folder_name); // Add mod folder name

      // Create the full path including category/entity dirs
      fs::create_dir_all(&final_mod_dest_path)
         .map_err(|e| format!("Failed to create destination directory '{}': {}", final_mod_dest_path.display(), e))?;

     println!("[import_archive] Target destination folder created/ensured: {}", final_mod_dest_path.display());

     // --- Extraction Logic (ZIP only) ---
     println!("[import_archive] Opening archive for extraction...");
     let file = fs::File::open(&archive_path)
         .map_err(|e| format!("Failed to open archive file {}: {}", archive_path.display(), e))?;
     let mut archive = ZipArchive::new(file)
         .map_err(|e| format!("Failed to read zip archive {}: {}", archive_path.display(), e))?;

     // Normalize the internal root path
     let prefix_to_extract_norm = selected_internal_root.replace("\\", "/");
     let prefix_to_extract = prefix_to_extract_norm.strip_suffix('/').unwrap_or(&prefix_to_extract_norm);
     let prefix_path = Path::new(prefix_to_extract);
     println!("[import_archive] Normalized internal root prefix: '{}'", prefix_to_extract);

     let mut files_extracted_count = 0;
     for i in 0..archive.len() {
        let mut file_in_zip = archive.by_index(i)
             .map_err(|e| format!("Failed to read entry #{} from zip: {}", i, e))?;

        let internal_path_obj_opt = file_in_zip.enclosed_name().map(|p| p.to_path_buf());
        if internal_path_obj_opt.is_none() { continue; }
        let internal_path_obj = internal_path_obj_opt.unwrap();

        let should_extract = if prefix_to_extract.is_empty() {
             true
         } else {
             internal_path_obj.starts_with(prefix_path)
         };

        if should_extract {
             let relative_path_to_dest = if prefix_to_extract.is_empty() {
                 &internal_path_obj
             } else {
                 match internal_path_obj.strip_prefix(prefix_path) {
                     Ok(p) => p,
                     Err(_) => { continue; } // Skip if prefix stripping fails
                 }
             };

            if relative_path_to_dest.as_os_str().is_empty() { continue; } // Skip root itself

            let outpath = final_mod_dest_path.join(relative_path_to_dest);

            if file_in_zip.is_dir() {
                 fs::create_dir_all(&outpath)
                     .map_err(|e| format!("Failed to create directory '{}': {}", outpath.display(), e))?;
            } else {
                 if let Some(p) = outpath.parent() {
                     if !p.exists() { fs::create_dir_all(&p).map_err(|e| format!("Failed to create parent dir '{}': {}", p.display(), e))?; }
                 }
                 let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to create file '{}': {}", outpath.display(), e))?;
                 std::io::copy(&mut file_in_zip, &mut outfile).map_err(|e| format!("Failed to copy content to '{}': {}", outpath.display(), e))?;
                 files_extracted_count += 1;
            }

             #[cfg(unix)]
             { /* ... set permissions ... */ }
        }
    }
     println!("[import_archive] Extracted {} files.", files_extracted_count);
     if files_extracted_count == 0 && archive.len() > 0 && !selected_internal_root.is_empty() {
          println!("[import_archive] Warning: 0 files extracted. Check if the selected internal root ('{}') was correct.", selected_internal_root);
     }


    // --- Handle Preview Image ---
    let mut image_filename_for_db: Option<String> = None;
    if let Some(user_preview_path_str) = selected_preview_absolute_path {
         let source_path = PathBuf::from(&user_preview_path_str);
          let target_image_path = final_mod_dest_path.join(TARGET_IMAGE_FILENAME);
          println!("[import_archive] Copying user-selected preview '{}' to '{}'", source_path.display(), target_image_path.display());
          if source_path.is_file() {
               fs::copy(&source_path, &target_image_path).map_err(|e| format!("Failed to copy user preview image: {}", e))?;
                image_filename_for_db = Some(TARGET_IMAGE_FILENAME.to_string());
          } else { /* ... warning ... */ }
    } else {
         let potential_extracted_image_path = final_mod_dest_path.join(TARGET_IMAGE_FILENAME);
         if potential_extracted_image_path.is_file() {
              println!("[import_archive] Using extracted {} as preview.", TARGET_IMAGE_FILENAME);
              image_filename_for_db = Some(TARGET_IMAGE_FILENAME.to_string());
         } else { /* ... no preview found log ... */ }
    }


   // --- Add to Database ---
   let relative_path_for_db = Path::new(&target_category_slug)
        .join(&target_entity_slug)
        .join(&target_mod_folder_name);
   let relative_path_for_db_str = relative_path_for_db.to_string_lossy().replace("\\", "/");

   // Check existing
   let check_existing: Option<i64> = conn.query_row(
        "SELECT id FROM assets WHERE entity_id = ?1 AND folder_name = ?2",
        params![target_entity_id, relative_path_for_db_str],
        |row| row.get(0)
   ).optional().map_err(|e| format!("DB error checking for existing imported asset '{}': {}", relative_path_for_db_str, e))?;

    if check_existing.is_some() {
        fs::remove_dir_all(&final_mod_dest_path).ok(); // Attempt cleanup
        return Err(format!("Database entry already exists for '{}'. Aborting.", relative_path_for_db_str));
    }

    // Insert new asset
    println!("[import_archive] Adding asset to DB: entity_id={}, name={}, path={}, image={:?}", target_entity_id, mod_name, relative_path_for_db_str, image_filename_for_db);
    conn.execute(
        "INSERT INTO assets (entity_id, name, description, folder_name, image_filename, author, category_tag) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            target_entity_id, mod_name, description, relative_path_for_db_str,
            image_filename_for_db, author, category_tag
        ]
    ).map_err(|e| {
        fs::remove_dir_all(&final_mod_dest_path).ok(); // Cleanup on DB error
        format!("Failed to add imported mod to database: {}", e)
    })?;

   println!("[import_archive] Import successful for '{}'", mod_name);
   Ok(()) // Lock released here
}

// --- Main Function ---
fn main() {
    let context = generate_context!();

    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle();
             if let Err(e) = initialize_database(&app_handle) {
                 eprintln!("FATAL: Database initialization failed: {}", e);
                 dialog::blocking::message( app_handle.get_window("main").as_ref(), "Fatal Error", format!("Database initialization failed:\n{}", e) );
                 std::process::exit(1);
             }
             println!("Database structure verified/initialized.");
             let data_dir = get_app_data_dir(&app_handle).expect("Failed to get app data dir post-init");
             let db_path = data_dir.join(DB_NAME);
             let conn = Connection::open(&db_path).expect("Failed to open DB for state management");
             app.manage(DbState(Arc::new(Mutex::new(conn))));
             let db_state: State<DbState> = app.state();
             match get_setting_value(&db_state.0.lock().unwrap(), SETTINGS_KEY_MODS_FOLDER) { // Simple unwrap ok in setup
                 Ok(Some(path)) => println!("Mods folder configured to: {}", path),
                 _ => println!("WARN: Mods folder path is not configured yet."),
             }
            Ok(())
        })
        .invoke_handler(generate_handler![
            // Settings
            get_setting, set_setting, select_directory, select_file, launch_executable,
            // Core
            get_categories, get_entities_by_category, get_entity_details,
            get_assets_for_entity, toggle_asset_enabled, get_asset_image_path,
            open_mods_folder,
            // Scan & Count
            scan_mods_directory,
            get_total_asset_count,
            // Edit & Import
            update_asset_info,
            read_binary_file,
            select_archive_file,
            analyze_archive,
            import_archive,
            read_archive_file_content,
        ])
        .run(context)
        .expect("error while running tauri application");
}