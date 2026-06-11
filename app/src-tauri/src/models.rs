use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StudyStatus {
    Planned,
    Active,
    Paused,
    Completed,
    Overdue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningContent {
    pub id: String,
    pub name: String,
    pub status: StudyStatus,
    pub deadline: Option<String>,
    pub estimated_hours: f64,
    pub progress: i64,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLearningContentInput {
    pub name: String,
    pub deadline: Option<String>,
    pub estimated_hours: Option<f64>,
    pub progress: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLearningContentInput {
    pub id: String,
    pub name: String,
    pub status: StudyStatus,
    pub deadline: Option<String>,
    pub estimated_hours: f64,
    pub progress: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialKind {
    File,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialItem {
    pub id: String,
    pub learning_content_id: String,
    pub parent_id: Option<String>,
    pub kind: MaterialKind,
    pub name: String,
    pub original_path: Option<String>,
    pub stored_path: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaterialFolderInput {
    pub learning_content_id: String,
    pub parent_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveMaterialItemInput {
    pub material_id: String,
    pub new_parent_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSubtreeCount {
    pub file_count: i64,
    pub folder_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialReadingState {
    pub material_id: String,
    pub page_number: i64,
    pub scale: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMaterialReadingStateInput {
    pub material_id: String,
    pub page_number: i64,
    pub scale: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryStats {
    pub material_count: i64,
    pub referenced_bytes: i64,
    pub actual_referenced_bytes: i64,
    pub library_bytes: i64,
    pub missing_file_count: i64,
    pub orphan_file_count: i64,
    pub orphan_bytes: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryCleanupReport {
    pub deleted_orphan_file_count: i64,
    pub deleted_orphan_database_record_count: i64,
    pub deleted_bytes: i64,
    pub failed_paths: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameMaterialItemInput {
    pub material_id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub learning_content_id: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningDetail {
    pub learning_content: LearningContent,
    pub materials: Vec<MaterialItem>,
    pub notes: Vec<Note>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialPreviewKind {
    Text,
    Image,
    Pdf,
    Video,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialPreview {
    pub material_id: String,
    pub kind: MaterialPreviewKind,
    pub mime_type: Option<String>,
    pub text: Option<String>,
    pub data_url: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMaterialFileInput {
    pub learning_content_id: String,
    pub source_path: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub learning_content_id: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteInput {
    pub note_id: String,
    pub title: String,
    pub body: String,
}
