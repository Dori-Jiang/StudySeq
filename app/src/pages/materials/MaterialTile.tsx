import { useEffect, useRef, useState } from "react";

import type { MaterialItem } from "../../shared/types";
import { fileTypeLabel } from "./format";

type MaterialTileProps = {
  material: MaterialItem;
  onOpen: (material: MaterialItem) => void;
  onRename: (material: MaterialItem) => void;
  onMoveRequest: (material: MaterialItem) => void;
  onStageDelete: (material: MaterialItem) => void;
};

export function MaterialTile({
  material,
  onMoveRequest,
  onOpen,
  onRename,
  onStageDelete,
}: MaterialTileProps) {
  const isFolder = material.kind === "folder";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const tileRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (tileRef.current && !tileRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  function runAction(action: (material: MaterialItem) => void) {
    setIsMenuOpen(false);
    action(material);
  }

  return (
    <article
      className={`material-tile${isFolder ? " material-tile-folder" : ""}`}
      ref={tileRef}
    >
      <button
        className="material-tile-open"
        type="button"
        aria-label={isFolder ? `打开文件夹：${material.name}` : `打开资料：${material.name}`}
        onClick={() => onOpen(material)}
      >
        <span aria-hidden="true" className="material-tile-icon">
          {isFolder ? <FolderGlyph /> : <FileGlyph label={fileTypeLabel(material)} />}
        </span>
        <h3>{material.name}</h3>
      </button>
      <button
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        aria-label={`资料操作：${material.name}`}
        className="material-tile-menu-button"
        type="button"
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        <MoreGlyph />
      </button>
      {isMenuOpen ? (
        <div aria-label={`资料操作菜单：${material.name}`} className="material-tile-menu" role="menu">
          <button role="menuitem" type="button" onClick={() => runAction(onRename)}>
            重命名
          </button>
          <button role="menuitem" type="button" onClick={() => runAction(onMoveRequest)}>
            移动到
          </button>
          <button
            className="material-tile-menu-danger"
            role="menuitem"
            type="button"
            onClick={() => runAction(onStageDelete)}
          >
            删除
          </button>
        </div>
      ) : null}
    </article>
  );
}

function FolderGlyph() {
  return (
    <svg className="material-glyph-folder" viewBox="0 0 48 40" focusable="false">
      <path d="M4 8a4 4 0 0 1 4-4h11l4 5h17a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
      <path className="material-glyph-folder-flap" d="M4 14h44v3H4z" />
    </svg>
  );
}

function FileGlyph({ label }: { label: string }) {
  return (
    <span className="material-glyph-file">
      <svg viewBox="0 0 36 44" focusable="false">
        <path d="M4 4a4 4 0 0 1 4-4h14l10 10v30a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V4z" />
        <path className="material-glyph-file-fold" d="M22 0l10 10H22V0z" />
      </svg>
      <em>{label}</em>
    </span>
  );
}

function MoreGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
