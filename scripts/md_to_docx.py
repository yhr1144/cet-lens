"""Render PRODUCT.md into a shareable .docx (headings, bullets, pipe tables)."""
import re
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

SRC = sys.argv[1] if len(sys.argv) > 1 else "PRODUCT.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "PRODUCT.docx"

INLINE = re.compile(r"\*\*(.+?)\*\*")


def add_runs(par, text):
    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            par.add_run(text[pos:m.start()])
        run = par.add_run(m.group(1))
        run.bold = True
        pos = m.end()
    if pos < len(text):
        par.add_run(text[pos:])


def main():
    lines = open(SRC, encoding="utf-8").read().splitlines()
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Microsoft YaHei"
    style.font.size = Pt(10.5)
    style.paragraph_format.line_spacing = 1.45
    style.paragraph_format.space_after = Pt(6)

    for level in (1, 2, 3):
        h = doc.styles["Heading %d" % level]
        h.font.name = "Microsoft YaHei"
        h.font.color.rgb = RGBColor(0x11, 0x2A, 0x4A)

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith("# "):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(line[2:].strip())
            run.bold = True
            run.font.size = Pt(22)
            run.font.name = "Microsoft YaHei"
            run.font.color.rgb = RGBColor(0x0B, 0x3D, 0x8C)
            i += 1
            continue
        if line.startswith("## "):
            doc.add_heading(line[3:].strip(), level=1)
            i += 1
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:].strip(), level=2)
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", ":", " "}:
            header = [c.strip() for c in line.strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            table = doc.add_table(rows=1, cols=len(header))
            table.style = "Table Grid"
            for idx, cell in enumerate(header):
                par = table.rows[0].cells[idx].paragraphs[0]
                run = par.add_run(cell)
                run.bold = True
                run.font.size = Pt(9.5)
            for row in rows:
                cells = table.add_row().cells
                for idx, cell in enumerate(row[:len(header)]):
                    par = cells[idx].paragraphs[0]
                    run = par.add_run(cell)
                    run.font.size = Pt(9.5)
            doc.add_paragraph()
            continue
        if line.startswith("- "):
            par = doc.add_paragraph(style="List Bullet")
            add_runs(par, line[2:].strip())
            i += 1
            continue
        if line.startswith("版本 "):
            par = doc.add_paragraph()
            run = par.add_run(line)
            run.font.size = Pt(9.5)
            run.font.color.rgb = RGBColor(0x55, 0x66, 0x7F)
            i += 1
            continue
        par = doc.add_paragraph()
        add_runs(par, line)
        i += 1

    doc.save(OUT)
    print("wrote", OUT)


main()
