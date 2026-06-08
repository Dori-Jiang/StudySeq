import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";

import {
  createLearningContent,
  deleteLearningContent,
  listLearningContents,
} from "../shared/api/learningContentApi";
import type { LearningContent } from "../shared/types";

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
            <Link
              aria-label={`打开 ${content.name}`}
              className="study-row-link"
              to={`/studies/${content.id}`}
            >
              <div>
                <h2>{content.name}</h2>
                <p>
                  {statusLabels[content.status]} · {content.estimatedHours} 小时
                </p>
              </div>
              <div className="study-meta">
                <span>{content.deadline ?? "未设置截止日期"}</span>
                <strong>{content.progress}%</strong>
              </div>
            </Link>
            <button
              className="secondary-button study-row-delete"
              type="button"
              aria-label={`删除 ${content.name}`}
              onClick={() => handleDelete(content)}
            >
              删除
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function toMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }

  return String(error);
}
