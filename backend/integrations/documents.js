'use strict';

const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Temp directory for generated files
const TEMP_DIR = path.join(__dirname, '..', 'temp_docs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Auto-cleanup files older than 1 hour
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(TEMP_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 3600000) fs.unlinkSync(fp);
    }
  } catch {}
}, 600000);

// ── Excel Generation ────────────────────────────────────────────────────────

async function generateExcel({ title, sheets }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lamu AI';
  wb.created = new Date();

  for (const sheet of (sheets || [])) {
    const ws = wb.addWorksheet(sheet.name || 'Sheet');

    // Column definitions
    if (sheet.columns?.length) {
      ws.columns = sheet.columns.map(c => ({
        header: c.header || c.name,
        key: c.key || c.name?.toLowerCase().replace(/\s+/g, '_'),
        width: c.width || Math.max(12, (c.header || c.name || '').length + 4),
      }));
    }

    // Header styling
    if (ws.columns?.length) {
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 24;
    }

    // Data rows
    if (sheet.rows?.length) {
      for (const rowData of sheet.rows) {
        const row = Array.isArray(rowData) ? rowData : Object.values(rowData);
        const addedRow = ws.addRow(row);
        addedRow.alignment = { vertical: 'middle' };
      }
    }

    // Formulas
    if (sheet.formulas?.length) {
      for (const f of sheet.formulas) {
        const cell = ws.getCell(f.cell);
        cell.value = { formula: f.formula };
        if (f.bold) cell.font = { bold: true };
        if (f.format === 'currency') cell.numFmt = '#,##0.00 €';
        if (f.format === 'percent') cell.numFmt = '0.00%';
        if (f.format === 'number') cell.numFmt = '#,##0';
      }
    }

    // Conditional formatting
    if (sheet.conditionalFormatting?.length) {
      for (const cf of sheet.conditionalFormatting) {
        ws.addConditionalFormatting({
          ref: cf.range,
          rules: [{
            type: 'cellIs',
            operator: cf.operator || 'greaterThan',
            formulae: [cf.value || 0],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: cf.color || 'FF4ADE80' } },
              font: { color: { argb: cf.fontColor || 'FF000000' } },
            },
          }],
        });
      }
    }

    // Auto-filter
    if (sheet.autoFilter !== false && ws.columns?.length && sheet.rows?.length) {
      ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + ws.columns.length)}1` };
    }

    // Freeze header row
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Alternating row colors
    for (let i = 2; i <= (sheet.rows?.length || 0) + 1; i++) {
      if (i % 2 === 0) {
        ws.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
    }
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const fileName = `${(title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_')}_${fileId}.xlsx`;
  const filePath = path.join(TEMP_DIR, fileName);
  await wb.xlsx.writeFile(filePath);
  return { fileName, filePath, fileId };
}

// ── PowerPoint Generation ───────────────────────────────────────────────────

async function generatePptx({ title, slides, theme }) {
  const pptx = new PptxGenJS();
  pptx.author = 'Lamu AI';
  pptx.title = title || 'Presentation';

  // Theme colors
  const colors = {
    primary: theme?.primary || '4F46E5',
    secondary: theme?.secondary || '818CF8',
    background: theme?.background || 'FFFFFF',
    text: theme?.text || '1A1A2E',
    accent: theme?.accent || '4ADE80',
  };

  for (const slideData of (slides || [])) {
    const slide = pptx.addSlide();

    // Background
    if (slideData.background) {
      slide.background = { color: slideData.background };
    }

    switch (slideData.layout || 'content') {
      case 'title': {
        // Title slide
        slide.background = { color: colors.primary };
        slide.addText(slideData.title || title || '', {
          x: 0.8, y: 1.5, w: '85%', h: 1.5,
          fontSize: 36, fontFace: 'Arial', color: 'FFFFFF', bold: true,
          align: 'left',
        });
        if (slideData.subtitle) {
          slide.addText(slideData.subtitle, {
            x: 0.8, y: 3.2, w: '85%', h: 0.8,
            fontSize: 18, fontFace: 'Arial', color: 'C7D2FE',
            align: 'left',
          });
        }
        if (slideData.date || slideData.author) {
          slide.addText(`${slideData.date || ''} ${slideData.author ? '— ' + slideData.author : ''}`.trim(), {
            x: 0.8, y: 4.5, w: '85%', h: 0.5,
            fontSize: 12, fontFace: 'Arial', color: 'A5B4FC',
          });
        }
        break;
      }
      case 'section': {
        slide.background = { color: colors.secondary };
        slide.addText(slideData.title || '', {
          x: 0.8, y: 2, w: '85%', h: 1.5,
          fontSize: 32, fontFace: 'Arial', color: 'FFFFFF', bold: true,
        });
        break;
      }
      case 'content': {
        // Header
        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.8,
            fontSize: 24, fontFace: 'Arial', color: colors.primary, bold: true,
          });
          // Divider line
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.5, y: 1.1, w: 1.5, h: 0.04, fill: { color: colors.accent },
          });
        }
        // Body content
        if (slideData.body) {
          slide.addText(slideData.body, {
            x: 0.5, y: 1.4, w: '90%', h: 3.8,
            fontSize: 16, fontFace: 'Arial', color: colors.text,
            lineSpacing: 24, valign: 'top',
          });
        }
        // Bullet points
        if (slideData.bullets?.length) {
          const bulletText = slideData.bullets.map(b => ({
            text: b, options: { bullet: { code: '2022' }, fontSize: 16, color: colors.text },
          }));
          slide.addText(bulletText, {
            x: 0.5, y: slideData.title ? 1.4 : 0.5, w: '90%', h: 4,
            fontFace: 'Arial', lineSpacing: 28, valign: 'top',
          });
        }
        break;
      }
      case 'two_column': {
        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.8,
            fontSize: 24, fontFace: 'Arial', color: colors.primary, bold: true,
          });
        }
        // Left column
        if (slideData.left) {
          slide.addText(slideData.left, {
            x: 0.5, y: 1.3, w: '43%', h: 3.8,
            fontSize: 14, fontFace: 'Arial', color: colors.text, valign: 'top',
          });
        }
        // Right column
        if (slideData.right) {
          slide.addText(slideData.right, {
            x: 5.3, y: 1.3, w: '43%', h: 3.8,
            fontSize: 14, fontFace: 'Arial', color: colors.text, valign: 'top',
          });
        }
        break;
      }
      case 'table': {
        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.7,
            fontSize: 22, fontFace: 'Arial', color: colors.primary, bold: true,
          });
        }
        if (slideData.table?.length) {
          const tableRows = slideData.table.map((row, i) =>
            row.map(cell => ({
              text: String(cell),
              options: {
                fontSize: 12, fontFace: 'Arial',
                fill: i === 0 ? colors.primary : (i % 2 === 0 ? 'F3F4F6' : 'FFFFFF'),
                color: i === 0 ? 'FFFFFF' : colors.text,
                bold: i === 0, valign: 'middle', align: 'center',
                border: { type: 'solid', pt: 0.5, color: 'E5E7EB' },
              },
            }))
          );
          slide.addTable(tableRows, {
            x: 0.5, y: 1.1, w: 9, colW: Array(slideData.table[0]?.length || 1).fill(9 / (slideData.table[0]?.length || 1)),
            rowH: 0.45,
          });
        }
        break;
      }
      case 'chart': {
        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.7,
            fontSize: 22, fontFace: 'Arial', color: colors.primary, bold: true,
          });
        }
        if (slideData.chartData?.length) {
          const chartType = slideData.chartType || 'bar';
          const pptxChartType = chartType === 'pie' ? pptx.ChartType.pie
            : chartType === 'line' ? pptx.ChartType.line
            : chartType === 'doughnut' ? pptx.ChartType.doughnut
            : pptx.ChartType.bar;
          slide.addChart(pptxChartType, slideData.chartData, {
            x: 0.5, y: 1.1, w: 9, h: 4,
            showTitle: false, showValue: true,
            chartColors: [colors.primary, colors.accent, colors.secondary, 'FBBF24', 'F87171', '38BDF8'],
          });
        }
        break;
      }
      default: {
        if (slideData.title) {
          slide.addText(slideData.title, {
            x: 0.5, y: 0.3, w: '90%', h: 0.8,
            fontSize: 24, fontFace: 'Arial', color: colors.primary, bold: true,
          });
        }
        if (slideData.body) {
          slide.addText(slideData.body, {
            x: 0.5, y: 1.4, w: '90%', h: 3.8,
            fontSize: 16, fontFace: 'Arial', color: colors.text, valign: 'top',
          });
        }
      }
    }

    // Notes
    if (slideData.notes) {
      slide.addNotes(slideData.notes);
    }
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const fileName = `${(title || 'presentation').replace(/[^a-zA-Z0-9_-]/g, '_')}_${fileId}.pptx`;
  const filePath = path.join(TEMP_DIR, fileName);
  await pptx.writeFile({ fileName: filePath });
  return { fileName, filePath, fileId };
}

// ── Tool Schemas ────────────────────────────────────────────────────────────

const SCHEMAS = [
  {
    type: 'function', function: {
      name: 'generate_excel',
      description: 'Generate a professional Excel spreadsheet (.xlsx) with multiple sheets, formulas, conditional formatting, and auto-filter. Returns a download link.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'Spreadsheet title (used as filename)' },
        sheets: {
          type: 'array', description: 'Worksheets to create',
          items: { type: 'object', properties: {
            name: { type: 'string', description: 'Sheet tab name' },
            columns: { type: 'array', items: { type: 'object', properties: {
              header: { type: 'string' }, key: { type: 'string' }, width: { type: 'integer' },
            }, required: ['header'] } },
            rows: { type: 'array', description: 'Data rows — each row is an array of values or an object matching column keys', items: {} },
            formulas: { type: 'array', description: 'Cell formulas', items: { type: 'object', properties: {
              cell: { type: 'string', description: 'Cell reference (e.g. E15)' },
              formula: { type: 'string', description: 'Excel formula (e.g. SUM(E2:E14))' },
              bold: { type: 'boolean' }, format: { type: 'string', enum: ['currency', 'percent', 'number'] },
            }, required: ['cell', 'formula'] } },
            conditionalFormatting: { type: 'array', items: { type: 'object', properties: {
              range: { type: 'string', description: 'Cell range (e.g. D2:D100)' },
              operator: { type: 'string', enum: ['greaterThan', 'lessThan', 'equal', 'between'] },
              value: {}, color: { type: 'string', description: 'ARGB hex (e.g. FF4ADE80)' },
            } } },
            autoFilter: { type: 'boolean', description: 'Enable auto-filter on headers (default true)' },
          }, required: ['name'] }
        },
      }, required: ['title', 'sheets'] }
    }
  },
  {
    type: 'function', function: {
      name: 'generate_pptx',
      description: 'Generate a professional PowerPoint presentation (.pptx) with multiple slide layouts: title, content, bullets, two-column, table, chart. Returns a download link.',
      parameters: { type: 'object', properties: {
        title: { type: 'string', description: 'Presentation title' },
        theme: { type: 'object', description: 'Color theme', properties: {
          primary: { type: 'string', description: 'Primary color hex (default 4F46E5)' },
          accent: { type: 'string', description: 'Accent color hex (default 4ADE80)' },
          background: { type: 'string' }, text: { type: 'string' },
        } },
        slides: {
          type: 'array', description: 'Slides to generate',
          items: { type: 'object', properties: {
            layout: { type: 'string', enum: ['title', 'section', 'content', 'two_column', 'table', 'chart'], description: 'Slide layout type' },
            title: { type: 'string' },
            subtitle: { type: 'string', description: 'For title slides' },
            body: { type: 'string', description: 'Body text content' },
            bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet point list' },
            left: { type: 'string', description: 'Left column text (two_column layout)' },
            right: { type: 'string', description: 'Right column text (two_column layout)' },
            table: { type: 'array', description: 'Table data — array of rows, each row is array of cell values. First row = headers.', items: { type: 'array', items: {} } },
            chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut'] },
            chartData: { type: 'array', description: 'Chart data series', items: { type: 'object', properties: {
              name: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } }, values: { type: 'array', items: { type: 'number' } },
            } } },
            notes: { type: 'string', description: 'Speaker notes' },
            date: { type: 'string' }, author: { type: 'string' },
          }, required: ['layout'] }
        },
      }, required: ['title', 'slides'] }
    }
  },
];

async function execute(name, args) {
  switch (name) {
    case 'generate_excel': {
      const result = await generateExcel(args);
      return { success: true, file: result.fileName, download_url: `/api/documents/download/${result.fileId}/${result.fileName}` };
    }
    case 'generate_pptx': {
      const result = await generatePptx(args);
      return { success: true, file: result.fileName, download_url: `/api/documents/download/${result.fileId}/${result.fileName}` };
    }
    default: return { error: `Unknown document tool: ${name}` };
  }
}

module.exports = { SCHEMAS, execute, TEMP_DIR };
