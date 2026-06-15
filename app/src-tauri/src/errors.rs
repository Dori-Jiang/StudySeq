use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("学习内容名称不能为空")]
    EmptyName,
    #[error("学习进度必须在 0 到 100 之间")]
    InvalidProgress,
    #[error("预计工时不能小于 0")]
    InvalidEstimatedHours,
    #[error("学习内容不存在")]
    LearningContentNotFound,
    #[error("资料文件不存在")]
    SourceFileMissing,
    #[error("资料副本不存在")]
    MaterialFileMissing,
    #[error("文本资料过大，无法预览")]
    TextPreviewTooLarge,
    #[error("资料不存在")]
    MaterialNotFound,
    #[error("资料名称不能为空")]
    EmptyMaterialName,
    #[error("资料名称不能包含路径")]
    InvalidMaterialName,
    #[error("资料路径超出 App 管理目录")]
    MaterialPathOutsideLibrary,
    #[error("文件夹不存在")]
    FolderNotFound,
    #[error("无法移动到该位置")]
    InvalidMoveTarget,
    #[error("播放位置无效")]
    InvalidPlaybackPosition,
    #[error("资料库位置无效")]
    InvalidMaterialLibraryLocation,
    #[error("资料库迁移失败")]
    MaterialLibraryMigrationFailed,
    #[error("资料重命名回滚失败")]
    MaterialRenameRollbackFailed,
    #[error("笔记标题不能为空")]
    EmptyNoteTitle,
    #[error("笔记不存在")]
    NoteNotFound,
    #[error("数据库错误：{0}")]
    Database(#[from] rusqlite::Error),
    #[error("文件系统错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("应用状态不可用")]
    StateUnavailable,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for ApiError {
    fn from(error: AppError) -> Self {
        Self {
            code: error.code(),
            message: error.user_message().to_string(),
        }
    }
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            AppError::EmptyName => "empty_name",
            AppError::InvalidProgress => "invalid_progress",
            AppError::InvalidEstimatedHours => "invalid_estimated_hours",
            AppError::LearningContentNotFound => "learning_content_not_found",
            AppError::SourceFileMissing => "source_file_missing",
            AppError::MaterialFileMissing => "material_file_missing",
            AppError::TextPreviewTooLarge => "text_preview_too_large",
            AppError::MaterialNotFound => "material_not_found",
            AppError::EmptyMaterialName => "empty_material_name",
            AppError::InvalidMaterialName => "invalid_material_name",
            AppError::MaterialPathOutsideLibrary => "material_path_outside_library",
            AppError::FolderNotFound => "folder_not_found",
            AppError::InvalidMoveTarget => "invalid_move_target",
            AppError::InvalidPlaybackPosition => "invalid_playback_position",
            AppError::InvalidMaterialLibraryLocation => "invalid_material_library_location",
            AppError::MaterialLibraryMigrationFailed => "material_library_migration_failed",
            AppError::MaterialRenameRollbackFailed => "material_rename_rollback_failed",
            AppError::EmptyNoteTitle => "empty_note_title",
            AppError::NoteNotFound => "note_not_found",
            AppError::Database(_) => "database_error",
            AppError::Io(_) => "file_system_error",
            AppError::StateUnavailable => "state_unavailable",
        }
    }

    fn user_message(&self) -> &'static str {
        match self {
            AppError::EmptyName => "学习内容名称不能为空",
            AppError::InvalidProgress => "学习进度必须在 0 到 100 之间",
            AppError::InvalidEstimatedHours => "预计工时不能小于 0",
            AppError::LearningContentNotFound => "学习内容不存在",
            AppError::SourceFileMissing => "资料文件不存在",
            AppError::MaterialFileMissing => "资料副本不存在，请重新导入",
            AppError::TextPreviewTooLarge => "文本资料过大，无法在 App 内预览",
            AppError::MaterialNotFound => "资料不存在",
            AppError::EmptyMaterialName => "资料名称不能为空",
            AppError::InvalidMaterialName => "资料名称不能包含路径",
            AppError::MaterialPathOutsideLibrary => "资料路径超出 App 管理目录，已拒绝访问",
            AppError::FolderNotFound => "文件夹不存在",
            AppError::InvalidMoveTarget => "无法移动到该位置",
            AppError::InvalidPlaybackPosition => "播放位置无效",
            AppError::InvalidMaterialLibraryLocation => {
                "资料库位置无效，请选择一个可写入的位置，App 会使用其中的 StudySeqData\\materials 目录"
            }
            AppError::MaterialLibraryMigrationFailed => "资料库迁移失败，原资料库仍保持可用",
            AppError::MaterialRenameRollbackFailed => {
                "资料重命名失败，且文件回滚未完成，请先不要继续操作该资料"
            }
            AppError::EmptyNoteTitle => "笔记标题不能为空",
            AppError::NoteNotFound => "笔记不存在",
            AppError::Database(_) => "数据库操作失败，请稍后重试",
            AppError::Io(_) => "文件系统操作失败，请确认文件仍可访问",
            AppError::StateUnavailable => "应用状态不可用",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_error_hides_database_and_io_details() {
        let database_error = ApiError::from(AppError::Database(
            rusqlite::Error::InvalidColumnName("stored_path".to_string()),
        ));
        assert_eq!(database_error.code, "database_error");
        assert_eq!(database_error.message, "数据库操作失败，请稍后重试");
        assert!(!database_error.message.contains("stored_path"));

        let io_error = ApiError::from(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "C:\\Users\\123\\secret.txt",
        )));
        assert_eq!(io_error.code, "file_system_error");
        assert_eq!(io_error.message, "文件系统操作失败，请确认文件仍可访问");
        assert!(!io_error.message.contains("C:\\"));
    }
}
