use std::path::{Path, PathBuf};

use chrono::{Duration, Utc};
use tauri::{Manager, State, Window};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::errors::{ApiError, AppError};
use crate::models::{
    CreateHandwritingNoteInput, CreateLearningContentInput, CreateMaterialFolderInput,
    CreateNoteInput, HandwritingNote, HandwritingNoteSummary, ImportMaterialFileInput,
    LearningContent, LearningDetail, MaterialDeletionReport, MaterialItem,
    MaterialLibraryCleanupReport, MaterialLibraryLocation, MaterialLibraryLocationCandidate,
    MaterialLibraryLocationChangeInput, MaterialLibraryLocationChangeReport, MaterialLibraryStats,
    MaterialPreview, MaterialReadingState, MaterialSubtreeCount, MoveMaterialItemInput, Note,
    PdfPageAnnotation, RenameMaterialItemInput, RenameMaterialItemReport,
    SaveMaterialReadingStateInput, SavePdfPageAnnotationInput, SaveVideoPlaybackStateInput,
    UpdateHandwritingNoteInput, UpdateLearningContentInput, UpdateNoteInput,
};
use crate::repository::LearningContentRepository;
use crate::{AppState, PendingMaterialLibraryLocation};

const MATERIAL_LIBRARY_LOCATION_TOKEN_TTL_MINUTES: i64 = 10;

fn current_material_library_dir(
    state: &State<'_, AppState>,
) -> Result<std::path::PathBuf, AppError> {
    state
        .material_library_dir
        .lock()
        .map(|path| path.clone())
        .map_err(|_| AppError::StateUnavailable)
}

#[tauri::command]
pub fn list_learning_contents(
    state: State<'_, AppState>,
) -> Result<Vec<LearningContent>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    list_learning_contents_from_repository(&repository, &material_library_dir)
}

#[tauri::command]
pub fn create_learning_content(
    state: State<'_, AppState>,
    input: CreateLearningContentInput,
) -> Result<LearningContent, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    create_learning_content_in_repository(&repository, input)
}

#[tauri::command]
pub fn update_learning_content(
    state: State<'_, AppState>,
    input: UpdateLearningContentInput,
) -> Result<LearningContent, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    update_learning_content_in_repository(&repository, input)
}

#[tauri::command]
pub fn get_learning_detail(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<LearningDetail>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    get_learning_detail_from_repository(&repository, &id)
}

#[tauri::command]
pub fn delete_learning_content(
    state: State<'_, AppState>,
    id: String,
) -> Result<MaterialDeletionReport, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    delete_learning_content_in_repository(&repository, &id, &material_library_dir)
}

#[tauri::command]
pub fn delete_material_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<MaterialDeletionReport, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    delete_material_item_in_repository(&repository, &id, &material_library_dir)
}

#[tauri::command]
pub fn import_material_file(
    window: Window,
    state: State<'_, AppState>,
    input: ImportMaterialFileInput,
) -> Result<Option<MaterialItem>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    let material_library_dir = current_material_library_dir(&state)?;
    let selected = window
        .dialog()
        .file()
        .set_title("选择学习资料")
        .blocking_pick_file();
    let Some(source_path) = selected.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };

    import_material_file_in_repository(&repository, input, &source_path, &material_library_dir)
        .map(Some)
}

#[tauri::command]
pub fn copy_text_to_clipboard(window: Window, text: String) -> Result<(), ApiError> {
    window
        .app_handle()
        .clipboard()
        .write_text(text)
        .map_err(|_| AppError::ClipboardUnavailable)?;
    Ok(())
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, input: CreateNoteInput) -> Result<Note, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    create_note_in_repository(&repository, input)
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, input: UpdateNoteInput) -> Result<Note, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    update_note_in_repository(&repository, input)
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    delete_note_in_repository(&repository, &id)
}

#[tauri::command]
pub fn list_handwriting_note_summaries(
    state: State<'_, AppState>,
    learning_content_id: String,
) -> Result<Vec<HandwritingNoteSummary>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    list_handwriting_note_summaries_in_repository(&repository, &learning_content_id)
}

#[tauri::command]
pub fn get_handwriting_note(
    state: State<'_, AppState>,
    learning_content_id: String,
    id: String,
) -> Result<HandwritingNote, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    get_handwriting_note_from_repository(&repository, &learning_content_id, &id)
}

#[tauri::command]
pub fn create_handwriting_note(
    state: State<'_, AppState>,
    input: CreateHandwritingNoteInput,
) -> Result<HandwritingNote, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    create_handwriting_note_in_repository(&repository, input)
}

#[tauri::command]
pub fn update_handwriting_note(
    state: State<'_, AppState>,
    input: UpdateHandwritingNoteInput,
) -> Result<HandwritingNote, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    update_handwriting_note_in_repository(&repository, input)
}

#[tauri::command]
pub fn delete_handwriting_note(
    state: State<'_, AppState>,
    learning_content_id: String,
    id: String,
) -> Result<(), ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    delete_handwriting_note_in_repository(&repository, &learning_content_id, &id)
}

#[tauri::command]
pub fn get_pdf_page_annotation(
    state: State<'_, AppState>,
    material_id: String,
    page_number: i64,
) -> Result<Option<PdfPageAnnotation>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    get_pdf_page_annotation_from_repository(
        &repository,
        &material_id,
        page_number,
        &material_library_dir,
    )
}

#[tauri::command]
pub fn save_pdf_page_annotation(
    state: State<'_, AppState>,
    input: SavePdfPageAnnotationInput,
) -> Result<PdfPageAnnotation, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    save_pdf_page_annotation_in_repository(&repository, input, &material_library_dir)
}

#[tauri::command]
pub fn delete_pdf_page_annotation(
    state: State<'_, AppState>,
    material_id: String,
    page_number: i64,
) -> Result<(), ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    delete_pdf_page_annotation_in_repository(
        &repository,
        &material_id,
        page_number,
        &material_library_dir,
    )
}

#[tauri::command]
pub fn preview_material_file(
    state: State<'_, AppState>,
    material_id: String,
) -> Result<MaterialPreview, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    preview_material_file_in_repository(&repository, &material_id, &material_library_dir)
}

#[tauri::command]
pub fn get_material_reading_state(
    state: State<'_, AppState>,
    material_id: String,
) -> Result<Option<MaterialReadingState>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    get_material_reading_state_from_repository(&repository, &material_id)
}

#[tauri::command]
pub fn save_material_reading_state(
    state: State<'_, AppState>,
    input: SaveMaterialReadingStateInput,
) -> Result<MaterialReadingState, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    save_material_reading_state_in_repository(&repository, input, &material_library_dir)
}

#[tauri::command]
pub fn save_video_playback_state(
    state: State<'_, AppState>,
    input: SaveVideoPlaybackStateInput,
) -> Result<MaterialReadingState, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    save_video_playback_state_in_repository(&repository, input, &material_library_dir)
}

#[tauri::command]
pub fn get_material_library_stats(
    state: State<'_, AppState>,
) -> Result<MaterialLibraryStats, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    get_material_library_stats_from_repository(&repository, &material_library_dir)
}

#[tauri::command]
pub fn cleanup_material_library(
    state: State<'_, AppState>,
) -> Result<MaterialLibraryCleanupReport, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    cleanup_material_library_in_repository(&repository, &material_library_dir)
}

#[tauri::command]
pub fn rename_material_item(
    state: State<'_, AppState>,
    input: RenameMaterialItemInput,
) -> Result<RenameMaterialItemReport, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = current_material_library_dir(&state)?;

    rename_material_item_in_repository(&repository, input, &material_library_dir)
}

#[tauri::command]
pub fn get_material_library_location(
    state: State<'_, AppState>,
) -> Result<MaterialLibraryLocation, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    repository
        .get_material_library_location(&state.default_material_library_dir)
        .map_err(ApiError::from)
}

#[tauri::command]
pub fn prepare_material_library_location_change(
    window: Window,
    state: State<'_, AppState>,
) -> Result<Option<MaterialLibraryLocationCandidate>, ApiError> {
    let selected = window
        .dialog()
        .file()
        .set_title("选择资料库存放位置")
        .blocking_pick_folder();

    let Some(storage_root) = selected.and_then(|path| path.into_path().ok()) else {
        return Ok(None);
    };

    let target_dir = material_library_dir_for_storage_root(&storage_root);
    let expires_at = Utc::now() + Duration::minutes(MATERIAL_LIBRARY_LOCATION_TOKEN_TTL_MINUTES);
    let token = Uuid::new_v4().to_string();
    let candidate = MaterialLibraryLocationCandidate {
        token: token.clone(),
        display_path: target_dir.to_string_lossy().to_string(),
        expires_at: expires_at.to_rfc3339(),
    };

    let mut pending = state
        .pending_material_library_locations
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    remove_expired_material_library_location_tokens(&mut pending, Utc::now());
    pending.insert(
        token,
        PendingMaterialLibraryLocation {
            path: target_dir,
            expires_at,
        },
    );

    Ok(Some(candidate))
}

#[tauri::command]
pub fn apply_material_library_location_change(
    window: Window,
    state: State<'_, AppState>,
    input: MaterialLibraryLocationChangeInput,
) -> Result<MaterialLibraryLocationChangeReport, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let current_dir = current_material_library_dir(&state)?;

    let target_dir = match input {
        MaterialLibraryLocationChangeInput::Default => state.default_material_library_dir.clone(),
        MaterialLibraryLocationChangeInput::Selected { token } => {
            consume_pending_material_library_location(&state, &token)?
        }
    };

    let change_plan = repository
        .set_material_library_location(
            &current_dir,
            &state.default_material_library_dir,
            &target_dir,
        )
        .map_err(ApiError::from)?;

    apply_material_library_runtime_update(
        &repository,
        &state.default_material_library_dir,
        &target_dir,
        &change_plan,
        || {
            window
                .asset_protocol_scope()
                .allow_directory(&change_plan.location.path, true)
                .map_err(|_| AppError::InvalidMaterialLibraryLocation)
                .and_then(|_| update_material_library_dir_state(&state, &change_plan.location.path))
        },
    )
    .map_err(ApiError::from)?;

    Ok(change_plan.cleanup_old_files())
}

fn material_library_dir_for_storage_root(storage_root: &Path) -> PathBuf {
    storage_root.join("StudySeqData").join("materials")
}

fn update_material_library_dir_state(
    state: &State<'_, AppState>,
    path: &str,
) -> Result<(), AppError> {
    *state
        .material_library_dir
        .lock()
        .map_err(|_| AppError::StateUnavailable)? = PathBuf::from(path);
    Ok(())
}

fn apply_material_library_runtime_update(
    repository: &LearningContentRepository,
    default_material_library_dir: &Path,
    target_dir: &Path,
    change_plan: &crate::repository::MaterialLibraryLocationChangePlan,
    update_runtime: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    if let Err(runtime_error) = update_runtime() {
        let rollback_result = repository.rollback_material_library_location(
            target_dir,
            default_material_library_dir,
            &change_plan.previous_dir,
        );
        if let Err(rollback_error) = rollback_result {
            eprintln!(
                "material library rollback failed after runtime update error: {rollback_error}"
            );
        }
        return Err(runtime_error);
    }

    Ok(())
}

fn consume_pending_material_library_location(
    state: &State<'_, AppState>,
    token: &str,
) -> Result<PathBuf, AppError> {
    let now = Utc::now();
    let mut pending = state
        .pending_material_library_locations
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    consume_pending_material_library_location_from_map(&mut pending, token, now)
}

fn consume_pending_material_library_location_from_map(
    pending: &mut std::collections::HashMap<String, PendingMaterialLibraryLocation>,
    token: &str,
    now: chrono::DateTime<Utc>,
) -> Result<PathBuf, AppError> {
    remove_expired_material_library_location_tokens(pending, now);

    let Some(candidate) = pending.remove(token) else {
        return Err(AppError::InvalidMaterialLibraryLocation);
    };
    if candidate.expires_at <= now {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }

    Ok(candidate.path)
}

fn remove_expired_material_library_location_tokens(
    pending: &mut std::collections::HashMap<String, PendingMaterialLibraryLocation>,
    now: chrono::DateTime<Utc>,
) {
    pending.retain(|_, candidate| candidate.expires_at > now);
}

#[tauri::command]
pub fn create_material_folder(
    state: State<'_, AppState>,
    input: CreateMaterialFolderInput,
) -> Result<MaterialItem, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    create_material_folder_in_repository(&repository, input)
}

#[tauri::command]
pub fn move_material_item(
    state: State<'_, AppState>,
    input: MoveMaterialItemInput,
) -> Result<MaterialItem, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    move_material_item_in_repository(&repository, input)
}

#[tauri::command]
pub fn count_material_subtree(
    state: State<'_, AppState>,
    material_id: String,
) -> Result<MaterialSubtreeCount, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    count_material_subtree_in_repository(&repository, &material_id)
}

fn list_learning_contents_from_repository(
    repository: &LearningContentRepository,
    material_library_dir: &std::path::Path,
) -> Result<Vec<LearningContent>, ApiError> {
    repository
        .list_with_material_library(material_library_dir)
        .map_err(ApiError::from)
}

fn create_learning_content_in_repository(
    repository: &LearningContentRepository,
    input: CreateLearningContentInput,
) -> Result<LearningContent, ApiError> {
    repository.create(input).map_err(ApiError::from)
}

fn update_learning_content_in_repository(
    repository: &LearningContentRepository,
    input: UpdateLearningContentInput,
) -> Result<LearningContent, ApiError> {
    repository
        .update_learning_content(
            &input.id,
            input.name,
            input.status,
            input.deadline,
            input.estimated_hours,
            input.progress,
        )
        .map_err(ApiError::from)
}

fn get_learning_detail_from_repository(
    repository: &LearningContentRepository,
    id: &str,
) -> Result<Option<LearningDetail>, ApiError> {
    repository.get_detail(id).map_err(ApiError::from)
}

fn delete_learning_content_in_repository(
    repository: &LearningContentRepository,
    id: &str,
    material_library_dir: &std::path::Path,
) -> Result<MaterialDeletionReport, ApiError> {
    repository
        .delete_learning_content(id, material_library_dir)
        .map_err(ApiError::from)
}

fn delete_material_item_in_repository(
    repository: &LearningContentRepository,
    id: &str,
    material_library_dir: &std::path::Path,
) -> Result<MaterialDeletionReport, ApiError> {
    repository
        .delete_material_item(id, material_library_dir)
        .map_err(ApiError::from)
}

fn import_material_file_in_repository(
    repository: &LearningContentRepository,
    input: ImportMaterialFileInput,
    source_path: &std::path::Path,
    material_library_dir: &std::path::Path,
) -> Result<MaterialItem, ApiError> {
    repository
        .import_material_file(
            &input.learning_content_id,
            source_path,
            material_library_dir,
            input.parent_id.as_deref(),
        )
        .map_err(ApiError::from)
}

fn create_note_in_repository(
    repository: &LearningContentRepository,
    input: CreateNoteInput,
) -> Result<Note, ApiError> {
    repository
        .create_note(&input.learning_content_id, input.title, input.body)
        .map_err(ApiError::from)
}

fn update_note_in_repository(
    repository: &LearningContentRepository,
    input: UpdateNoteInput,
) -> Result<Note, ApiError> {
    repository
        .update_note(&input.note_id, input.title, input.body)
        .map_err(ApiError::from)
}

fn delete_note_in_repository(
    repository: &LearningContentRepository,
    id: &str,
) -> Result<(), ApiError> {
    repository.delete_note(id).map_err(ApiError::from)
}

fn list_handwriting_note_summaries_in_repository(
    repository: &LearningContentRepository,
    learning_content_id: &str,
) -> Result<Vec<HandwritingNoteSummary>, ApiError> {
    repository
        .list_handwriting_note_summaries(learning_content_id)
        .map_err(ApiError::from)
}

fn get_handwriting_note_from_repository(
    repository: &LearningContentRepository,
    learning_content_id: &str,
    id: &str,
) -> Result<HandwritingNote, ApiError> {
    repository
        .get_handwriting_note_in_content(learning_content_id, id)
        .map_err(ApiError::from)?
        .ok_or(AppError::HandwritingNoteNotFound)
        .map_err(ApiError::from)
}

fn create_handwriting_note_in_repository(
    repository: &LearningContentRepository,
    input: CreateHandwritingNoteInput,
) -> Result<HandwritingNote, ApiError> {
    repository
        .create_handwriting_note(input)
        .map_err(ApiError::from)
}

fn update_handwriting_note_in_repository(
    repository: &LearningContentRepository,
    input: UpdateHandwritingNoteInput,
) -> Result<HandwritingNote, ApiError> {
    repository
        .update_handwriting_note(input)
        .map_err(ApiError::from)
}

fn delete_handwriting_note_in_repository(
    repository: &LearningContentRepository,
    learning_content_id: &str,
    id: &str,
) -> Result<(), ApiError> {
    repository
        .delete_handwriting_note(learning_content_id, id)
        .map_err(ApiError::from)
}

fn get_pdf_page_annotation_from_repository(
    repository: &LearningContentRepository,
    material_id: &str,
    page_number: i64,
    material_library_dir: &std::path::Path,
) -> Result<Option<PdfPageAnnotation>, ApiError> {
    repository
        .get_pdf_page_annotation(material_id, page_number, material_library_dir)
        .map_err(ApiError::from)
}

fn save_pdf_page_annotation_in_repository(
    repository: &LearningContentRepository,
    input: SavePdfPageAnnotationInput,
    material_library_dir: &std::path::Path,
) -> Result<PdfPageAnnotation, ApiError> {
    repository
        .save_pdf_page_annotation(input, material_library_dir)
        .map_err(ApiError::from)
}

fn delete_pdf_page_annotation_in_repository(
    repository: &LearningContentRepository,
    material_id: &str,
    page_number: i64,
    material_library_dir: &std::path::Path,
) -> Result<(), ApiError> {
    repository
        .delete_pdf_page_annotation(material_id, page_number, material_library_dir)
        .map_err(ApiError::from)
}

fn preview_material_file_in_repository(
    repository: &LearningContentRepository,
    material_id: &str,
    material_library_dir: &std::path::Path,
) -> Result<MaterialPreview, ApiError> {
    repository
        .preview_material_file(material_id, material_library_dir)
        .map_err(ApiError::from)
}

fn get_material_reading_state_from_repository(
    repository: &LearningContentRepository,
    material_id: &str,
) -> Result<Option<MaterialReadingState>, ApiError> {
    repository
        .get_material_reading_state(material_id)
        .map_err(ApiError::from)
}

fn save_material_reading_state_in_repository(
    repository: &LearningContentRepository,
    input: SaveMaterialReadingStateInput,
    material_library_dir: &std::path::Path,
) -> Result<MaterialReadingState, ApiError> {
    repository
        .save_material_reading_state(
            &input.material_id,
            input.page_number,
            input.scale,
            material_library_dir,
        )
        .map_err(ApiError::from)
}

fn save_video_playback_state_in_repository(
    repository: &LearningContentRepository,
    input: SaveVideoPlaybackStateInput,
    material_library_dir: &std::path::Path,
) -> Result<MaterialReadingState, ApiError> {
    repository
        .save_video_playback_state(
            &input.material_id,
            input.position_seconds,
            material_library_dir,
        )
        .map_err(ApiError::from)
}

fn get_material_library_stats_from_repository(
    repository: &LearningContentRepository,
    material_library_dir: &std::path::Path,
) -> Result<MaterialLibraryStats, ApiError> {
    repository
        .get_material_library_stats(material_library_dir)
        .map_err(ApiError::from)
}

fn cleanup_material_library_in_repository(
    repository: &LearningContentRepository,
    material_library_dir: &std::path::Path,
) -> Result<MaterialLibraryCleanupReport, ApiError> {
    repository
        .cleanup_material_library(material_library_dir)
        .map_err(ApiError::from)
}

fn rename_material_item_in_repository(
    repository: &LearningContentRepository,
    input: RenameMaterialItemInput,
    material_library_dir: &std::path::Path,
) -> Result<RenameMaterialItemReport, ApiError> {
    repository
        .rename_material_item(&input.material_id, &input.name, material_library_dir)
        .map_err(ApiError::from)
}

fn create_material_folder_in_repository(
    repository: &LearningContentRepository,
    input: CreateMaterialFolderInput,
) -> Result<MaterialItem, ApiError> {
    repository
        .create_material_folder(
            &input.learning_content_id,
            input.parent_id.as_deref(),
            &input.name,
        )
        .map_err(ApiError::from)
}

fn move_material_item_in_repository(
    repository: &LearningContentRepository,
    input: MoveMaterialItemInput,
) -> Result<MaterialItem, ApiError> {
    repository
        .move_material_item(&input.material_id, input.new_parent_id.as_deref())
        .map_err(ApiError::from)
}

fn count_material_subtree_in_repository(
    repository: &LearningContentRepository,
    material_id: &str,
) -> Result<MaterialSubtreeCount, ApiError> {
    repository
        .count_material_subtree(material_id)
        .map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::repository::LearningContentRepository;

    use super::*;

    #[test]
    fn material_library_storage_root_is_derived_inside_rust() {
        let selected_root = PathBuf::from(r"D:\LearningData");

        let target = material_library_dir_for_storage_root(&selected_root);

        assert_eq!(
            target,
            PathBuf::from(r"D:\LearningData")
                .join("StudySeqData")
                .join("materials")
        );
    }

    #[test]
    fn pending_material_library_location_tokens_expire() {
        let now = Utc::now();
        let mut pending = HashMap::from([
            (
                "expired".to_string(),
                PendingMaterialLibraryLocation {
                    path: PathBuf::from(r"D:\expired\StudySeqData\materials"),
                    expires_at: now - Duration::minutes(1),
                },
            ),
            (
                "active".to_string(),
                PendingMaterialLibraryLocation {
                    path: PathBuf::from(r"D:\active\StudySeqData\materials"),
                    expires_at: now + Duration::minutes(1),
                },
            ),
        ]);

        remove_expired_material_library_location_tokens(&mut pending, now);

        assert!(!pending.contains_key("expired"));
        assert!(pending.contains_key("active"));
    }

    #[test]
    fn pending_material_library_location_tokens_are_one_time_use() {
        let token = "token-1".to_string();
        let path = PathBuf::from(r"D:\LearningData\StudySeqData\materials");
        let mut pending = HashMap::from([(
            token.clone(),
            PendingMaterialLibraryLocation {
                path: path.clone(),
                expires_at: Utc::now() + Duration::minutes(1),
            },
        )]);

        let first =
            consume_pending_material_library_location_from_map(&mut pending, &token, Utc::now())
                .expect("first token use");
        let second =
            consume_pending_material_library_location_from_map(&mut pending, &token, Utc::now());

        assert_eq!(first, path);
        assert!(matches!(
            second,
            Err(AppError::InvalidMaterialLibraryLocation)
        ));
    }

    #[test]
    fn material_library_runtime_failure_rolls_back_repository_location() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let default_library_dir = temp_dir.path().join("default-materials");
        let target_library_dir = temp_dir
            .path()
            .join("target")
            .join("StudySeqData")
            .join("materials");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::write(&source_file, b"%PDF command rollback").expect("write source");
        let content = repository
            .create(CreateLearningContentInput {
                name: "命令回滚".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create content");
        let material = repository
            .import_material_file(&content.id, &source_file, &default_library_dir, None)
            .expect("import material");
        let old_stored_path = material.stored_path.clone().expect("old stored path");
        let change_plan = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect("set target location");

        let error = apply_material_library_runtime_update(
            &repository,
            &default_library_dir,
            &target_library_dir,
            &change_plan,
            || Err(AppError::InvalidMaterialLibraryLocation),
        )
        .expect_err("runtime update should fail");

        assert!(matches!(error, AppError::InvalidMaterialLibraryLocation));
        let rolled_back_location = repository
            .get_material_library_location(&default_library_dir)
            .expect("get rolled back location");
        assert!(rolled_back_location.is_default);
        let detail = repository
            .get_detail(&content.id)
            .expect("get detail")
            .expect("detail exists");
        assert_eq!(
            detail.materials[0].stored_path.as_deref(),
            Some(old_stored_path.as_str())
        );
        assert!(PathBuf::from(old_stored_path).exists());
    }

    #[test]
    fn command_handlers_share_repository_state_for_create_and_list() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");

        create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "SQLite 闭环".to_string(),
                deadline: None,
                estimated_hours: Some(3.0),
                progress: Some(10),
            },
        )
        .expect("create learning content");

        let contents = list_learning_contents_from_repository(&repository, &material_library_dir)
            .expect("list learning contents");

        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0].name, "SQLite 闭环");
        assert_eq!(contents[0].progress, 10);
    }

    #[test]
    fn command_handlers_update_learning_content_basic_fields() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "编辑命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: Some(10),
            },
        )
        .expect("create learning content");

        let updated = update_learning_content_in_repository(
            &repository,
            UpdateLearningContentInput {
                id: content.id.clone(),
                name: "编辑命令更新".to_string(),
                status: crate::models::StudyStatus::Active,
                deadline: Some("2026-08-15".to_string()),
                estimated_hours: 8.5,
                progress: 65,
            },
        )
        .expect("update learning content");

        assert_eq!(updated.name, "编辑命令更新");
        assert_eq!(updated.status, crate::models::StudyStatus::Active);
        assert_eq!(updated.estimated_hours, 8.5);
        assert_eq!(updated.progress, 65);
        assert_eq!(updated.deadline.as_deref(), Some("2026-08-15"));
    }

    #[test]
    fn command_handlers_create_detail_material_note_and_delete_learning_content() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.txt");
        std::fs::write(&source_file, "hello").expect("write source file");

        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "详情页命令闭环".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import material");
        create_note_in_repository(
            &repository,
            CreateNoteInput {
                learning_content_id: content.id.clone(),
                title: "命令笔记".to_string(),
                body: "正文".to_string(),
            },
        )
        .expect("create note");

        let detail = get_learning_detail_from_repository(&repository, &content.id)
            .expect("get detail")
            .expect("detail exists");
        assert_eq!(detail.materials.len(), 1);
        assert_eq!(detail.notes.len(), 1);

        let report =
            delete_learning_content_in_repository(&repository, &content.id, &material_library_dir)
                .expect("delete learning content");
        assert_eq!(report.failed_cleanup_path_count, 0);
        assert!(
            get_learning_detail_from_repository(&repository, &content.id)
                .expect("get deleted detail")
                .is_none()
        );
    }

    #[test]
    fn command_handlers_delete_material_item() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.txt");
        std::fs::write(&source_file, "hello").expect("write source file");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "删除资料命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import material");
        let stored_path = material.stored_path.clone().expect("stored path");

        let report =
            delete_material_item_in_repository(&repository, &material.id, &material_library_dir)
                .expect("delete material");
        assert_eq!(report.failed_cleanup_path_count, 0);

        let detail = get_learning_detail_from_repository(&repository, &content.id)
            .expect("get detail")
            .expect("detail exists");
        assert!(detail.materials.is_empty());
        assert!(!std::path::Path::new(&stored_path).exists());
    }

    #[test]
    fn command_handlers_manage_v1_1_material_state_stats_cleanup_and_rename() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::write(&source_file, b"%PDF").expect("write source file");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "V1.1 命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import material");
        let orphan_file = material_library_dir.join(&content.id).join("orphan.tmp");
        std::fs::write(&orphan_file, b"orphan").expect("write orphan");

        let saved_state = save_material_reading_state_in_repository(
            &repository,
            SaveMaterialReadingStateInput {
                material_id: material.id.clone(),
                page_number: 4,
                scale: 1.5,
            },
            &material_library_dir,
        )
        .expect("save material reading state");
        let video_source = temp_dir.path().join("source.mp4");
        std::fs::write(&video_source, b"video").expect("write video source");
        let video = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &video_source,
            &material_library_dir,
        )
        .expect("import video");
        let saved_video_state = save_video_playback_state_in_repository(
            &repository,
            SaveVideoPlaybackStateInput {
                material_id: video.id.clone(),
                position_seconds: 42.5,
            },
            &material_library_dir,
        )
        .expect("save video playback state");
        let loaded_state = get_material_reading_state_from_repository(&repository, &material.id)
            .expect("get material reading state")
            .expect("state exists");
        let stats = get_material_library_stats_from_repository(&repository, &material_library_dir)
            .expect("get stats");
        let renamed = rename_material_item_in_repository(
            &repository,
            RenameMaterialItemInput {
                material_id: material.id.clone(),
                name: "重命名.pdf".to_string(),
            },
            &material_library_dir,
        )
        .expect("rename material");
        let cleanup = cleanup_material_library_in_repository(&repository, &material_library_dir)
            .expect("cleanup");

        assert_eq!(saved_state.page_number, 4);
        assert_eq!(saved_video_state.video_position_seconds, Some(42.5));
        assert_eq!(loaded_state.scale, 1.5);
        assert_eq!(stats.orphan_file_count, 1);
        assert_eq!(renamed.material.name, "重命名.pdf");
        assert_eq!(renamed.failed_cleanup_path_count, 0);
        assert_eq!(cleanup.deleted_orphan_file_count, 1);
    }

    #[test]
    fn command_preview_material_file_uses_app_material_library_dir() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let wrong_library_dir = temp_dir.path().join("wrong-materials");
        std::fs::create_dir_all(&wrong_library_dir).expect("create wrong library dir");
        let source_file = temp_dir.path().join("source.txt");
        std::fs::write(&source_file, "hello").expect("write source");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "预览命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import material");

        let error =
            preview_material_file_in_repository(&repository, &material.id, &wrong_library_dir)
                .expect_err("wrong library dir should be rejected");
        assert_eq!(error.code, "material_path_outside_library");

        let preview =
            preview_material_file_in_repository(&repository, &material.id, &material_library_dir)
                .expect("preview with app library dir");
        assert_eq!(preview.text.as_deref(), Some("hello"));
    }

    #[test]
    fn command_handlers_manage_material_folders() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("讲义.txt");
        std::fs::write(&source_file, "hello").expect("write source file");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "文件夹命令闭环".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");

        let folder = create_material_folder_in_repository(
            &repository,
            CreateMaterialFolderInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
                name: "第一章".to_string(),
            },
        )
        .expect("create folder");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id.clone(),
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import material");
        let moved = move_material_item_in_repository(
            &repository,
            MoveMaterialItemInput {
                material_id: material.id.clone(),
                new_parent_id: Some(folder.id.clone()),
            },
        )
        .expect("move material into folder");
        let count =
            count_material_subtree_in_repository(&repository, &folder.id).expect("count subtree");

        assert_eq!(moved.parent_id.as_deref(), Some(folder.id.as_str()));
        assert_eq!(count.file_count, 1);
        assert_eq!(count.folder_count, 0);

        delete_material_item_in_repository(&repository, &folder.id, &material_library_dir)
            .expect("delete folder recursively");
        let detail = get_learning_detail_from_repository(&repository, &content.id)
            .expect("get detail")
            .expect("detail exists");
        assert!(detail.materials.is_empty());
    }

    #[test]
    fn command_handlers_delete_note() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "删除笔记命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let note = create_note_in_repository(
            &repository,
            CreateNoteInput {
                learning_content_id: content.id.clone(),
                title: "待删笔记".to_string(),
                body: "正文".to_string(),
            },
        )
        .expect("create note");

        delete_note_in_repository(&repository, &note.id).expect("delete note");

        let detail = get_learning_detail_from_repository(&repository, &content.id)
            .expect("get detail")
            .expect("detail exists");
        assert!(detail.notes.is_empty());
    }

    #[test]
    fn command_handlers_manage_handwriting_notes() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "手写命令闭环".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");

        let created = create_handwriting_note_in_repository(
            &repository,
            CreateHandwritingNoteInput {
                learning_content_id: content.id.clone(),
                title: "手写草稿".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 1024.0,
                canvas_height: 768.0,
            },
        )
        .expect("create handwriting note");
        let summaries = list_handwriting_note_summaries_in_repository(&repository, &content.id)
            .expect("list handwriting summaries");
        let loaded = get_handwriting_note_from_repository(&repository, &content.id, &created.id)
            .expect("get handwriting note");
        let updated = update_handwriting_note_in_repository(
            &repository,
            UpdateHandwritingNoteInput {
                learning_content_id: content.id.clone(),
                note_id: created.id.clone(),
                title: "手写复盘".to_string(),
                stroke_data_json: handwriting_json_with_width(0.012),
                canvas_width: 1200.0,
                canvas_height: 800.0,
            },
        )
        .expect("update handwriting note");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].title, "手写草稿");
        assert_eq!(loaded.stroke_data_json, handwriting_json());
        assert_eq!(updated.title, "手写复盘");
        assert!(updated.stroke_data_json.contains("0.012"));

        delete_handwriting_note_in_repository(&repository, &content.id, &created.id)
            .expect("delete handwriting note");
        assert!(
            list_handwriting_note_summaries_in_repository(&repository, &content.id)
                .expect("list handwriting summaries after delete")
                .is_empty()
        );
    }

    #[test]
    fn command_handlers_scope_handwriting_notes_to_learning_content() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let first = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "第一项".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create first learning content");
        let second = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "第二项".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create second learning content");
        let note = create_handwriting_note_in_repository(
            &repository,
            CreateHandwritingNoteInput {
                learning_content_id: second.id.clone(),
                title: "第二项手写".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 1024.0,
                canvas_height: 768.0,
            },
        )
        .expect("create handwriting note");

        let get_error = get_handwriting_note_from_repository(&repository, &first.id, &note.id)
            .expect_err("cross-content get should fail");
        let update_error = update_handwriting_note_in_repository(
            &repository,
            UpdateHandwritingNoteInput {
                learning_content_id: first.id.clone(),
                note_id: note.id.clone(),
                title: "越权更新".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 1024.0,
                canvas_height: 768.0,
            },
        )
        .expect_err("cross-content update should fail");
        let delete_error = delete_handwriting_note_in_repository(&repository, &first.id, &note.id)
            .expect_err("cross-content delete should fail");

        assert_eq!(get_error.code, "handwriting_note_not_found");
        assert_eq!(update_error.code, "handwriting_note_not_found");
        assert_eq!(delete_error.code, "handwriting_note_not_found");
        assert!(
            get_handwriting_note_from_repository(&repository, &second.id, &note.id)
                .expect("owner can still read")
                .id
                == note.id
        );
    }

    #[test]
    fn command_handlers_reject_invalid_handwriting_payload_with_stable_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "手写错误".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");

        let error = create_handwriting_note_in_repository(
            &repository,
            CreateHandwritingNoteInput {
                learning_content_id: content.id,
                title: "坏数据".to_string(),
                stroke_data_json: "not-json".to_string(),
                canvas_width: 1024.0,
                canvas_height: 768.0,
            },
        )
        .expect_err("invalid handwriting should fail");

        assert_eq!(error.code, "invalid_handwriting_data");
        assert!(!error.message.contains("not-json"));
    }

    #[test]
    fn command_handlers_manage_pdf_page_annotations() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("讲义.pdf");
        std::fs::write(&source_file, b"%PDF-1.7\n%%EOF").expect("write pdf");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "PDF 批注命令".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id,
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import pdf");

        let saved = save_pdf_page_annotation_in_repository(
            &repository,
            SavePdfPageAnnotationInput {
                material_id: material.id.clone(),
                page_number: 1,
                page_width: 595.0,
                page_height: 842.0,
                stroke_data: handwriting_json(),
            },
            &material_library_dir,
        )
        .expect("save pdf annotation");
        let loaded = get_pdf_page_annotation_from_repository(
            &repository,
            &material.id,
            1,
            &material_library_dir,
        )
        .expect("get annotation")
        .expect("annotation exists");
        delete_pdf_page_annotation_in_repository(
            &repository,
            &material.id,
            1,
            &material_library_dir,
        )
        .expect("delete annotation");
        let missing = get_pdf_page_annotation_from_repository(
            &repository,
            &material.id,
            1,
            &material_library_dir,
        )
        .expect("get missing annotation");

        assert_eq!(saved.material_id, material.id);
        assert_eq!(loaded.id, saved.id);
        assert!(missing.is_none());
    }

    #[test]
    fn command_handlers_reject_invalid_pdf_annotation_payload_with_stable_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("讲义.pdf");
        std::fs::write(&source_file, b"%PDF-1.7\n%%EOF").expect("write pdf");
        let content = create_learning_content_in_repository(
            &repository,
            CreateLearningContentInput {
                name: "PDF 批注错误".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            },
        )
        .expect("create learning content");
        let material = import_material_file_in_repository(
            &repository,
            ImportMaterialFileInput {
                learning_content_id: content.id,
                parent_id: None,
            },
            &source_file,
            &material_library_dir,
        )
        .expect("import pdf");

        let error = save_pdf_page_annotation_in_repository(
            &repository,
            SavePdfPageAnnotationInput {
                material_id: material.id,
                page_number: 1,
                page_width: 595.0,
                page_height: 842.0,
                stroke_data: "not-json".to_string(),
            },
            &material_library_dir,
        )
        .expect_err("invalid annotation should fail");

        assert_eq!(error.code, "invalid_pdf_annotation_data");
        assert!(!error.message.contains("not-json"));
    }

    fn handwriting_json() -> String {
        handwriting_json_with_width(0.006)
    }

    fn handwriting_json_with_width(width: f64) -> String {
        format!(
            r##"{{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{{"id":"stroke-1","tool":"pen","color":"#1f2937","width":{},"points":[{{"x":0.12,"y":0.24,"t":1}}]}}]}}"##,
            width
        )
    }
}
