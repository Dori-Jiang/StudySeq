use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine as _};
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use chrono::Utc;
use encoding_rs::UTF_8;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::{
    CreateLearningContentInput, LearningContent, LearningDetail, MaterialItem, MaterialKind,
    MaterialLibraryCleanupReport, MaterialLibraryStats, MaterialPreview, MaterialPreviewKind,
    MaterialReadingState, MaterialSubtreeCount, Note, StudyStatus,
};

pub struct LearningContentRepository {
    connection: Connection,
}

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
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
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

        Ok(LearningContent {
            name,
            status,
            progress,
            deadline,
            estimated_hours,
            updated_at: now,
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
            learning_content,
        }))
    }

    pub fn delete_learning_content(
        &self,
        id: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<(), AppError> {
        // 按表批量删除而不是逐项递归，避免文件夹子树被重复删除报 MaterialNotFound
        let materials = self.list_materials(id)?;
        self.remove_material_file_copies(&materials, material_library_dir.as_ref())?;
        // DB 删除段单事务提交，避免中途崩溃留下悬空记录
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM material_reading_states WHERE material_id IN (
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
        transaction.execute("DELETE FROM learning_contents WHERE id = ?1", params![id])?;
        transaction.commit()?;
        Ok(())
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
    ) -> Result<(), AppError> {
        let Some(material) = self.get_material(material_id)? else {
            return Err(AppError::MaterialNotFound);
        };

        // 文件夹是纯逻辑层级：先递归收集子树，文件行删磁盘副本，所有行删记录与阅读状态
        let subtree = self.collect_material_subtree(&material)?;
        self.remove_material_file_copies(&subtree, material_library_dir.as_ref())?;

        // DB 删除段单事务提交，避免中途崩溃留下悬空的子树记录
        let transaction = self.connection.unchecked_transaction()?;
        for item in &subtree {
            transaction.execute("DELETE FROM material_items WHERE id = ?1", params![item.id])?;
            transaction.execute(
                "DELETE FROM material_reading_states WHERE material_id = ?1",
                params![item.id],
            )?;
        }
        transaction.commit()?;

        Ok(())
    }

    pub fn rename_material_item(
        &self,
        material_id: &str,
        name: &str,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialItem, AppError> {
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
            return Ok(MaterialItem {
                name: display_name,
                updated_at: now,
                ..material
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

        let now = Utc::now().to_rfc3339();
        let metadata = std::fs::metadata(&target_path)?;
        let update_result = self.connection.execute(
            "UPDATE material_items
             SET name = ?1, stored_path = ?2, size_bytes = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                display_name,
                target_path.to_string_lossy().to_string(),
                metadata.len() as i64,
                now,
                material.id,
            ],
        );

        if let Err(error) = update_result {
            if source_path != target_path {
                let _ = std::fs::rename(&target_path, &source_path);
            }
            return Err(AppError::Database(error));
        }

        Ok(MaterialItem {
            name: display_name,
            stored_path: Some(target_path.to_string_lossy().to_string()),
            size_bytes: metadata.len() as i64,
            updated_at: now,
            ..material
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

        let title = title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::EmptyNoteTitle);
        }

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
        let title = title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::EmptyNoteTitle);
        }

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

    pub fn preview_material_file(&self, material_id: &str) -> Result<MaterialPreview, AppError> {
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
                encoding: None,
            });
        };
        let mime_type = resolve_preview_mime(material.mime_type.as_deref(), &stored_path);
        let kind = preview_kind(mime_type.as_deref());

        match kind {
            MaterialPreviewKind::Text => {
                let bytes = std::fs::read(&stored_path)?;
                let (text, encoding) = decode_text(&bytes);
                Ok(MaterialPreview {
                    material_id: material.id,
                    kind,
                    mime_type,
                    text: Some(text),
                    data_url: None,
                    encoding: Some(encoding),
                })
            }
            MaterialPreviewKind::Image | MaterialPreviewKind::Pdf => {
                let bytes = std::fs::read(&stored_path)?;
                let mime = mime_type
                    .clone()
                    .unwrap_or_else(|| "application/octet-stream".to_string());
                Ok(MaterialPreview {
                    material_id: material.id,
                    kind,
                    mime_type,
                    text: None,
                    data_url: Some(format!(
                        "data:{mime};base64,{}",
                        general_purpose::STANDARD.encode(bytes)
                    )),
                    encoding: None,
                })
            }
            // 视频走前端 asset 协议流式播放，不支持格式不需要内容：都不读文件字节
            MaterialPreviewKind::Video | MaterialPreviewKind::Unsupported => Ok(MaterialPreview {
                material_id: material.id,
                kind,
                mime_type,
                text: None,
                data_url: None,
                encoding: None,
            }),
        }
    }

    pub fn get_material_reading_state(
        &self,
        material_id: &str,
    ) -> Result<Option<MaterialReadingState>, AppError> {
        self.connection
            .query_row(
                "SELECT material_id, page_number, scale, updated_at
                 FROM material_reading_states
                 WHERE material_id = ?1",
                params![material_id],
                |row| {
                    Ok(MaterialReadingState {
                        material_id: row.get(0)?,
                        page_number: row.get(1)?,
                        scale: row.get(2)?,
                        updated_at: row.get(3)?,
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
    ) -> Result<MaterialReadingState, AppError> {
        let page_number = page_number.max(1);
        let scale = scale.clamp(0.6, 2.4);
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO material_reading_states (
                material_id, page_number, scale, updated_at
            ) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(material_id) DO UPDATE SET
                page_number = excluded.page_number,
                scale = excluded.scale,
                updated_at = excluded.updated_at",
            params![material_id, page_number, scale, now],
        )?;

        Ok(MaterialReadingState {
            material_id: material_id.to_string(),
            page_number,
            scale,
            updated_at: now,
        })
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
        let referenced_paths = file_materials
            .iter()
            .filter_map(|material| material.stored_path.as_deref().map(PathBuf::from))
            .collect::<Vec<_>>();
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

        Ok(MaterialLibraryStats {
            material_count: file_materials.len() as i64,
            referenced_bytes,
            actual_referenced_bytes,
            library_bytes: library_scan.library_bytes,
            missing_file_count,
            orphan_file_count: library_scan.orphan_files.len() as i64,
            orphan_bytes: library_scan.orphan_bytes,
            updated_at: Utc::now().to_rfc3339(),
        })
    }

    pub fn cleanup_material_library(
        &self,
        material_library_dir: impl AsRef<Path>,
    ) -> Result<MaterialLibraryCleanupReport, AppError> {
        let material_library_dir = material_library_dir.as_ref();
        let materials = self.list_all_materials()?;
        let referenced_paths = materials
            .iter()
            .filter(|material| material.kind == MaterialKind::File)
            .filter_map(|material| material.stored_path.as_deref().map(PathBuf::from))
            .collect::<Vec<_>>();
        let library_scan = scan_material_library(material_library_dir, &referenced_paths)?;
        let mut deleted_orphan_file_count = 0;
        let mut deleted_bytes = 0;
        let mut failed_paths = Vec::new();

        for orphan in library_scan.orphan_files {
            if let Ok(metadata) = std::fs::metadata(&orphan) {
                let size = metadata.len() as i64;
                match std::fs::remove_file(&orphan) {
                    Ok(()) => {
                        deleted_orphan_file_count += 1;
                        deleted_bytes += size;
                    }
                    Err(_) => failed_paths.push(orphan.to_string_lossy().to_string()),
                }
            }
        }

        let orphan_materials = self.list_orphan_materials()?;
        let mut deleted_orphan_database_record_count = 0;
        for material in orphan_materials {
            // 孤儿 folder 行没有磁盘实体，只删记录
            if let Some(stored_path) = material.stored_path.as_deref() {
                let stored_path = PathBuf::from(stored_path);
                if is_path_inside_directory(&stored_path, material_library_dir)? {
                    if let Ok(metadata) = std::fs::metadata(&stored_path) {
                        let size = metadata.len() as i64;
                        match std::fs::remove_file(&stored_path) {
                            Ok(()) => {
                                deleted_orphan_file_count += 1;
                                deleted_bytes += size;
                            }
                            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                            Err(_) => failed_paths.push(stored_path.to_string_lossy().to_string()),
                        }
                    }
                }
            }
            self.connection.execute(
                "DELETE FROM material_reading_states WHERE material_id = ?1",
                params![material.id],
            )?;
            self.connection.execute(
                "DELETE FROM material_items WHERE id = ?1",
                params![material.id],
            )?;
            deleted_orphan_database_record_count += 1;
        }

        Ok(MaterialLibraryCleanupReport {
            deleted_orphan_file_count,
            deleted_orphan_database_record_count,
            deleted_bytes,
            failed_paths,
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
    pub fn debug_count_material_reading_states(&self) -> Result<i64, AppError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM material_reading_states", [], |row| {
                row.get(0)
            })
            .map_err(AppError::from)
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

    /// 删除一组资料行的 App 管理磁盘副本。
    /// 只删除位于资料库目录内的文件，绝不触碰用户原始文件或目录外路径；
    /// 已不存在的文件视为成功（删除操作可重试收敛）。
    fn remove_material_file_copies(
        &self,
        materials: &[MaterialItem],
        material_library_dir: &Path,
    ) -> Result<(), AppError> {
        for item in materials {
            if item.kind != MaterialKind::File {
                continue;
            }
            let Some(stored_path) = item.stored_path.as_deref() else {
                continue;
            };
            if !is_path_inside_directory(Path::new(stored_path), material_library_dir)? {
                continue;
            }
            match std::fs::remove_file(stored_path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(AppError::Io(error)),
            }
        }
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

    next_duplicate_name(preferred_name, |name| directory.join(name).exists()).into()
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

fn guess_mime_type(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match extension.as_str() {
        "txt" => "text/plain",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
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
        Some("application/pdf") => MaterialPreviewKind::Pdf,
        Some("video/mp4") | Some("video/webm") => MaterialPreviewKind::Video,
        Some(value) if value.starts_with("image/") => MaterialPreviewKind::Image,
        _ => MaterialPreviewKind::Unsupported,
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
        let source_file = temp_dir.path().join("source.txt");
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
        assert_eq!(detail.materials[0].name, "source.txt");
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
        let source_file = temp_dir.path().join("source.txt");
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
            .save_material_reading_state(&material.id, 2, 1.4)
            .expect("save material reading state");
        repository
            .create_note(
                &learning_content.id,
                "保留笔记".to_string(),
                "删除学习内容时同步删除".to_string(),
            )
            .expect("create note");

        repository
            .delete_learning_content(&learning_content.id, &material_library_dir)
            .expect("delete learning content");

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
            .preview_material_file(&material.id)
            .expect("preview material");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Text);
        assert_eq!(preview.text.as_deref(), Some("你好"));
        assert!(preview.encoding.as_deref().is_some());
    }

    #[test]
    fn previews_image_and_pdf_materials_as_data_urls() {
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
            .preview_material_file(&image.id)
            .expect("preview image");
        let pdf_preview = repository
            .preview_material_file(&pdf.id)
            .expect("preview pdf");

        assert_eq!(
            image_preview.kind,
            crate::models::MaterialPreviewKind::Image
        );
        assert!(image_preview
            .data_url
            .as_deref()
            .expect("image data url")
            .starts_with("data:image/png;base64,"));
        assert_eq!(pdf_preview.kind, crate::models::MaterialPreviewKind::Pdf);
        assert!(pdf_preview
            .data_url
            .as_deref()
            .expect("pdf data url")
            .starts_with("data:application/pdf;base64,"));
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

        repository
            .save_material_reading_state("material-a", 3, 1.4)
            .expect("save material a state");
        repository
            .save_material_reading_state("material-b", 1, 1.0)
            .expect("save material b state");
        drop(repository);

        let reopened_repository =
            LearningContentRepository::open(&database_path).expect("reopen migrated db");
        let material_a_state = reopened_repository
            .get_material_reading_state("material-a")
            .expect("get material a state")
            .expect("material a state exists");
        let material_b_state = reopened_repository
            .get_material_reading_state("material-b")
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

        assert_eq!(material_a_state.material_id, "material-a");
        assert_eq!(material_a_state.page_number, 3);
        assert_eq!(material_a_state.scale, 1.4);
        assert_eq!(material_b_state.page_number, 1);
        assert_eq!(material_b_state.scale, 1.0);
        assert_eq!(reading_states_table_count, 0);
    }

    #[test]
    fn migrates_v3_database_to_v4_tree_model_keeping_materials_at_root() {
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

        let repository = LearningContentRepository::open(&database_path).expect("migrate to v4");

        let user_version: i64 = repository
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let materials = repository.list_materials("lc-1").expect("list materials");

        assert_eq!(user_version, 4);
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
    }

    #[test]
    fn fresh_database_initializes_v4_tree_schema() {
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

        assert_eq!(user_version, 4);
        assert_eq!(parent_id_column_count, 1);
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
        assert_eq!(stats.orphan_bytes, 6);
        assert!(stats.library_bytes >= first_material.size_bytes + 6);
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

        let renamed = repository
            .rename_material_item(&second_material.id, "资料.txt", &material_library_dir)
            .expect("rename material");

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

        let renamed_again = repository
            .rename_material_item(&renamed.id, &first_material.name, &material_library_dir)
            .expect("rename duplicate material");
        assert_eq!(renamed_again.name, "first (1).txt");
        assert!(std::path::Path::new(
            renamed_again
                .stored_path
                .as_deref()
                .expect("renamed again stored path")
        )
        .exists());

        let preview = repository
            .preview_material_file(&renamed_again.id)
            .expect("preview renamed");
        assert_eq!(preview.text.as_deref(), Some("second"));
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
        // 删除磁盘副本来证明视频预览不读文件字节：流式播放由前端走 asset 协议
        std::fs::remove_file(material.stored_path.as_deref().expect("stored path"))
            .expect("remove stored copy");

        let preview = repository
            .preview_material_file(&material.id)
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
            .preview_material_file(&material.id)
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
        let inner_source = write_source(&temp_dir, "内层文件.txt");
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
            .save_material_reading_state(&outer_file.id, 3, 1.2)
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
    fn delete_learning_content_with_nested_folders_leaves_no_residue() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let repository = LearningContentRepository::open(temp_dir.path().join("studyseq.sqlite"))
            .expect("open db");
        let material_library_dir = temp_dir.path().join("materials");
        let content = create_content(&repository, "级联删除含文件夹");
        let source = write_source(&temp_dir, "文件.txt");

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
            .save_material_reading_state(&file.id, 2, 1.0)
            .expect("save reading state");

        repository
            .delete_learning_content(&content.id, &material_library_dir)
            .expect("delete learning content with folders");

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

        let renamed = repository
            .rename_material_item(&second.id, "第一章", temp_dir.path().join("materials"))
            .expect("rename folder");

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
            .preview_material_file(&material.id)
            .expect("preview legacy video");

        assert_eq!(preview.kind, crate::models::MaterialPreviewKind::Video);
        assert_eq!(preview.mime_type.as_deref(), Some("video/mp4"));
        assert!(preview.data_url.is_none());
    }
}
