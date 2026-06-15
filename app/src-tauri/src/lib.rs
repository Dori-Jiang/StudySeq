pub mod commands;
pub mod errors;
pub mod models;
pub mod repository;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use repository::LearningContentRepository;
use tauri::Manager;

pub struct AppState {
    pub repository: Mutex<LearningContentRepository>,
    pub default_material_library_dir: PathBuf,
    pub material_library_dir: Mutex<PathBuf>,
    pub pending_material_library_locations: Mutex<HashMap<String, PendingMaterialLibraryLocation>>,
}

#[derive(Debug, Clone)]
pub struct PendingMaterialLibraryLocation {
    pub path: PathBuf,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".studyseq"));
            let database_path = data_dir.join("studyseq.sqlite");
            let repository = LearningContentRepository::open(database_path)
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;
            let default_material_library_dir = data_dir.join("materials");
            let material_library_location = repository
                .get_material_library_location(&default_material_library_dir)
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;
            app.asset_protocol_scope()
                .allow_directory(&material_library_location.path, true)
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;

            app.manage(AppState {
                repository: Mutex::new(repository),
                default_material_library_dir,
                material_library_dir: Mutex::new(PathBuf::from(material_library_location.path)),
                pending_material_library_locations: Mutex::new(HashMap::new()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_learning_contents,
            commands::create_learning_content,
            commands::update_learning_content,
            commands::get_learning_detail,
            commands::delete_learning_content,
            commands::delete_material_item,
            commands::import_material_file,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::preview_material_file,
            commands::get_material_reading_state,
            commands::save_material_reading_state,
            commands::save_video_playback_state,
            commands::get_material_library_stats,
            commands::cleanup_material_library,
            commands::get_material_library_location,
            commands::prepare_material_library_location_change,
            commands::apply_material_library_location_change,
            commands::rename_material_item,
            commands::create_material_folder,
            commands::move_material_item,
            commands::count_material_subtree,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StudySeq");
}
