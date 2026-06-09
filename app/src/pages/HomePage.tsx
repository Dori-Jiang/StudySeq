import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";

import {
  createLearningContent,
  deleteLearningContent,
  listLearningContents,
  updateLearningContent,
} from "../shared/api/learningContentApi";
import type { LearningContent, StudyStatus } from "../shared/types";

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(toMessage(loadError));
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

  async function handleDelete(content: LearningContent) {
    if (!window.confirm(`确定删除「${content.name}」吗？`)) {
      return;
    }

    await deleteLearningContent(content.id);
    setContents((currentContents) =>
      currentContents.filter((currentContent) => currentContent.id !== content.id),
    );
  }

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
                  aria-label={`打开 ${content.name}`}
                  className="study-row-link"
                  to={`/studies/${content.id}`}
                >
                  <div className="study-row-main">
                    <h2>{content.name}</h2>
                    <p>{statusLabels[content.status]}</p>
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
                    onClick={() => handleDelete(content)}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  );
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

function toMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }

  return String(error);
}
