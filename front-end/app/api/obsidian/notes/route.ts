import { NextResponse } from "next/server";
import { listNotes } from "../../../../server-lib/lib/obsidian.js";

/**
 * GET /api/obsidian/notes
 * Возвращает список заметок из obsidian-vault/ для выбора в AI-панели.
 */
export async function GET() {
  try {
    const notes = await listNotes();
    return NextResponse.json({ notes });
  } catch (err: any) {
    return NextResponse.json({ notes: [], error: err.message }, { status: 200 });
  }
}
