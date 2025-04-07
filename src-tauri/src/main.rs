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
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, Arc};
use tauri::{
    command, generate_context, generate_handler, AppHandle, Manager, State, api::dialog,
    api::process::Command
};
use thiserror::Error;
use once_cell::sync::Lazy;
use tauri::async_runtime;
use toml;

// --- Structs for Deserializing Definitions ---
#[derive(Deserialize, Debug, Clone)] // Added Clone for potential use later
struct EntityDefinition {
    name: String,
    slug: String,
    description: Option<String>,
    details: Option<String>, // JSON string from TOML
    base_image: Option<String>,
}

#[derive(Deserialize, Debug)]
struct CategoryDefinition {
    name: String, // Category display name
    entities: Vec<EntityDefinition>,
}

// Type alias for the top-level structure (HashMap: category_slug -> CategoryDefinition)
type Definitions = HashMap<String, CategoryDefinition>;

// --- Constants for Settings Keys ---
const SETTINGS_KEY_MODS_FOLDER: &str = "mods_folder_path";
const OTHER_ENTITY_SUFFIX: &str = "-other";
const OTHER_ENTITY_NAME: &str = "Other/Unknown";


// --- Configuration ---
const DB_NAME: &str = "app_data.sqlite";
const DISABLED_PREFIX: &str = "DISABLED_";

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
}

// --- Event Payload Struct ---
#[derive(Clone, serde::Serialize)]
struct ScanProgress {
  processed: usize,
  total: usize,
  current_path: Option<String>, // Optional: path being processed
  message: String,
}

// --- Event Names ---
const SCAN_PROGRESS_EVENT: &str = "scan://progress";
const SCAN_COMPLETE_EVENT: &str = "scan://complete";
const SCAN_ERROR_EVENT: &str = "scan://error";

// --- Use String for Command Errors ---
type CmdResult<T> = Result<T, String>;

// --- Database Setup ---
struct DbState(Arc<Mutex<Connection>>);

static DB_CONNECTION: Lazy<Mutex<SqlResult<Connection>>> = Lazy::new(|| {
    Mutex::new(Err(rusqlite::Error::InvalidPath("DB not initialized yet".into())))
});

// --- Add Regex for cleanup ---
lazy_static! {
    // Simple regex to remove common prefixes/suffixes used for versioning or status
    static ref MOD_NAME_CLEANUP_REGEX: Regex = Regex::new(r"(?i)(_v\d+(\.\d+)*|_DISABLED|DISABLED_|\(disabled\)|^DISABLED_)").unwrap();
    // Regex to find potential character names (simple example, needs expansion)
    static ref CHARACTER_NAME_REGEX: Regex = Regex::new(r"(?i)(Raiden|Shogun|HuTao|Tao|Zhongli|Ganyu|Ayaka|Kazuha|Yelan|Eula|Klee|Nahida)").unwrap(); // Add more known names/aliases
}

// --- Helper Structs (Internal) ---
#[derive(Debug)]
struct DeducedInfo {
    entity_slug: String,
    mod_name: String,
    mod_type_tag: Option<String>,
    author: Option<String>,
    description: Option<String>,
    image_filename: Option<String>,
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


// --- Data Structures --- (Keep existing structs)
#[derive(Serialize, Deserialize, Debug)] struct Category { id: i64, name: String, slug: String }
#[derive(Serialize, Deserialize, Debug)] struct Entity { id: i64, category_id: i64, name: String, slug: String, description: Option<String>, details: Option<String>, base_image: Option<String>, mod_count: i32 }
// #[serde(skip_deserializing)] removed for is_enabled as we set it now
#[derive(Serialize, Deserialize, Debug, Clone)] struct Asset { id: i64, entity_id: i64, name: String, description: Option<String>, folder_name: String, image_filename: Option<String>, author: Option<String>, category_tag: Option<String>, is_enabled: bool }


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
             match get_mods_base_path_from_settings(&db_state) {
                 Ok(path) => println!("Mods folder configured to: {}", path.display()),
                 Err(_) => println!("WARN: Mods folder path is not configured yet."),
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
            // Scan & New Count Command
            scan_mods_directory,
            get_total_asset_count,
        ])
        .run(context)
        .expect("error while running tauri application");
}