type TranscriptEntry = { role: "them" | "ai" | "me"; text: string; time: string };

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exports a meeting transcript as a plain .txt file.
 */
export function exportTranscriptAsTxt(transcript: TranscriptEntry[], dateLabel?: string): void {
  const roleLabel = (role: TranscriptEntry["role"]) =>
    role === "me" ? "Moi" : role === "them" ? "Participant" : "Assistant IA";
  const lines: string[] = [];
  if (dateLabel) lines.push(`Transcription — ${dateLabel}`, "");
  for (const entry of transcript) {
    lines.push(`[${entry.time}] ${roleLabel(entry.role)}: ${entry.text}`);
  }
  downloadBlob(lines.join("\n"), `Transcription_${Date.now()}.txt`, "text/plain");
}

/**
 * Exports a meeting transcript as an .srt subtitle file.
 */
export function exportTranscriptAsSrt(transcript: TranscriptEntry[]): void {
  const roleLabel = (role: TranscriptEntry["role"]) =>
    role === "me" ? "Moi" : role === "them" ? "Participant" : "IA";

  // Parse "HH:MM" or "MM:SS" or plain time strings into seconds
  const parseTime = (t: string): number => {
    const parts = t.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  const toSrtTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},000`;
  };

  const lines: string[] = [];
  transcript.forEach((entry, i) => {
    const startSecs = parseTime(entry.time);
    const endSecs = startSecs + Math.max(3, Math.ceil(entry.text.length / 15));
    lines.push(
      `${i + 1}`,
      `${toSrtTime(startSecs)} --> ${toSrtTime(endSecs)}`,
      `${roleLabel(entry.role)}: ${entry.text}`,
      ""
    );
  });
  downloadBlob(lines.join("\n"), `Transcription_${Date.now()}.srt`, "text/plain");
}

/**
 * Exports text content as a downloadable Markdown file.
 */
export function exportAsMarkdown(title: string, content: string): void {
  const blob = new Blob([`# ${title}\n\n${content}`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exports content as a printable PDF via the browser's print dialog.
 * The user can choose "Save as PDF" from the print dialog.
 */
export function exportAsPdf(title: string, content: string, dateLabel?: string): void {
  // Convert basic markdown to HTML
  const htmlContent = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #111;
    max-width: 720px;
    margin: 0 auto;
    padding: 24px;
  }
  h1 { font-size: 20pt; margin-bottom: 4px; }
  h2 { font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 12pt; margin-top: 14px; }
  .subtitle { color: #666; font-size: 10pt; margin-bottom: 24px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  p { margin: 8px 0; }
  strong { font-weight: 600; }
  @media print {
    body { padding: 0; }
    @page { margin: 2cm; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
${dateLabel ? `<p class="subtitle">${dateLabel}</p>` : ""}
<div>${htmlContent}</div>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Wait for content to render, then print
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Remove iframe after print dialog closes (delay to allow dialog to open)
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  }, 250);
}
