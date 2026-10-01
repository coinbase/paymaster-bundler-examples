/**
 * Append-only trade journal (JSONL).
 */
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export function appendJournal(journalPath, entry) {
  const dir = dirname(journalPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const row = {
    ts: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(journalPath, `${JSON.stringify(row)}\n`, "utf8");
  return row;
}
