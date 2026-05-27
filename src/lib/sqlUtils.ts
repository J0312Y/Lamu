// Shared SQL utilities for detecting and classifying SQL in AI responses

export interface SqlQueryResult {
  sql: string;
  dbName: string;
  integrationId: string;
  data: string;
  error?: string;
  type: "read" | "write";
  executed: boolean;
}

export interface PendingSqlWrite {
  sql: string;
  dbName: string;
  integrationId: string;
  writeQueue: Array<{ sql: string; dbName: string; integrationId: string }>;
}

export function isWriteSql(sql: string): boolean {
  return /^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE)\b/i.test(sql.trim());
}

export function extractSqlBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```sql\s*\n?([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[1].trim();
    if (s) blocks.push(s);
  }
  return blocks;
}
