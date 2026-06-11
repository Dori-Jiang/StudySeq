import type { PdfOutlineNode } from "./pdfOutline";

export function PdfOutlinePanel({
  nodes,
  onJump,
}: {
  nodes: PdfOutlineNode[];
  onJump: (pageNumber: number) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="pdf-outline-panel" aria-label="PDF 目录">
        <p className="empty-state">该 PDF 没有目录</p>
      </div>
    );
  }

  return (
    <div className="pdf-outline-panel" aria-label="PDF 目录">
      <OutlineList nodes={nodes} onJump={onJump} />
    </div>
  );
}

function OutlineList({
  nodes,
  onJump,
}: {
  nodes: PdfOutlineNode[];
  onJump: (pageNumber: number) => void;
}) {
  return (
    <ul className="pdf-outline-list">
      {nodes.map((node) => (
        <li key={node.id} className="pdf-outline-item">
          <button
            type="button"
            className="pdf-outline-entry"
            disabled={node.pageNumber === null}
            onClick={() => {
              if (node.pageNumber !== null) onJump(node.pageNumber);
            }}
          >
            {node.title}
          </button>
          {node.children.length > 0 && <OutlineList nodes={node.children} onJump={onJump} />}
        </li>
      ))}
    </ul>
  );
}
