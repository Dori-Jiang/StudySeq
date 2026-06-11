use tauri::State;

use crate::errors::{ApiError, AppError};
use crate::models::{
    CreateLearningContentInput, CreateNoteInput, ImportMaterialFileInput, LearningContent,
    LearningDetail, MaterialItem, MaterialLibraryCleanupReport, MaterialLibraryStats,
    MaterialPreview, MaterialReadingState, Note, RenameMaterialItemInput,
    SaveMaterialReadingStateInput, UpdateLearningContentInput, UpdateNoteInput,
};
use crate::repository::LearningContentRepository;
use crate::AppState;

#[tauri::command]
pub fn list_learning_contents(
    state: State<'_, AppState>,
) -> Result<Vec<LearningContent>, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    list_learning_contents_from_repository(&repository)
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
pub fn delete_learning_content(state: State<'_, AppState>, id: String) -> Result<(), ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    delete_learning_content_in_repository(&repository, &id)
}

#[tauri::command]
pub fn delete_material_item(state: State<'_, AppState>, id: String) -> Result<(), ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    delete_material_item_in_repository(&repository, &id)
}

#[tauri::command]
pub fn import_material_file(
    state: State<'_, AppState>,
    input: ImportMaterialFileInput,
) -> Result<MaterialItem, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    let material_library_dir = state.material_library_dir.clone();
    import_material_file_in_repository(&repository, input, &material_library_dir)
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
pub fn preview_material_file(
    state: State<'_, AppState>,
    material_id: String,
) -> Result<MaterialPreview, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    preview_material_file_in_repository(&repository, &material_id)
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

    save_material_reading_state_in_repository(&repository, input)
}

#[tauri::command]
pub fn get_material_library_stats(
    state: State<'_, AppState>,
) -> Result<MaterialLibraryStats, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;
    let material_library_dir = state.material_library_dir.clone();

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
    let material_library_dir = state.material_library_dir.clone();

    cleanup_material_library_in_repository(&repository, &material_library_dir)
}

#[tauri::command]
pub fn rename_material_item(
    state: State<'_, AppState>,
    input: RenameMaterialItemInput,
) -> Result<MaterialItem, ApiError> {
    let repository = state
        .repository
        .lock()
        .map_err(|_| AppError::StateUnavailable)?;

    rename_material_item_in_repository(&repository, input)
}

fn list_learning_contents_from_repository(
    repository: &LearningContentRepository,
) -> Result<Vec<LearningContent>, ApiError> {
    repository.list().map_err(ApiError::from)
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
) -> Result<(), ApiError> {
    repository
        .delete_learning_content(id)
        .map_err(ApiError::from)
}

fn delete_material_item_in_repository(
    repository: &LearningContentRepository,
    id: &str,
) -> Result<(), ApiError> {
    repository.delete_material_item(id).map_err(ApiError::from)
}

fn import_material_file_in_repository(
    repository: &LearningContentRepository,
    input: ImportMaterialFileInput,
    material_library_dir: &std::path::Path,
) -> Result<MaterialItem, ApiError> {
    repository
        .import_material_file(
            &input.learning_content_id,
            input.source_path,
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

fn preview_material_file_in_repository(
    repository: &LearningContentRepository,
    material_id: &str,
) -> Result<MaterialPreview, ApiError> {
    repository
        .preview_material_file(material_id)
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
) -> Result<MaterialReadingState, ApiError> {
    repository
        .save_material_reading_state(&input.material_id, input.page_number, input.scale)
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
) -> Result<MaterialItem, ApiError> {
    repository
        .rename_material_item(&input.material_id, &input.name)
        .map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use crate::repository::LearningContentRepository;

    use super::*;

    #[test]
    fn command_handlers_share_repository_state_for_create_and_list() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");

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

        let contents =
            list_learning_contents_from_repository(&repository).expect("list learning contents");

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
                source_path: source_file.to_string_lossy().to_string(),
                parent_id: None,
            },
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

        delete_learning_content_in_repository(&repository, &content.id)
            .expect("delete learning content");
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
                source_path: source_file.to_string_lossy().to_string(),
                parent_id: None,
            },
            &material_library_dir,
        )
        .expect("import material");
        let stored_path = material.stored_path.clone().expect("stored path");

        delete_material_item_in_repository(&repository, &material.id).expect("delete material");

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
                source_path: source_file.to_string_lossy().to_string(),
                parent_id: None,
            },
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
        )
        .expect("save material reading state");
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
        )
        .expect("rename material");
        let cleanup = cleanup_material_library_in_repository(&repository, &material_library_dir)
            .expect("cleanup");

        assert_eq!(saved_state.page_number, 4);
        assert_eq!(loaded_state.scale, 1.5);
        assert_eq!(stats.orphan_file_count, 1);
        assert_eq!(renamed.name, "重命名.pdf");
        assert_eq!(cleanup.deleted_orphan_file_count, 1);
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
}
