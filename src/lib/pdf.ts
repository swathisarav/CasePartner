import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract plain text from a PDF, page by page, entirely locally. */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      // pdf.js returns positioned fragments; start a new line when the
      // vertical position changes so tables keep some row structure.
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) line.push("\n");
      else if (line.length > 0) line.push(" ");
      line.push(item.str);
      lastY = y;
    }
    pages.push(`--- Page ${i} ---\n${line.join("")}`);
  }
  await doc.cleanup();
  return pages.join("\n\n");
}
