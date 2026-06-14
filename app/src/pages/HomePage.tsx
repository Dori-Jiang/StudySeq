import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import {
  createLearningContent,
  deleteLearningContent,
  chooseMaterialLibraryStorageRoot,
  getMaterialLibraryLocation,
  listLearningContents,
  setMaterialLibraryLocation,
  updateLearningContent,
} from "../shared/api/learningContentApi";
import { toUserMessage } from "../shared/api/errors";
import type { LearningContent, MaterialLibraryLocation, StudyStatus } from "../shared/types";

const statusLabels: Record<LearningContent["status"], string> = {
  planned: "计划中",
  active: "进行中",
  paused: "暂停",
  completed: "完成",
  overdue: "超期",
};

export function HomePage() {
  const [contents, setContents] = useState<LearningContent[]>([]);
  const [name, setName] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("1");
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentPendingDelete, setContentPendingDelete] = useState<LearningContent | null>(null);
  const [isDeletingContent, setIsDeletingContent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialLibraryLocation, setMaterialLibraryLocationState] =
    useState<MaterialLibraryLocation | null>(null);
  const [isMigratingMaterialLibrary, setIsMigratingMaterialLibrary] = useState(false);
  const [materialLibraryMessage, setMaterialLibraryMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    listLearningContents()
      .then((loadedContents) => {
        if (isMounted) {
          setContents(loadedContents);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(toUserMessage(loadError));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getMaterialLibraryLocation()
      .then((location) => {
        if (isMounted) setMaterialLibraryLocationState(location);
      })
      .catch((locationError: unknown) => {
        if (isMounted) setError(toUserMessage(locationError));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("学习内容名称不能为空");
      return;
    }

    setError(null);
    const created = await createLearningContent({
      name: trimmedName,
      estimatedHours: Number(estimatedHours) || 0,
      progress: 0,
    });

    setContents((currentContents) => [created, ...currentContents]);
    setName("");
    setEstimatedHours("1");
  }

  function handleRequestDelete(content: LearningContent) {
    setContentPendingDelete(content);
    setDeleteError(null);
    setError(null);
  }

  function handleCancelDelete() {
    if (!isDeletingContent) {
      setContentPendingDelete(null);
      setDeleteError(null);
    }
  }

  async function handleConfirmDelete() {
    if (!contentPendingDelete) {
      return;
    }

    const content = contentPendingDelete;
    setIsDeletingContent(true);
    setDeleteError(null);
    setError(null);
    try {
      await deleteLearningContent(content.id);
      setContents((currentContents) =>
        currentContents.filter((currentContent) => currentContent.id !== content.id),
      );
      setContentPendingDelete(null);
    } catch (deleteError: unknown) {
      setDeleteError(`删除学习内容失败：${toUserMessage(deleteError)}`);
    } finally {
      setIsDeletingContent(false);
    }
  }

  const deleteConfirmationMessage = contentPendingDelete
    ? `删除「${contentPendingDelete.name}」会同步删除该学习内容下的资料、笔记和阅读状态。只会删除 App 管理的资料副本，不会删除用户原始来源文件。`
    : "";

  function handleStartEdit(content: LearningContent) {
    setEditingContentId(content.id);
    setError(null);
  }

  function handleCancelEdit() {
    setEditingContentId(null);
    setError(null);
  }

  async function handleSaveEdit(
    content: LearningContent,
    input: {
      name: string;
      status: StudyStatus;
      estimatedHours: number;
      deadline: string | null;
      progress: number;
    },
  ) {
    const updated = await updateLearningContent({
      id: content.id,
      ...input,
    });
    setContents((currentContents) =>
      currentContents.map((currentContent) =>
        currentContent.id === updated.id ? updated : currentContent,
      ),
    );
    setEditingContentId(null);
    setError(null);
  }

  async function handleChooseMaterialLibraryLocation() {
    try {
      const selected = await chooseMaterialLibraryStorageRoot();
      if (selected === null) return;

      await handleMoveMaterialLibrary(buildMaterialLibraryPath(selected));
    } catch (chooseError: unknown) {
      setError(toUserMessage(chooseError));
    }
  }

  async function handleMoveMaterialLibrary(path: string, label = path) {
    if (
      !window.confirm(
        `确定将资料库迁移到 ${label} 吗？迁移期间请不要关闭应用，完成后新导入资料会写入该位置。`,
      )
    ) {
      return;
    }

    setIsMigratingMaterialLibrary(true);
    setMaterialLibraryMessage(null);
    try {
      const location = await setMaterialLibraryLocation({ path });
      setMaterialLibraryLocationState(location);
      setMaterialLibraryMessage(`资料库位置已更新为 ${location.path}`);
      setError(null);
    } catch (migrationError: unknown) {
      setError(toUserMessage(migrationError));
    } finally {
      setIsMigratingMaterialLibrary(false);
    }
  }

  return (
    <main className="home-shell">
      <section className="home-header">
        <div>
          <p className="eyebrow">StudySeq / 知序</p>
          <h1>学习内容</h1>
        </div>
        <p className="summary">{contents.length} 个学习内容</p>
      </section>

      <form className="create-form" onSubmit={handleCreate}>
        <label>
          学习内容名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：Rust 入门"
          />
        </label>
        <label>
          预计工时
          <input
            type="number"
            min="0"
            step="0.5"
            value={estimatedHours}
            onChange={(event) => setEstimatedHours(event.target.value)}
          />
        </label>
        <button type="submit">新建</button>
      </form>

      <section className="home-material-library-panel" aria-label="资料库位置设置">
        <div>
          <h2>资料库位置</h2>
          <p className="muted-text">
            {materialLibraryLocation
              ? `当前 ${materialLibraryLocation.path}${materialLibraryLocation.isDefault ? "（默认）" : ""}`
              : "正在读取资料库位置"}
          </p>
          {materialLibraryMessage ? (
            <p className="muted-text">{materialLibraryMessage}</p>
          ) : null}
        </div>
        <div className="home-material-library-actions">
          <button
            type="button"
            onClick={handleChooseMaterialLibraryLocation}
            disabled={isMigratingMaterialLibrary}
          >
            选择资料库位置
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void handleMoveMaterialLibrary("DEFAULT", "默认位置");
            }}
            disabled={isMigratingMaterialLibrary || materialLibraryLocation?.isDefault !== false}
          >
            迁回默认位置
          </button>
        </div>
      </section>

      {error ? <p className="error-message">{error}</p> : null}
      {isLoading ? <p className="empty-state">正在加载学习内容</p> : null}

      {!isLoading && contents.length === 0 ? (
        <p className="empty-state">还没有学习内容</p>
      ) : null}

      <section className="study-list" aria-label="学习内容列表">
        {contents.map((content) => (
          <article className="study-row" key={content.id}>
            {editingContentId === content.id ? (
              <StudyRowEditForm
                content={content}
                onCancel={handleCancelEdit}
                onSave={handleSaveEdit}
              />
            ) : (
              <>
                <Link
                  aria-describedby={`study-recent-open-${content.id}`}
                  aria-label={`打开 ${content.name}`}
                  className="study-row-link"
                  to={`/studies/${content.id}`}
                >
                  <div className="study-row-main">
                    <h2>{content.name}</h2>
                    <p>{statusLabels[content.status]}</p>
                    <RecentOpenSummary content={content} />
                    <div
                      aria-label={`${content.name} 进度`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={content.progress}
                      className="study-progress-bar"
                      role="progressbar"
                    >
                      <span style={{ width: `${content.progress}%` }} />
                    </div>
                  </div>
                  <div className="study-meta">
                    <span>{content.deadline ?? "未设置截止日期"}</span>
                    <strong>{content.progress}%</strong>
                  </div>
                </Link>
                <div className="study-row-actions">
                  {content.recentOpen ? (
                    <Link
                      aria-label={`继续 ${content.name}`}
                      className="secondary-button study-row-continue"
                      to={buildContinueHref(content)}
                    >
                      继续
                    </Link>
                  ) : null}
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`编辑 ${content.name}`}
                    onClick={() => handleStartEdit(content)}
                  >
                    编辑
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`删除 ${content.name}`}
                    onClick={() => handleRequestDelete(content)}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>

      {contentPendingDelete
        ? createPortal(
            <div className="modal-backdrop">
              <section
                aria-labelledby="delete-learning-content-title"
                aria-modal="true"
                className="confirm-dialog"
                role="dialog"
              >
                <h2 id="delete-learning-content-title">删除学习内容</h2>
                <p>{deleteConfirmationMessage}</p>
                <p className="confirm-dialog-warning">删除后无法撤回。</p>
                {deleteError ? (
                  <p className="error-message confirm-dialog-error">{deleteError}</p>
                ) : null}
                <div className="confirm-dialog-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeletingContent}
                  >
                    {isDeletingContent ? "删除中" : "确认删除"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleCancelDelete}
                    disabled={isDeletingContent}
                  >
                    取消
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}

function buildContinueHref(content: LearningContent) {
  if (!content.recentOpen) return `/studies/${content.id}`;
  const materialId = encodeURIComponent(content.recentOpen.materialId);
  return `/studies/${content.id}?continue=1&materialId=${materialId}`;
}

function buildMaterialLibraryPath(storageRoot: string) {
  const separator = storageRoot.includes("\\") && !storageRoot.includes("/") ? "\\" : "/";
  const trimmedRoot = storageRoot.replace(/[\\/]+$/, "");
  const normalizedRoot = trimmedRoot.replace(/\\/g, "/");
  if (normalizedRoot.endsWith("/StudySeqData/materials")) {
    return trimmedRoot;
  }
  if (normalizedRoot.endsWith("/StudySeqData")) {
    return `${trimmedRoot}${separator}materials`;
  }
  return `${trimmedRoot}${separator}StudySeqData${separator}materials`;
}

function RecentOpenSummary({ content }: { content: LearningContent }) {
  const recentOpen = content.recentOpen;
  const summaryId = `study-recent-open-${content.id}`;
  if (!recentOpen) {
    return (
      <p className="study-recent-open study-recent-open-empty" id={summaryId}>
        暂无打开记录
      </p>
    );
  }

  const positionText = formatRecentOpenPosition(recentOpen.position);

  return (
    <p className="study-recent-open" id={summaryId}>
      <span>{formatRecentOpenTime(recentOpen.openedAt)}</span>
      <span className="study-recent-open-file">{recentOpen.materialName}</span>
      {positionText ? <span>{positionText}</span> : null}
    </p>
  );
}

function formatRecentOpenPosition(
  position: NonNullable<LearningContent["recentOpen"]>["position"],
) {
  if (position.kind === "pdf_page") {
    return `第 ${position.pageNumber} 页`;
  }
  if (position.kind === "video_second") {
    return formatPlaybackTime(position.seconds);
  }
  return "";
}

function formatPlaybackTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

function formatRecentOpenTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const timeText = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${timeText}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${timeText}`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function StudyRowEditForm({
  content,
  onCancel,
  onSave,
}: {
  content: LearningContent;
  onCancel: () => void;
  onSave: (
    content: LearningContent,
    input: {
      name: string;
      status: StudyStatus;
      estimatedHours: number;
      deadline: string | null;
      progress: number;
    },
  ) => Promise<void>;
}) {
  const [name, setName] = useState(content.name);
  const [status, setStatus] = useState<StudyStatus>(content.status);
  const [estimatedHours, setEstimatedHours] = useState(String(content.estimatedHours));
  const [deadline, setDeadline] = useState(content.deadline ?? "");
  const [progress, setProgress] = useState(String(content.progress));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("学习名称不能为空");
      return;
    }

    const estimatedHoursValue = Number(estimatedHours);
    if (!Number.isFinite(estimatedHoursValue) || estimatedHoursValue < 0) {
      setError("预计工时不能小于 0");
      return;
    }

    const progressValue = Number(progress);
    if (!Number.isInteger(progressValue) || progressValue < 0 || progressValue > 100) {
      setError("进度必须是 0 到 100 的整数");
      return;
    }

    await onSave(content, {
      name: trimmedName,
      status,
      estimatedHours: estimatedHoursValue,
      deadline: deadline || null,
      progress: progressValue,
    });
  }

  return (
    <form className="study-row-edit-form" onSubmit={handleSubmit}>
      <label>
        学习名称
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        状态
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StudyStatus)}
        >
          {Object.entries(statusLabels).map(([statusValue, label]) => (
            <option key={statusValue} value={statusValue}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        预计工时
        <input
          type="number"
          min="0"
          step="0.5"
          value={estimatedHours}
          onChange={(event) => setEstimatedHours(event.target.value)}
        />
      </label>
      <label>
        截止日期
        <input
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
      </label>
      <label>
        进度百分比
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          value={progress}
          onChange={(event) => setProgress(event.target.value)}
        />
      </label>
      <div className="study-row-edit-actions">
        <button type="submit">保存学习内容</button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
      {error ? <p className="error-message study-row-edit-error">{error}</p> : null}
    </form>
  );
}
