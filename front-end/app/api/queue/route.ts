import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

/**
 * GET /api/queue?status=done
 * Возвращает товары по статусу очереди для review.
 * Если status не указан — возвращает сводку по всем статусам.
 */
export async function GET(req: NextRequest) {
  await connectDB();
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");

  if (status) {
    const items = await Product.find({ task_status: status })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select(
        "wc_id sku name seo_score task_status ai_suggestion updatedAt history"
      )
      .lean();

    return NextResponse.json({ items });
  }

  const counts = await Product.aggregate([
    { $group: { _id: "$task_status", count: { $sum: 1 } } },
  ]);

  const result: Record<string, number> = {
    idle: 0,
    pending: 0,
    processing: 0,
    done: 0,
    approved: 0,
    rejected: 0,
  };
  for (const c of counts) {
    if (c._id in result) result[c._id] = c.count;
  }

  return NextResponse.json(result);
}
