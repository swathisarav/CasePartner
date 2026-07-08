import { invoke } from "@tauri-apps/api/core";
import type { CaseData } from "../types/case";

export async function saveCase(caseData: CaseData): Promise<void> {
  await invoke("save_case", {
    id: caseData.id,
    json: JSON.stringify(caseData, null, 2),
  });
}

export async function listCases(): Promise<CaseData[]> {
  const raw = await invoke<string[]>("list_cases");
  const cases = raw.map((json) => JSON.parse(json) as CaseData);
  cases.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return cases;
}

export async function deleteCase(id: string): Promise<void> {
  await invoke("delete_case", { id });
}
