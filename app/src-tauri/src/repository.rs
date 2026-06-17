use std::{
    collections::HashSet,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};

use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use chrono::Utc;
use encoding_rs::UTF_8;
use office2pdf::config::{ConvertOptions, Format, PaperSize};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::{
    CreateHandwritingNoteInput, CreateLearningContentInput, HandwritingNote,
    HandwritingNoteSummary, LearningContent, LearningDetail, MaterialDeletionReport, MaterialItem,
    MaterialKind, MaterialLibraryCleanupReport, MaterialLibraryLocation,
    MaterialLibraryLocationChangeReport, MaterialLibraryStats, MaterialOpenPositionKind,
    MaterialPreview, MaterialPreviewKind, MaterialReadingState, MaterialSubtreeCount, Note,
    PdfPageAnnotation, RecentMaterialOpenPosition, RecentMaterialOpenSummary,
    RenameMaterialItemReport, SavePdfPageAnnotationInput, StudyStatus, UpdateHandwritingNoteInput,
};

pub struct LearningContentRepository {
    connection: Connection,
}

const OFFICE_CONVERSION_MAX_BYTES: u64 = 50 * 1024 * 1024;
const XLSX_DERIVED_PDF_CACHE_DIR: &str = "office-pdf-xlsx-wide-v1";
const XLSX_PREVIEW_WIDTH_PT: f64 = 1190.56;
const XLSX_PREVIEW_HEIGHT_PT: f64 = 841.89;
const CODE_HIGHLIGHT_MAX_BYTES: u64 = 1024 * 1024;
const CODE_PREVIEW_MAX_BYTES: u64 = 2 * 1024 * 1024;
const CODE_PREVIEW_MAX_LINES: usize = 20_000;
const HANDWRITING_SCHEMA_VERSION: i64 = 1;
const HANDWRITING_DATA_MAX_BYTES: usize = 5 * 1024 * 1024;
const HANDWRITING_MAX_STROKES: usize = 2_000;
const HANDWRITING_MAX_POINTS: usize = 100_000;
const HANDWRITING_MAX_WIDTH: f64 = 0.2;
const NOTE_TITLE_MAX_CHARS: usize = 200;
const HANDWRITING_CANVAS_MAX_SIZE: f64 = 10_000.0;
const PDF_ANNOTATION_PAGE_MAX_SIZE: f64 = 50_000.0;

#[derive(Debug)]
pub struct MaterialLibraryLocationChangePlan {
    pub location: MaterialLibraryLocation,
    pub previous_dir: PathBuf,
    cleanup_plan: Vec<MaterialLibraryMigrationFile>,
}

impl MaterialLibraryLocationChangePlan {
    pub fn cleanup_old_files(self) -> MaterialLibraryLocationChangeReport {
        let cleanup_failed_count =
            cleanup_migrated_material_files(&self.cleanup_plan, &self.previous_dir);
        if cleanup_failed_count > 0 {
            eprintln!(
                "material library migration left {cleanup_failed_count} old file(s) for retry"
            );
        }

        MaterialLibraryLocationChangeReport {
            location: self.location,
            failed_cleanup_path_count: cleanup_failed_count as i64,
        }
    }
}

const MATERIAL_LIBRARY_DIR_SETTING_KEY: &str = "material_library_dir";
const MAX_TEXT_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;

impl LearningContentRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, AppError> {
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connection = Connection::open(path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        let repository = Self { connection };
        repository.migrate()?;
        Ok(repository)
    }

    pub fn create(&self, input: CreateLearningContentInput) -> Result<LearningContent, AppError> {
        let name = input.name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::EmptyName);
        }

        let progress = input.progress.unwrap_or(0);
        if !(0..=100).contains(&progress) {
            return Err(AppError::InvalidProgress);
        }

        let estimated_hours = input.estimated_hours.unwrap_or(0.0);
        if estimated_hours < 0.0 {
            return Err(AppError::InvalidEstimatedHours);
        }

        let now = Utc::now().to_rfc3339();
        let content = LearningContent {
            id: Uuid::new_v4().to_string(),
            name,
            status: StudyStatus::Planned,
            deadline: input.deadline,
            estimated_hours,
            progress,
            created_at: now.clone(),
            updated_at: now,
            last_opened_at: None,
            recent_open: None,
        };

        self.connection.execute(
            "INSERT INTO learning_contents (
                id, name, status, deadline, estimated_hours, progress, created_at, updated_at, last_opened_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                content.id,
                content.name,
                status_to_str(&content.status),
                content.deadline,
                content.estimated_hours,
                content.progress,
                content.created_at,
                content.updated_at,
                content.last_opened_at,
            ],
        )?;

        Ok(content)
    }

    pub fn list(&self) -> Result<Vec<LearningContent>, AppError> {
        self.list_contents_with_recent_open(None)
    }

    pub fn list_with_material_library(
        &self,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<Vec<LearningContent>, AppError> {
        self.list_contents_with_recent_open(Some(material_library_dir.as_ref()))
    }

    fn list_contents_with_recent_open(
        &self,
        material_library_dir: Option<&Path>,
    ) -> Result<Vec<LearningContent>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, name, status, deadline, estimated_hours, progress, created_at, updated_at, last_opened_at
             FROM learning_contents
             ORDER BY updated_at DESC",
        )?;

        let rows = statement.query_map([], |row| {
            Ok(LearningContent {
                id: row.get(0)?,
                name: row.get(1)?,
                status: status_from_str(row.get::<_, String>(2)?.as_str()),
                deadline: row.get(3)?,
                estimated_hours: row.get(4)?,
                progress: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                last_opened_at: row.get(8)?,
                recent_open: None,
            })
        })?;

        let mut contents = rows.collect::<Result<Vec<_>, _>>()?;
        for content in &mut contents {
            content.recent_open =
                self.get_recent_material_open_summary(&content.id, material_library_dir)?;
        }

        Ok(contents)
    }

    pub fn update_learning_content(
        &self,
        id: &str,
        name: String,
        status: StudyStatus,
        deadline: Option<String>,
        estimated_hours: f64,
        progress: i64,
    ) -> Result<LearningContent, AppError> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::EmptyName);
        }

        if estimated_hours < 0.0 {
            return Err(AppError::InvalidEstimatedHours);
        }

        if !(0..=100).contains(&progress) {
            return Err(AppError::InvalidProgress);
        }

        let Some(existing) = self.get_learning_content(id)? else {
            return Err(AppError::LearningContentNotFound);
        };

        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE learning_contents
             SET name = ?1, status = ?2, deadline = ?3, estimated_hours = ?4, progress = ?5, updated_at = ?6
             WHERE id = ?7",
            params![
                name,
                status_to_str(&status),
                deadline,
                estimated_hours,
                progress,
                now,
                id
            ],
        )?;

        let recent_open = self.get_recent_material_open_summary(id, None)?;
        Ok(LearningContent {
            name,
            status,
            progress,
            deadline,
            estimated_hours,
            updated_at: now,
            recent_open,
            ..existing
        })
    }

    pub fn get_detail(&self, id: &str) -> Result<Option<LearningDetail>, AppError> {
        let learning_content = self.get_learning_content(id)?;
        let Some(learning_content) = learning_content else {
            return Ok(None);
        };

        Ok(Some(LearningDetail {
            materials: self.list_materials(id)?,
            notes: self.list_notes(id)?,
            handwriting_notes: self.list_handwriting_note_summaries(id)?,
            learning_content,
        }))
    }

    pub fn delete_learning_content(
        &self,
        id: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialDeletionReport, AppError> {
        // 按表批量删除而不是逐项递归，避免文件夹子树被重复删除报 MaterialNotFound
        let materials = self.list_materials(id)?;
        let file_cleanup_paths =
            collect_material_file_cleanup_paths(&materials, material_library_dir.as_ref())?;
        // DB 删除段单事务提交，避免中途崩溃留下悬空记录
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM material_reading_states WHERE material_id IN (
                SELECT id FROM material_items WHERE learning_content_id = ?1
            )",
            params![id],
        )?;
        transaction.execute(
            "DELETE FROM pdf_page_annotations WHERE material_id IN (
                SELECT id FROM material_items WHERE learning_content_id = ?1
            )",
            params![id],
        )?;
        transaction.execute(
            "DELETE FROM material_items WHERE learning_content_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "DELETE FROM notes WHERE learning_content_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "DELETE FROM handwriting_notes WHERE learning_content_id = ?1",
            params![id],
        )?;
        transaction.execute("DELETE FROM learning_contents WHERE id = ?1", params![id])?;
        transaction.commit()?;
        Ok(MaterialDeletionReport {
            failed_cleanup_path_count: remove_material_file_paths_best_effort(&file_cleanup_paths)
                as i64,
        })
    }

    pub fn import_material_file(
        &self,
        learning_content_id: &str,
        source_path: impl AsRef<Path>,
        material_library_dir: impl AsRef<Path>,
        parent_id: Option<&str>,
    ) -> Result<MaterialItem, AppError> {
        if self.get_learning_content(learning_content_id)?.is_none() {
            return Err(AppError::LearningContentNotFound);
        }
        self.ensure_folder_in_content(learning_content_id, parent_id)?;

        let source_path = source_path.as_ref();
        if !source_path.exists() {
            return Err(AppError::SourceFileMissing);
        }

        let original_name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(AppError::SourceFileMissing)?;
        let material_dir = material_library_dir.as_ref().join(learning_content_id);
        std::fs::create_dir_all(&material_dir)?;
        let display_name =
            self.next_sibling_material_name(learning_content_id, parent_id, original_name, None)?;
        let stored_path = next_available_path(&material_dir, &display_name);
        std::fs::copy(source_path, &stored_path)?;

        let metadata = std::fs::metadata(&stored_path)?;
        let now = Utc::now().to_rfc3339();
        let material = MaterialItem {
            id: Uuid::new_v4().to_string(),
            learning_content_id: learning_content_id.to_string(),
            parent_id: parent_id.map(|value| value.to_string()),
            kind: MaterialKind::File,
            name: display_name,
            original_path: Some(source_path.to_string_lossy().to_string()),
            stored_path: Some(stored_path.to_string_lossy().to_string()),
            mime_type: guess_mime_type(source_path),
            size_bytes: metadata.len() as i64,
            created_at: now.clone(),
            updated_at: now,
        };

        self.insert_material_item(&material)?;

        Ok(material)
    }

    /// 在指定学习内容的指定父级（None 为根）下创建逻辑文件夹。
    /// 文件夹不在磁盘创建对应目录；同级重名自动追加 ` (n)` 后缀。
    pub fn create_material_folder(
        &self,
        learning_content_id: &str,
        parent_id: Option<&str>,
        name: &str,
    ) -> Result<MaterialItem, AppError> {
        if self.get_learning_content(learning_content_id)?.is_none() {
            return Err(AppError::LearningContentNotFound);
        }
        self.ensure_folder_in_content(learning_content_id, parent_id)?;

        let requested_name = validate_material_file_name(name)?;
        let display_name =
            self.next_sibling_material_name(learning_content_id, parent_id, requested_name, None)?;

        let now = Utc::now().to_rfc3339();
        let folder = MaterialItem {
            id: Uuid::new_v4().to_string(),
            learning_content_id: learning_content_id.to_string(),
            parent_id: parent_id.map(|value| value.to_string()),
            kind: MaterialKind::Folder,
            name: display_name,
            original_path: None,
            stored_path: None,
            mime_type: None,
            size_bytes: 0,
            created_at: now.clone(),
            updated_at: now,
        };

        self.insert_material_item(&folder)?;

        Ok(folder)
    }

    /// 把资料或文件夹移动到新父级（None 为根）。
    /// 目标必须是同一学习内容下的文件夹；禁止把文件夹移入自身或其后代；
    /// 目标内重名自动追加后缀。纯 DB 操作，不移动磁盘文件。
    pub fn move_material_item(
        &self,
        material_id: &str,
        new_parent_id: Option<&str>,
    ) -> Result<MaterialItem, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };

        if let Some(target_id) = new_parent_id {
            let Some(target) = self.get_material(target_id)? else {
                return Err(AppError::FolderNotFound);
            };
            if target.kind != MaterialKind::Folder
                || target.learning_content_id != material.learning_content_id
            {
                return Err(AppError::InvalidMoveTarget);
            }
            // 禁止把文件夹移入自身或其后代：从目标沿 parent 链上溯。
            // visited 集合防御损坏数据中的 parent 环。
            if material.kind == MaterialKind::Folder {
                let mut visited = std::collections::HashSet::new();
                let mut cursor = Some(target.id.clone());
                while let Some(current_id) = cursor {
                    if current_id == material.id || !visited.insert(current_id.clone()) {
                        return Err(AppError::InvalidMoveTarget);
                    }
                    cursor = self
                        .get_material(&current_id)?
                        .and_then(|item| item.parent_id);
                }
            }
        }

        let display_name = self.next_sibling_material_name(
            &material.learning_content_id,
            new_parent_id,
            &material.name,
            Some(&material.id),
        )?;
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE material_items SET parent_id = ?1, name = ?2, updated_at = ?3 WHERE id = ?4",
            params![new_parent_id, display_name, now, material.id],
        )?;

        Ok(MaterialItem {
            parent_id: new_parent_id.map(|value| value.to_string()),
            name: display_name,
            updated_at: now,
            ..material
        })
    }

    /// 统计子树内的文件数与文件夹数，不含根节点自身（供删除确认文案使用）。
    pub fn count_material_subtree(
        &self,
        material_id: &str,
    ) -> Result<MaterialSubtreeCount, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };

        let subtree = self.collect_material_subtree(&material)?;
        let mut count = MaterialSubtreeCount {
            file_count: 0,
            folder_count: 0,
        };
        for item in subtree.iter().filter(|item| item.id != material.id) {
            match item.kind {
                MaterialKind::File => count.file_count += 1,
                MaterialKind::Folder => count.folder_count += 1,
            }
        }

        Ok(count)
    }

    pub fn delete_material_item(
        &self,
        material_id: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialDeletionReport, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };

        // 文件夹是纯逻辑层级：先递归收集子树，文件行删磁盘副本，所有行删记录与阅读状态
        let mut subtree = self.collect_material_subtree(&material)?;
        let file_cleanup_paths =
            collect_material_file_cleanup_paths(&subtree, material_library_dir.as_ref())?;
        let depths = subtree
            .iter()
            .map(|item| (item.id.clone(), material_depth(item, &subtree)))
            .collect::<std::collections::HashMap<_, _>>();
        subtree.sort_by_key(|item| std::cmp::Reverse(*depths.get(&item.id).unwrap_or(&0)));

        // DB 删除段单事务提交，避免中途崩溃留下悬空的子树记录
        let transaction = self.connection.unchecked_transaction()?;
        for item in &subtree {
            transaction.execute(
                "DELETE FROM material_reading_states WHERE material_id = ?1",
                params![item.id],
            )?;
            transaction.execute(
                "DELETE FROM pdf_page_annotations WHERE material_id = ?1",
                params![item.id],
            )?;
            transaction.execute("DELETE FROM material_items WHERE id = ?1", params![item.id])?;
        }
        transaction.commit()?;
        let failed_cleanup_path_count =
            remove_material_file_paths_best_effort(&file_cleanup_paths) as i64;

        Ok(MaterialDeletionReport {
            failed_cleanup_path_count,
        })
    }

    pub fn rename_material_item(
        &self,
        material_id: &str,
        name: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<RenameMaterialItemReport, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };
        let requested_name = validate_material_file_name(name)?;
        let display_name = self.next_sibling_material_name(
            &material.learning_content_id,
            material.parent_id.as_deref(),
            requested_name,
            Some(&material.id),
        )?;

        // 文件夹无磁盘实体，纯 DB 改名
        if material.kind == MaterialKind::Folder {
            let now = Utc::now().to_rfc3339();
            self.connection.execute(
                "UPDATE material_items SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![display_name, now, material.id],
            )?;
            return Ok(RenameMaterialItemReport {
                material: MaterialItem {
                    name: display_name,
                    updated_at: now,
                    ..material
                },
                failed_cleanup_path_count: 0,
            });
        }

        let Some(stored_path) = material.stored_path.as_deref() else {
            return Err(AppError::MaterialNotFound);
        };
        let source_path = PathBuf::from(stored_path);
        // 与删除链路同一标准：来自 DB 的 stored_path 触发文件系统变更前必须确认在资料库目录内
        if !is_path_inside_directory(&source_path, material_library_dir.as_ref())? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        let Some(parent_dir) = source_path.parent() else {
            return Err(AppError::MaterialNotFound);
        };
        let target_path = next_available_path(parent_dir, &display_name);
        if source_path != target_path {
            std::fs::rename(&source_path, &target_path)?;
        }

        let resolved_legacy_mime_type = material
            .mime_type
            .as_deref()
            .filter(|mime_type| *mime_type == "application/octet-stream")
            .and_then(|_| guess_mime_type(&source_path))
            .filter(|mime_type| mime_type != "application/octet-stream");
        let next_mime_type = resolved_legacy_mime_type
            .clone()
            .or_else(|| material.mime_type.clone());
        let should_cleanup_derived_pdfs = office_format_for_material(&material).is_some()
            || office_format_for_path(&target_path).is_some();
        let now = Utc::now().to_rfc3339();
        let metadata = match std::fs::metadata(&target_path) {
            Ok(metadata) => metadata,
            Err(error) => {
                rollback_material_rename(&source_path, &target_path)?;
                return Err(AppError::Io(error));
            }
        };
        let update_result = self.connection.execute(
            "UPDATE material_items
             SET name = ?1, stored_path = ?2, mime_type = ?3, size_bytes = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                display_name,
                target_path.to_string_lossy().to_string(),
                next_mime_type,
                metadata.len() as i64,
                now,
                material.id,
            ],
        );

        if let Err(error) = update_result {
            rollback_material_rename(&source_path, &target_path)?;
            return Err(AppError::Database(error));
        }

        let failed_cleanup_path_count = if should_cleanup_derived_pdfs {
            remove_material_file_paths_best_effort(&derived_office_pdf_cache_paths(
                material_library_dir.as_ref(),
                &material,
            )?) as i64
        } else {
            0
        };

        Ok(RenameMaterialItemReport {
            material: MaterialItem {
                name: display_name,
                stored_path: Some(target_path.to_string_lossy().to_string()),
                mime_type: next_mime_type,
                size_bytes: metadata.len() as i64,
                updated_at: now,
                ..material
            },
            failed_cleanup_path_count,
        })
    }

    pub fn create_note(
        &self,
        learning_content_id: &str,
        title: String,
        body: String,
    ) -> Result<Note, AppError> {
        if self.get_learning_content(learning_content_id)?.is_none() {
            return Err(AppError::LearningContentNotFound);
        }

        let title = validate_note_title(title)?;

        let now = Utc::now().to_rfc3339();
        let note = Note {
            id: Uuid::new_v4().to_string(),
            learning_content_id: learning_content_id.to_string(),
            title,
            body,
            created_at: now.clone(),
            updated_at: now,
        };

        self.connection.execute(
            "INSERT INTO notes (
                id, learning_content_id, title, body, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                note.id,
                note.learning_content_id,
                note.title,
                note.body,
                note.created_at,
                note.updated_at,
            ],
        )?;

        Ok(note)
    }

    pub fn update_note(
        &self,
        note_id: &str,
        title: String,
        body: String,
    ) -> Result<Note, AppError> {
        let title = validate_note_title(title)?;

        let Some(existing) = self.get_note(note_id)? else {
            return Err(AppError::NoteNotFound);
        };

        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE notes
             SET title = ?1, body = ?2, updated_at = ?3
             WHERE id = ?4",
            params![title, body, now, note_id],
        )?;

        Ok(Note {
            title,
            body,
            updated_at: now,
            ..existing
        })
    }

    pub fn delete_note(&self, note_id: &str) -> Result<(), AppError> {
        if self.get_note(note_id)?.is_none() {
            return Err(AppError::NoteNotFound);
        }

        self.connection
            .execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
        Ok(())
    }

    pub fn list_handwriting_note_summaries(
        &self,
        learning_content_id: &str,
    ) -> Result<Vec<HandwritingNoteSummary>, AppError> {
        if self.get_learning_content(learning_content_id)?.is_none() {
            return Err(AppError::LearningContentNotFound);
        }

        self.list_handwriting_note_summaries_unchecked(learning_content_id)
    }

    pub fn get_handwriting_note(&self, note_id: &str) -> Result<Option<HandwritingNote>, AppError> {
        self.connection
            .query_row(
                "SELECT id, learning_content_id, title, stroke_data_json,
                        stroke_schema_version, canvas_width, canvas_height, created_at, updated_at
                 FROM handwriting_notes
                 WHERE id = ?1",
                params![note_id],
                handwriting_note_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn get_handwriting_note_in_content(
        &self,
        learning_content_id: &str,
        note_id: &str,
    ) -> Result<Option<HandwritingNote>, AppError> {
        self.connection
            .query_row(
                "SELECT id, learning_content_id, title, stroke_data_json,
                        stroke_schema_version, canvas_width, canvas_height, created_at, updated_at
                 FROM handwriting_notes
                 WHERE id = ?1 AND learning_content_id = ?2",
                params![note_id, learning_content_id],
                handwriting_note_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn create_handwriting_note(
        &self,
        input: CreateHandwritingNoteInput,
    ) -> Result<HandwritingNote, AppError> {
        if self
            .get_learning_content(&input.learning_content_id)?
            .is_none()
        {
            return Err(AppError::LearningContentNotFound);
        }

        let title = validate_note_title(input.title)?;
        validate_canvas_size(input.canvas_width, input.canvas_height)?;
        validate_handwriting_data(&input.stroke_data_json)?;

        let now = Utc::now().to_rfc3339();
        let note = HandwritingNote {
            id: Uuid::new_v4().to_string(),
            learning_content_id: input.learning_content_id,
            title,
            stroke_data_json: input.stroke_data_json,
            stroke_schema_version: HANDWRITING_SCHEMA_VERSION,
            canvas_width: input.canvas_width,
            canvas_height: input.canvas_height,
            created_at: now.clone(),
            updated_at: now,
        };

        self.connection.execute(
            "INSERT INTO handwriting_notes (
                id, learning_content_id, title, stroke_data_json, stroke_schema_version,
                canvas_width, canvas_height, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                note.id,
                note.learning_content_id,
                note.title,
                note.stroke_data_json,
                note.stroke_schema_version,
                note.canvas_width,
                note.canvas_height,
                note.created_at,
                note.updated_at,
            ],
        )?;

        Ok(note)
    }

    pub fn update_handwriting_note(
        &self,
        input: UpdateHandwritingNoteInput,
    ) -> Result<HandwritingNote, AppError> {
        let Some(existing) =
            self.get_handwriting_note_in_content(&input.learning_content_id, &input.note_id)?
        else {
            return Err(AppError::HandwritingNoteNotFound);
        };

        let title = validate_note_title(input.title)?;
        validate_canvas_size(input.canvas_width, input.canvas_height)?;
        validate_handwriting_data(&input.stroke_data_json)?;

        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE handwriting_notes
             SET title = ?1, stroke_data_json = ?2, stroke_schema_version = ?3,
                 canvas_width = ?4, canvas_height = ?5, updated_at = ?6
             WHERE id = ?7 AND learning_content_id = ?8",
            params![
                title,
                input.stroke_data_json,
                HANDWRITING_SCHEMA_VERSION,
                input.canvas_width,
                input.canvas_height,
                now,
                input.note_id,
                input.learning_content_id,
            ],
        )?;

        Ok(HandwritingNote {
            title,
            stroke_data_json: input.stroke_data_json,
            stroke_schema_version: HANDWRITING_SCHEMA_VERSION,
            canvas_width: input.canvas_width,
            canvas_height: input.canvas_height,
            updated_at: now,
            ..existing
        })
    }

    pub fn delete_handwriting_note(
        &self,
        learning_content_id: &str,
        note_id: &str,
    ) -> Result<(), AppError> {
        let deleted = self.connection.execute(
            "DELETE FROM handwriting_notes WHERE id = ?1 AND learning_content_id = ?2",
            params![note_id, learning_content_id],
        )?;
        if deleted == 0 {
            return Err(AppError::HandwritingNoteNotFound);
        }
        Ok(())
    }

    pub fn get_pdf_page_annotation(
        &self,
        material_id: &str,
        page_number: i64,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<Option<PdfPageAnnotation>, AppError> {
        self.ensure_pdf_annotatable_material(material_id, material_library_dir.as_ref())?;
        if page_number < 1 {
            return Err(AppError::InvalidPdfAnnotationData);
        }

        self.connection
            .query_row(
                "SELECT id, material_id, page_number, stroke_data_json, stroke_schema_version,
                        page_width, page_height, created_at, updated_at
                 FROM pdf_page_annotations
                 WHERE material_id = ?1 AND page_number = ?2",
                params![material_id, page_number],
                pdf_page_annotation_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn save_pdf_page_annotation(
        &self,
        input: SavePdfPageAnnotationInput,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<PdfPageAnnotation, AppError> {
        self.ensure_pdf_annotatable_material(&input.material_id, material_library_dir.as_ref())?;
        validate_pdf_page_number(input.page_number)?;
        validate_pdf_page_size(input.page_width, input.page_height)?;
        validate_pdf_annotation_data(&input.stroke_data)?;

        if handwriting_data_is_empty(&input.stroke_data)? {
            self.delete_pdf_page_annotation_unchecked(&input.material_id, input.page_number)?;
            return Ok(PdfPageAnnotation {
                id: Uuid::new_v4().to_string(),
                material_id: input.material_id,
                page_number: input.page_number,
                stroke_data_json: input.stroke_data,
                stroke_schema_version: HANDWRITING_SCHEMA_VERSION,
                page_width: input.page_width,
                page_height: input.page_height,
                created_at: Utc::now().to_rfc3339(),
                updated_at: Utc::now().to_rfc3339(),
            });
        }

        let now = Utc::now().to_rfc3339();
        let existing_id: Option<String> = self
            .connection
            .query_row(
                "SELECT id FROM pdf_page_annotations WHERE material_id = ?1 AND page_number = ?2",
                params![input.material_id, input.page_number],
                |row| row.get(0),
            )
            .optional()?;
        let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());

        self.connection.execute(
            "INSERT INTO pdf_page_annotations (
                id, material_id, page_number, stroke_data_json, stroke_schema_version,
                page_width, page_height, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
            ON CONFLICT(material_id, page_number) DO UPDATE SET
                stroke_data_json = excluded.stroke_data_json,
                stroke_schema_version = excluded.stroke_schema_version,
                page_width = excluded.page_width,
                page_height = excluded.page_height,
                updated_at = excluded.updated_at",
            params![
                &id,
                &input.material_id,
                input.page_number,
                &input.stroke_data,
                HANDWRITING_SCHEMA_VERSION,
                input.page_width,
                input.page_height,
                &now,
            ],
        )?;

        self.get_pdf_page_annotation(&input.material_id, input.page_number, material_library_dir)?
            .ok_or(AppError::PdfAnnotationNotFound)
    }

    pub fn delete_pdf_page_annotation(
        &self,
        material_id: &str,
        page_number: i64,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<(), AppError> {
        self.ensure_pdf_annotatable_material(material_id, material_library_dir.as_ref())?;
        self.delete_pdf_page_annotation_unchecked(material_id, page_number)
    }

    fn delete_pdf_page_annotation_unchecked(
        &self,
        material_id: &str,
        page_number: i64,
    ) -> Result<(), AppError> {
        if page_number < 1 {
            return Err(AppError::InvalidPdfAnnotationData);
        }

        self.connection.execute(
            "DELETE FROM pdf_page_annotations WHERE material_id = ?1 AND page_number = ?2",
            params![material_id, page_number],
        )?;
        Ok(())
    }

    pub fn preview_material_file(
        &self,
        material_id: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialPreview, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };

        let Some(stored_path) = material.stored_path.clone() else {
            // 文件夹等无磁盘实体的行没有可预览内容
            return Ok(MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Unsupported,
                mime_type: None,
                text: None,
                data_url: None,
                asset_path: None,
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            });
        };
        let stored_path_buf = PathBuf::from(&stored_path);
        if !is_material_preview_path_inside_library(
            &stored_path_buf,
            material_library_dir.as_ref(),
        )? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        let mime_type = resolve_preview_mime(material.mime_type.as_deref(), &stored_path);
        let kind = preview_kind(mime_type.as_deref());
        if let Some(format) = office_format_for_material(&material) {
            ensure_material_file_exists(&stored_path_buf)?;
            let pdf_path = self.convert_office_material_to_pdf(
                &material,
                &stored_path_buf,
                material_library_dir.as_ref(),
                format,
            )?;
            self.record_material_open(&material.id)?;
            return Ok(MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Pdf,
                mime_type: Some("application/pdf".to_string()),
                text: None,
                data_url: None,
                asset_path: Some(pdf_path.to_string_lossy().to_string()),
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            });
        }
        if matches!(
            kind,
            MaterialPreviewKind::Image | MaterialPreviewKind::Pdf | MaterialPreviewKind::Video
        ) {
            ensure_material_file_exists(&stored_path_buf)?;
        }

        let preview = match kind {
            MaterialPreviewKind::Text => {
                let bytes = read_text_preview_bytes_with_limit(&stored_path_buf)?;
                let (text, encoding) = decode_text(&bytes);
                MaterialPreview {
                    material_id: material.id,
                    kind: MaterialPreviewKind::Text,
                    mime_type,
                    text: Some(text),
                    data_url: None,
                    asset_path: None,
                    encoding: Some(encoding),
                    language: None,
                    language_label: None,
                    line_count: None,
                    is_truncated: false,
                    highlighting_mode: None,
                }
            }
            MaterialPreviewKind::Code => {
                let language = code_language_for_material(&material, mime_type.as_deref());
                let language_id = language.as_ref().map(|value| value.id.to_string());
                let language_label = language.as_ref().map(|value| value.label.to_string());
                let preview = read_code_preview(&stored_path_buf, language.is_some())?;
                MaterialPreview {
                    material_id: material.id,
                    kind: MaterialPreviewKind::Code,
                    mime_type,
                    text: Some(preview.text),
                    data_url: None,
                    asset_path: None,
                    encoding: Some(preview.encoding),
                    language: language_id,
                    language_label,
                    line_count: Some(preview.line_count as i64),
                    is_truncated: preview.is_truncated,
                    highlighting_mode: Some(preview.highlighting_mode.to_string()),
                }
            }
            MaterialPreviewKind::Image => MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Image,
                mime_type,
                text: None,
                data_url: None,
                asset_path: Some(stored_path),
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            },
            // PDF/视频走前端 asset 协议读取，不把大文件通过 invoke 搬进前端
            MaterialPreviewKind::Pdf => MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Pdf,
                mime_type,
                text: None,
                data_url: None,
                asset_path: Some(stored_path),
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            },
            MaterialPreviewKind::Video => MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Video,
                mime_type,
                text: None,
                data_url: None,
                asset_path: Some(stored_path),
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            },
            MaterialPreviewKind::Unsupported => MaterialPreview {
                material_id: material.id,
                kind: MaterialPreviewKind::Unsupported,
                mime_type,
                text: None,
                data_url: None,
                asset_path: None,
                encoding: None,
                language: None,
                language_label: None,
                line_count: None,
                is_truncated: false,
                highlighting_mode: None,
            },
        };

        if preview.kind != MaterialPreviewKind::Unsupported {
            self.record_material_open(&preview.material_id)?;
        }

        Ok(preview)
    }

    fn convert_office_material_to_pdf(
        &self,
        material: &MaterialItem,
        source_path: &Path,
        material_library_dir: &Path,
        format: Format,
    ) -> Result<PathBuf, AppError> {
        let pdf_path = derived_office_pdf_path(material_library_dir, material)?;
        if is_fresh_derived_pdf(source_path, &pdf_path)? {
            return Ok(pdf_path);
        }

        let metadata = std::fs::metadata(source_path)?;
        if metadata.len() > OFFICE_CONVERSION_MAX_BYTES {
            return Err(AppError::OfficeConversionTooLarge);
        }

        if let Some(parent) = pdf_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let bytes = std::fs::read(source_path)?;
        let options = office_conversion_options(format);
        let result = office2pdf::convert_bytes(&bytes, format, &options)
            .map_err(|_| AppError::OfficeConversionFailed)?;
        if !result.pdf.starts_with(b"%PDF") {
            return Err(AppError::OfficeConversionFailed);
        }

        write_derived_pdf_atomically(&pdf_path, &result.pdf)?;
        Ok(pdf_path)
    }

    pub fn get_material_reading_state(
        &self,
        material_id: &str,
    ) -> Result<Option<MaterialReadingState>, AppError> {
        self.connection
            .query_row(
                "SELECT material_id, page_number, scale, last_opened_at, position_kind,
                        video_position_seconds, updated_at
                 FROM material_reading_states
                 WHERE material_id = ?1",
                params![material_id],
                |row| {
                    Ok(MaterialReadingState {
                        material_id: row.get(0)?,
                        page_number: row.get(1)?,
                        scale: row.get(2)?,
                        last_opened_at: row.get(3)?,
                        position_kind: material_open_position_kind_from_str(
                            row.get::<_, String>(4)?.as_str(),
                        ),
                        video_position_seconds: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn save_material_reading_state(
        &self,
        material_id: &str,
        page_number: i64,
        scale: f64,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialReadingState, AppError> {
        let material = self.ensure_previewable_file_material(material_id)?;
        let Some(stored_path) = material.stored_path.as_deref() else {
            return Err(AppError::MaterialNotFound);
        };
        let stored_path_buf = PathBuf::from(stored_path);
        if !is_material_preview_path_inside_library(
            &stored_path_buf,
            material_library_dir.as_ref(),
        )? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        let resolved_mime = resolve_preview_mime(material.mime_type.as_deref(), stored_path);
        if preview_kind(resolved_mime.as_deref()) != MaterialPreviewKind::Pdf
            && office_format_for_material(&material).is_none()
        {
            return Err(AppError::MaterialNotFound);
        }
        ensure_material_file_exists(&stored_path_buf)?;

        let page_number = page_number.max(1);
        let scale = scale.clamp(0.6, 2.4);
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO material_reading_states (
                material_id, page_number, scale, last_opened_at, position_kind,
                video_position_seconds, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 'pdf_page', NULL, ?4)
            ON CONFLICT(material_id) DO UPDATE SET
                page_number = excluded.page_number,
                scale = excluded.scale,
                last_opened_at = excluded.last_opened_at,
                position_kind = excluded.position_kind,
                video_position_seconds = excluded.video_position_seconds,
                updated_at = excluded.updated_at",
            params![material_id, page_number, scale, now],
        )?;

        Ok(MaterialReadingState {
            material_id: material_id.to_string(),
            page_number,
            scale,
            last_opened_at: Some(now.clone()),
            position_kind: MaterialOpenPositionKind::PdfPage,
            video_position_seconds: None,
            updated_at: now,
        })
    }

    pub fn save_video_playback_state(
        &self,
        material_id: &str,
        position_seconds: f64,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialReadingState, AppError> {
        let material = self.ensure_previewable_file_material(material_id)?;
        if !position_seconds.is_finite() || position_seconds < 0.0 {
            return Err(AppError::InvalidPlaybackPosition);
        }
        let Some(stored_path) = material.stored_path.as_deref() else {
            return Err(AppError::MaterialNotFound);
        };
        let stored_path_buf = PathBuf::from(stored_path);
        if !is_material_preview_path_inside_library(
            &stored_path_buf,
            material_library_dir.as_ref(),
        )? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        let resolved_mime = resolve_preview_mime(material.mime_type.as_deref(), stored_path);
        if preview_kind(resolved_mime.as_deref()) != MaterialPreviewKind::Video {
            return Err(AppError::MaterialNotFound);
        }
        ensure_material_file_exists(&stored_path_buf)?;

        let position_seconds = position_seconds.max(0.0);
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO material_reading_states (
                material_id, page_number, scale, last_opened_at, position_kind,
                video_position_seconds, updated_at
            ) VALUES (?1, 1, 1.0, NULL, 'video_second', ?2, ?3)
            ON CONFLICT(material_id) DO UPDATE SET
                position_kind = excluded.position_kind,
                video_position_seconds = excluded.video_position_seconds,
                updated_at = excluded.updated_at",
            params![material_id, position_seconds, now],
        )?;

        let state = self
            .get_material_reading_state(material_id)?
            .ok_or(AppError::MaterialNotFound)?;
        Ok(state)
    }

    pub fn record_material_open(
        &self,
        material_id: &str,
    ) -> Result<MaterialReadingState, AppError> {
        self.ensure_previewable_file_material(material_id)?;
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO material_reading_states (
                material_id, page_number, scale, last_opened_at, position_kind,
                video_position_seconds, updated_at
            ) VALUES (?1, 1, 1.0, ?2, 'none', NULL, ?2)
            ON CONFLICT(material_id) DO UPDATE SET
                last_opened_at = excluded.last_opened_at,
                updated_at = excluded.updated_at",
            params![material_id, now],
        )?;

        let state = self
            .get_material_reading_state(material_id)?
            .ok_or(AppError::MaterialNotFound)?;
        Ok(state)
    }

    pub fn get_material_library_stats(
        &self,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialLibraryStats, AppError> {
        let materials = self.list_all_materials()?;
        // folder 行没有磁盘实体，统计只看文件行
        let file_materials = materials
            .iter()
            .filter(|material| material.kind == MaterialKind::File)
            .collect::<Vec<_>>();
        let referenced_paths =
            referenced_material_library_paths(&file_materials, material_library_dir.as_ref())?;
        let referenced_bytes = file_materials
            .iter()
            .map(|material| material.size_bytes)
            .sum::<i64>();
        let mut actual_referenced_bytes = 0;
        let mut missing_file_count = 0;
        for path in &referenced_paths {
            match std::fs::metadata(path) {
                Ok(metadata) if metadata.is_file() => {
                    actual_referenced_bytes += metadata.len() as i64;
                }
                _ => {
                    missing_file_count += 1;
                }
            }
        }

        let library_scan = scan_material_library(material_library_dir.as_ref(), &referenced_paths)?;
        let orphan_database_record_count = self.list_orphan_materials()?.len() as i64;

        Ok(MaterialLibraryStats {
            material_count: file_materials.len() as i64,
            referenced_bytes,
            actual_referenced_bytes,
            library_bytes: library_scan.library_bytes,
            missing_file_count,
            orphan_file_count: library_scan.orphan_files.len() as i64,
            orphan_database_record_count,
            orphan_bytes: library_scan.orphan_bytes,
            updated_at: Utc::now().to_rfc3339(),
        })
    }

    pub fn get_material_library_location(
        &self,
        default_material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialLibraryLocation, AppError> {
        let default_path = default_material_library_dir.as_ref();
        let path = self
            .get_app_setting(MATERIAL_LIBRARY_DIR_SETTING_KEY)?
            .map(PathBuf::from)
            .unwrap_or_else(|| default_path.to_path_buf());
        validate_supported_material_library_location(&path, default_path)?;

        Ok(MaterialLibraryLocation {
            is_default: same_path_string(&path, default_path),
            path: path.to_string_lossy().to_string(),
        })
    }

    pub fn set_material_library_location(
        &self,
        current_material_library_dir: impl AsRef<Path>,
        default_material_library_dir: impl AsRef<Path>,
        target_material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialLibraryLocationChangePlan, AppError> {
        let current_dir = current_material_library_dir.as_ref();
        let default_dir = default_material_library_dir.as_ref();
        let target_dir = target_material_library_dir.as_ref();
        validate_supported_material_library_location(target_dir, default_dir)?;

        if same_path_string(current_dir, target_dir) {
            return Ok(MaterialLibraryLocationChangePlan {
                cleanup_plan: Vec::new(),
                previous_dir: current_dir.to_path_buf(),
                location: MaterialLibraryLocation {
                    path: current_dir.to_string_lossy().to_string(),
                    is_default: same_path_string(current_dir, default_dir),
                },
            });
        }

        let migration_plan =
            migrate_material_library_files(current_dir, target_dir, &self.list_all_materials()?)?;
        self.update_material_library_paths_and_setting(current_dir, default_dir, target_dir)?;

        Ok(MaterialLibraryLocationChangePlan {
            cleanup_plan: migration_plan,
            previous_dir: current_dir.to_path_buf(),
            location: MaterialLibraryLocation {
                path: target_dir.to_string_lossy().to_string(),
                is_default: same_path_string(target_dir, default_dir),
            },
        })
    }

    pub fn rollback_material_library_location(
        &self,
        current_material_library_dir: impl AsRef<Path>,
        default_material_library_dir: impl AsRef<Path>,
        previous_material_library_dir: impl AsRef<Path>,
    ) -> Result<(), AppError> {
        self.update_material_library_paths_and_setting(
            current_material_library_dir.as_ref(),
            default_material_library_dir.as_ref(),
            previous_material_library_dir.as_ref(),
        )
    }

    pub fn cleanup_material_library(
        &self,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialLibraryCleanupReport, AppError> {
        let material_library_dir = material_library_dir.as_ref();
        let materials = self.list_all_materials()?;
        let file_materials = materials
            .iter()
            .filter(|material| material.kind == MaterialKind::File)
            .collect::<Vec<_>>();
        let referenced_paths =
            referenced_material_library_paths(&file_materials, material_library_dir)?;
        let library_scan = scan_material_library(material_library_dir, &referenced_paths)?;
        let mut deleted_orphan_file_count = 0;
        let mut deleted_bytes = 0;
        let mut failed_path_count = 0;

        for orphan in library_scan.orphan_files {
            match std::fs::metadata(&orphan) {
                Ok(metadata) => {
                    let size = metadata.len() as i64;
                    match std::fs::remove_file(&orphan) {
                        Ok(()) => {
                            deleted_orphan_file_count += 1;
                            deleted_bytes += size;
                        }
                        Err(_) => failed_path_count += 1,
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => failed_path_count += 1,
            }
        }

        let orphan_materials = self.list_orphan_materials()?;
        let orphan_pdf_annotation_count = self.count_orphan_pdf_page_annotations()?;
        let orphan_material_file_paths =
            collect_material_file_cleanup_paths(&orphan_materials, material_library_dir)?;
        let deleted_orphan_database_record_count =
            orphan_materials.len() as i64 + orphan_pdf_annotation_count;
        if !orphan_materials.is_empty() || orphan_pdf_annotation_count > 0 {
            let transaction = self.connection.unchecked_transaction()?;
            for material in &orphan_materials {
                transaction.execute(
                    "DELETE FROM material_reading_states WHERE material_id = ?1",
                    params![material.id],
                )?;
                transaction.execute(
                    "DELETE FROM pdf_page_annotations WHERE material_id = ?1",
                    params![material.id],
                )?;
                transaction.execute(
                    "DELETE FROM material_items WHERE id = ?1",
                    params![material.id],
                )?;
            }
            transaction.execute(
                "DELETE FROM pdf_page_annotations
                 WHERE material_id NOT IN (SELECT id FROM material_items)",
                [],
            )?;
            transaction.commit()?;
        }
        for stored_path in orphan_material_file_paths {
            match std::fs::metadata(&stored_path) {
                Ok(metadata) => {
                    let size = metadata.len() as i64;
                    match std::fs::remove_file(&stored_path) {
                        Ok(()) => {
                            deleted_orphan_file_count += 1;
                            deleted_bytes += size;
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(_) => failed_path_count += 1,
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => failed_path_count += 1,
            }
        }

        Ok(MaterialLibraryCleanupReport {
            deleted_orphan_file_count,
            deleted_orphan_database_record_count,
            deleted_bytes,
            failed_path_count,
            updated_at: Utc::now().to_rfc3339(),
        })
    }

    #[cfg(test)]
    pub fn debug_count_materials(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM material_items", [], |row| row.get(0))
            .map_err(AppError::from)
    }

    #[cfg(test)]
    pub fn debug_count_notes(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .map_err(AppError::from)
    }

    #[cfg(test)]
    pub fn debug_count_handwriting_notes(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM handwriting_notes", [], |row| {
                row.get(0)
            })
            .map_err(AppError::from)
    }

    #[cfg(test)]
    pub fn debug_count_material_reading_states(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM material_reading_states", [], |row| {
                row.get(0)
            })
            .map_err(AppError::from)
    }

    #[cfg(test)]
    pub fn debug_count_pdf_page_annotations(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM pdf_page_annotations", [], |row| {
                row.get(0)
            })
            .map_err(AppError::from)
    }

    fn get_recent_material_open_summary(
        &self,
        learning_content_id: &str,
        material_library_dir: Option<&Path>,
    ) -> Result<Option<RecentMaterialOpenSummary>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT material_items.id, material_items.name, material_items.stored_path,
                        material_reading_states.last_opened_at,
                        material_reading_states.position_kind, material_reading_states.page_number,
                        material_reading_states.video_position_seconds
                 FROM material_reading_states
                 INNER JOIN material_items ON material_items.id = material_reading_states.material_id
                 WHERE material_items.learning_content_id = ?1
                   AND material_items.kind = 'file'
                   AND material_reading_states.last_opened_at IS NOT NULL
                 ORDER BY material_reading_states.last_opened_at DESC, material_reading_states.updated_at DESC
                 LIMIT 10",
        )?;
        let rows = statement.query_map(params![learning_content_id], |row| {
            let position_kind =
                material_open_position_kind_from_str(row.get::<_, String>(4)?.as_str());
            let page_number = row.get::<_, i64>(5)?;
            let video_position_seconds = row.get::<_, Option<f64>>(6)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                recent_open_position(position_kind, page_number, video_position_seconds),
            ))
        })?;

        for row in rows {
            let (material_id, material_name, stored_path, opened_at, position) = row?;
            if let Some(directory) = material_library_dir {
                let Some(stored_path) = stored_path.as_deref() else {
                    continue;
                };
                let stored_path_buf = PathBuf::from(stored_path);
                if !is_material_preview_path_inside_library(&stored_path_buf, directory)? {
                    continue;
                }
                match ensure_material_file_exists(&stored_path_buf) {
                    Ok(()) => {}
                    Err(AppError::MaterialFileMissing) => continue,
                    Err(error) => return Err(error),
                }
            }

            return Ok(Some(RecentMaterialOpenSummary {
                material_id,
                material_name,
                opened_at,
                position,
            }));
        }

        Ok(None)
    }

    fn get_learning_content(&self, id: &str) -> Result<Option<LearningContent>, AppError> {
        self.connection
            .query_row(
                "SELECT id, name, status, deadline, estimated_hours, progress, created_at, updated_at, last_opened_at
                 FROM learning_contents
                 WHERE id = ?1",
                params![id],
                |row| {
                    Ok(LearningContent {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        status: status_from_str(row.get::<_, String>(2)?.as_str()),
                        deadline: row.get(3)?,
                        estimated_hours: row.get(4)?,
                        progress: row.get(5)?,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                        last_opened_at: row.get(8)?,
                        recent_open: None,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    fn list_materials(&self, learning_content_id: &str) -> Result<Vec<MaterialItem>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, learning_content_id, parent_id, kind, name, original_path, stored_path,
                    mime_type, size_bytes, created_at, updated_at
             FROM material_items
             WHERE learning_content_id = ?1
             ORDER BY created_at ASC",
        )?;

        let rows = statement.query_map(params![learning_content_id], material_item_from_row)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn ensure_previewable_file_material(
        &self,
        material_id: &str,
    ) -> Result<MaterialItem, AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };
        if material.kind != MaterialKind::File {
            return Err(AppError::MaterialNotFound);
        }
        Ok(material)
    }

    fn ensure_pdf_annotatable_material(
        &self,
        material_id: &str,
        material_library_dir: &Path,
    ) -> Result<MaterialItem, AppError> {
        let material = self.ensure_previewable_file_material(material_id)?;
        let Some(stored_path) = material.stored_path.as_deref() else {
            return Err(AppError::MaterialNotFound);
        };
        let stored_path_buf = PathBuf::from(stored_path);
        if !is_material_preview_path_inside_library(&stored_path_buf, material_library_dir)? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }

        let resolved_mime = resolve_preview_mime(material.mime_type.as_deref(), stored_path);
        if preview_kind(resolved_mime.as_deref()) != MaterialPreviewKind::Pdf
            && office_format_for_material(&material).is_none()
        {
            return Err(AppError::MaterialNotFound);
        }
        ensure_material_file_exists(&stored_path_buf)?;

        Ok(material)
    }

    fn get_app_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        self.connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(AppError::from)
    }

    fn update_material_library_paths_and_setting(
        &self,
        current_dir: &Path,
        default_dir: &Path,
        target_dir: &Path,
    ) -> Result<(), AppError> {
        let transaction = self.connection.unchecked_transaction()?;
        let mut statement = transaction
            .prepare("SELECT id, stored_path FROM material_items WHERE stored_path IS NOT NULL")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let path_updates = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        for (material_id, stored_path) in path_updates {
            let old_path = PathBuf::from(stored_path);
            if has_relative_dir_component(&old_path) {
                return Err(AppError::MaterialPathOutsideLibrary);
            }
            if !is_path_inside_directory(&old_path, current_dir)? {
                return Err(AppError::MaterialPathOutsideLibrary);
            }
            let current_canonical = current_dir.canonicalize()?;
            let old_canonical = old_path.canonicalize()?;
            let relative_path = old_canonical
                .strip_prefix(current_canonical)
                .map_err(|_| AppError::MaterialPathOutsideLibrary)?;
            let new_path = target_dir.join(relative_path);
            if !is_material_preview_path_inside_library(&new_path, target_dir)? {
                return Err(AppError::MaterialPathOutsideLibrary);
            }
            transaction.execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![new_path.to_string_lossy().to_string(), material_id],
            )?;
        }

        if same_path_string(target_dir, default_dir) {
            transaction.execute(
                "DELETE FROM app_settings WHERE key = ?1",
                params![MATERIAL_LIBRARY_DIR_SETTING_KEY],
            )?;
        } else {
            transaction.execute(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at",
                params![
                    MATERIAL_LIBRARY_DIR_SETTING_KEY,
                    target_dir.to_string_lossy().to_string(),
                    Utc::now().to_rfc3339(),
                ],
            )?;
        }

        transaction.commit()?;
        Ok(())
    }

    fn get_material(&self, material_id: &str) -> Result<Option<MaterialItem>, AppError> {
        self.connection
            .query_row(
                "SELECT id, learning_content_id, parent_id, kind, name, original_path, stored_path,
                        mime_type, size_bytes, created_at, updated_at
                 FROM material_items
                 WHERE id = ?1",
                params![material_id],
                material_item_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    fn list_all_materials(&self) -> Result<Vec<MaterialItem>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, learning_content_id, parent_id, kind, name, original_path, stored_path,
                    mime_type, size_bytes, created_at, updated_at
             FROM material_items
             ORDER BY created_at ASC",
        )?;

        let rows = statement.query_map([], material_item_from_row)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn list_orphan_materials(&self) -> Result<Vec<MaterialItem>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT material_items.id, material_items.learning_content_id, material_items.parent_id,
                    material_items.kind, material_items.name, material_items.original_path,
                    material_items.stored_path, material_items.mime_type, material_items.size_bytes,
                    material_items.created_at, material_items.updated_at
             FROM material_items
             LEFT JOIN learning_contents ON learning_contents.id = material_items.learning_content_id
             WHERE learning_contents.id IS NULL",
        )?;

        let rows = statement.query_map([], material_item_from_row)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn count_orphan_pdf_page_annotations(&self) -> Result<i64, AppError> {
        self.connection
            .query_row(
                "SELECT COUNT(*) FROM pdf_page_annotations
                 WHERE material_id NOT IN (SELECT id FROM material_items)",
                [],
                |row| row.get(0),
            )
            .map_err(AppError::from)
    }

    fn list_notes(&self, learning_content_id: &str) -> Result<Vec<Note>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, learning_content_id, title, body, created_at, updated_at
             FROM notes
             WHERE learning_content_id = ?1
             ORDER BY created_at ASC",
        )?;

        let rows = statement.query_map(params![learning_content_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                learning_content_id: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    fn get_note(&self, note_id: &str) -> Result<Option<Note>, AppError> {
        self.connection
            .query_row(
                "SELECT id, learning_content_id, title, body, created_at, updated_at
                 FROM notes
                 WHERE id = ?1",
                params![note_id],
                |row| {
                    Ok(Note {
                        id: row.get(0)?,
                        learning_content_id: row.get(1)?,
                        title: row.get(2)?,
                        body: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(AppError::from)
    }

    fn list_handwriting_note_summaries_unchecked(
        &self,
        learning_content_id: &str,
    ) -> Result<Vec<HandwritingNoteSummary>, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT id, learning_content_id, title, stroke_schema_version,
                    canvas_width, canvas_height, created_at, updated_at
             FROM handwriting_notes
             WHERE learning_content_id = ?1
             ORDER BY updated_at DESC, created_at DESC, id ASC",
        )?;

        let rows = statement.query_map(params![learning_content_id], |row| {
            Ok(HandwritingNoteSummary {
                id: row.get(0)?,
                learning_content_id: row.get(1)?,
                title: row.get(2)?,
                stroke_schema_version: row.get(3)?,
                canvas_width: row.get(4)?,
                canvas_height: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    /// 同级兄弟节点（文件与文件夹同池）范围内判重，重名追加 ` (n)` 后缀。
    fn next_sibling_material_name(
        &self,
        learning_content_id: &str,
        parent_id: Option<&str>,
        original_name: &str,
        exclude_id: Option<&str>,
    ) -> Result<String, AppError> {
        let mut statement = self.connection.prepare(
            "SELECT name FROM material_items
             WHERE learning_content_id = ?1 AND parent_id IS ?2 AND id IS NOT ?3",
        )?;
        let existing_names = statement
            .query_map(params![learning_content_id, parent_id, exclude_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(next_duplicate_name(original_name, |candidate| {
            existing_names.iter().any(|name| name == candidate)
        }))
    }

    /// 校验 parent_id（若有）必须存在、是文件夹且属于同一学习内容。
    fn ensure_folder_in_content(
        &self,
        learning_content_id: &str,
        parent_id: Option<&str>,
    ) -> Result<(), AppError> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };
        let Some(parent) = self.get_material(parent_id)? else {
            return Err(AppError::FolderNotFound);
        };
        if parent.kind != MaterialKind::Folder || parent.learning_content_id != learning_content_id
        {
            return Err(AppError::FolderNotFound);
        }
        Ok(())
    }

    fn insert_material_item(&self, material: &MaterialItem) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO material_items (
                id, learning_content_id, parent_id, kind, name,
                original_path, stored_path, mime_type, size_bytes, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                material.id,
                material.learning_content_id,
                material.parent_id,
                material_kind_to_str(&material.kind),
                material.name,
                material.original_path,
                material.stored_path,
                material.mime_type,
                material.size_bytes,
                material.created_at,
                material.updated_at,
            ],
        )?;
        Ok(())
    }

    /// 返回以 root 为根的整棵子树（含 root 自身），文件行直接返回单元素。
    /// 用 visited 集合防御损坏数据中的 parent 环。
    fn collect_material_subtree(&self, root: &MaterialItem) -> Result<Vec<MaterialItem>, AppError> {
        if root.kind == MaterialKind::File {
            return Ok(vec![root.clone()]);
        }

        let all = self.list_materials(&root.learning_content_id)?;
        let mut visited = std::collections::HashSet::from([root.id.clone()]);
        let mut subtree = vec![root.clone()];
        let mut frontier = vec![root.id.clone()];
        while let Some(current_id) = frontier.pop() {
            for item in all
                .iter()
                .filter(|item| item.parent_id.as_deref() == Some(current_id.as_str()))
            {
                if !visited.insert(item.id.clone()) {
                    continue;
                }
                if item.kind == MaterialKind::Folder {
                    frontier.push(item.id.clone());
                }
                subtree.push(item.clone());
            }
        }

        Ok(subtree)
    }

    fn migrate(&self) -> Result<(), AppError> {
        self.connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS learning_contents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                deadline TEXT,
                estimated_hours REAL DEFAULT 0,
                progress INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_opened_at TEXT
            );

            CREATE TABLE IF NOT EXISTS material_items (
                id TEXT PRIMARY KEY,
                learning_content_id TEXT NOT NULL,
                parent_id TEXT,
                kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'folder')),
                name TEXT NOT NULL,
                original_path TEXT,
                stored_path TEXT,
                mime_type TEXT,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                learning_content_id TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS handwriting_notes (
                id TEXT PRIMARY KEY,
                learning_content_id TEXT NOT NULL,
                title TEXT NOT NULL,
                stroke_data_json TEXT NOT NULL,
                stroke_schema_version INTEGER NOT NULL DEFAULT 1,
                canvas_width REAL NOT NULL DEFAULT 1,
                canvas_height REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_handwriting_notes_learning_content
            ON handwriting_notes(learning_content_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS pdf_page_annotations (
                id TEXT PRIMARY KEY,
                material_id TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                stroke_data_json TEXT NOT NULL,
                stroke_schema_version INTEGER NOT NULL DEFAULT 1,
                page_width REAL NOT NULL,
                page_height REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(material_id, page_number)
            );

            CREATE INDEX IF NOT EXISTS idx_pdf_page_annotations_material
            ON pdf_page_annotations(material_id, page_number);

            ",
        )?;

        let user_version: i64 = self
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if user_version < 1 {
            self.connection.pragma_update(None, "user_version", 1)?;
        }
        if user_version < 2 {
            self.connection.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS material_reading_states (
                    material_id TEXT PRIMARY KEY,
                    page_number INTEGER NOT NULL DEFAULT 1,
                    scale REAL NOT NULL DEFAULT 1.0,
                    last_opened_at TEXT,
                    position_kind TEXT NOT NULL DEFAULT 'none',
                    video_position_seconds REAL,
                    updated_at TEXT NOT NULL
                );
                ",
            )?;
            self.connection.pragma_update(None, "user_version", 2)?;
        }
        if user_version < 3 {
            self.connection
                .execute_batch("DROP TABLE IF EXISTS reading_states;")?;
            self.connection.pragma_update(None, "user_version", 3)?;
        }
        if user_version < 4 {
            // 旧库 material_items 缺 parent_id/kind 且路径列 NOT NULL，SQLite 不能
            // ALTER 去掉 NOT NULL，必须单事务表重建；新库建表语句已是新 schema，跳过重建。
            if !self.material_items_has_column("parent_id")? {
                self.connection.execute_batch(
                    "
                    BEGIN IMMEDIATE;
                    CREATE TABLE material_items_new (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        parent_id TEXT,
                        kind TEXT NOT NULL DEFAULT 'file',
                        name TEXT NOT NULL,
                        original_path TEXT,
                        stored_path TEXT,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    INSERT INTO material_items_new (
                        id, learning_content_id, parent_id, kind, name,
                        original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                    )
                    SELECT id, learning_content_id, NULL, 'file', name,
                           original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                    FROM material_items;
                    DROP TABLE material_items;
                    ALTER TABLE material_items_new RENAME TO material_items;
                    COMMIT;
                    ",
                )?;
            }
            self.connection.execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_material_items_scope
                 ON material_items(learning_content_id, parent_id);",
            )?;
            self.connection.pragma_update(None, "user_version", 4)?;
        }
        if user_version < 5 {
            if !self.material_reading_states_has_column("last_opened_at")? {
                self.connection.execute_batch(
                    "ALTER TABLE material_reading_states ADD COLUMN last_opened_at TEXT;",
                )?;
            }
            if !self.material_reading_states_has_column("position_kind")? {
                self.connection.execute_batch(
                    "ALTER TABLE material_reading_states
                     ADD COLUMN position_kind TEXT NOT NULL DEFAULT 'none';",
                )?;
            }
            if !self.material_reading_states_has_column("video_position_seconds")? {
                self.connection.execute_batch(
                    "ALTER TABLE material_reading_states ADD COLUMN video_position_seconds REAL;",
                )?;
            }
            self.connection.execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_material_reading_states_last_opened
                 ON material_reading_states(last_opened_at DESC);",
            )?;
            self.connection.pragma_update(None, "user_version", 5)?;
        }
        if user_version < 6 {
            self.connection.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                ",
            )?;
            self.connection.pragma_update(None, "user_version", 6)?;
        }
        if user_version < 7 {
            self.connection.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS handwriting_notes (
                    id TEXT PRIMARY KEY,
                    learning_content_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    stroke_data_json TEXT NOT NULL,
                    stroke_schema_version INTEGER NOT NULL DEFAULT 1,
                    canvas_width REAL NOT NULL DEFAULT 1,
                    canvas_height REAL NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_handwriting_notes_learning_content
                ON handwriting_notes(learning_content_id, updated_at DESC);
                ",
            )?;
            self.connection.pragma_update(None, "user_version", 7)?;
        }
        if user_version < 8 {
            self.connection.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS pdf_page_annotations (
                    id TEXT PRIMARY KEY,
                    material_id TEXT NOT NULL,
                    page_number INTEGER NOT NULL,
                    stroke_data_json TEXT NOT NULL,
                    stroke_schema_version INTEGER NOT NULL DEFAULT 1,
                    page_width REAL NOT NULL,
                    page_height REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(material_id, page_number)
                );

                CREATE INDEX IF NOT EXISTS idx_pdf_page_annotations_material
                ON pdf_page_annotations(material_id, page_number);
                ",
            )?;
            self.connection.pragma_update(None, "user_version", 8)?;
        }

        Ok(())
    }

    fn material_items_has_column(&self, column: &str) -> Result<bool, AppError> {
        let count: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('material_items') WHERE name = ?1",
            params![column],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn material_reading_states_has_column(&self, column: &str) -> Result<bool, AppError> {
        let count: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('material_reading_states') WHERE name = ?1",
            params![column],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

fn rollback_material_rename(source_path: &Path, target_path: &Path) -> Result<(), AppError> {
    if source_path == target_path || !target_path.exists() {
        return Ok(());
    }

    std::fs::rename(target_path, source_path).map_err(|rollback_error| {
        eprintln!("material rename rollback failed after database update error: {rollback_error}");
        AppError::MaterialRenameRollbackFailed
    })
}

fn handwriting_note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HandwritingNote> {
    Ok(HandwritingNote {
        id: row.get(0)?,
        learning_content_id: row.get(1)?,
        title: row.get(2)?,
        stroke_data_json: row.get(3)?,
        stroke_schema_version: row.get(4)?,
        canvas_width: row.get(5)?,
        canvas_height: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn pdf_page_annotation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PdfPageAnnotation> {
    Ok(PdfPageAnnotation {
        id: row.get(0)?,
        material_id: row.get(1)?,
        page_number: row.get(2)?,
        stroke_data_json: row.get(3)?,
        stroke_schema_version: row.get(4)?,
        page_width: row.get(5)?,
        page_height: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_note_title(title: String) -> Result<String, AppError> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::EmptyNoteTitle);
    }
    if title.chars().count() > NOTE_TITLE_MAX_CHARS {
        return Err(AppError::InvalidHandwritingData);
    }
    Ok(title)
}

fn validate_canvas_size(width: f64, height: f64) -> Result<(), AppError> {
    if !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || width > HANDWRITING_CANVAS_MAX_SIZE
        || height > HANDWRITING_CANVAS_MAX_SIZE
    {
        return Err(AppError::InvalidHandwritingData);
    }
    Ok(())
}

fn validate_pdf_page_number(page_number: i64) -> Result<(), AppError> {
    if page_number < 1 {
        return Err(AppError::InvalidPdfAnnotationData);
    }
    Ok(())
}

fn validate_pdf_page_size(width: f64, height: f64) -> Result<(), AppError> {
    if !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || width > PDF_ANNOTATION_PAGE_MAX_SIZE
        || height > PDF_ANNOTATION_PAGE_MAX_SIZE
    {
        return Err(AppError::InvalidPdfAnnotationData);
    }
    Ok(())
}

fn validate_pdf_annotation_data(stroke_data_json: &str) -> Result<(), AppError> {
    match validate_handwriting_data(stroke_data_json) {
        Ok(()) => Ok(()),
        Err(AppError::HandwritingDataTooLarge) => Err(AppError::PdfAnnotationDataTooLarge),
        Err(AppError::InvalidHandwritingData) => Err(AppError::InvalidPdfAnnotationData),
        Err(error) => Err(error),
    }
}

fn handwriting_data_is_empty(stroke_data_json: &str) -> Result<bool, AppError> {
    let value: serde_json::Value =
        serde_json::from_str(stroke_data_json).map_err(|_| AppError::InvalidPdfAnnotationData)?;
    let Some(strokes) = value.get("strokes").and_then(serde_json::Value::as_array) else {
        return Err(AppError::InvalidPdfAnnotationData);
    };
    Ok(strokes.is_empty())
}

fn validate_handwriting_data(stroke_data_json: &str) -> Result<(), AppError> {
    if stroke_data_json.len() > HANDWRITING_DATA_MAX_BYTES {
        return Err(AppError::HandwritingDataTooLarge);
    }

    let value: serde_json::Value =
        serde_json::from_str(stroke_data_json).map_err(|_| AppError::InvalidHandwritingData)?;
    let Some(object) = value.as_object() else {
        return Err(AppError::InvalidHandwritingData);
    };

    if object
        .get("schemaVersion")
        .and_then(serde_json::Value::as_i64)
        != Some(HANDWRITING_SCHEMA_VERSION)
    {
        return Err(AppError::InvalidHandwritingData);
    }
    if object
        .get("coordinateSpace")
        .and_then(serde_json::Value::as_str)
        != Some("normalized")
    {
        return Err(AppError::InvalidHandwritingData);
    }

    let Some(strokes) = object.get("strokes").and_then(serde_json::Value::as_array) else {
        return Err(AppError::InvalidHandwritingData);
    };
    if strokes.len() > HANDWRITING_MAX_STROKES {
        return Err(AppError::HandwritingDataTooLarge);
    }

    let mut point_count = 0usize;
    for stroke in strokes {
        let Some(stroke) = stroke.as_object() else {
            return Err(AppError::InvalidHandwritingData);
        };
        if stroke
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .is_none()
        {
            return Err(AppError::InvalidHandwritingData);
        }
        match stroke.get("tool").and_then(serde_json::Value::as_str) {
            Some("pen") | Some("eraser") => {}
            _ => return Err(AppError::InvalidHandwritingData),
        }
        if stroke
            .get("color")
            .and_then(serde_json::Value::as_str)
            .filter(|color| is_valid_hex_color(color))
            .is_none()
        {
            return Err(AppError::InvalidHandwritingData);
        }
        let Some(width) = stroke.get("width").and_then(serde_json::Value::as_f64) else {
            return Err(AppError::InvalidHandwritingData);
        };
        if !width.is_finite() || width <= 0.0 || width > HANDWRITING_MAX_WIDTH {
            return Err(AppError::InvalidHandwritingData);
        }
        let Some(points) = stroke.get("points").and_then(serde_json::Value::as_array) else {
            return Err(AppError::InvalidHandwritingData);
        };
        point_count = point_count.saturating_add(points.len());
        if point_count > HANDWRITING_MAX_POINTS {
            return Err(AppError::HandwritingDataTooLarge);
        }
        for point in points {
            let Some(point) = point.as_object() else {
                return Err(AppError::InvalidHandwritingData);
            };
            let Some(x) = point.get("x").and_then(serde_json::Value::as_f64) else {
                return Err(AppError::InvalidHandwritingData);
            };
            let Some(y) = point.get("y").and_then(serde_json::Value::as_f64) else {
                return Err(AppError::InvalidHandwritingData);
            };
            let Some(t) = point.get("t").and_then(serde_json::Value::as_i64) else {
                return Err(AppError::InvalidHandwritingData);
            };
            if !x.is_finite()
                || !y.is_finite()
                || !(0.0..=1.0).contains(&x)
                || !(0.0..=1.0).contains(&y)
                || t < 0
            {
                return Err(AppError::InvalidHandwritingData);
            }
        }
    }

    Ok(())
}

fn is_valid_hex_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn material_item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MaterialItem> {
    Ok(MaterialItem {
        id: row.get(0)?,
        learning_content_id: row.get(1)?,
        parent_id: row.get(2)?,
        kind: material_kind_from_str(row.get::<_, String>(3)?.as_str()),
        name: row.get(4)?,
        original_path: row.get(5)?,
        stored_path: row.get(6)?,
        mime_type: row.get(7)?,
        size_bytes: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn material_kind_to_str(kind: &MaterialKind) -> &'static str {
    match kind {
        MaterialKind::File => "file",
        MaterialKind::Folder => "folder",
    }
}

fn material_kind_from_str(value: &str) -> MaterialKind {
    match value {
        "file" => MaterialKind::File,
        // 未知值保守归 Folder：只删记录、不触发磁盘删除（schema 有 CHECK 兜底，此处属纵深防御）
        _ => MaterialKind::Folder,
    }
}

fn next_available_path(directory: &Path, preferred_name: &str) -> PathBuf {
    let candidate = directory.join(preferred_name);
    if !candidate.exists() {
        return candidate;
    }

    directory.join(next_duplicate_name(preferred_name, |name| {
        directory.join(name).exists()
    }))
}

fn next_duplicate_name(name: &str, exists: impl Fn(&str) -> bool) -> String {
    if !exists(name) {
        return name.to_string();
    }

    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let extension = path.extension().and_then(|value| value.to_str());

    for index in 1.. {
        let candidate = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };

        if !exists(&candidate) {
            return candidate;
        }
    }

    unreachable!("duplicate name loop is unbounded");
}

struct MaterialLibraryScan {
    library_bytes: i64,
    orphan_bytes: i64,
    orphan_files: Vec<PathBuf>,
}

#[derive(Debug)]
struct MaterialLibraryMigrationFile {
    source_path: PathBuf,
    target_path: PathBuf,
}

fn validate_material_file_name(name: &str) -> Result<&str, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::EmptyMaterialName);
    }

    let path = Path::new(name);
    if path.components().count() != 1
        || path.file_name().and_then(|value| value.to_str()) != Some(name)
    {
        return Err(AppError::InvalidMaterialName);
    }

    Ok(name)
}

fn scan_material_library(
    material_library_dir: &Path,
    referenced_paths: &[PathBuf],
) -> Result<MaterialLibraryScan, AppError> {
    if !material_library_dir.exists() {
        return Ok(MaterialLibraryScan {
            library_bytes: 0,
            orphan_bytes: 0,
            orphan_files: Vec::new(),
        });
    }

    let referenced_canonical_paths = referenced_paths
        .iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect::<Vec<_>>();
    let mut scan = MaterialLibraryScan {
        library_bytes: 0,
        orphan_bytes: 0,
        orphan_files: Vec::new(),
    };
    scan_directory_for_materials(
        material_library_dir,
        material_library_dir,
        &referenced_canonical_paths,
        &mut scan,
    )?;

    Ok(scan)
}

fn referenced_material_library_paths(
    file_materials: &[&MaterialItem],
    material_library_dir: &Path,
) -> Result<Vec<PathBuf>, AppError> {
    let mut paths = Vec::new();
    for material in file_materials {
        if let Some(stored_path) = material.stored_path.as_deref() {
            paths.push(PathBuf::from(stored_path));
        }
        if office_format_for_material(material).is_some() {
            for pdf_path in derived_office_pdf_paths(material_library_dir, material)? {
                if pdf_path.exists() {
                    paths.push(pdf_path);
                }
            }
        }
    }
    Ok(paths)
}

fn scan_directory_for_materials(
    current_dir: &Path,
    material_library_dir: &Path,
    referenced_canonical_paths: &[PathBuf],
    scan: &mut MaterialLibraryScan,
) -> Result<(), AppError> {
    for entry in std::fs::read_dir(current_dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            scan_directory_for_materials(
                &path,
                material_library_dir,
                referenced_canonical_paths,
                scan,
            )?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        if !is_path_inside_directory(&path, material_library_dir)? {
            continue;
        }

        let size = metadata.len() as i64;
        scan.library_bytes += size;
        let canonical_path = path.canonicalize()?;
        if !referenced_canonical_paths
            .iter()
            .any(|referenced_path| referenced_path == &canonical_path)
        {
            scan.orphan_bytes += size;
            scan.orphan_files.push(path);
        }
    }

    Ok(())
}

fn validate_supported_material_library_location(
    target_dir: &Path,
    default_dir: &Path,
) -> Result<(), AppError> {
    if !target_dir.is_absolute() {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }
    if has_parent_dir_component(target_dir) {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }
    if same_path_string(target_dir, default_dir) {
        return Ok(());
    }

    if !has_app_managed_material_library_suffix(target_dir) {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }
    let storage_root = storage_root_for_app_managed_material_library(target_dir)
        .ok_or(AppError::InvalidMaterialLibraryLocation)?;
    if is_unsafe_material_storage_root(storage_root) {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }

    Ok(())
}

fn has_parent_dir_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn has_relative_dir_component(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
}

fn has_app_managed_material_library_suffix(path: &Path) -> bool {
    let Some(file_name) = path.file_name() else {
        return false;
    };
    if !path_segment_eq(file_name, "materials") {
        return false;
    }

    let Some(parent_name) = path.parent().and_then(Path::file_name) else {
        return false;
    };
    path_segment_eq(parent_name, "StudySeqData")
}

fn storage_root_for_app_managed_material_library(path: &Path) -> Option<&Path> {
    path.parent()?.parent()
}

fn path_segment_eq(segment: &std::ffi::OsStr, expected: &str) -> bool {
    segment
        .to_str()
        .is_some_and(|value| value.eq_ignore_ascii_case(expected))
}

#[cfg(windows)]
fn is_unsafe_material_storage_root(storage_root: &Path) -> bool {
    windows_unsafe_storage_roots()
        .iter()
        .any(|unsafe_root| path_starts_with_case_insensitive(storage_root, unsafe_root))
}

#[cfg(not(windows))]
fn is_unsafe_material_storage_root(_storage_root: &Path) -> bool {
    false
}

#[cfg(windows)]
fn windows_unsafe_storage_roots() -> Vec<PathBuf> {
    let mut roots = [
        std::env::var_os("WINDIR").map(PathBuf::from),
        std::env::var_os("ProgramFiles").map(PathBuf::from),
        std::env::var_os("ProgramFiles(x86)").map(PathBuf::from),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();

    roots.push(PathBuf::from(r"C:\Windows"));
    roots.push(PathBuf::from(r"C:\Program Files"));
    roots.push(PathBuf::from(r"C:\Program Files (x86)"));
    roots
}

#[cfg(windows)]
fn path_starts_with_case_insensitive(path: &Path, directory: &Path) -> bool {
    let normalized_path = normalize_path_string(path);
    let normalized_directory = normalize_path_string(directory);
    normalized_path == normalized_directory
        || normalized_path
            .strip_prefix(&format!("{normalized_directory}/"))
            .is_some()
}

fn migrate_material_library_files(
    current_dir: &Path,
    target_dir: &Path,
    materials: &[MaterialItem],
) -> Result<Vec<MaterialLibraryMigrationFile>, AppError> {
    let target_absolute = canonicalize_material_library_target(target_dir)?;
    if !current_dir.exists() {
        std::fs::create_dir_all(&target_absolute)?;
        return Ok(Vec::new());
    }
    let current_canonical = current_dir.canonicalize()?;
    std::fs::create_dir_all(&target_absolute)?;

    if target_absolute.starts_with(&current_canonical)
        || current_canonical.starts_with(&target_absolute)
    {
        return Err(AppError::InvalidMaterialLibraryLocation);
    }

    let plan =
        build_material_library_migration_plan(&current_canonical, &target_absolute, materials)?;
    for file in &plan {
        copy_material_library_file(file)?;
    }

    Ok(plan)
}

fn canonicalize_material_library_target(target_dir: &Path) -> Result<PathBuf, AppError> {
    let target_parent = target_dir
        .parent()
        .ok_or(AppError::InvalidMaterialLibraryLocation)?;
    std::fs::create_dir_all(target_parent)?;
    let target_parent_canonical = target_parent.canonicalize()?;
    Ok(target_parent_canonical.join(
        target_dir
            .file_name()
            .ok_or(AppError::InvalidMaterialLibraryLocation)?,
    ))
}

fn build_material_library_migration_plan(
    current_dir: &Path,
    target_dir: &Path,
    materials: &[MaterialItem],
) -> Result<Vec<MaterialLibraryMigrationFile>, AppError> {
    let mut plan = Vec::new();
    let mut planned_sources = HashSet::new();
    for material in materials
        .iter()
        .filter(|item| item.kind == MaterialKind::File)
    {
        let Some(stored_path) = material.stored_path.as_deref() else {
            continue;
        };
        let source_path = PathBuf::from(stored_path);
        if has_relative_dir_component(&source_path) {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        if !is_path_inside_directory(&source_path, current_dir)? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        ensure_material_file_exists(&source_path)?;
        let canonical_source_path = source_path.canonicalize()?;
        let relative_path = canonical_source_path
            .strip_prefix(current_dir)
            .map_err(|_| AppError::MaterialPathOutsideLibrary)?;
        let target_path = target_dir.join(relative_path);
        if !is_material_preview_path_inside_library(&target_path, target_dir)? {
            return Err(AppError::MaterialPathOutsideLibrary);
        }
        push_material_library_migration_file(
            &mut plan,
            &mut planned_sources,
            source_path,
            target_path,
        );

        for derived_pdf_path in derived_office_pdf_paths(current_dir, material)? {
            if !derived_pdf_path.exists() {
                continue;
            }
            if !is_path_inside_directory(&derived_pdf_path, current_dir)? {
                return Err(AppError::MaterialPathOutsideLibrary);
            }
            let canonical_derived_path = derived_pdf_path.canonicalize()?;
            let derived_relative_path = canonical_derived_path
                .strip_prefix(current_dir)
                .map_err(|_| AppError::MaterialPathOutsideLibrary)?;
            let target_derived_path = target_dir.join(derived_relative_path);
            if !is_material_preview_path_inside_library(&target_derived_path, target_dir)? {
                return Err(AppError::MaterialPathOutsideLibrary);
            }
            push_material_library_migration_file(
                &mut plan,
                &mut planned_sources,
                derived_pdf_path,
                target_derived_path,
            );
        }
    }

    Ok(plan)
}

fn push_material_library_migration_file(
    plan: &mut Vec<MaterialLibraryMigrationFile>,
    planned_sources: &mut HashSet<String>,
    source_path: PathBuf,
    target_path: PathBuf,
) {
    let source_key = normalize_path_string(&source_path).to_ascii_lowercase();
    if planned_sources.insert(source_key) {
        plan.push(MaterialLibraryMigrationFile {
            source_path,
            target_path,
        });
    }
}

fn copy_material_library_file(file: &MaterialLibraryMigrationFile) -> Result<(), AppError> {
    if let Some(parent) = file.target_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if file.target_path.exists() {
        if material_files_match(&file.source_path, &file.target_path)? {
            return Ok(());
        }
        return Err(AppError::MaterialLibraryMigrationFailed);
    }
    std::fs::copy(&file.source_path, &file.target_path)?;
    Ok(())
}

fn material_files_match(left: &Path, right: &Path) -> Result<bool, AppError> {
    let left_metadata = std::fs::metadata(left)?;
    let right_metadata = std::fs::metadata(right)?;
    if !left_metadata.is_file() || !right_metadata.is_file() {
        return Ok(false);
    }
    if left_metadata.len() != right_metadata.len() {
        return Ok(false);
    }

    let mut left_file = std::fs::File::open(left)?;
    let mut right_file = std::fs::File::open(right)?;
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left_file.read(&mut left_buffer)?;
        let right_read = right_file.read(&mut right_buffer)?;
        if left_read != right_read {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
        if left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
    }
}

fn cleanup_migrated_material_files(
    plan: &[MaterialLibraryMigrationFile],
    library_root: &Path,
) -> usize {
    let Ok(canonical_library_root) = library_root.canonicalize() else {
        return plan.len();
    };
    let mut failed_count = 0;
    for file in plan {
        match std::fs::remove_file(&file.source_path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => failed_count += 1,
        }
        cleanup_empty_ancestor_dirs(
            file.source_path.parent().map(Path::to_path_buf),
            &canonical_library_root,
        );
    }
    failed_count
}

fn cleanup_empty_ancestor_dirs(mut directory: Option<PathBuf>, canonical_library_root: &Path) {
    while let Some(path) = directory.as_deref() {
        let Ok(canonical_path) = path.canonicalize() else {
            return;
        };
        if canonical_path == canonical_library_root
            || !canonical_path.starts_with(canonical_library_root)
        {
            return;
        }

        match std::fs::remove_dir(&canonical_path) {
            Ok(()) => {
                directory = canonical_path.parent().map(Path::to_path_buf);
            }
            Err(_) => return,
        }
    }
}

fn collect_material_file_cleanup_paths(
    materials: &[MaterialItem],
    material_library_dir: &Path,
) -> Result<Vec<PathBuf>, AppError> {
    let mut paths = Vec::new();
    for item in materials {
        if item.kind != MaterialKind::File {
            continue;
        }
        let Some(stored_path) = item.stored_path.as_deref() else {
            continue;
        };
        let path = PathBuf::from(stored_path);
        if is_path_inside_directory(&path, material_library_dir)? {
            paths.push(path);
            if office_format_for_material(item).is_some() {
                for derived_pdf_path in derived_office_pdf_paths(material_library_dir, item)? {
                    if derived_pdf_path.exists() {
                        paths.push(derived_pdf_path);
                    }
                }
            }
        }
    }
    Ok(paths)
}

fn remove_material_file_paths_best_effort(paths: &[PathBuf]) -> usize {
    let mut failed_count = 0;
    for path in paths {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => failed_count += 1,
        }
    }
    failed_count
}

fn material_depth(item: &MaterialItem, subtree: &[MaterialItem]) -> usize {
    let mut depth = 0;
    let mut current_parent = item.parent_id.as_deref();
    while let Some(parent_id) = current_parent {
        let Some(parent) = subtree.iter().find(|candidate| candidate.id == parent_id) else {
            break;
        };
        depth += 1;
        current_parent = parent.parent_id.as_deref();
    }

    depth
}

fn same_path_string(left: &Path, right: &Path) -> bool {
    normalize_path_string(left).eq_ignore_ascii_case(&normalize_path_string(right))
}

fn normalize_path_string(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

fn is_path_inside_directory(path: &Path, directory: &Path) -> Result<bool, AppError> {
    let canonical_path = match path.canonicalize() {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(AppError::Io(error)),
    };
    let canonical_directory = match directory.canonicalize() {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(AppError::Io(error)),
    };

    Ok(canonical_path.starts_with(canonical_directory))
}

fn is_material_preview_path_inside_library(
    path: &Path,
    directory: &Path,
) -> Result<bool, AppError> {
    match is_path_inside_directory(path, directory) {
        Ok(true) => Ok(true),
        Ok(false) if !path.exists() => is_missing_path_still_inside_directory(path, directory),
        other => other,
    }
}

fn is_missing_path_still_inside_directory(path: &Path, directory: &Path) -> Result<bool, AppError> {
    let canonical_directory = match directory.canonicalize() {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(AppError::Io(error)),
    };

    let mut existing_ancestor = path;
    let mut missing_components = Vec::new();
    while !existing_ancestor.exists() {
        let Some(file_name) = existing_ancestor.file_name() else {
            return Ok(false);
        };
        missing_components.push(file_name.to_os_string());
        let Some(parent) = existing_ancestor.parent() else {
            return Ok(false);
        };
        existing_ancestor = parent;
    }

    let mut reconstructed_path = existing_ancestor.canonicalize()?;
    for component in missing_components.iter().rev() {
        reconstructed_path.push(component);
    }

    Ok(reconstructed_path.starts_with(canonical_directory))
}

fn read_text_preview_bytes_with_limit(path: &Path) -> Result<Vec<u8>, AppError> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::MaterialFileMissing
        } else {
            AppError::Io(error)
        }
    })?;
    if !metadata.is_file() {
        return Err(AppError::MaterialFileMissing);
    }
    if metadata.len() > MAX_TEXT_PREVIEW_BYTES {
        return Err(AppError::TextPreviewTooLarge);
    }
    std::fs::read(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::MaterialFileMissing
        } else {
            AppError::Io(error)
        }
    })
}

struct CodeLanguage {
    id: &'static str,
    label: &'static str,
}

#[derive(Debug, PartialEq, Eq)]
struct CodePreviewData {
    text: String,
    encoding: String,
    line_count: usize,
    is_truncated: bool,
    highlighting_mode: &'static str,
}

fn read_code_preview(
    path: &Path,
    has_highlight_language: bool,
) -> Result<CodePreviewData, AppError> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::MaterialFileMissing
        } else {
            AppError::Io(error)
        }
    })?;
    if !metadata.is_file() {
        return Err(AppError::MaterialFileMissing);
    }

    let byte_limit = metadata.len().min(CODE_PREVIEW_MAX_BYTES);
    let mut file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::MaterialFileMissing
        } else {
            AppError::Io(error)
        }
    })?;
    let mut bytes = Vec::with_capacity(byte_limit as usize);
    file.by_ref()
        .take(byte_limit)
        .read_to_end(&mut bytes)
        .map_err(AppError::Io)?;

    let (decoded_text, encoding) = decode_text(&bytes);
    let (text, line_count, line_truncated) = limit_code_preview_lines(decoded_text);
    let is_truncated = metadata.len() > byte_limit || line_truncated;
    let highlighting_mode = if metadata.len() > CODE_HIGHLIGHT_MAX_BYTES || is_truncated {
        "plain_too_large"
    } else if encoding.ends_with("-lossy") {
        "plain_decode_lossy"
    } else if !has_highlight_language {
        "plain_unknown_language"
    } else {
        "highlight"
    };

    Ok(CodePreviewData {
        text,
        encoding,
        line_count,
        is_truncated,
        highlighting_mode,
    })
}

fn limit_code_preview_lines(text: String) -> (String, usize, bool) {
    let line_count = text.lines().count();
    if line_count <= CODE_PREVIEW_MAX_LINES {
        return (text, line_count, false);
    }

    let limited = text
        .lines()
        .take(CODE_PREVIEW_MAX_LINES)
        .collect::<Vec<_>>()
        .join("\n");
    (limited, CODE_PREVIEW_MAX_LINES, true)
}

fn ensure_material_file_exists(path: &Path) -> Result<(), AppError> {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(()),
        Ok(_) => Err(AppError::MaterialFileMissing),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::MaterialFileMissing)
        }
        Err(error) => Err(AppError::Io(error)),
    }
}

fn guess_mime_type(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match extension.as_str() {
        "txt" => "text/plain",
        "ts" => "application/x-typescript",
        "tsx" => "application/x-tsx",
        "js" => "text/javascript",
        "jsx" => "text/jsx",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "json" => "application/json",
        "py" => "text/x-python",
        "rs" => "text/x-rust",
        "go" => "text/x-go",
        "java" => "text/x-java-source",
        "cs" => "text/x-csharp",
        "c" => "text/x-c",
        "h" => "text/x-c-header",
        "cpp" | "cc" | "cxx" => "text/x-c++src",
        "hpp" | "hh" | "hxx" => "text/x-c++hdr",
        "yaml" | "yml" => "application/x-yaml",
        "toml" => "application/toml",
        "xml" => "application/xml",
        "sql" => "application/sql",
        "sh" => "application/x-sh",
        "ps1" => "application/x-powershell",
        "md" | "markdown" => "text/markdown",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // 可内嵌播放的视频格式
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        // 暂不支持播放的视频格式：标记 video/* 供前端显示专属提示
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "flv" => "video/x-flv",
        "wmv" => "video/x-ms-wmv",
        "mov" => "video/quicktime",
        "rmvb" | "rm" => "video/vnd.rn-realvideo",
        _ => "application/octet-stream",
    };

    Some(mime.to_string())
}

fn preview_kind(mime_type: Option<&str>) -> MaterialPreviewKind {
    match mime_type {
        Some("text/plain") => MaterialPreviewKind::Text,
        Some(value) if is_code_preview_mime(value) => MaterialPreviewKind::Code,
        Some("application/pdf") => MaterialPreviewKind::Pdf,
        Some("video/mp4") | Some("video/webm") => MaterialPreviewKind::Video,
        Some(value) if value.starts_with("image/") => MaterialPreviewKind::Image,
        _ => MaterialPreviewKind::Unsupported,
    }
}

fn is_code_preview_mime(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "application/x-typescript"
            | "application/x-tsx"
            | "text/javascript"
            | "text/jsx"
            | "text/html"
            | "text/css"
            | "application/json"
            | "text/x-python"
            | "text/x-rust"
            | "text/x-go"
            | "text/x-java-source"
            | "text/x-csharp"
            | "text/x-c"
            | "text/x-c-header"
            | "text/x-c++src"
            | "text/x-c++hdr"
            | "application/x-yaml"
            | "application/toml"
            | "application/xml"
            | "application/sql"
            | "application/x-sh"
            | "application/x-powershell"
            | "text/markdown"
    )
}

fn code_language_for_material(
    material: &MaterialItem,
    mime_type: Option<&str>,
) -> Option<CodeLanguage> {
    mime_type.and_then(code_language_for_mime_type).or_else(|| {
        material
            .stored_path
            .as_deref()
            .and_then(|path| code_language_for_path(Path::new(path)))
    })
}

fn code_language_for_mime_type(mime_type: &str) -> Option<CodeLanguage> {
    match mime_type {
        "application/x-typescript" => Some(code_language("typescript", "TypeScript")),
        "application/x-tsx" => Some(code_language("tsx", "TSX")),
        "text/javascript" => Some(code_language("javascript", "JavaScript")),
        "text/jsx" => Some(code_language("jsx", "JSX")),
        "text/html" => Some(code_language("markup", "HTML")),
        "text/css" => Some(code_language("css", "CSS")),
        "application/json" => Some(code_language("json", "JSON")),
        "text/x-python" => Some(code_language("python", "Python")),
        "text/x-rust" => Some(code_language("rust", "Rust")),
        "text/x-go" => Some(code_language("go", "Go")),
        "text/x-java-source" => Some(code_language("java", "Java")),
        "text/x-csharp" => Some(code_language("csharp", "C#")),
        "text/x-c" | "text/x-c-header" => Some(code_language("c", "C")),
        "text/x-c++src" | "text/x-c++hdr" => Some(code_language("cpp", "C++")),
        "application/x-yaml" => Some(code_language("yaml", "YAML")),
        _ => None,
    }
}

fn code_language_for_path(path: &Path) -> Option<CodeLanguage> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "ts" => Some(code_language("typescript", "TypeScript")),
        "tsx" => Some(code_language("tsx", "TSX")),
        "js" => Some(code_language("javascript", "JavaScript")),
        "jsx" => Some(code_language("jsx", "JSX")),
        "html" | "htm" => Some(code_language("markup", "HTML")),
        "css" => Some(code_language("css", "CSS")),
        "json" => Some(code_language("json", "JSON")),
        "py" => Some(code_language("python", "Python")),
        "rs" => Some(code_language("rust", "Rust")),
        "go" => Some(code_language("go", "Go")),
        "java" => Some(code_language("java", "Java")),
        "cs" => Some(code_language("csharp", "C#")),
        "c" | "h" => Some(code_language("c", "C")),
        "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => Some(code_language("cpp", "C++")),
        "yaml" | "yml" => Some(code_language("yaml", "YAML")),
        _ => None,
    }
}

fn code_language(id: &'static str, label: &'static str) -> CodeLanguage {
    CodeLanguage { id, label }
}

fn office_format_for_path(path: &Path) -> Option<Format> {
    let extension = path.extension()?.to_str()?;
    Format::from_extension(extension)
}

fn office_format_for_mime_type(mime_type: Option<&str>) -> Option<Format> {
    match mime_type {
        Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document") => {
            Some(Format::Docx)
        }
        Some("application/vnd.openxmlformats-officedocument.presentationml.presentation") => {
            Some(Format::Pptx)
        }
        Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") => {
            Some(Format::Xlsx)
        }
        _ => None,
    }
}

fn office_format_for_material(material: &MaterialItem) -> Option<Format> {
    match material.mime_type.as_deref() {
        Some(mime_type) => office_format_for_mime_type(Some(mime_type)).or_else(|| {
            if mime_type == "application/octet-stream" {
                material
                    .stored_path
                    .as_deref()
                    .and_then(|path| office_format_for_path(Path::new(path)))
            } else {
                None
            }
        }),
        None => material
            .stored_path
            .as_deref()
            .and_then(|path| office_format_for_path(Path::new(path))),
    }
}

fn derived_office_pdf_cache_paths(
    material_library_dir: &Path,
    material: &MaterialItem,
) -> Result<Vec<PathBuf>, AppError> {
    ["office-pdf", XLSX_DERIVED_PDF_CACHE_DIR]
        .into_iter()
        .map(|cache_dir| {
            derived_office_pdf_path_in_cache_dir(material_library_dir, material, cache_dir)
        })
        .collect()
}

fn derived_office_pdf_path(
    material_library_dir: &Path,
    material: &MaterialItem,
) -> Result<PathBuf, AppError> {
    let format = office_format_for_material(material);
    let cache_dir = format
        .map(office_derived_pdf_cache_dir)
        .unwrap_or("office-pdf");
    derived_office_pdf_path_in_cache_dir(material_library_dir, material, cache_dir)
}

fn derived_office_pdf_paths(
    material_library_dir: &Path,
    material: &MaterialItem,
) -> Result<Vec<PathBuf>, AppError> {
    let format = office_format_for_material(material);
    let Some(format) = format else {
        return Ok(Vec::new());
    };

    let mut cache_dirs = vec![office_derived_pdf_cache_dir(format)];
    if format == Format::Xlsx {
        cache_dirs.push("office-pdf");
    }

    cache_dirs
        .into_iter()
        .map(|cache_dir| {
            derived_office_pdf_path_in_cache_dir(material_library_dir, material, cache_dir)
        })
        .collect()
}

fn derived_office_pdf_path_in_cache_dir(
    material_library_dir: &Path,
    material: &MaterialItem,
    cache_dir: &str,
) -> Result<PathBuf, AppError> {
    let path = material_library_dir
        .join(&material.learning_content_id)
        .join(".derived")
        .join(cache_dir)
        .join(format!("{}.pdf", material.id));
    if is_material_preview_path_inside_library(&path, material_library_dir)? {
        Ok(path)
    } else {
        Err(AppError::MaterialPathOutsideLibrary)
    }
}

fn office_derived_pdf_cache_dir(format: Format) -> &'static str {
    match format {
        Format::Xlsx => XLSX_DERIVED_PDF_CACHE_DIR,
        Format::Docx | Format::Pptx => "office-pdf",
    }
}

fn office_conversion_options(format: Format) -> ConvertOptions {
    match format {
        Format::Xlsx => ConvertOptions {
            paper_size: Some(PaperSize::Custom {
                width: XLSX_PREVIEW_WIDTH_PT,
                height: XLSX_PREVIEW_HEIGHT_PT,
            }),
            landscape: Some(true),
            ..ConvertOptions::default()
        },
        Format::Docx | Format::Pptx => ConvertOptions::default(),
    }
}

fn is_fresh_derived_pdf(source_path: &Path, pdf_path: &Path) -> Result<bool, AppError> {
    let Ok(pdf_metadata) = std::fs::metadata(pdf_path) else {
        return Ok(false);
    };
    if !pdf_metadata.is_file() {
        return Ok(false);
    }
    if !path_looks_like_complete_pdf(pdf_path)? {
        return Ok(false);
    }
    let source_modified = std::fs::metadata(source_path)?
        .modified()
        .map_err(AppError::Io)?;
    let pdf_modified = pdf_metadata.modified().map_err(AppError::Io)?;
    Ok(pdf_modified >= source_modified)
}

fn write_derived_pdf_atomically(pdf_path: &Path, pdf_bytes: &[u8]) -> Result<(), AppError> {
    if !pdf_bytes.starts_with(b"%PDF") {
        return Err(AppError::OfficeConversionFailed);
    }
    let parent = pdf_path.parent().ok_or(AppError::OfficeConversionFailed)?;
    std::fs::create_dir_all(parent)?;
    let file_name = pdf_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(AppError::OfficeConversionFailed)?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    if let Err(error) = std::fs::write(&temp_path, pdf_bytes) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(AppError::Io(error));
    }
    match path_looks_like_complete_pdf(&temp_path) {
        Ok(true) => {}
        Ok(false) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(AppError::OfficeConversionFailed);
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(error);
        }
    }

    let backup_path = match std::fs::metadata(pdf_path) {
        Ok(metadata) if metadata.is_file() => {
            let backup_path = parent.join(format!(".{file_name}.{}.bak", Uuid::new_v4()));
            if let Err(error) = std::fs::rename(pdf_path, &backup_path) {
                let _ = std::fs::remove_file(&temp_path);
                return Err(AppError::Io(error));
            }
            Some(backup_path)
        }
        Ok(_) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(AppError::OfficeConversionFailed);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(AppError::Io(error));
        }
    };

    if let Err(error) = std::fs::rename(&temp_path, pdf_path) {
        let _ = std::fs::remove_file(&temp_path);
        if let Some(backup_path) = backup_path.as_deref() {
            if let Err(restore_error) = std::fs::rename(backup_path, pdf_path) {
                eprintln!(
                    "failed to restore previous derived PDF cache after replace error: {restore_error}"
                );
            }
        }
        return Err(AppError::Io(error));
    }
    if let Some(backup_path) = backup_path {
        let _ = std::fs::remove_file(backup_path);
    }
    Ok(())
}

fn path_starts_with_pdf_header(path: &Path) -> Result<bool, AppError> {
    let mut file = std::fs::File::open(path)?;
    let mut header = [0; 4];
    match file.read_exact(&mut header) {
        Ok(()) => Ok(header == *b"%PDF"),
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(error) => Err(AppError::Io(error)),
    }
}

fn path_looks_like_complete_pdf(path: &Path) -> Result<bool, AppError> {
    if !path_starts_with_pdf_header(path)? {
        return Ok(false);
    }
    let mut file = std::fs::File::open(path)?;
    let file_len = file.metadata()?.len();
    let tail_len = file_len.min(2048) as usize;
    if tail_len == 0 {
        return Ok(false);
    }
    file.seek(SeekFrom::End(-(tail_len as i64)))?;
    let mut tail = vec![0; tail_len];
    file.read_exact(&mut tail)?;
    Ok(tail.windows(5).any(|window| window == b"%%EOF"))
}

fn material_open_position_kind_from_str(value: &str) -> MaterialOpenPositionKind {
    match value {
        "pdf_page" => MaterialOpenPositionKind::PdfPage,
        "video_second" => MaterialOpenPositionKind::VideoSecond,
        _ => MaterialOpenPositionKind::None,
    }
}

fn recent_open_position(
    kind: MaterialOpenPositionKind,
    page_number: i64,
    video_position_seconds: Option<f64>,
) -> RecentMaterialOpenPosition {
    match kind {
        MaterialOpenPositionKind::PdfPage => RecentMaterialOpenPosition::PdfPage {
            page_number: page_number.max(1),
        },
        MaterialOpenPositionKind::VideoSecond => RecentMaterialOpenPosition::VideoSecond {
            seconds: video_position_seconds.unwrap_or(0.0).max(0.0),
        },
        MaterialOpenPositionKind::None => RecentMaterialOpenPosition::None,
    }
}

/// 存量记录兜底：V1.1 及更早版本导入的视频 mime 落库为 application/octet-stream，
/// 预览时按 App 副本扩展名重新猜测，不做数据迁移。
fn resolve_preview_mime(mime_type: Option<&str>, stored_path: &str) -> Option<String> {
    match mime_type {
        Some(value) if value != "application/octet-stream" => Some(value.to_string()),
        _ => guess_mime_type(Path::new(stored_path))
            .or_else(|| mime_type.map(|value| value.to_string())),
    }
}

fn decode_text(bytes: &[u8]) -> (String, String) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (text, _, _) = UTF_8.decode(&bytes[3..]);
        return (text.into_owned(), "utf-8".to_string());
    }

    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        let encoding = if bytes.starts_with(&[0xFF, 0xFE]) {
            encoding_rs::UTF_16LE
        } else {
            encoding_rs::UTF_16BE
        };
        let (text, _, _) = encoding.decode(&bytes[2..]);
        return (text.into_owned(), encoding.name().to_ascii_lowercase());
    }

    let mut detector = EncodingDetector::new(Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, Utf8Detection::Allow);
    let (text, _, had_errors) = encoding.decode(bytes);
    if had_errors {
        let (fallback, _, _) = UTF_8.decode(bytes);
        return (fallback.into_owned(), "utf-8-lossy".to_string());
    }

    (text.into_owned(), encoding.name().to_ascii_lowercase())
}

fn status_to_str(status: &StudyStatus) -> &'static str {
    match status {
        StudyStatus::Planned => "planned",
        StudyStatus::Active => "active",
        StudyStatus::Paused => "paused",
        StudyStatus::Completed => "completed",
        StudyStatus::Overdue => "overdue",
    }
}

fn status_from_str(value: &str) -> StudyStatus {
    match value {
        "active" => StudyStatus::Active,
        "paused" => StudyStatus::Paused,
        "completed" => StudyStatus::Completed,
        "overdue" => StudyStatus::Overdue,
        _ => StudyStatus::Planned,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn created_learning_content_is_restored_after_reopening_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");

        let first_repository = LearningContentRepository::open(&database_path).expect("open db");
        let created = first_repository
            .create(CreateLearningContentInput {
                name: "Rust 入门".to_string(),
                deadline: Some("2026-07-01".to_string()),
                estimated_hours: Some(12.5),
                progress: Some(25),
            })
            .expect("create learning content");
        drop(first_repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen db");
        let restored = reopened_repository.list().expect("list learning contents");

        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].id, created.id);
        assert_eq!(restored[0].name, "Rust 入门");
        assert_eq!(restored[0].status, StudyStatus::Planned);
        assert_eq!(restored[0].deadline.as_deref(), Some("2026-07-01"));
        assert_eq!(restored[0].estimated_hours, 12.5);
        assert_eq!(restored[0].progress, 25);
    }

    #[test]
    fn create_rejects_empty_name() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");

        let error = repository
            .create(CreateLearningContentInput {
                name: "   ".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect_err("empty name should fail");

        assert!(matches!(error, AppError::EmptyName));
    }

    #[test]
    fn create_rejects_progress_outside_zero_to_one_hundred() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");

        let error = repository
            .create(CreateLearningContentInput {
                name: "Rust 入门".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: Some(101),
            })
            .expect_err("invalid progress should fail");

        assert!(matches!(error, AppError::InvalidProgress));
    }

    #[test]
    fn updates_learning_content_basic_fields_after_reopening_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        let repository = LearningContentRepository::open(&database_path).expect("open db");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "进度编辑".to_string(),
                deadline: Some("2026-07-01".to_string()),
                estimated_hours: None,
                progress: Some(20),
            })
            .expect("create learning content");

        let updated = repository
            .update_learning_content(
                &learning_content.id,
                "进度编辑更新".to_string(),
                StudyStatus::Active,
                Some("2026-08-15".to_string()),
                8.5,
                65,
            )
            .expect("update learning content");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen db");
        let restored = reopened_repository.list().expect("list learning contents");

        assert_eq!(updated.name, "进度编辑更新");
        assert_eq!(updated.status, StudyStatus::Active);
        assert_eq!(updated.estimated_hours, 8.5);
        assert_eq!(updated.progress, 65);
        assert_eq!(updated.deadline.as_deref(), Some("2026-08-15"));
        assert_eq!(restored[0].id, learning_content.id);
        assert_eq!(restored[0].name, "进度编辑更新");
        assert_eq!(restored[0].status, StudyStatus::Active);
        assert_eq!(restored[0].estimated_hours, 8.5);
        assert_eq!(restored[0].progress, 65);
        assert_eq!(restored[0].deadline.as_deref(), Some("2026-08-15"));
    }

    #[test]
    fn detail_restores_imported_materials_and_plain_text_notes_after_reopening_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::write(&source_file, "hello").expect("write source file");

        let repository = LearningContentRepository::open(&database_path).expect("open db");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料导入闭环".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");

        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");
        let note = repository
            .create_note(
                &learning_content.id,
                "第一条笔记".to_string(),
                "纯文本正文".to_string(),
            )
            .expect("create note");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen db");
        let detail = reopened_repository
            .get_detail(&learning_content.id)
            .expect("get detail")
            .expect("detail exists");

        assert_eq!(detail.learning_content.id, learning_content.id);
        assert_eq!(detail.materials.len(), 1);
        assert_eq!(detail.materials[0].id, material.id);
        assert_eq!(detail.materials[0].name, "source.pdf");
        assert!(std::path::Path::new(
            detail.materials[0]
                .stored_path
                .as_deref()
                .expect("stored path")
        )
        .exists());
        assert_eq!(detail.notes.len(), 1);
        assert_eq!(detail.notes[0].id, note.id);
        assert_eq!(detail.notes[0].title, "第一条笔记");
        assert_eq!(detail.notes[0].body, "纯文本正文");
    }

    #[test]
    fn handwriting_notes_roundtrip_and_detail_only_lists_summaries() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        let repository = LearningContentRepository::open(&database_path).expect("open db");
        let learning_content = create_content(&repository, "手写笔记闭环");

        let note = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "草稿".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 1024.0,
                canvas_height: 720.0,
            })
            .expect("create handwriting note");
        let updated = repository
            .update_handwriting_note(UpdateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                note_id: note.id.clone(),
                title: "课堂板书".to_string(),
                stroke_data_json: handwriting_json_with_width(0.01),
                canvas_width: 1280.0,
                canvas_height: 720.0,
            })
            .expect("update handwriting note");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen db");
        let detail = reopened_repository
            .get_detail(&learning_content.id)
            .expect("get detail")
            .expect("detail exists");
        let loaded = reopened_repository
            .get_handwriting_note_in_content(&learning_content.id, &note.id)
            .expect("get handwriting note")
            .expect("handwriting note exists");

        assert_eq!(detail.handwriting_notes.len(), 1);
        assert_eq!(detail.handwriting_notes[0].id, note.id);
        assert_eq!(detail.handwriting_notes[0].title, "课堂板书");
        assert_eq!(detail.handwriting_notes[0].stroke_schema_version, 1);
        assert_eq!(loaded.stroke_data_json, updated.stroke_data_json);
        assert!(loaded.stroke_data_json.contains("\"strokes\""));
    }

    #[test]
    fn handwriting_note_validation_rejects_invalid_payloads() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let learning_content = create_content(&repository, "手写校验");

        let invalid_json = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "坏 JSON".to_string(),
                stroke_data_json: "{".to_string(),
                canvas_width: 1.0,
                canvas_height: 1.0,
            })
            .expect_err("invalid json rejected");
        assert!(matches!(invalid_json, AppError::InvalidHandwritingData));

        let unknown_schema =
            repository
                .create_handwriting_note(CreateHandwritingNoteInput {
                    learning_content_id: learning_content.id.clone(),
                    title: "坏版本".to_string(),
                    stroke_data_json:
                        r#"{"schemaVersion":2,"coordinateSpace":"normalized","strokes":[]}"#
                            .to_string(),
                    canvas_width: 1.0,
                    canvas_height: 1.0,
                })
                .expect_err("unknown schema rejected");
        assert!(matches!(unknown_schema, AppError::InvalidHandwritingData));

        let out_of_bounds = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "越界".to_string(),
                stroke_data_json: r##"{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{"id":"s1","tool":"pen","color":"#1f2937","width":0.006,"points":[{"x":1.5,"y":0.2,"t":1}]}]}"##.to_string(),
                canvas_width: 1.0,
                canvas_height: 1.0,
            })
            .expect_err("out of bounds rejected");
        assert!(matches!(out_of_bounds, AppError::InvalidHandwritingData));

        let invalid_canvas = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "超大画布".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 10001.0,
                canvas_height: 1.0,
            })
            .expect_err("oversized canvas rejected");
        assert!(matches!(invalid_canvas, AppError::InvalidHandwritingData));

        let long_title = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "长".repeat(201),
                stroke_data_json: handwriting_json(),
                canvas_width: 1.0,
                canvas_height: 1.0,
            })
            .expect_err("long title rejected");
        assert!(matches!(long_title, AppError::InvalidHandwritingData));

        let too_many_strokes = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "过多笔画".to_string(),
                stroke_data_json: handwriting_json_with_stroke_count(2001),
                canvas_width: 1.0,
                canvas_height: 1.0,
            })
            .expect_err("too many strokes rejected");
        assert!(matches!(
            too_many_strokes,
            AppError::HandwritingDataTooLarge
        ));

        let too_many_points = repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id,
                title: "过多点".to_string(),
                stroke_data_json: handwriting_json_with_point_count(100001),
                canvas_width: 1.0,
                canvas_height: 1.0,
            })
            .expect_err("too many points rejected");
        assert!(matches!(too_many_points, AppError::HandwritingDataTooLarge));
    }

    #[test]
    fn deleting_learning_content_cascades_handwriting_notes() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let learning_content = create_content(&repository, "删除手写笔记");
        repository
            .create_handwriting_note(CreateHandwritingNoteInput {
                learning_content_id: learning_content.id.clone(),
                title: "待删除手写".to_string(),
                stroke_data_json: handwriting_json(),
                canvas_width: 1024.0,
                canvas_height: 768.0,
            })
            .expect("create handwriting note");

        repository
            .delete_learning_content(&learning_content.id, &material_library_dir)
            .expect("delete learning content");

        assert_eq!(
            repository
                .debug_count_handwriting_notes()
                .expect("count handwriting notes"),
            0
        );
    }

    #[test]
    fn pdf_page_annotations_roundtrip_replace_and_isolate_by_material_and_page() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let first_pdf = temp_dir.path().join("讲义（第1章）#A.pdf");
        let second_pdf = temp_dir.path().join("讲义（第2章）#B.pdf");
        std::fs::write(&first_pdf, b"%PDF-1.7\n%%EOF").expect("write first pdf");
        std::fs::write(&second_pdf, b"%PDF-1.7\n%%EOF").expect("write second pdf");
        let content = create_content(&repository, "PDF 批注隔离");
        let first = repository
            .import_material_file(&content.id, &first_pdf, &material_library_dir, None)
            .expect("import first pdf");
        let second = repository
            .import_material_file(&content.id, &second_pdf, &material_library_dir, None)
            .expect("import second pdf");

        let first_page_one = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: first.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json_with_width(0.006),
                },
                &material_library_dir,
            )
            .expect("save first page one");
        let first_page_two = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: first.id.clone(),
                    page_number: 2,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json_with_width(0.012),
                },
                &material_library_dir,
            )
            .expect("save first page two");
        let second_page_one = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: second.id.clone(),
                    page_number: 1,
                    page_width: 842.0,
                    page_height: 595.0,
                    stroke_data: handwriting_json_with_width(0.018),
                },
                &material_library_dir,
            )
            .expect("save second page one");
        let replaced = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: first.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json_with_width(0.02),
                },
                &material_library_dir,
            )
            .expect("replace first page one");

        let loaded_first_page_one = repository
            .get_pdf_page_annotation(&first.id, 1, &material_library_dir)
            .expect("get first page one")
            .expect("first page one exists");
        let loaded_first_page_two = repository
            .get_pdf_page_annotation(&first.id, 2, &material_library_dir)
            .expect("get first page two")
            .expect("first page two exists");
        let loaded_second_page_one = repository
            .get_pdf_page_annotation(&second.id, 1, &material_library_dir)
            .expect("get second page one")
            .expect("second page one exists");

        assert_eq!(first_page_one.id, replaced.id);
        assert_ne!(first_page_one.id, first_page_two.id);
        assert_ne!(first_page_one.id, second_page_one.id);
        assert!(loaded_first_page_one.stroke_data_json.contains("0.02"));
        assert!(loaded_first_page_two.stroke_data_json.contains("0.012"));
        assert!(loaded_second_page_one.stroke_data_json.contains("0.018"));
        assert_eq!(
            repository
                .debug_count_pdf_page_annotations()
                .expect("count annotations"),
            3
        );
        assert!(repository
            .get_pdf_page_annotation(&first.id, 3, &material_library_dir)
            .expect("get missing page")
            .is_none());
    }

    #[test]
    fn pdf_page_annotations_reject_invalid_inputs_and_non_pdf_materials() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "PDF 批注校验");
        let pdf_source = temp_dir.path().join("safe.pdf");
        let text_source = temp_dir.path().join("safe.txt");
        std::fs::write(&pdf_source, b"%PDF-1.7\n%%EOF").expect("write pdf");
        std::fs::write(&text_source, "hello").expect("write text");
        let pdf = repository
            .import_material_file(&content.id, &pdf_source, &material_library_dir, None)
            .expect("import pdf");
        let text = repository
            .import_material_file(&content.id, &text_source, &material_library_dir, None)
            .expect("import text");
        let folder = repository
            .create_material_folder(&content.id, None, "资料夹")
            .expect("create folder");

        let bad_page = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: pdf.id.clone(),
                    page_number: 0,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect_err("page number should be rejected");
        let bad_size = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: pdf.id.clone(),
                    page_number: 1,
                    page_width: f64::NAN,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect_err("page size should be rejected");
        let bad_json = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: pdf.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: "not-json".to_string(),
                },
                &material_library_dir,
            )
            .expect_err("bad json should be rejected");
        let non_pdf = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: text.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect_err("text material should be rejected");
        let folder_error = repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: folder.id,
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect_err("folder should be rejected");

        assert!(matches!(bad_page, AppError::InvalidPdfAnnotationData));
        assert!(matches!(bad_size, AppError::InvalidPdfAnnotationData));
        assert!(matches!(bad_json, AppError::InvalidPdfAnnotationData));
        assert!(matches!(non_pdf, AppError::MaterialNotFound));
        assert!(matches!(folder_error, AppError::MaterialNotFound));
    }

    #[test]
    fn deleting_material_folder_learning_content_and_cleanup_remove_pdf_annotations() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "PDF 批注清理");
        let pdf_source = temp_dir.path().join("annotated.pdf");
        std::fs::write(&pdf_source, b"%PDF-1.7\n%%EOF").expect("write pdf");
        let folder = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create folder");
        let nested = repository
            .import_material_file(
                &content.id,
                &pdf_source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect("import nested pdf");

        repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: nested.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect("save nested annotation");
        repository
            .delete_material_item(&folder.id, &material_library_dir)
            .expect("delete folder");
        assert_eq!(
            repository
                .debug_count_pdf_page_annotations()
                .expect("count after folder delete"),
            0
        );

        let second = create_content(&repository, "PDF 批注学习内容删除");
        let second_material = repository
            .import_material_file(&second.id, &pdf_source, &material_library_dir, None)
            .expect("import second pdf");
        repository
            .save_pdf_page_annotation(
                SavePdfPageAnnotationInput {
                    material_id: second_material.id.clone(),
                    page_number: 1,
                    page_width: 595.0,
                    page_height: 842.0,
                    stroke_data: handwriting_json(),
                },
                &material_library_dir,
            )
            .expect("save second annotation");
        repository
            .delete_learning_content(&second.id, &material_library_dir)
            .expect("delete learning content");
        assert_eq!(
            repository
                .debug_count_pdf_page_annotations()
                .expect("count after learning content delete"),
            0
        );

        repository
            .connection
            .execute(
                "INSERT INTO pdf_page_annotations (
                    id, material_id, page_number, stroke_data_json, stroke_schema_version,
                    page_width, page_height, created_at, updated_at
                ) VALUES ('orphan-annotation', 'missing-material', 1, ?1, 1, 595.0, 842.0, '2026-06-17T00:00:00Z', '2026-06-17T00:00:00Z')",
                params![handwriting_json()],
            )
            .expect("insert orphan annotation");
        let cleanup = repository
            .cleanup_material_library(&material_library_dir)
            .expect("cleanup annotations");

        assert_eq!(cleanup.deleted_orphan_database_record_count, 1);
        assert_eq!(
            repository
                .debug_count_pdf_page_annotations()
                .expect("count after orphan cleanup"),
            0
        );
    }

    #[test]
    fn importing_duplicate_material_names_appends_suffix() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let first_source = temp_dir.path().join("资料.txt");
        let second_source = temp_dir.path().join("nested").join("资料.txt");
        std::fs::create_dir_all(second_source.parent().expect("parent"))
            .expect("create nested dir");
        std::fs::write(&first_source, "first").expect("write first source");
        std::fs::write(&second_source, "second").expect("write second source");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "重名导入".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");

        let first = repository
            .import_material_file(
                &learning_content.id,
                &first_source,
                &material_library_dir,
                None,
            )
            .expect("import first");
        let second = repository
            .import_material_file(
                &learning_content.id,
                &second_source,
                &material_library_dir,
                None,
            )
            .expect("import second");

        assert_eq!(first.name, "资料.txt");
        assert_eq!(second.name, "资料 (1).txt");
        assert_ne!(first.stored_path, second.stored_path);
        assert!(
            std::path::Path::new(second.stored_path.as_deref().expect("second stored path"))
                .exists()
        );
    }

    #[test]
    fn delete_learning_content_cascades_materials_notes_and_reading_states() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::write(&source_file, "hello").expect("write source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "删除学习项目".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");
        let stored_path = material.stored_path.clone().expect("stored path");
        repository
            .save_material_reading_state(&material.id, 2, 1.4, &material_library_dir)
            .expect("save material reading state");
        repository
            .create_note(
                &learning_content.id,
                "保留笔记".to_string(),
                "删除学习内容时同步删除".to_string(),
            )
            .expect("create note");

        let report = repository
            .delete_learning_content(&learning_content.id, &material_library_dir)
            .expect("delete learning content");
        assert_eq!(report.failed_cleanup_path_count, 0);

        assert!(repository
            .get_detail(&learning_content.id)
            .expect("get deleted detail")
            .is_none());
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            0
        );
        assert_eq!(repository.debug_count_notes().expect("count notes"), 0);
        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count material reading states"),
            0
        );
        assert!(!std::path::Path::new(&stored_path).exists());
        assert!(source_file.exists());
    }

    #[test]
    fn previews_text_material_with_utf16_bom() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("utf16.txt");
        std::fs::write(&source_file, [0xFF, 0xFE, 0x60, 0x4F, 0x7D, 0x59])
            .expect("write utf16 source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "多编码文本".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview material");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Text);
        assert_eq!(preview.text.as_deref(), Some("你好"));
        assert!(preview.encoding.as_deref().is_some());
    }

    #[test]
    fn previews_image_and_pdf_as_asset_paths_without_inline_bytes() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let image_file = temp_dir.path().join("image.png");
        let pdf_file = temp_dir.path().join("doc.pdf");
        std::fs::write(&image_file, [0x89, b'P', b'N', b'G']).expect("write image");
        std::fs::write(&pdf_file, b"%PDF-1.7").expect("write pdf");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "预览资料".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let image = repository
            .import_material_file(
                &learning_content.id,
                &image_file,
                &material_library_dir,
                None,
            )
            .expect("import image");
        let pdf = repository
            .import_material_file(&learning_content.id, &pdf_file, &material_library_dir, None)
            .expect("import pdf");

        let image_preview = repository
            .preview_material_file(&image.id, &material_library_dir)
            .expect("preview image");
        let pdf_preview = repository
            .preview_material_file(&pdf.id, &material_library_dir)
            .expect("preview pdf");

        assert_eq!(
            image_preview.kind,
            crate::models::MaterialPreviewKind::Image
        );
        assert_eq!(image_preview.data_url, None);
        assert_eq!(image_preview.asset_path, image.stored_path);
        assert_eq!(pdf_preview.kind, crate::models::MaterialPreviewKind::Pdf);
        assert_eq!(pdf_preview.mime_type.as_deref(), Some("application/pdf"));
        assert_eq!(pdf_preview.data_url, None);
        assert_eq!(pdf_preview.asset_path, pdf.stored_path);
    }

    #[test]
    fn preview_rejects_oversized_text_without_recording_recent_open() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("large.txt");
        std::fs::write(
            &source_file,
            vec![b'a'; (MAX_TEXT_PREVIEW_BYTES + 1) as usize],
        )
        .expect("write oversized text");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "超大文本".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");

        let error = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect_err("oversized text should fail");

        assert!(matches!(error, AppError::TextPreviewTooLarge));
        assert_eq!(repository.list().expect("list")[0].recent_open, None);
    }

    #[test]
    fn previews_supported_code_material_with_language_metadata() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("example.ts");
        std::fs::write(
            &source_file,
            "const message: string = '<script>alert(1)</script>';\nconsole.log(message);\n",
        )
        .expect("write source");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "代码预览".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview code");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Code);
        assert_eq!(
            preview.mime_type.as_deref(),
            Some("application/x-typescript")
        );
        assert_eq!(preview.language.as_deref(), Some("typescript"));
        assert_eq!(preview.language_label.as_deref(), Some("TypeScript"));
        assert_eq!(preview.line_count, Some(2));
        assert_eq!(preview.highlighting_mode.as_deref(), Some("highlight"));
        assert!(!preview.is_truncated);
        assert!(preview
            .text
            .as_deref()
            .expect("code text")
            .contains("<script>alert(1)</script>"));
        assert_eq!(preview.asset_path, None);
        assert_eq!(preview.data_url, None);
        assert!(repository.list().expect("list")[0].recent_open.is_some());
    }

    #[test]
    fn code_preview_uses_stored_extension_when_mime_is_octet_stream() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("component.tsx");
        std::fs::write(&source_file, "export function View() { return <div />; }\n")
            .expect("write source");
        let content = repository
            .create(CreateLearningContentInput {
                name: "octet fallback".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source_file, &material_library_dir, None)
            .expect("import material");
        repository
            .connection
            .execute(
                "UPDATE material_items SET name = ?1, mime_type = ?2 WHERE id = ?3",
                params!["重命名资料", "application/octet-stream", material.id],
            )
            .expect("update material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview code");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Code);
        assert_eq!(preview.language.as_deref(), Some("tsx"));
        assert_eq!(preview.language_label.as_deref(), Some("TSX"));
    }

    #[test]
    fn unsupported_code_like_extension_previews_as_plain_code_without_highlighting() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("settings.toml");
        std::fs::write(&source_file, "[package]\nname = \"studyseq\"\n").expect("write source");
        let content = repository
            .create(CreateLearningContentInput {
                name: "toml fallback".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source_file, &material_library_dir, None)
            .expect("import material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview toml");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Code);
        assert_eq!(preview.language, None);
        assert_eq!(preview.language_label, None);
        assert_eq!(
            preview.highlighting_mode.as_deref(),
            Some("plain_unknown_language")
        );
        assert!(!preview.is_truncated);
    }

    #[test]
    fn large_code_preview_disables_highlighting_and_truncates_at_two_mb() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("large.py");
        std::fs::write(
            &source_file,
            vec![b'a'; (CODE_PREVIEW_MAX_BYTES + 128) as usize],
        )
        .expect("write large code");
        let content = repository
            .create(CreateLearningContentInput {
                name: "large code".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source_file, &material_library_dir, None)
            .expect("import material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview large code");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Code);
        assert_eq!(preview.language.as_deref(), Some("python"));
        assert_eq!(
            preview.highlighting_mode.as_deref(),
            Some("plain_too_large")
        );
        assert!(preview.is_truncated);
        assert_eq!(
            preview.text.as_deref().expect("text").len(),
            CODE_PREVIEW_MAX_BYTES as usize
        );
    }

    #[test]
    fn material_library_location_defaults_and_migrates_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let default_library_dir = temp_dir.path().join("default-materials");
        let target_library_dir = temp_dir
            .path()
            .join("target")
            .join("StudySeqData")
            .join("materials");
        let user_sidecar_file = default_library_dir.join("手动放置.txt");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::create_dir_all(&default_library_dir).expect("create default library");
        std::fs::write(&user_sidecar_file, b"user").expect("write sidecar file");
        std::fs::write(&source_file, b"%PDF").expect("write source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料库迁移".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &default_library_dir,
                None,
            )
            .expect("import material");
        let old_stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));

        let initial_location = repository
            .get_material_library_location(&default_library_dir)
            .expect("get initial location");
        assert!(initial_location.is_default);
        assert_eq!(
            initial_location.path,
            default_library_dir.to_string_lossy().to_string()
        );

        let change_plan = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect("migrate library");

        let migrated_location = change_plan.location.clone();
        assert!(!migrated_location.is_default);
        assert_eq!(
            migrated_location.path,
            target_library_dir.to_string_lossy().to_string()
        );
        assert!(old_stored_path.exists());
        let detail = repository
            .get_detail(&learning_content.id)
            .expect("get detail")
            .expect("detail exists");
        let new_stored_path = PathBuf::from(
            detail.materials[0]
                .stored_path
                .as_deref()
                .expect("new stored path"),
        );
        assert!(new_stored_path.starts_with(&target_library_dir));
        assert!(new_stored_path.exists());
        assert!(user_sidecar_file.exists());

        let preview = repository
            .preview_material_file(&material.id, &target_library_dir)
            .expect("preview migrated material");
        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
        let report = change_plan.cleanup_old_files();
        assert_eq!(report.failed_cleanup_path_count, 0);
        assert!(!old_stored_path.exists());
    }

    #[test]
    fn material_library_location_allows_retry_when_target_copy_already_matches() {
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
        std::fs::write(&source_file, b"%PDF retry").expect("write source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料库迁移重试".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &default_library_dir,
                None,
            )
            .expect("import material");
        let old_stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));
        let target_copy = target_library_dir
            .join(&learning_content.id)
            .join(old_stored_path.file_name().expect("file name"));
        std::fs::create_dir_all(target_copy.parent().expect("target parent"))
            .expect("create target parent");
        std::fs::copy(&old_stored_path, &target_copy).expect("precopy matching target");

        let change_plan = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect("retry migration should accept matching target copy");

        assert!(old_stored_path.exists());
        let detail = repository
            .get_detail(&learning_content.id)
            .expect("get detail")
            .expect("detail exists");
        assert_eq!(
            detail.materials[0].stored_path.as_deref(),
            Some(target_copy.to_string_lossy().as_ref())
        );
        let report = change_plan.cleanup_old_files();
        assert_eq!(report.failed_cleanup_path_count, 0);
        assert!(!old_stored_path.exists());
    }

    #[test]
    fn material_library_location_can_roll_back_after_runtime_update_failure() {
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
        std::fs::write(&source_file, b"%PDF rollback").expect("write source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料库迁移回滚".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &default_library_dir,
                None,
            )
            .expect("import material");
        let old_stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));

        let change_plan = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect("migrate library");
        let target_stored_path = repository
            .get_detail(&learning_content.id)
            .expect("get migrated detail")
            .expect("detail exists")
            .materials[0]
            .stored_path
            .clone()
            .expect("target stored path");
        assert!(PathBuf::from(&target_stored_path).starts_with(&target_library_dir));

        repository
            .rollback_material_library_location(
                &target_library_dir,
                &default_library_dir,
                &change_plan.previous_dir,
            )
            .expect("rollback location");

        let rolled_back_location = repository
            .get_material_library_location(&default_library_dir)
            .expect("get rolled back location");
        assert!(rolled_back_location.is_default);
        let detail = repository
            .get_detail(&learning_content.id)
            .expect("get rolled back detail")
            .expect("detail exists");
        assert_eq!(
            detail.materials[0].stored_path.as_deref(),
            Some(old_stored_path.to_string_lossy().as_ref())
        );
        assert!(old_stored_path.exists());
        assert!(PathBuf::from(target_stored_path).exists());
    }

    #[test]
    fn material_library_location_rejects_stored_path_with_parent_directory_component() {
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
        std::fs::write(&source_file, b"%PDF parent").expect("write source file");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "拒绝异常路径".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &default_library_dir,
                None,
            )
            .expect("import material");
        let stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));
        let tampered_path = stored_path
            .parent()
            .expect("stored parent")
            .join("nested")
            .join("..")
            .join(stored_path.file_name().expect("file name"));
        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![tampered_path.to_string_lossy().to_string(), material.id],
            )
            .expect("tamper stored path");

        let error = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect_err("tampered path should fail");

        assert!(matches!(error, AppError::MaterialPathOutsideLibrary));
        assert!(stored_path.exists());
    }

    #[test]
    fn material_library_location_accepts_user_selected_storage_root() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let default_library_dir = temp_dir.path().join("default-materials");
        let selected_storage_root = temp_dir.path().join("selected-storage");
        let target_library_dir = selected_storage_root.join("StudySeqData").join("materials");

        let location = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &target_library_dir,
            )
            .expect("custom storage root should be accepted");

        assert!(!location.location.is_default);
        assert_eq!(
            location.location.path,
            target_library_dir.to_string_lossy().to_string()
        );
    }

    #[test]
    fn material_library_location_rejects_selected_root_itself() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let default_library_dir = temp_dir.path().join("default-materials");
        let selected_storage_root = temp_dir.path().join("selected-storage");

        let error = repository
            .set_material_library_location(
                &default_library_dir,
                &default_library_dir,
                &selected_storage_root,
            )
            .expect_err("selected root should not be treated as the cleanup root");

        assert!(matches!(error, AppError::InvalidMaterialLibraryLocation));
    }

    #[test]
    fn material_library_location_rejects_unsafe_saved_setting() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let default_library_dir = temp_dir.path().join("default-materials");
        repository
            .connection
            .execute(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES (?1, ?2, '2026-06-14T00:00:00Z')",
                params![
                    MATERIAL_LIBRARY_DIR_SETTING_KEY,
                    temp_dir
                        .path()
                        .join("unsupported-materials")
                        .to_string_lossy()
                        .to_string()
                ],
            )
            .expect("insert unsupported setting");

        let error = repository
            .get_material_library_location(&default_library_dir)
            .expect_err("unsupported saved setting should fail");

        assert!(matches!(error, AppError::InvalidMaterialLibraryLocation));
    }

    #[test]
    fn migrated_material_cleanup_ignores_missing_old_copies_and_counts_real_failures() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let library_root = temp_dir.path().join("materials");
        let target_root = temp_dir
            .path()
            .join("target")
            .join("StudySeqData")
            .join("materials");
        let missing_old_copy = library_root.join("content-1").join("missing.pdf");
        let migrated_copy = target_root.join("content-1").join("missing.pdf");
        let directory_old_copy = library_root.join("content-1").join("directory.pdf");
        let directory_migrated_copy = target_root.join("content-1").join("directory.pdf");
        std::fs::create_dir_all(&library_root).expect("create source library");
        std::fs::create_dir_all(&directory_old_copy).expect("create old copy directory");
        std::fs::create_dir_all(migrated_copy.parent().expect("target parent"))
            .expect("create target parent");
        std::fs::write(&migrated_copy, b"%PDF").expect("write migrated copy");
        std::fs::write(&directory_migrated_copy, b"%PDF").expect("write second migrated copy");
        let plan = vec![
            MaterialLibraryMigrationFile {
                source_path: missing_old_copy,
                target_path: migrated_copy,
            },
            MaterialLibraryMigrationFile {
                source_path: directory_old_copy,
                target_path: directory_migrated_copy,
            },
        ];

        let failed_count = cleanup_migrated_material_files(&plan, &library_root);

        assert_eq!(failed_count, 1);
    }

    #[test]
    fn material_file_cleanup_reports_delete_failures_without_paths() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let existing_file = temp_dir.path().join("existing.txt");
        let missing_file = temp_dir.path().join("missing.txt");
        let directory_path = temp_dir.path().join("directory");
        std::fs::write(&existing_file, b"delete me").expect("write existing file");
        std::fs::create_dir(&directory_path).expect("create directory");

        let failed_count = remove_material_file_paths_best_effort(&[
            existing_file.clone(),
            missing_file,
            directory_path.clone(),
        ]);

        assert_eq!(failed_count, 1);
        assert!(!existing_file.exists());
        assert!(directory_path.exists());
    }

    #[test]
    fn previews_material_inside_library_after_canonical_check() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("资料（第一章）.txt");
        std::fs::write(&source_file, "库内正文").expect("write source");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "库内预览".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview inside library");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Text);
        assert_eq!(preview.text.as_deref(), Some("库内正文"));
    }

    #[test]
    fn preview_refuses_stored_path_outside_material_library() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.txt");
        let outside_file = temp_dir.path().join("secret.txt");
        std::fs::write(&source_file, "safe").expect("write source");
        std::fs::write(&outside_file, "secret").expect("write outside");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "预览越界防护".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");
        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![outside_file.to_string_lossy().to_string(), material.id],
            )
            .expect("corrupt stored path");

        let error = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect_err("preview outside library should fail");

        assert!(matches!(error, AppError::MaterialPathOutsideLibrary));
        assert_eq!(
            std::fs::read_to_string(&outside_file).expect("read outside"),
            "secret"
        );
    }

    #[test]
    fn preview_refuses_relative_traversal_that_resolves_outside_library() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let outside_dir = temp_dir.path().join("outside");
        std::fs::create_dir_all(&outside_dir).expect("create outside dir");
        let source_file = temp_dir.path().join("source.txt");
        let outside_file = outside_dir.join("secret.txt");
        std::fs::write(&source_file, "safe").expect("write source");
        std::fs::write(&outside_file, "secret").expect("write outside");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "相对路径穿越".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");
        let traversal_path = material_library_dir
            .join("..")
            .join("outside")
            .join("secret.txt");
        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![traversal_path.to_string_lossy().to_string(), material.id],
            )
            .expect("corrupt stored path");

        let error = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect_err("relative traversal should fail");

        assert!(matches!(error, AppError::MaterialPathOutsideLibrary));
    }

    #[test]
    fn preview_missing_library_copy_returns_stable_file_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.txt");
        std::fs::write(&source_file, "source fallback must not be read").expect("write source");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "缺失副本".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import material");
        std::fs::remove_file(material.stored_path.as_deref().expect("stored path"))
            .expect("remove stored copy");

        let error = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect_err("missing library copy should fail");

        assert!(matches!(error, AppError::MaterialFileMissing));
        assert!(source_file.exists());
    }

    #[test]
    fn preview_missing_pdf_parent_directory_returns_stable_file_error() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.pdf");
        std::fs::write(&source_file, b"%PDF-1.7").expect("write source pdf");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "缺失 PDF 目录".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &source_file,
                &material_library_dir,
                None,
            )
            .expect("import pdf");
        let missing_pdf_path = material_library_dir
            .join("missing-parent")
            .join("source.pdf");
        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![missing_pdf_path.to_string_lossy().to_string(), material.id],
            )
            .expect("point stored path at missing child directory");

        let error = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect_err("missing pdf parent directory should fail as missing file");

        assert!(matches!(error, AppError::MaterialFileMissing));
        assert!(source_file.exists());
    }

    #[test]
    fn preview_folder_row_stays_unsupported_without_path_check_failure() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "文件夹预览".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let folder = repository
            .create_material_folder(&learning_content.id, None, "第一章")
            .expect("create folder");

        let preview = repository
            .preview_material_file(&folder.id, &material_library_dir)
            .expect("preview folder");

        assert_eq!(
            preview.kind,
            crate::models::MaterialPreviewKind::Unsupported
        );
        assert!(preview.text.is_none());
        assert!(preview.data_url.is_none());
    }

    #[test]
    fn updates_plain_text_note_after_reopening_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");

        let repository = LearningContentRepository::open(&database_path).expect("open db");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "笔记更新".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let note = repository
            .create_note(
                &learning_content.id,
                "旧标题".to_string(),
                "旧正文".to_string(),
            )
            .expect("create note");

        let updated_note = repository
            .update_note(&note.id, "新标题".to_string(), "新正文".to_string())
            .expect("update note");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen db");
        let detail = reopened_repository
            .get_detail(&learning_content.id)
            .expect("get detail")
            .expect("detail exists");

        assert_eq!(detail.notes[0].title, "新标题");
        assert_eq!(detail.notes[0].body, "新正文");
        assert_eq!(detail.notes[0].id, updated_note.id);
    }

    #[test]
    fn migrates_v1_database_and_persists_pdf_reading_state_by_material() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        {
            let connection = rusqlite::Connection::open(&database_path).expect("open raw db");
            connection
                .execute_batch(
                    "
                    CREATE TABLE learning_contents (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        deadline TEXT,
                        estimated_hours REAL DEFAULT 0,
                        progress INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_opened_at TEXT
                    );

                    CREATE TABLE material_items (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        original_path TEXT NOT NULL,
                        stored_path TEXT NOT NULL,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE reading_states (
                        learning_content_id TEXT PRIMARY KEY,
                        current_material_id TEXT,
                        current_note_id TEXT,
                        split_ratio INTEGER NOT NULL DEFAULT 55,
                        updated_at TEXT NOT NULL
                    );
                    ",
                )
                .expect("create v1 schema");
        }

        let repository = LearningContentRepository::open(&database_path).expect("migrate db");

        let material_library_dir = temp_dir.path().join("materials");
        let source_a = temp_dir.path().join("material-a.pdf");
        let source_b = temp_dir.path().join("material-b.pdf");
        std::fs::write(&source_a, b"%PDF-a").expect("write material a");
        std::fs::write(&source_b, b"%PDF-b").expect("write material b");
        let content = repository
            .create(CreateLearningContentInput {
                name: "旧库迁移内容".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material_a = repository
            .import_material_file(&content.id, &source_a, &material_library_dir, None)
            .expect("import material a");
        let material_b = repository
            .import_material_file(&content.id, &source_b, &material_library_dir, None)
            .expect("import material b");
        repository
            .save_material_reading_state(&material_a.id, 3, 1.4, &material_library_dir)
            .expect("save material a state");
        repository
            .save_material_reading_state(&material_b.id, 1, 1.0, &material_library_dir)
            .expect("save material b state");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen migrated db");
        let material_a_state = reopened_repository
            .get_material_reading_state(&material_a.id)
            .expect("get material a state")
            .expect("material a state exists");
        let material_b_state = reopened_repository
            .get_material_reading_state(&material_b.id)
            .expect("get material b state")
            .expect("material b state exists");
        let reading_states_table_count: i64 = reopened_repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'reading_states'",
                [],
                |row| row.get(0),
            )
            .expect("query old reading states table");

        assert_eq!(material_a_state.material_id, material_a.id);
        assert_eq!(material_a_state.page_number, 3);
        assert_eq!(material_a_state.scale, 1.4);
        assert_eq!(material_b_state.page_number, 1);
        assert_eq!(material_b_state.scale, 1.0);
        assert_eq!(
            material_a_state.position_kind,
            MaterialOpenPositionKind::PdfPage
        );
        assert_eq!(reading_states_table_count, 0);
    }

    #[test]
    fn migrates_v3_database_to_v5_tree_and_recent_open_schema() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        {
            let connection = rusqlite::Connection::open(&database_path).expect("open raw db");
            connection
                .execute_batch(
                    "
                    CREATE TABLE learning_contents (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        deadline TEXT,
                        estimated_hours REAL DEFAULT 0,
                        progress INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_opened_at TEXT
                    );

                    CREATE TABLE material_items (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        name TEXT NOT NULL,
                        original_path TEXT NOT NULL,
                        stored_path TEXT NOT NULL,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE material_reading_states (
                        material_id TEXT PRIMARY KEY,
                        page_number INTEGER NOT NULL DEFAULT 1,
                        scale REAL NOT NULL DEFAULT 1.0,
                        updated_at TEXT NOT NULL
                    );

                    INSERT INTO learning_contents (id, name, status, created_at, updated_at)
                    VALUES ('lc-1', '旧库内容', 'planned', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z');

                    INSERT INTO material_items (
                        id, learning_content_id, name, original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                    ) VALUES (
                        'mat-1', 'lc-1', '旧资料.pdf', 'D:\\src\\旧资料.pdf', 'C:\\lib\\旧资料.pdf', 'application/pdf', 9,
                        '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'
                    );

                    INSERT INTO material_reading_states (material_id, page_number, scale, updated_at)
                    VALUES ('mat-1', 7, 1.6, '2026-06-01T00:00:00Z');

                    PRAGMA user_version = 3;
                    ",
                )
                .expect("create v3 schema with data");
        }

        let repository = LearningContentRepository::open(&database_path).expect("migrate to v8");

        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let materials = repository.list_materials("lc-1").expect("list materials");
        let reading_state = repository
            .get_material_reading_state("mat-1")
            .expect("get migrated reading state")
            .expect("migrated reading state exists");
        let last_opened_column_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('material_reading_states') WHERE name = 'last_opened_at'",
                [],
                |row| row.get(0),
            )
            .expect("check last_opened_at column");

        assert_eq!(user_version, 8);
        assert_eq!(materials.len(), 1);
        assert_eq!(materials[0].id, "mat-1");
        assert_eq!(materials[0].name, "旧资料.pdf");
        assert_eq!(materials[0].parent_id, None);
        assert_eq!(materials[0].kind, crate::models::MaterialKind::File);
        assert_eq!(
            materials[0].stored_path.as_deref(),
            Some("C:\\lib\\旧资料.pdf")
        );
        assert_eq!(
            materials[0].original_path.as_deref(),
            Some("D:\\src\\旧资料.pdf")
        );
        assert_eq!(materials[0].mime_type.as_deref(), Some("application/pdf"));
        assert_eq!(materials[0].size_bytes, 9);
        assert_eq!(reading_state.page_number, 7);
        assert_eq!(reading_state.scale, 1.6);
        assert_eq!(reading_state.last_opened_at, None);
        assert_eq!(reading_state.position_kind, MaterialOpenPositionKind::None);
        assert_eq!(reading_state.video_position_seconds, None);
        assert_eq!(last_opened_column_count, 1);
    }

    #[test]
    fn migrates_v4_database_to_v8_pdf_annotation_schema() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        {
            let connection = rusqlite::Connection::open(&database_path).expect("open raw db");
            connection
                .execute_batch(
                    "
                    CREATE TABLE learning_contents (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        deadline TEXT,
                        estimated_hours REAL DEFAULT 0,
                        progress INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_opened_at TEXT
                    );

                    CREATE TABLE material_items (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        parent_id TEXT,
                        kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'folder')),
                        name TEXT NOT NULL,
                        original_path TEXT,
                        stored_path TEXT,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE material_reading_states (
                        material_id TEXT PRIMARY KEY,
                        page_number INTEGER NOT NULL DEFAULT 1,
                        scale REAL NOT NULL DEFAULT 1.0,
                        updated_at TEXT NOT NULL
                    );

                    INSERT INTO learning_contents (id, name, status, created_at, updated_at)
                    VALUES ('lc-v4', 'V4 内容', 'planned', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z');

                    INSERT INTO material_items (
                        id, learning_content_id, parent_id, kind, name, original_path, stored_path,
                        mime_type, size_bytes, created_at, updated_at
                    ) VALUES (
                        'mat-v4', 'lc-v4', NULL, 'file', 'V4资料.pdf', 'D:\\src\\v4.pdf',
                        'C:\\lib\\v4.pdf', 'application/pdf', 9,
                        '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'
                    );

                    INSERT INTO material_reading_states (material_id, page_number, scale, updated_at)
                    VALUES ('mat-v4', 5, 1.25, '2026-06-01T00:00:00Z');

                    PRAGMA user_version = 4;
                    ",
                )
                .expect("create v4 schema with data");
        }

        let repository = LearningContentRepository::open(&database_path).expect("migrate v4 to v8");
        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let reading_state = repository
            .get_material_reading_state("mat-v4")
            .expect("get migrated state")
            .expect("migrated state exists");
        let app_settings_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'",
                [],
                |row| row.get(0),
            )
            .expect("check app_settings");
        let handwriting_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'handwriting_notes'",
                [],
                |row| row.get(0),
            )
            .expect("check handwriting table");
        let pdf_annotation_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'pdf_page_annotations'",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation table");

        assert_eq!(user_version, 8);
        assert_eq!(reading_state.page_number, 5);
        assert_eq!(reading_state.scale, 1.25);
        assert_eq!(reading_state.position_kind, MaterialOpenPositionKind::None);
        assert_eq!(app_settings_count, 1);
        assert_eq!(handwriting_table_count, 1);
        assert_eq!(pdf_annotation_table_count, 1);
    }

    #[test]
    fn fresh_database_initializes_v8_pdf_annotation_schema() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");

        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let parent_id_column_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('material_items') WHERE name = 'parent_id'",
                [],
                |row| row.get(0),
            )
            .expect("check parent_id column");
        let position_kind_column_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('material_reading_states') WHERE name = 'position_kind'",
                [],
                |row| row.get(0),
            )
            .expect("check position_kind column");

        let app_settings_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'",
                [],
                |row| row.get(0),
            )
            .expect("check app_settings table");
        let handwriting_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'handwriting_notes'",
                [],
                |row| row.get(0),
            )
            .expect("check handwriting table");
        let handwriting_index_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_handwriting_notes_learning_content'",
                [],
                |row| row.get(0),
            )
            .expect("check handwriting index");
        let pdf_annotation_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'pdf_page_annotations'",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation table");
        let pdf_annotation_index_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_pdf_page_annotations_material'",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation index");
        let pdf_annotation_unique_index_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_index_list('pdf_page_annotations') WHERE [unique] = 1",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation unique index");

        assert_eq!(user_version, 8);
        assert_eq!(parent_id_column_count, 1);
        assert_eq!(position_kind_column_count, 1);
        assert_eq!(app_settings_table_count, 1);
        assert_eq!(handwriting_table_count, 1);
        assert_eq!(handwriting_index_count, 1);
        assert_eq!(pdf_annotation_table_count, 1);
        assert_eq!(pdf_annotation_index_count, 1);
        assert!(pdf_annotation_unique_index_count >= 1);
    }

    #[test]
    fn migrates_v6_database_to_v8_pdf_annotation_schema() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        {
            let connection = rusqlite::Connection::open(&database_path).expect("open raw db");
            connection
                .execute_batch(
                    "
                    CREATE TABLE learning_contents (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        deadline TEXT,
                        estimated_hours REAL DEFAULT 0,
                        progress INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_opened_at TEXT
                    );

                    CREATE TABLE material_items (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        parent_id TEXT,
                        kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'folder')),
                        name TEXT NOT NULL,
                        original_path TEXT,
                        stored_path TEXT,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE material_reading_states (
                        material_id TEXT PRIMARY KEY,
                        page_number INTEGER NOT NULL DEFAULT 1,
                        scale REAL NOT NULL DEFAULT 1.0,
                        last_opened_at TEXT,
                        position_kind TEXT NOT NULL DEFAULT 'none',
                        video_position_seconds REAL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    PRAGMA user_version = 6;
                    ",
                )
                .expect("create v6 schema");
        }

        let repository = LearningContentRepository::open(&database_path).expect("migrate db");
        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let handwriting_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'handwriting_notes'",
                [],
                |row| row.get(0),
            )
            .expect("check handwriting table");

        assert_eq!(user_version, 8);
        assert_eq!(handwriting_table_count, 1);
    }

    #[test]
    fn migrates_v7_database_to_v8_pdf_annotation_schema() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let database_path = temp_dir.path().join("studyseq.sqlite");
        {
            let connection = rusqlite::Connection::open(&database_path).expect("open raw db");
            connection
                .execute_batch(
                    "
                    CREATE TABLE learning_contents (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        deadline TEXT,
                        estimated_hours REAL DEFAULT 0,
                        progress INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        last_opened_at TEXT
                    );

                    CREATE TABLE material_items (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        parent_id TEXT,
                        kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'folder')),
                        name TEXT NOT NULL,
                        original_path TEXT,
                        stored_path TEXT,
                        mime_type TEXT,
                        size_bytes INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE material_reading_states (
                        material_id TEXT PRIMARY KEY,
                        page_number INTEGER NOT NULL DEFAULT 1,
                        scale REAL NOT NULL DEFAULT 1.0,
                        last_opened_at TEXT,
                        position_kind TEXT NOT NULL DEFAULT 'none',
                        video_position_seconds REAL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE handwriting_notes (
                        id TEXT PRIMARY KEY,
                        learning_content_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        stroke_data_json TEXT NOT NULL,
                        stroke_schema_version INTEGER NOT NULL DEFAULT 1,
                        canvas_width REAL NOT NULL DEFAULT 1,
                        canvas_height REAL NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    INSERT INTO learning_contents (id, name, status, created_at, updated_at)
                    VALUES ('lc-v7', 'V7 内容', 'planned', '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z');

                    INSERT INTO handwriting_notes (
                        id, learning_content_id, title, stroke_data_json, created_at, updated_at
                    ) VALUES (
                        'note-v7', 'lc-v7', 'V7 手写', '{\"schemaVersion\":1,\"coordinateSpace\":\"normalized\",\"strokes\":[]}',
                        '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'
                    );

                    PRAGMA user_version = 7;
                    ",
                )
                .expect("create v7 schema");
        }

        let repository = LearningContentRepository::open(&database_path).expect("migrate db");
        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let handwriting_count: i64 = repository
            .connection
            .query_row("SELECT COUNT(*) FROM handwriting_notes", [], |row| {
                row.get(0)
            })
            .expect("count handwriting notes");
        let pdf_annotation_table_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'pdf_page_annotations'",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation table");
        let pdf_annotation_index_count: i64 = repository
            .connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_pdf_page_annotations_material'",
                [],
                |row| row.get(0),
            )
            .expect("check pdf annotation index");

        assert_eq!(user_version, 8);
        assert_eq!(handwriting_count, 1);
        assert_eq!(pdf_annotation_table_count, 1);
        assert_eq!(pdf_annotation_index_count, 1);
    }

    #[test]
    fn material_library_stats_counts_references_missing_files_and_orphans() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let first_source = temp_dir.path().join("first.pdf");
        let second_source = temp_dir.path().join("second.txt");
        std::fs::write(&first_source, b"pdf").expect("write first");
        std::fs::write(&second_source, b"text").expect("write second");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料统计".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let first_material = repository
            .import_material_file(
                &learning_content.id,
                &first_source,
                &material_library_dir,
                None,
            )
            .expect("import first");
        let second_material = repository
            .import_material_file(
                &learning_content.id,
                &second_source,
                &material_library_dir,
                None,
            )
            .expect("import second");
        std::fs::remove_file(
            second_material
                .stored_path
                .as_deref()
                .expect("second stored path"),
        )
        .expect("remove referenced file");
        let orphan_path = material_library_dir
            .join(&learning_content.id)
            .join("orphan.tmp");
        std::fs::write(&orphan_path, b"orphan").expect("write orphan");

        let stats = repository
            .get_material_library_stats(&material_library_dir)
            .expect("get stats");

        assert_eq!(stats.material_count, 2);
        assert_eq!(
            stats.referenced_bytes,
            first_material.size_bytes + second_material.size_bytes
        );
        assert_eq!(stats.actual_referenced_bytes, first_material.size_bytes);
        assert_eq!(stats.missing_file_count, 1);
        assert_eq!(stats.orphan_file_count, 1);
        assert_eq!(stats.orphan_database_record_count, 0);
        assert_eq!(stats.orphan_bytes, 6);
        assert!(stats.library_bytes >= first_material.size_bytes + 6);
    }

    #[test]
    fn recent_open_summary_tracks_plain_pdf_and_video_positions() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let text_source = temp_dir.path().join("讲义.txt");
        let pdf_source = temp_dir.path().join("讲义.pdf");
        let video_source = temp_dir.path().join("课程.mp4");
        std::fs::write(&text_source, "hello").expect("write text");
        std::fs::write(&pdf_source, b"%PDF").expect("write pdf");
        std::fs::write(&video_source, b"video").expect("write video");
        let content = create_content(&repository, "最近打开");
        let text = repository
            .import_material_file(&content.id, &text_source, &material_library_dir, None)
            .expect("import text");
        let pdf = repository
            .import_material_file(&content.id, &pdf_source, &material_library_dir, None)
            .expect("import pdf");
        let video = repository
            .import_material_file(&content.id, &video_source, &material_library_dir, None)
            .expect("import video");

        let initial = repository.list().expect("list initial");
        assert_eq!(initial[0].recent_open, None);

        repository
            .preview_material_file(&text.id, &material_library_dir)
            .expect("preview text");
        let after_text = repository.list().expect("list after text");
        let text_summary = after_text[0].recent_open.as_ref().expect("text summary");
        assert_eq!(text_summary.material_id, text.id);
        assert_eq!(text_summary.material_name, "讲义.txt");
        assert!(matches!(
            text_summary.position,
            RecentMaterialOpenPosition::None
        ));

        repository
            .save_material_reading_state(&pdf.id, 14, 1.25, &material_library_dir)
            .expect("save pdf state");
        let after_pdf = repository.list().expect("list after pdf");
        let pdf_summary = after_pdf[0].recent_open.as_ref().expect("pdf summary");
        assert_eq!(pdf_summary.material_id, pdf.id);
        assert_eq!(pdf_summary.material_name, "讲义.pdf");
        assert!(matches!(
            pdf_summary.position,
            RecentMaterialOpenPosition::PdfPage { page_number: 14 }
        ));

        repository
            .preview_material_file(&video.id, &material_library_dir)
            .expect("preview video");
        repository
            .save_video_playback_state(&video.id, 1458.4, &material_library_dir)
            .expect("save video state");
        let after_video = repository.list().expect("list after video");
        let video_summary = after_video[0].recent_open.as_ref().expect("video summary");
        assert_eq!(video_summary.material_id, video.id);
        assert_eq!(video_summary.material_name, "课程.mp4");
        match video_summary.position {
            RecentMaterialOpenPosition::VideoSecond { seconds } => {
                assert_eq!(seconds, 1458.4);
            }
            _ => panic!("expected video position"),
        }
    }

    #[test]
    fn deleting_recent_material_removes_home_summary_reference() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = write_source(&temp_dir, "资料.txt");
        let content = create_content(&repository, "删除最近打开");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import material");
        repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("record open");
        assert!(repository.list().expect("list")[0].recent_open.is_some());

        repository
            .delete_material_item(&material.id, &material_library_dir)
            .expect("delete material");

        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count states"),
            0
        );
        assert_eq!(repository.list().expect("list")[0].recent_open, None);
    }

    #[test]
    fn material_open_state_rejects_missing_folder_and_invalid_video_position() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "状态校验");
        let folder = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create folder");
        let text_source = write_source(&temp_dir, "资料.txt");
        let text = repository
            .import_material_file(&content.id, &text_source, &material_library_dir, None)
            .expect("import text");

        assert!(matches!(
            repository
                .save_material_reading_state("missing", 1, 1.0, &material_library_dir)
                .expect_err("missing material should fail"),
            AppError::MaterialNotFound
        ));
        assert!(matches!(
            repository
                .record_material_open(&folder.id)
                .expect_err("folder should fail"),
            AppError::MaterialNotFound
        ));
        assert!(matches!(
            repository
                .save_video_playback_state(&text.id, -1.0, &material_library_dir)
                .expect_err("invalid position should fail"),
            AppError::InvalidPlaybackPosition
        ));
        assert!(matches!(
            repository
                .save_video_playback_state(&text.id, 10.0, &material_library_dir)
                .expect_err("non-video should fail"),
            AppError::MaterialNotFound
        ));
    }

    #[test]
    fn pdf_state_requires_pdf_material_inside_existing_library_copy() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "PDF 状态校验");
        let text_source = write_source(&temp_dir, "资料.txt");
        let pdf_source = write_source(&temp_dir, "资料.pdf");
        let text = repository
            .import_material_file(&content.id, &text_source, &material_library_dir, None)
            .expect("import text");
        let pdf = repository
            .import_material_file(&content.id, &pdf_source, &material_library_dir, None)
            .expect("import pdf");

        assert!(matches!(
            repository
                .save_material_reading_state(&text.id, 2, 1.0, &material_library_dir)
                .expect_err("text material should not accept pdf state"),
            AppError::MaterialNotFound
        ));

        let pdf_stored_path = pdf.stored_path.as_deref().expect("pdf stored path");
        std::fs::remove_file(pdf_stored_path).expect("remove pdf copy");
        assert!(matches!(
            repository
                .save_material_reading_state(&pdf.id, 2, 1.0, &material_library_dir)
                .expect_err("missing pdf copy should fail"),
            AppError::MaterialFileMissing
        ));
        assert_eq!(repository.list().expect("list")[0].recent_open, None);
    }

    #[test]
    fn video_preview_requires_existing_copy_and_progress_save_keeps_opened_at() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "视频打开校验");
        let video_source = temp_dir.path().join("课程.mp4");
        std::fs::write(&video_source, b"video").expect("write video");
        let video = repository
            .import_material_file(&content.id, &video_source, &material_library_dir, None)
            .expect("import video");

        repository
            .preview_material_file(&video.id, &material_library_dir)
            .expect("preview video");
        let opened_at = repository
            .get_material_reading_state(&video.id)
            .expect("get video state")
            .expect("state exists")
            .last_opened_at
            .expect("opened at exists");

        repository
            .save_video_playback_state(&video.id, 15.0, &material_library_dir)
            .expect("save video position");
        let state_after_position_save = repository
            .get_material_reading_state(&video.id)
            .expect("get video state")
            .expect("state exists");
        assert_eq!(
            state_after_position_save.last_opened_at.as_deref(),
            Some(opened_at.as_str())
        );
        assert_eq!(state_after_position_save.video_position_seconds, Some(15.0));

        let video_stored_path = video.stored_path.as_deref().expect("video stored path");
        std::fs::remove_file(video_stored_path).expect("remove video copy");
        assert!(matches!(
            repository
                .preview_material_file(&video.id, &material_library_dir)
                .expect_err("missing video copy should fail"),
            AppError::MaterialFileMissing
        ));
        assert!(matches!(
            repository
                .save_video_playback_state(&video.id, 20.0, &material_library_dir)
                .expect_err("missing video copy should reject progress save"),
            AppError::MaterialFileMissing
        ));
        assert_eq!(
            repository
                .list_with_material_library(&material_library_dir)
                .expect("list with library")[0]
                .recent_open,
            None
        );
    }

    #[test]
    fn video_progress_save_rejects_stored_path_outside_material_library() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "视频路径校验");
        let video_source = temp_dir.path().join("source.mp4");
        let outside_video = temp_dir.path().join("outside.mp4");
        std::fs::write(&video_source, b"video").expect("write video source");
        std::fs::write(&outside_video, b"outside").expect("write outside video");
        let video = repository
            .import_material_file(&content.id, &video_source, &material_library_dir, None)
            .expect("import video");
        repository
            .preview_material_file(&video.id, &material_library_dir)
            .expect("preview video");
        assert!(repository
            .list_with_material_library(&material_library_dir)
            .expect("list before tamper")[0]
            .recent_open
            .is_some());

        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![outside_video.to_string_lossy().to_string(), video.id],
            )
            .expect("tamper stored path");

        assert!(matches!(
            repository
                .save_video_playback_state(&video.id, 12.0, &material_library_dir)
                .expect_err("outside video path should reject progress save"),
            AppError::MaterialPathOutsideLibrary
        ));
        assert_eq!(
            repository
                .list_with_material_library(&material_library_dir)
                .expect("list after tamper")[0]
                .recent_open,
            None
        );
    }

    #[test]
    fn cleanup_material_library_removes_orphan_files_and_orphan_database_records_only() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("source.txt");
        std::fs::write(&source_file, b"kept").expect("write source");
        let orphan_content_id = "deleted-learning-content";
        let orphan_dir = material_library_dir.join(orphan_content_id);
        std::fs::create_dir_all(&orphan_dir).expect("create orphan dir");
        let orphan_material_path = orphan_dir.join("kept.txt");
        std::fs::write(&orphan_material_path, b"kept").expect("write orphan material copy");
        let orphan_file = orphan_dir.join("orphan.tmp");
        std::fs::write(&orphan_file, b"orphan").expect("write orphan");
        repository
            .connection
            .execute(
                "INSERT INTO material_items (
                    id, learning_content_id, name, original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    "orphan-material",
                    orphan_content_id,
                    "kept.txt",
                    source_file.to_string_lossy().to_string(),
                    orphan_material_path.to_string_lossy().to_string(),
                    "text/plain",
                    4,
                    "2026-06-10T00:00:00Z",
                    "2026-06-10T00:00:00Z",
                ],
            )
            .expect("insert orphan material");

        let report = repository
            .cleanup_material_library(&material_library_dir)
            .expect("cleanup library");

        assert_eq!(report.deleted_orphan_file_count, 2);
        assert!(report.deleted_orphan_database_record_count >= 1);
        assert!(!orphan_file.exists());
        assert!(!orphan_material_path.exists());
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            0
        );
        assert!(source_file.exists());
    }

    #[test]
    fn stats_count_orphan_database_records_separately_from_missing_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        std::fs::create_dir_all(&material_library_dir).expect("create library dir");
        repository
            .connection
            .execute(
                "INSERT INTO material_items (
                    id, learning_content_id, parent_id, kind, name,
                    original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                ) VALUES (?1, ?2, NULL, 'folder', ?3, NULL, NULL, NULL, 0, ?4, ?4)",
                params![
                    "orphan-folder",
                    "deleted-content",
                    "孤儿文件夹",
                    "2026-06-10T00:00:00Z",
                ],
            )
            .expect("insert orphan folder row");

        let stats = repository
            .get_material_library_stats(&material_library_dir)
            .expect("get stats");

        assert_eq!(stats.missing_file_count, 0);
        assert_eq!(stats.orphan_file_count, 0);
        assert_eq!(stats.orphan_database_record_count, 1);
    }

    #[test]
    fn cleanup_rolls_back_orphan_database_records_and_reading_states_on_db_failure() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let orphan_content_id = "deleted-learning-content";
        let orphan_dir = material_library_dir.join(orphan_content_id);
        std::fs::create_dir_all(&orphan_dir).expect("create orphan dir");
        let orphan_material_path = orphan_dir.join("orphan.txt");
        std::fs::write(&orphan_material_path, b"orphan").expect("write orphan copy");
        repository
            .connection
            .execute(
                "INSERT INTO material_items (
                    id, learning_content_id, name, original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    "orphan-material",
                    orphan_content_id,
                    "orphan.txt",
                    "C:/source/orphan.txt",
                    orphan_material_path.to_string_lossy().to_string(),
                    "text/plain",
                    6,
                    "2026-06-10T00:00:00Z",
                    "2026-06-10T00:00:00Z",
                ],
            )
            .expect("insert orphan material");
        repository
            .connection
            .execute(
                "INSERT INTO material_reading_states (
                    material_id, page_number, scale, last_opened_at, position_kind,
                    video_position_seconds, updated_at
                ) VALUES (?1, 3, 1.2, ?2, 'pdf_page', NULL, ?2)",
                params!["orphan-material", "2026-06-10T00:00:00Z"],
            )
            .expect("insert orphan reading state");
        repository
            .connection
            .execute_batch(
                "
                CREATE TRIGGER fail_orphan_material_delete
                BEFORE DELETE ON material_items
                WHEN OLD.id = 'orphan-material'
                BEGIN
                    SELECT RAISE(ABORT, 'forced cleanup failure');
                END;
                ",
            )
            .expect("create failing trigger");

        let error = repository
            .cleanup_material_library(&material_library_dir)
            .expect_err("cleanup should fail during database delete");

        assert!(matches!(error, AppError::Database(_)));
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            1
        );
        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count reading states"),
            1
        );

        repository
            .connection
            .execute_batch("DROP TRIGGER fail_orphan_material_delete;")
            .expect("drop failing trigger");
        let report = repository
            .cleanup_material_library(&material_library_dir)
            .expect("retry cleanup");

        assert_eq!(report.deleted_orphan_database_record_count, 1);
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            0
        );
        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count reading states"),
            0
        );
    }

    #[test]
    fn renames_material_with_duplicate_suffix_and_keeps_preview_working() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let first_source = temp_dir.path().join("first.txt");
        let second_source = temp_dir.path().join("second.txt");
        std::fs::write(&first_source, "first").expect("write first");
        std::fs::write(&second_source, "second").expect("write second");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "资料重命名".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let first_material = repository
            .import_material_file(
                &learning_content.id,
                &first_source,
                &material_library_dir,
                None,
            )
            .expect("import first");
        let second_material = repository
            .import_material_file(
                &learning_content.id,
                &second_source,
                &material_library_dir,
                None,
            )
            .expect("import second");

        let rename_report = repository
            .rename_material_item(&second_material.id, "资料.txt", &material_library_dir)
            .expect("rename material");
        let renamed = rename_report.material;

        let renamed_stored_path = renamed.stored_path.as_deref().expect("renamed stored path");
        assert_eq!(renamed.name, "资料.txt");
        assert!(renamed_stored_path.ends_with("资料.txt"));
        assert!(std::path::Path::new(renamed_stored_path).exists());
        assert!(!std::path::Path::new(
            second_material
                .stored_path
                .as_deref()
                .expect("second stored path")
        )
        .exists());

        let rename_again_report = repository
            .rename_material_item(&renamed.id, &first_material.name, &material_library_dir)
            .expect("rename duplicate material");
        let renamed_again = rename_again_report.material;
        assert_eq!(renamed_again.name, "first (1).txt");
        assert!(std::path::Path::new(
            renamed_again
                .stored_path
                .as_deref()
                .expect("renamed again stored path")
        )
        .exists());

        let preview = repository
            .preview_material_file(&renamed_again.id, &material_library_dir)
            .expect("preview renamed");
        assert_eq!(preview.text.as_deref(), Some("second"));
    }

    #[test]
    fn legacy_octet_stream_code_material_stays_code_after_rename_without_extension() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("legacy.rs");
        std::fs::write(&source, "fn main() {}\n").expect("write source");
        let content = repository
            .create(CreateLearningContentInput {
                name: "legacy code".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create content");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import material");
        repository
            .connection
            .execute(
                "UPDATE material_items SET mime_type = 'application/octet-stream' WHERE id = ?1",
                params![material.id],
            )
            .expect("simulate legacy octet stream");

        let renamed = repository
            .rename_material_item(&material.id, "重命名代码", &material_library_dir)
            .expect("rename material")
            .material;
        let preview = repository
            .preview_material_file(&renamed.id, &material_library_dir)
            .expect("preview renamed code");

        assert_eq!(renamed.mime_type.as_deref(), Some("text/x-rust"));
        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Code);
        assert_eq!(preview.language.as_deref(), Some("rust"));
        assert_eq!(preview.text.as_deref(), Some("fn main() {}\n"));
    }

    #[test]
    fn material_rename_reports_rollback_failure_without_silently_losing_file() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let source_path = temp_dir.path().join("missing-parent").join("source.txt");
        let target_path = temp_dir.path().join("target.txt");
        std::fs::write(&target_path, "target moved").expect("write target");

        let error = rollback_material_rename(&source_path, &target_path)
            .expect_err("rollback should fail when source parent is missing");

        assert!(matches!(error, AppError::MaterialRenameRollbackFailed));
        assert_eq!(
            std::fs::read_to_string(&target_path).expect("target should remain for diagnosis"),
            "target moved"
        );
    }

    #[test]
    fn imports_mp4_and_webm_with_video_mime_types() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let mp4_source = temp_dir.path().join("课程视频.mp4");
        let webm_source = temp_dir.path().join("clip.webm");
        std::fs::write(&mp4_source, b"fake mp4 bytes").expect("write mp4");
        std::fs::write(&webm_source, b"fake webm bytes").expect("write webm");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "视频导入".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");

        let mp4 = repository
            .import_material_file(
                &learning_content.id,
                &mp4_source,
                &material_library_dir,
                None,
            )
            .expect("import mp4");
        let webm = repository
            .import_material_file(
                &learning_content.id,
                &webm_source,
                &material_library_dir,
                None,
            )
            .expect("import webm");

        assert_eq!(mp4.mime_type.as_deref(), Some("video/mp4"));
        assert_eq!(webm.mime_type.as_deref(), Some("video/webm"));
    }

    #[test]
    fn previews_video_material_without_reading_file_bytes() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let mp4_source = temp_dir.path().join("lecture.mp4");
        std::fs::write(&mp4_source, b"fake mp4 bytes").expect("write mp4");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "视频预览".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &mp4_source,
                &material_library_dir,
                None,
            )
            .expect("import mp4");
        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview video");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Video);
        assert_eq!(preview.mime_type.as_deref(), Some("video/mp4"));
        assert!(preview.data_url.is_none());
        assert!(preview.text.is_none());
        assert!(preview.encoding.is_none());
    }

    #[test]
    fn previews_unsupported_video_format_with_video_mime_hint_without_reading_bytes() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let mkv_source = temp_dir.path().join("movie.mkv");
        std::fs::write(&mkv_source, b"fake mkv bytes").expect("write mkv");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "不支持视频格式".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &mkv_source,
                &material_library_dir,
                None,
            )
            .expect("import mkv");
        std::fs::remove_file(material.stored_path.as_deref().expect("stored path"))
            .expect("remove stored copy");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview mkv");

        assert_eq!(
            preview.kind,
            crate::models::MaterialPreviewKind::Unsupported
        );
        assert!(preview
            .mime_type
            .as_deref()
            .expect("mkv mime")
            .starts_with("video/"));
        assert!(preview.data_url.is_none());
    }

    fn create_content(repository: &LearningContentRepository, name: &str) -> LearningContent {
        repository
            .create(CreateLearningContentInput {
                name: name.to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content")
    }

    fn handwriting_json() -> String {
        handwriting_json_with_width(0.006)
    }

    fn handwriting_json_with_width(width: f64) -> String {
        format!(
            r##"{{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{{"id":"stroke-1","tool":"pen","color":"#1f2937","width":{},"points":[{{"x":0.12,"y":0.24,"t":1}},{{"x":0.2,"y":0.28,"t":2}}]}}]}}"##,
            width
        )
    }

    fn handwriting_json_with_stroke_count(count: usize) -> String {
        let strokes = (0..count)
            .map(|index| {
                format!(
                    r##"{{"id":"stroke-{index}","tool":"pen","color":"#1f2937","width":0.006,"points":[]}}"##
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!(r##"{{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{strokes}]}}"##)
    }

    fn handwriting_json_with_point_count(count: usize) -> String {
        let points = (0..count)
            .map(|index| format!(r#"{{"x":0.1,"y":0.2,"t":{index}}}"#))
            .collect::<Vec<_>>()
            .join(",");
        format!(
            r##"{{"schemaVersion":1,"coordinateSpace":"normalized","strokes":[{{"id":"stroke-many","tool":"pen","color":"#1f2937","width":0.006,"points":[{points}]}}]}}"##
        )
    }

    fn write_source(temp_dir: &tempfile::TempDir, name: &str) -> PathBuf {
        let path = temp_dir.path().join(name);
        std::fs::write(&path, b"content").expect("write source");
        path
    }

    #[test]
    fn creates_nested_material_folders() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_content(&repository, "嵌套文件夹");

        let parent = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create parent folder");
        let child = repository
            .create_material_folder(&content.id, Some(&parent.id), "习题")
            .expect("create child folder");

        assert_eq!(parent.kind, MaterialKind::Folder);
        assert_eq!(parent.parent_id, None);
        assert_eq!(parent.stored_path, None);
        assert_eq!(child.parent_id.as_deref(), Some(parent.id.as_str()));

        let error = repository
            .create_material_folder(&content.id, Some("missing-folder"), "无效")
            .expect_err("missing parent should fail");
        assert!(matches!(error, AppError::FolderNotFound));
    }

    #[test]
    fn sibling_names_share_one_pool_and_different_folders_allow_same_name() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "同名规则");
        let source = write_source(&temp_dir, "资料");

        let folder = repository
            .create_material_folder(&content.id, None, "资料")
            .expect("create folder");
        // 同级文件与文件夹同池判重：导入同名文件应追加后缀
        let file = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import file");
        // 不同父级允许同名
        let nested_folder = repository
            .create_material_folder(&content.id, Some(&folder.id), "资料")
            .expect("create nested same-name folder");
        let sibling_folder = repository
            .create_material_folder(&content.id, None, "资料")
            .expect("create same-name sibling folder");

        assert_eq!(folder.name, "资料");
        assert_eq!(file.name, "资料 (1)");
        assert_eq!(nested_folder.name, "资料");
        assert_eq!(sibling_folder.name, "资料 (2)");
    }

    #[test]
    fn imports_material_into_folder_and_deduplicates_within_folder() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "文件夹导入");
        let first_source = write_source(&temp_dir, "讲义.txt");
        let second_source = temp_dir.path().join("nested").join("讲义.txt");
        std::fs::create_dir_all(second_source.parent().expect("parent")).expect("nested dir");
        std::fs::write(&second_source, b"second").expect("write second");

        let folder = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create folder");
        let first = repository
            .import_material_file(
                &content.id,
                &first_source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect("import into folder");
        let second = repository
            .import_material_file(
                &content.id,
                &second_source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect("import duplicate into folder");

        assert_eq!(first.parent_id.as_deref(), Some(folder.id.as_str()));
        assert_eq!(first.name, "讲义.txt");
        assert_eq!(second.name, "讲义 (1).txt");

        // 导入目标必须是同一学习内容下的文件夹
        let other_content = create_content(&repository, "另一个内容");
        let error = repository
            .import_material_file(
                &other_content.id,
                &first_source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect_err("cross content folder should fail");
        assert!(matches!(error, AppError::FolderNotFound));
    }

    #[test]
    fn moves_material_between_root_and_folder_with_dedup() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "移动资料");
        let source = write_source(&temp_dir, "笔记.txt");
        let duplicate_source = temp_dir.path().join("nested").join("笔记.txt");
        std::fs::create_dir_all(duplicate_source.parent().expect("parent")).expect("nested dir");
        std::fs::write(&duplicate_source, b"dup").expect("write dup");

        let folder = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create folder");
        let file = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import at root");
        let occupied = repository
            .import_material_file(
                &content.id,
                &duplicate_source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect("import duplicate inside folder");

        let moved = repository
            .move_material_item(&file.id, Some(&folder.id))
            .expect("move into folder");
        assert_eq!(moved.parent_id.as_deref(), Some(folder.id.as_str()));
        // 目标内已有同名文件，移动后追加后缀
        assert_eq!(occupied.name, "笔记.txt");
        assert_eq!(moved.name, "笔记 (1).txt");
        let moved_stored_path = moved.stored_path.as_deref().expect("moved stored path");
        assert!(Path::new(moved_stored_path).starts_with(&material_library_dir));
        assert!(Path::new(moved_stored_path).exists());
        assert!(!Path::new("笔记 (1).txt").exists());

        let moved_back = repository
            .move_material_item(&moved.id, None)
            .expect("move back to root");
        assert_eq!(moved_back.parent_id, None);
    }

    #[test]
    fn move_rejects_invalid_targets() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "移动校验");
        let other_content = create_content(&repository, "另一个内容");
        let source = write_source(&temp_dir, "文件.txt");

        let outer = repository
            .create_material_folder(&content.id, None, "外层")
            .expect("create outer");
        let inner = repository
            .create_material_folder(&content.id, Some(&outer.id), "内层")
            .expect("create inner");
        let file = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import file");
        let other_folder = repository
            .create_material_folder(&other_content.id, None, "他处")
            .expect("create other folder");

        // 文件夹不能移入自身
        assert!(matches!(
            repository
                .move_material_item(&outer.id, Some(&outer.id))
                .expect_err("move into self"),
            AppError::InvalidMoveTarget
        ));
        // 文件夹不能移入其后代
        assert!(matches!(
            repository
                .move_material_item(&outer.id, Some(&inner.id))
                .expect_err("move into descendant"),
            AppError::InvalidMoveTarget
        ));
        // 不能跨学习内容移动
        assert!(matches!(
            repository
                .move_material_item(&file.id, Some(&other_folder.id))
                .expect_err("move across contents"),
            AppError::InvalidMoveTarget
        ));
        // 目标必须是文件夹
        assert!(matches!(
            repository
                .move_material_item(&outer.id, Some(&file.id))
                .expect_err("move into file"),
            AppError::InvalidMoveTarget
        ));
        // 目标不存在
        assert!(matches!(
            repository
                .move_material_item(&file.id, Some("missing"))
                .expect_err("move into missing"),
            AppError::FolderNotFound
        ));
    }

    #[test]
    fn deletes_folder_recursively_cleaning_disk_records_and_reading_states() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "递归删除");
        let outer_source = write_source(&temp_dir, "外层文件.pdf");
        let inner_source = write_source(&temp_dir, "内层文件.pdf");
        let root_source = write_source(&temp_dir, "根文件.txt");

        let outer = repository
            .create_material_folder(&content.id, None, "外层")
            .expect("create outer");
        let inner = repository
            .create_material_folder(&content.id, Some(&outer.id), "内层")
            .expect("create inner");
        let outer_file = repository
            .import_material_file(
                &content.id,
                &outer_source,
                &material_library_dir,
                Some(&outer.id),
            )
            .expect("import outer file");
        let inner_file = repository
            .import_material_file(
                &content.id,
                &inner_source,
                &material_library_dir,
                Some(&inner.id),
            )
            .expect("import inner file");
        let root_file = repository
            .import_material_file(&content.id, &root_source, &material_library_dir, None)
            .expect("import root file");
        repository
            .save_material_reading_state(&outer_file.id, 3, 1.2, &material_library_dir)
            .expect("save reading state");

        let count = repository
            .count_material_subtree(&outer.id)
            .expect("count subtree");
        assert_eq!(count.file_count, 2);
        assert_eq!(count.folder_count, 1);

        repository
            .delete_material_item(&outer.id, &material_library_dir)
            .expect("delete folder recursively");

        let materials = repository.list_materials(&content.id).expect("list");
        assert_eq!(materials.len(), 1);
        assert_eq!(materials[0].id, root_file.id);
        assert!(
            !std::path::Path::new(outer_file.stored_path.as_deref().expect("outer stored"))
                .exists()
        );
        assert!(
            !std::path::Path::new(inner_file.stored_path.as_deref().expect("inner stored"))
                .exists()
        );
        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count reading states"),
            0
        );
        // 用户原始来源文件不受影响
        assert!(outer_source.exists());
        assert!(inner_source.exists());
    }

    #[test]
    fn delete_material_item_keeps_file_when_database_delete_fails() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "删除失败保护");
        let source = write_source(&temp_dir, "文件.txt");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import material");
        let stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));
        repository
            .connection
            .execute_batch(
                "
                CREATE TRIGGER fail_material_delete
                BEFORE DELETE ON material_items
                BEGIN
                    SELECT RAISE(FAIL, 'blocked material delete');
                END;
                ",
            )
            .expect("create failing trigger");

        let error = repository
            .delete_material_item(&material.id, &material_library_dir)
            .expect_err("db delete should fail");

        assert!(matches!(error, AppError::Database(_)));
        assert!(stored_path.exists());
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            1
        );
    }

    #[test]
    fn delete_learning_content_with_nested_folders_leaves_no_residue() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "级联删除含文件夹");
        let source = write_source(&temp_dir, "文件.pdf");

        let outer = repository
            .create_material_folder(&content.id, None, "外层")
            .expect("create outer");
        let inner = repository
            .create_material_folder(&content.id, Some(&outer.id), "内层")
            .expect("create inner");
        let file = repository
            .import_material_file(&content.id, &source, &material_library_dir, Some(&inner.id))
            .expect("import file");
        repository
            .save_material_reading_state(&file.id, 2, 1.0, &material_library_dir)
            .expect("save reading state");

        let report = repository
            .delete_learning_content(&content.id, &material_library_dir)
            .expect("delete learning content with folders");
        assert_eq!(report.failed_cleanup_path_count, 0);

        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            0
        );
        assert_eq!(
            repository
                .debug_count_material_reading_states()
                .expect("count reading states"),
            0
        );
        assert!(!std::path::Path::new(file.stored_path.as_deref().expect("stored")).exists());
        assert!(source.exists());
    }

    #[test]
    fn delete_learning_content_keeps_files_when_database_delete_fails() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "学习内容删除失败保护");
        let source = write_source(&temp_dir, "文件.txt");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import material");
        let stored_path = PathBuf::from(material.stored_path.as_deref().expect("stored path"));
        repository
            .connection
            .execute_batch(
                "
                CREATE TRIGGER fail_learning_content_delete
                BEFORE DELETE ON learning_contents
                BEGIN
                    SELECT RAISE(FAIL, 'blocked learning content delete');
                END;
                ",
            )
            .expect("create failing trigger");

        let error = repository
            .delete_learning_content(&content.id, &material_library_dir)
            .expect_err("db delete should fail");

        assert!(matches!(error, AppError::Database(_)));
        assert!(stored_path.exists());
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            1
        );
        assert!(repository
            .get_detail(&content.id)
            .expect("get detail")
            .is_some());
    }

    #[test]
    fn stats_count_files_inside_folders_and_ignore_folder_rows() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "文件夹统计");
        let source = write_source(&temp_dir, "文件.txt");

        let folder = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create folder");
        let file = repository
            .import_material_file(
                &content.id,
                &source,
                &material_library_dir,
                Some(&folder.id),
            )
            .expect("import into folder");

        let stats = repository
            .get_material_library_stats(&material_library_dir)
            .expect("get stats");

        // folder 行不计入资料数，也不产生 missing
        assert_eq!(stats.material_count, 1);
        assert_eq!(stats.referenced_bytes, file.size_bytes);
        assert_eq!(stats.missing_file_count, 0);
        assert_eq!(stats.orphan_file_count, 0);
    }

    #[test]
    fn cleanup_removes_orphan_folder_records_without_disk_operations() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        std::fs::create_dir_all(&material_library_dir).expect("create library dir");
        repository
            .connection
            .execute(
                "INSERT INTO material_items (
                    id, learning_content_id, parent_id, kind, name,
                    original_path, stored_path, mime_type, size_bytes, created_at, updated_at
                ) VALUES (?1, ?2, NULL, 'folder', ?3, NULL, NULL, NULL, 0, ?4, ?4)",
                params![
                    "orphan-folder",
                    "deleted-content",
                    "孤儿文件夹",
                    "2026-06-10T00:00:00Z",
                ],
            )
            .expect("insert orphan folder row");

        let report = repository
            .cleanup_material_library(&material_library_dir)
            .expect("cleanup");

        assert_eq!(report.deleted_orphan_database_record_count, 1);
        assert_eq!(report.deleted_orphan_file_count, 0);
        assert_eq!(
            repository.debug_count_materials().expect("count materials"),
            0
        );
    }

    #[test]
    fn renames_folder_in_database_only_with_sibling_dedup() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let content = create_content(&repository, "文件夹重命名");

        let first = repository
            .create_material_folder(&content.id, None, "第一章")
            .expect("create first");
        let second = repository
            .create_material_folder(&content.id, None, "第二章")
            .expect("create second");

        let rename_report = repository
            .rename_material_item(&second.id, "第一章", temp_dir.path().join("materials"))
            .expect("rename folder");
        let renamed = rename_report.material;

        assert_eq!(renamed.kind, MaterialKind::Folder);
        assert_eq!(renamed.name, "第一章 (1)");
        assert_eq!(renamed.stored_path, None);
        assert_eq!(first.name, "第一章");
    }

    #[test]
    fn rename_refuses_to_touch_files_outside_material_library() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source_file = temp_dir.path().join("原始文件.txt");
        std::fs::write(&source_file, b"user original").expect("write source");
        let content = create_content(&repository, "重命名越界防护");
        let material = repository
            .import_material_file(&content.id, &source_file, &material_library_dir, None)
            .expect("import material");
        // 模拟损坏/被篡改的记录：stored_path 指向库外的用户原始文件
        repository
            .connection
            .execute(
                "UPDATE material_items SET stored_path = ?1 WHERE id = ?2",
                params![source_file.to_string_lossy().to_string(), material.id],
            )
            .expect("corrupt stored path");

        let error = repository
            .rename_material_item(&material.id, "改名.txt", &material_library_dir)
            .expect_err("rename outside library should fail");

        assert!(matches!(error, AppError::MaterialPathOutsideLibrary));
        // 用户原始文件原地未动
        assert!(source_file.exists());
        assert_eq!(
            std::fs::read(&source_file).expect("read source"),
            b"user original"
        );
    }

    #[test]
    fn resolve_preview_mime_falls_back_to_original_when_stored_path_has_no_extension() {
        assert_eq!(
            resolve_preview_mime(Some("application/octet-stream"), "C:\\library\\讲座"),
            Some("application/octet-stream".to_string())
        );
        assert_eq!(resolve_preview_mime(None, "C:\\library\\讲座"), None);
        // 有效 mime 不被 stored_path 扩展名覆盖
        assert_eq!(
            resolve_preview_mime(Some("text/plain"), "C:\\library\\note.mp4"),
            Some("text/plain".to_string())
        );
    }

    #[test]
    fn previews_legacy_octet_stream_video_record_as_video() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let mp4_source = temp_dir.path().join("旧版导入.mp4");
        std::fs::write(&mp4_source, b"fake mp4 bytes").expect("write mp4");
        let learning_content = repository
            .create(CreateLearningContentInput {
                name: "存量视频兜底".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(
                &learning_content.id,
                &mp4_source,
                &material_library_dir,
                None,
            )
            .expect("import mp4");
        // 模拟 V1.1 及更早版本导入的存量记录：mime 落库为 application/octet-stream
        repository
            .connection
            .execute(
                "UPDATE material_items SET mime_type = 'application/octet-stream' WHERE id = ?1",
                params![material.id],
            )
            .expect("downgrade mime to legacy value");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview legacy video");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Video);
        assert_eq!(preview.mime_type.as_deref(), Some("video/mp4"));
        assert!(preview.data_url.is_none());
    }

    #[test]
    fn previews_docx_pptx_and_xlsx_as_derived_pdfs() {
        for (file_name, data) in [
            ("讲义.docx", minimal_docx()),
            ("课件.pptx", minimal_pptx()),
            ("表格.xlsx", minimal_xlsx()),
        ] {
            let temp_dir = tempfile::tempdir().expect("temp dir");
            let repository =
                LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
                    .expect("open db");
            let material_library_dir = temp_dir.path().join("materials");
            let source = temp_dir.path().join(file_name);
            std::fs::write(&source, data).expect("write office sample");
            let content = repository
                .create(CreateLearningContentInput {
                    name: format!("{file_name} 转换"),
                    deadline: None,
                    estimated_hours: None,
                    progress: None,
                })
                .expect("create learning content");
            let material = repository
                .import_material_file(&content.id, &source, &material_library_dir, None)
                .expect("import office material");

            let preview = repository
                .preview_material_file(&material.id, &material_library_dir)
                .expect("preview office as pdf");

            assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
            assert_eq!(preview.mime_type.as_deref(), Some("application/pdf"));
            assert!(preview.data_url.is_none());
            let asset_path = preview.asset_path.expect("derived pdf path");
            assert_ne!(asset_path, source.to_string_lossy());
            let pdf_path = PathBuf::from(asset_path);
            assert!(
                is_path_inside_directory(&pdf_path, &material_library_dir).expect("inside library")
            );
            assert!(std::fs::read(&pdf_path)
                .expect("read derived pdf")
                .starts_with(b"%PDF"));
        }
    }

    #[test]
    fn xlsx_preview_uses_wide_landscape_conversion_options_and_versioned_cache() {
        let options = office_conversion_options(Format::Xlsx);
        assert_eq!(options.landscape, Some(true));
        assert_eq!(
            options.paper_size,
            Some(PaperSize::Custom {
                width: XLSX_PREVIEW_WIDTH_PT,
                height: XLSX_PREVIEW_HEIGHT_PT,
            })
        );

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("宽表.xlsx");
        std::fs::write(&source, minimal_xlsx()).expect("write xlsx");
        let content = create_content(&repository, "宽表缓存");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import xlsx");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview xlsx");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));

        assert!(pdf_path
            .to_string_lossy()
            .contains(XLSX_DERIVED_PDF_CACHE_DIR));
        assert!(std::fs::read(&pdf_path)
            .expect("read xlsx derived pdf")
            .starts_with(b"%PDF"));
    }

    #[test]
    fn renamed_xlsx_preview_keeps_office_format_from_mime_type() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("预算.xlsx");
        std::fs::write(&source, minimal_xlsx()).expect("write xlsx");
        let content = create_content(&repository, "重命名后预览");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import xlsx");
        let rename_report = repository
            .rename_material_item(&material.id, "预算资料", &material_library_dir)
            .expect("rename xlsx without extension");
        let renamed = rename_report.material;

        let preview = repository
            .preview_material_file(&renamed.id, &material_library_dir)
            .expect("preview renamed xlsx");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
        assert!(pdf_path
            .to_string_lossy()
            .contains(XLSX_DERIVED_PDF_CACHE_DIR));
    }

    #[test]
    fn renamed_pdf_with_xlsx_extension_does_not_enter_office_conversion() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("资料.pdf");
        std::fs::write(&source, b"%PDF ordinary\n%%EOF").expect("write pdf");
        let content = create_content(&repository, "PDF 改名");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import pdf");
        let rename_report = repository
            .rename_material_item(&material.id, "看起来像表格.xlsx", &material_library_dir)
            .expect("rename pdf with xlsx extension");
        let renamed = rename_report.material;

        let preview = repository
            .preview_material_file(&renamed.id, &material_library_dir)
            .expect("preview renamed pdf");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
        assert_eq!(preview.mime_type.as_deref(), Some("application/pdf"));
        assert_eq!(
            preview.asset_path.as_deref(),
            renamed.stored_path.as_deref()
        );
    }

    #[test]
    fn docx_and_pptx_preview_keep_default_conversion_options_and_cache_dir() {
        assert!(office_conversion_options(Format::Docx).paper_size.is_none());
        assert!(office_conversion_options(Format::Docx).landscape.is_none());
        assert!(office_conversion_options(Format::Pptx).paper_size.is_none());
        assert!(office_conversion_options(Format::Pptx).landscape.is_none());

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("讲义.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = create_content(&repository, "默认缓存");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview docx");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));

        assert!(pdf_path.to_string_lossy().contains(".derived"));
        assert!(pdf_path.to_string_lossy().contains("office-pdf"));
        assert!(!pdf_path
            .to_string_lossy()
            .contains(XLSX_DERIVED_PDF_CACHE_DIR));
    }

    #[test]
    fn office_preview_reuses_fresh_derived_pdf() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("复用缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = repository
            .create(CreateLearningContentInput {
                name: "缓存复用".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");

        let first = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("first preview");
        let pdf_path = PathBuf::from(first.asset_path.expect("first pdf path"));
        let first_modified = std::fs::metadata(&pdf_path)
            .expect("pdf metadata")
            .modified()
            .expect("pdf modified");
        let second = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("second preview");

        assert_eq!(second.kind, crate::models::MaterialPreviewKind::Pdf);
        assert_eq!(
            PathBuf::from(second.asset_path.expect("second pdf path")),
            pdf_path
        );
        assert_eq!(
            std::fs::metadata(&pdf_path)
                .expect("pdf metadata")
                .modified()
                .expect("pdf modified"),
            first_modified
        );
    }

    #[test]
    fn office_preview_refreshes_invalid_derived_pdf_cache() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("坏缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = repository
            .create(CreateLearningContentInput {
                name: "坏缓存刷新".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        let pdf_path =
            derived_office_pdf_path(&material_library_dir, &material).expect("derived pdf path");
        std::fs::create_dir_all(pdf_path.parent().expect("derived parent"))
            .expect("create derived parent");
        std::fs::write(&pdf_path, b"not a pdf").expect("write invalid cache");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview office");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
        assert!(std::fs::read(&pdf_path)
            .expect("read refreshed pdf")
            .starts_with(b"%PDF"));
    }

    #[test]
    fn office_preview_refreshes_pdf_header_cache_without_eof_marker() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("半成品缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = create_content(&repository, "半成品缓存刷新");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        let pdf_path =
            derived_office_pdf_path(&material_library_dir, &material).expect("derived pdf path");
        std::fs::create_dir_all(pdf_path.parent().expect("derived parent"))
            .expect("create derived parent");
        std::fs::write(&pdf_path, b"%PDF truncated cache").expect("write partial cache");

        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview office");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Pdf);
        let refreshed = std::fs::read(&pdf_path).expect("read refreshed pdf");
        assert!(refreshed.starts_with(b"%PDF"));
        assert!(refreshed.windows(5).any(|window| window == b"%%EOF"));
    }

    #[test]
    fn derived_pdf_write_refuses_non_file_cache_target() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let pdf_path = temp_dir.path().join("derived.pdf");
        std::fs::create_dir(&pdf_path).expect("block target with directory");
        let result = write_derived_pdf_atomically(&pdf_path, b"%PDF next\n%%EOF");

        assert!(result.is_err());
        assert!(pdf_path.is_dir());
    }

    #[test]
    fn renaming_office_material_removes_existing_derived_pdf_cache() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("改名前缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = create_content(&repository, "改名前缓存");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview docx");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));
        assert!(pdf_path.exists());

        let rename_report = repository
            .rename_material_item(&material.id, "改名后资料", &material_library_dir)
            .expect("rename office material");

        assert_eq!(rename_report.failed_cleanup_path_count, 0);
        assert!(!pdf_path.exists());
    }

    #[test]
    fn renaming_office_material_reports_derived_pdf_cleanup_failure() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("清理失败.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = create_content(&repository, "清理失败");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview docx");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));
        std::fs::remove_file(&pdf_path).expect("remove derived pdf");
        std::fs::create_dir(&pdf_path).expect("create blocking directory");

        let rename_report = repository
            .rename_material_item(&material.id, "改名后资料", &material_library_dir)
            .expect("rename office material");

        assert_eq!(rename_report.material.name, "改名后资料");
        assert_eq!(rename_report.failed_cleanup_path_count, 1);
        assert!(pdf_path.is_dir());
    }

    #[test]
    fn office_derived_pdf_cache_is_not_counted_as_orphan() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("缓存统计.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = repository
            .create(CreateLearningContentInput {
                name: "缓存统计".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview office");

        let stats = repository
            .get_material_library_stats(&material_library_dir)
            .expect("get stats");
        let cleanup = repository
            .cleanup_material_library(&material_library_dir)
            .expect("cleanup library");

        assert_eq!(stats.orphan_file_count, 0);
        assert_eq!(cleanup.deleted_orphan_file_count, 0);
    }

    #[test]
    fn deleting_office_material_removes_derived_pdf_cache() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("删除缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = repository
            .create(CreateLearningContentInput {
                name: "删除缓存".to_string(),
                deadline: None,
                estimated_hours: None,
                progress: None,
            })
            .expect("create learning content");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import docx");
        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview office");
        let pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));

        repository
            .delete_material_item(&material.id, &material_library_dir)
            .expect("delete office material");

        assert!(!pdf_path.exists());
    }

    #[test]
    fn deleting_xlsx_material_removes_new_and_legacy_derived_pdf_caches() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let source = temp_dir.path().join("删除宽表缓存.xlsx");
        std::fs::write(&source, minimal_xlsx()).expect("write xlsx");
        let content = create_content(&repository, "删除宽表缓存");
        let material = repository
            .import_material_file(&content.id, &source, &material_library_dir, None)
            .expect("import xlsx");
        let preview = repository
            .preview_material_file(&material.id, &material_library_dir)
            .expect("preview xlsx");
        let new_pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));
        let legacy_pdf_path =
            derived_office_pdf_path_in_cache_dir(&material_library_dir, &material, "office-pdf")
                .expect("legacy pdf path");
        std::fs::create_dir_all(legacy_pdf_path.parent().expect("legacy parent"))
            .expect("create legacy parent");
        std::fs::write(&legacy_pdf_path, b"%PDF old xlsx cache").expect("write legacy cache");

        repository
            .delete_material_item(&material.id, &material_library_dir)
            .expect("delete xlsx material");

        assert!(!new_pdf_path.exists());
        assert!(!legacy_pdf_path.exists());
    }

    #[test]
    fn material_library_migration_includes_office_derived_pdf_cache() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let current_library_dir = temp_dir
            .path()
            .join("current")
            .join("StudySeqData")
            .join("materials");
        let target_library_dir = temp_dir
            .path()
            .join("target")
            .join("StudySeqData")
            .join("materials");
        let source = temp_dir.path().join("迁移缓存.docx");
        std::fs::write(&source, minimal_docx()).expect("write docx");
        let content = create_content(&repository, "迁移缓存");
        let material = repository
            .import_material_file(&content.id, &source, &current_library_dir, None)
            .expect("import docx");
        let preview = repository
            .preview_material_file(&material.id, &current_library_dir)
            .expect("preview docx");
        let old_pdf_path = PathBuf::from(preview.asset_path.expect("derived pdf path"));
        assert!(old_pdf_path.exists());
        let materials = repository
            .get_detail(&content.id)
            .expect("get detail")
            .expect("detail")
            .materials;

        let plan =
            migrate_material_library_files(&current_library_dir, &target_library_dir, &materials)
                .expect("build and copy migration plan");
        let new_pdf_path = target_library_dir
            .join(&material.learning_content_id)
            .join(".derived")
            .join("office-pdf")
            .join(format!("{}.pdf", material.id));

        assert!(new_pdf_path.exists());
        assert!(std::fs::read(&new_pdf_path)
            .expect("read migrated derived pdf")
            .starts_with(b"%PDF"));

        let failed = cleanup_migrated_material_files(&plan, &current_library_dir);

        assert_eq!(failed, 0);
        assert!(!old_pdf_path.exists());
    }

    #[test]
    fn old_office_extensions_remain_unsupported() {
        for file_name in ["旧文档.doc", "旧课件.ppt", "旧表格.xls"] {
            let temp_dir = tempfile::tempdir().expect("temp dir");
            let repository =
                LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
                    .expect("open db");
            let material_library_dir = temp_dir.path().join("materials");
            let source = temp_dir.path().join(file_name);
            std::fs::write(&source, b"legacy office bytes").expect("write old office");
            let content = repository
                .create(CreateLearningContentInput {
                    name: file_name.to_string(),
                    deadline: None,
                    estimated_hours: None,
                    progress: None,
                })
                .expect("create learning content");
            let material = repository
                .import_material_file(&content.id, &source, &material_library_dir, None)
                .expect("import old office");

            let preview = repository
                .preview_material_file(&material.id, &material_library_dir)
                .expect("preview old office");

            assert_eq!(
                preview.kind,
                crate::models::MaterialPreviewKind::Unsupported
            );
            assert!(preview.asset_path.is_none());
        }
    }

    fn minimal_docx() -> Vec<u8> {
        let docx = docx_rs::Docx::new().add_paragraph(
            docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text("StudySeq DOCX sample")),
        );
        let mut cursor = std::io::Cursor::new(Vec::new());
        docx.build().pack(&mut cursor).expect("pack docx");
        cursor.into_inner()
    }

    fn minimal_pptx() -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("[Content_Types].xml", options)
            .expect("content types");
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>"#).expect("write content types");
        zip.start_file("_rels/.rels", options).expect("rels");
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#).expect("write rels");
        zip.start_file("ppt/presentation.xml", options)
            .expect("presentation");
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>"#).expect("write presentation");
        zip.start_file("ppt/_rels/presentation.xml.rels", options)
            .expect("presentation rels");
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>"#).expect("write presentation rels");
        zip.start_file("ppt/slides/slide1.xml", options)
            .expect("slide");
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="7315200" cy="914400"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>StudySeq PPTX sample</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>"#).expect("write slide");
        zip.finish().expect("finish pptx").into_inner()
    }

    fn minimal_xlsx() -> Vec<u8> {
        let mut book = umya_spreadsheet::new_file_empty_worksheet();
        let mut sheet = umya_spreadsheet::Worksheet::default();
        sheet.set_name("Sheet1");
        sheet.get_cell_mut("A1").set_value("StudySeq XLSX sample");
        book.add_sheet(sheet).expect("add sheet");
        let mut buffer = std::io::Cursor::new(Vec::new());
        umya_spreadsheet::writer::xlsx::write_writer(&book, &mut buffer).expect("write xlsx");
        buffer.into_inner()
    }
}
