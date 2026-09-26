import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

/**
 * POST /api/products/bulk
 *
 * Body: {
 *   ids: number[]              // wc_id list
 *   action: 'queue' | 'approve' | 'reject' | 'reset'
 *   mode?: 'seo'|'content'|'all'   // only for action='queue'
 * }
 *
 * 'queue' marks products as task_status='pending' so the BullMQ worker
 * (running separately) can pick them up. This route does NOT call AI itself —
 * adding jobs to BullMQ requires Redis; for synchronous in-dashboard generation
 * use /api/products/[id]/ai-enhance one at a time, or run the worker.
 */
export async function POST(req: NextRequest) {
  await connectDB();

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, action } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "Too many ids (max 200 per request)" }, { status: 400 });
  }

  const numericIds = ids.map(Number).filter((n) => !isNaN(n));

  let update: Record<string, any> = {};
  let historyNote = "";

  switch (action) {
    case "queue":
      update = { task_status: "pending" };
      historyNote = "Queued for AI enhancement (bulk action)";
      break;
    case "approve":
      update = { task_status: "approved", imported_at: new Date() };
      historyNote = "Approved (bulk action)";
      break;
    case "reject":
      update = { task_status: "rejected", ai_suggestion: null };
      historyNote = "Rejected (bulk action)";
      break;
    case "reset":
      update = { task_status: "idle", ai_suggestion: null };
      historyNote = "Reset to idle (bulk action)";
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const result = await Product.updateMany(
    { wc_id: { $in: numericIds } },
    {
      $set: update,
      $push: {
        history: {
          action: "manual",
          changes: [],
          note: historyNote,
          created_at: new Date(),
        },
      },
    }
  );

  return NextResponse.json({
    ok: true,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
}
