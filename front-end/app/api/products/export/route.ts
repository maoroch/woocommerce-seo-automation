import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

function csvEscape(value: any): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * GET /api/products/export
 * Same filters as /api/products (search, status, score, category) but
 * returns the FULL matching set as CSV (no pagination).
 */
export async function GET(req: NextRequest) {
  await connectDB();

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  const scoreFilter = sp.get("score");
  const categoryId = sp.get("category");

  const query: any = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { wc_id: isNaN(Number(search)) ? -1 : Number(search) },
    ];
  }
  if (status) query.task_status = status;
  if (scoreFilter === "below50") query["seo_score.total"] = { $lt: 50 };
  else if (scoreFilter === "above70") query["seo_score.total"] = { $gte: 70 };
  if (categoryId) query["categories.id"] = Number(categoryId);

  const items = await Product.find(query)
    .sort({ "seo_score.total": 1 })
    .limit(2000)
    .select(
      "wc_id sku name meta_title meta_description focus_keyword seo_score task_status categories wc_synced_at"
    )
    .lean();

  const headers = [
    "wc_id",
    "sku",
    "name",
    "category",
    "seo_score",
    "title_score",
    "meta_score",
    "keyword_score",
    "content_score",
    "images_score",
    "meta_title",
    "meta_description",
    "focus_keyword",
    "task_status",
    "synced_at",
  ];

  const rows = (items as any[]).map((p) => [
    p.wc_id,
    p.sku || "",
    p.name || "",
    (p.categories || []).map((c: any) => c.name).join("; "),
    p.seo_score?.total ?? 0,
    p.seo_score?.title ?? 0,
    p.seo_score?.meta_desc ?? 0,
    p.seo_score?.keyword ?? 0,
    p.seo_score?.content ?? 0,
    p.seo_score?.images ?? 0,
    p.meta_title || "",
    p.meta_description || "",
    p.focus_keyword || "",
    p.task_status || "idle",
    p.wc_synced_at ? new Date(p.wc_synced_at).toISOString() : "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seo-products-${Date.now()}.csv"`,
    },
  });
}
