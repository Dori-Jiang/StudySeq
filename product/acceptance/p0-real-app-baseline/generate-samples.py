from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
SAMPLES = ROOT / "samples"


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generate_image() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    path = SAMPLES / "P0-test-image.png"
    image = Image.new("RGB", (1280, 720), "#f7fbff")
    draw = ImageDraw.Draw(image)
    title_font = load_font(56)
    body_font = load_font(30)
    small_font = load_font(22)

    draw.rectangle((0, 0, 1280, 720), fill="#f7fbff")
    draw.rectangle((64, 64, 1216, 656), outline="#9dc7e8", width=4)
    draw.rectangle((64, 64, 1216, 170), fill="#d8efff")
    draw.text((96, 92), "StudySeq P0 图片预览测试", fill="#16324f", font=title_font)
    draw.text((96, 230), "用途：验证图片资料导入、详情页预览、阅读页显示。", fill="#1f3b57", font=body_font)
    draw.text((96, 292), "文件名：P0-test-image.png", fill="#1f3b57", font=body_font)
    draw.text((96, 354), "尺寸：1280 x 720", fill="#1f3b57", font=body_font)
    draw.text((96, 452), "验收点：图片不变形、不黑屏、不丢失。", fill="#0f5f8f", font=body_font)
    draw.text((96, 610), "Generated for local App acceptance only.", fill="#607d95", font=small_font)
    image.save(path)


def generate_pdf() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    path = SAMPLES / "P0-multipage-test.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4, title="StudySeq P0 PDF Test")
    styles = getSampleStyleSheet()
    story = []

    for page in range(1, 4):
        story.append(Paragraph(f"StudySeq P0 PDF Preview Test - Page {page}", styles["Title"]))
        story.append(Spacer(1, 24))
        story.append(
            Paragraph(
                "This file validates PDF import, in-app preview, page navigation, zoom, "
                "and reading state recovery in the real Tauri application.",
                styles["BodyText"],
            )
        )
        story.append(Spacer(1, 18))
        story.append(Paragraph(f"Acceptance marker: P0-PDF-PAGE-{page}", styles["Heading2"]))
        story.append(Spacer(1, 18))
        story.append(
            Paragraph(
                "Expected result: this page renders clearly, page controls work, and the "
                "app can return to this material after restart.",
                styles["BodyText"],
            )
        )
        if page < 3:
            story.append(PageBreak())

    doc.build(story)


def main() -> None:
    generate_image()
    generate_pdf()


if __name__ == "__main__":
    main()
