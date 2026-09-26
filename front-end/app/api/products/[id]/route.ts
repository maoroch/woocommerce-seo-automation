import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;

  const doc = await Product.findOne({ wc_id: Number(id) }).lean();
  if (!doc) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(doc);
}

/**
 * PATCH — изменить task_status (например approve / reject из Queue review).
 * Body: { action: "approve" | "reject" }
 *
 * Это НЕ пишет в WooCommerce — только обновляет состояние в MongoDB.
 * Фактический импорт в WC выполняется через CLI (import.js) для сохранения
 * принципа Human-in-the-Loop с diff/preview/backup.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const { action, note } = body;

  const doc = await Product.findOne({ wc_id: Number(id) });
  if (!doc) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (action === "approve") {
    doc.task_status = "approved";
    doc.history.push({
      action: "manual",
      changes: [],
      note: note || "Marked as approved for import via dashboard",
      created_at: new Date(),
    } as any);
  } else if (action === "reject") {
    doc.task_status = "rejected";
    doc.ai_suggestion = null;
    doc.history.push({
      action: "manual",
      changes: [],
      note: note || "AI suggestion rejected via dashboard",
      created_at: new Date(),
    } as any);
  } else if (action === "reset") {
    doc.task_status = "idle";
    doc.ai_suggestion = null;
    doc.history.push({
      action: "manual",
      changes: [],
      note: note || "Reset to idle via dashboard",
      created_at: new Date(),
    } as any);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await doc.save();
  return NextResponse.json({ ok: true, task_status: doc.task_status });
}
