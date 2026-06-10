pub mod commands;
pub mod errors;
pub mod models;
pub mod repository;

use std::path::PathBuf;
use std::sync::Mutex;

use repository::LearningContentRepository;
use tauri::Manager;

pub struct AppState {
    pub repository: Mutex<LearningContentRepository>,
    pub material_library_dir: PathBuf,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".studyseq"));
            let database_path = data_dir.join("studyseq.sqlite");
            let repository = LearningContentRepository::open(database_path)
                .map_err(|error| tauri::Error::Anyhow(error.into()))?;

            app.manage(AppState {
                repository: Mutex::new(repository),
                material_library_dir: data_dir.join("materials"),
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
            commands::get_material_library_stats,
            commands::cleanup_material_library,
            commands::rename_material_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running StudySeq");
}
