import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  TableBorders,
  WidthType,
} from "docx";
import sharp from "sharp";
import { formatFormDate } from "./dates";
import type { ReportCommit } from "./types";

const IMG_WIDTH_PX = 600; // ± 16 cm pada 96 dpi
const FONT = "Arial";

export interface FormMeta {
  employeeName: string;
  supervisor: { name: string; nik: string };
}

const text = (
  t: string,
  o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {},
) => new TextRun({ text: t, font: FONT, size: o.size ?? 22, ...o });

function fieldRow(label: string, value: string | string[]) {
  const cell = (w: number, t: string | string[]) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      borders: TableBorders.NONE as never,
      children: (Array.isArray(t) ? t : [t]).map(
        (line) =>
          new Paragraph({ spacing: { after: 80 }, children: [text(line)] }),
      ),
    });
  return new TableRow({
    children: [cell(2200, label), cell(300, ":"), cell(7206, value)],
  });
}

async function imageBlock(buf: Buffer, label?: string): Promise<Paragraph[]> {
  const { width = 1, height = 1 } = await sharp(buf).metadata();
  const h = Math.round((IMG_WIDTH_PX * height) / width);
  const out: Paragraph[] = [];
  if (label)
    out.push(
      new Paragraph({
        children: [text(label, { italics: true, size: 18, color: "888888" })],
      }),
    );
  out.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new ImageRun({
          type: "png",
          data: buf,
          transformation: { width: IMG_WIDTH_PX, height: h },
        }),
      ],
    }),
  );
  return out;
}

async function buildForm(
  dateKey: string,
  list: ReportCommit[],
  meta: FormMeta,
  first: boolean,
) {
  const out: (Paragraph | Table)[] = [];

  out.push(
    new Paragraph({
      pageBreakBefore: !first,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [text("FORM PENGAJUAN LEMBUR", { bold: true, size: 28 })],
    }),
  );

  out.push(
    new Table({
      width: { size: 9706, type: WidthType.DXA },
      columnWidths: [2200, 300, 7206],
      borders: TableBorders.NONE,
      rows: [
        fieldRow("Nama", meta.employeeName),
        fieldRow("Tanggal", formatFormDate(dateKey)),
        // 1 commit: judul saja. Lebih dari 1: daftar bernomor.
        fieldRow(
          "Alasan Lembur",
          list.length === 1
            ? list[0].title
            : list.map((c, i) => `${i + 1}. ${c.title}`),
        ),
      ],
    }),
  );

  out.push(
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [text("Screenshot perubahan", { bold: true })],
    }),
  );
  for (let n = 0; n < list.length; n++) {
    const c = list[n];
    if (list.length > 1) {
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 160, after: 80 },
          children: [text(`${n + 1}. ${c.title}`, { bold: true, size: 20 })],
        }),
      );
    }
    if (c.note)
      out.push(
        new Paragraph({
          children: [text(c.note, { italics: true, color: "B45309" })],
        }),
      );
    const total = c.images.length;
    for (let i = 0; i < total; i++) {
      out.push(
        ...(await imageBlock(
          c.images[i],
          total > 1 ? `Bagian ${i + 1}/${total}` : undefined,
        )),
      );
    }
  }

  // Blok tanda tangan atasan (dijaga agar tidak terpisah dari baris berikutnya)
  const sig = (t: string, o: { bold?: boolean; before?: number } = {}) =>
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before: o.before ?? 0, after: 40 },
      children: [text(t, { bold: o.bold })],
    });
  out.push(
    sig(
      "Kepala Subdirektorat Inovasi, Produk, dan Layanan Digital pada Direktorat Teknologi Digital",
      { bold: true, before: 360 },
    ),
    sig(""),
    sig(""),
    sig(""),
    sig(meta.supervisor.name, { bold: true }),
    new Paragraph({
      keepLines: true,
      children: [text(`NIK ${meta.supervisor.nik}`)],
    }),
  );
  return out;
}

export async function buildDocx(
  commits: ReportCommit[],
  meta: FormMeta,
): Promise<Buffer> {
  const sorted = [...commits].sort((a, b) => a.time - b.time);
  const children: (Paragraph | Table)[] = [];

  if (!sorted.length) {
    children.push(
      new Paragraph({ children: [text("Tidak ada commit pada periode ini.")] }),
    );
  }
  // Satu form per tanggal; semua commit (lintas project) di tanggal itu digabung.
  const byDate = new Map<string, ReportCommit[]>();
  for (const c of sorted) {
    if (!byDate.has(c.dateKey)) byDate.set(c.dateKey, []);
    byDate.get(c.dateKey)!.push(c);
  }
  let first = true;
  for (const dateKey of [...byDate.keys()].sort()) {
    children.push(
      ...(await buildForm(dateKey, byDate.get(dateKey)!, meta, first)),
    );
    first = false;
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
