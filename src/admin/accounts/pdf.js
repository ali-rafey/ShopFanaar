// PDF downloads of the books: a title, then tables. jsPDF is loaded only when
// a download is asked for, so the admin doesn't carry it otherwise.
//
// section: { heading, head: [...], body: [[...]], foot?: [...], align?: { [column]: "right" } }
// A body cell can be { content, bold: true } for a subtotal.

// The PDF's built-in font covers Latin-1 only: swap typographic characters for
// plain ones so nothing comes out garbled.
const plain = (v) =>
  String(v ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");

export async function downloadPdf(name, title, sections) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(21, 21, 21);
  doc.text(plain(`Fanaar - ${title}`), 40, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Fanaar Accounts - private. Downloaded ${today}.`, 40, 72);

  let y = 104;
  for (const s of sections) {
    if (y > pageHeight - 120) {
      doc.addPage();
      y = 54;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(21, 21, 21);
    doc.text(plain(s.heading), 40, y);
    const cell = (c) =>
      c && typeof c === "object" ? { content: plain(c.content), styles: c.bold ? { fontStyle: "bold" } : {} } : plain(c);
    autoTable(doc, {
      startY: y + 8,
      head: [s.head.map(plain)],
      body: s.body.map((row) => row.map(cell)),
      foot: s.foot ? [s.foot.map(plain)] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      margin: { left: 40, right: 40 },
      styles: { fontSize: 9.5, cellPadding: 5, lineColor: [225, 225, 222], textColor: [30, 30, 30] },
      headStyles: { fillColor: [21, 21, 21], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 236], textColor: [21, 21, 21], fontStyle: "bold" },
      columnStyles: Object.fromEntries(Object.entries(s.align || {}).map(([col, halign]) => [col, { halign }])),
      // Headings and totals line up with their column too.
      didParseCell: (data) => {
        const halign = s.align?.[data.column.index];
        if (halign && data.section !== "body") data.cell.styles.halign = halign;
      },
    });
    y = doc.lastAutoTable.finalY + 30;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pages}`, doc.internal.pageSize.getWidth() - 40, pageHeight - 24, { align: "right" });
  }
  doc.save(`fanaar-${name}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
