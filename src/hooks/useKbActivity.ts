import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface KbActivityResult {
  doc_name: string;
  source_type: string;
  similarity: number;
  snippet: string;
}

export interface KbActivityEntry {
  id: string;
  query: string;
  result_count: number;
  results: KbActivityResult[];
  created_at: number;
}

export function useKbActivity(limit = 50) {
  const [entries, setEntries] = useState<KbActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await invoke<KbActivityEntry[]>("kb_get_activity", { limit });
      setEntries(data);
    } catch (e) {
      console.error("KB activity fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  const clearAll = useCallback(async () => {
    try {
      await invoke("kb_clear_activity");
      setEntries([]);
    } catch (e) {
      console.error("KB clear activity error:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  return { entries, isLoading, refresh, clearAll };
}
