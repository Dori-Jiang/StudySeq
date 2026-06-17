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
    pub recent_open: Option<RecentMaterialOpenSummary>,
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
    #[serde(skip_serializing)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialDeletionReport {
    pub failed_cleanup_path_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialReadingState {
    pub material_id: String,
    pub page_number: i64,
    pub scale: f64,
    pub last_opened_at: Option<String>,
    pub position_kind: MaterialOpenPositionKind,
    pub video_position_seconds: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMaterialReadingStateInput {
    pub material_id: String,
    pub page_number: i64,
    pub scale: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVideoPlaybackStateInput {
    pub material_id: String,
    pub position_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialOpenPositionKind {
    None,
    PdfPage,
    VideoSecond,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentMaterialOpenSummary {
    pub material_id: String,
    pub material_name: String,
    pub opened_at: String,
    pub position: RecentMaterialOpenPosition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RecentMaterialOpenPosition {
    None,
    PdfPage { page_number: i64 },
    VideoSecond { seconds: f64 },
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
    pub orphan_database_record_count: i64,
    pub orphan_bytes: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryCleanupReport {
    pub deleted_orphan_file_count: i64,
    pub deleted_orphan_database_record_count: i64,
    pub deleted_bytes: i64,
    pub failed_path_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryLocation {
    pub path: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryLocationChangeReport {
    pub location: MaterialLibraryLocation,
    pub failed_cleanup_path_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialLibraryLocationCandidate {
    pub token: String,
    pub display_path: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MaterialLibraryLocationChangeInput {
    Selected { token: String },
    Default,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameMaterialItemInput {
    pub material_id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameMaterialItemReport {
    pub material: MaterialItem,
    pub failed_cleanup_path_count: i64,
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
pub struct HandwritingNoteSummary {
    pub id: String,
    pub learning_content_id: String,
    pub title: String,
    pub stroke_schema_version: i64,
    pub canvas_width: f64,
    pub canvas_height: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandwritingNote {
    pub id: String,
    pub learning_content_id: String,
    pub title: String,
    pub stroke_data_json: String,
    pub stroke_schema_version: i64,
    pub canvas_width: f64,
    pub canvas_height: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPageAnnotation {
    pub id: String,
    pub material_id: String,
    pub page_number: i64,
    pub stroke_data_json: String,
    pub stroke_schema_version: i64,
    pub page_width: f64,
    pub page_height: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavePdfPageAnnotationInput {
    pub material_id: String,
    pub page_number: i64,
    pub page_width: f64,
    pub page_height: f64,
    pub stroke_data: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningDetail {
    pub learning_content: LearningContent,
    pub materials: Vec<MaterialItem>,
    pub notes: Vec<Note>,
    pub handwriting_notes: Vec<HandwritingNoteSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialPreviewKind {
    Text,
    Code,
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
    pub asset_path: Option<String>,
    pub encoding: Option<String>,
    pub language: Option<String>,
    pub language_label: Option<String>,
    pub line_count: Option<i64>,
    pub is_truncated: bool,
    pub highlighting_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMaterialFileInput {
    pub learning_content_id: String,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHandwritingNoteInput {
    pub learning_content_id: String,
    pub title: String,
    pub stroke_data_json: String,
    pub canvas_width: f64,
    pub canvas_height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHandwritingNoteInput {
    pub learning_content_id: String,
    pub note_id: String,
    pub title: String,
    pub stroke_data_json: String,
    pub canvas_width: f64,
    pub canvas_height: f64,
}
