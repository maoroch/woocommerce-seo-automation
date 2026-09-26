import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";

/**
 * GET /api/categories/scores
 * Средний SEO score по каждой категории — для Dashboard.
 */
export async function GET() {
  await connectDB();

  const results = await Product.aggregate([
    { $unwind: "$categories" },
    {
      $group: {
        _id: { id: "$categories.id", name: "$categories.name" },
        avgScore: { $avg: "$seo_score.total" },
        count: { $sum: 1 },
        below50: { $sum: { $cond: [{ $lt: ["$seo_score.total", 50] }, 1, 0] } },
      },
    },
    { $sort: { avgScore: 1 } },
    { $limit: 20 },
  ]);

  const categories = results.map((r) => ({
    id: r._id.id,
    name: r._id.name,
    avgScore: Math.round(r.avgScore ?? 0),
    count: r.count,
    below50: r.below50,
  }));

  return NextResponse.json({ categories });
}
