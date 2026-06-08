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
    #[error("资料不存在")]
    MaterialNotFound,
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
    pub message: String,
}

impl From<AppError> for ApiError {
    fn from(error: AppError) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}
