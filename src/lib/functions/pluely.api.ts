import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "../storage";
import { STORAGE_KEYS } from "@/config";

// Helper function to check if Lamu API should be used
export async function shouldUseLamuAPI(): Promise<boolean> {
  try {
    // Check if Lamu API is enabled in localStorage (default to true for new users)
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.LAMU_API_ENABLED);
    const lamuApiEnabled = stored === null ? true : stored === "true";
    if (!lamuApiEnabled) return false;

    // Allow during active trial (no license required)
    const cachedExpiry = safeLocalStorage.getItem(STORAGE_KEYS.TRIAL_EXPIRES_AT);
    if (cachedExpiry && Date.now() < parseInt(cachedExpiry, 10)) return true;

    // Allow with active license
    const hasLicense = await invoke<boolean>("check_license_status");
    return hasLicense;
  } catch (error) {
    console.warn("Failed to check Lamu API availability:", error);
    return false;
  }
}
