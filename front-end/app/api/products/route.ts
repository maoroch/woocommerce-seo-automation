import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

export async function GET(req: NextRequest) {
  await connectDB();

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  const scoreFilter = sp.get("score"); // "below50" | "above70" | null
  const categoryId = sp.get("category");
  const sort = sp.get("sort") || "score_asc";
  const page = parseInt(sp.get("page") || "1");
  const limit = Math.min(parseInt(sp.get("limit") || "25"), 100);

  const query: any = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { wc_id: isNaN(Number(search)) ? -1 : Number(search) },
    ];
  }

  if (status) {
    query.task_status = status;
  }

  if (scoreFilter === "below50") {
    query["seo_score.total"] = { $lt: 50 };
  } else if (scoreFilter === "above70") {
    query["seo_score.total"] = { $gte: 70 };
  }

  if (categoryId) {
    query["categories.id"] = Number(categoryId);
  }

  let sortSpec: Record<string, 1 | -1> = { "seo_score.total": 1 };
  switch (sort) {
    case "score_asc":
      sortSpec = { "seo_score.total": 1 };
      break;
    case "score_desc":
      sortSpec = { "seo_score.total": -1 };
      break;
    case "name_asc":
      sortSpec = { name: 1 };
      break;
    case "synced_desc":
      sortSpec = { wc_synced_at: -1 };
      break;
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(query)
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .select(
        "wc_id sku slug name seo_score task_status wc_synced_at imported_at ai_suggestion categories"
      )
      .lean(),
    Product.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
