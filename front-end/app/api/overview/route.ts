import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";
import type { OverviewStats, TaskStatus } from "@/lib/types";

export async function GET() {
  await connectDB();

  const total = await Product.countDocuments();

  if (total === 0) {
    const empty: OverviewStats = {
      total: 0,
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      below50: 0,
      above70: 0,
      lastSync: null,
      statusCounts: {
        idle: 0,
        pending: 0,
        processing: 0,
        done: 0,
        approved: 0,
        rejected: 0,
      },
    };
    return NextResponse.json(empty);
  }

  const [scoreAgg, statusAgg, lastSyncDoc] = await Promise.all([
    Product.aggregate([
      {
        $group: {
          _id: null,
          avg: { $avg: "$seo_score.total" },
          min: { $min: "$seo_score.total" },
          max: { $max: "$seo_score.total" },
          below50: {
            $sum: { $cond: [{ $lt: ["$seo_score.total", 50] }, 1, 0] },
          },
          above70: {
            $sum: { $cond: [{ $gte: ["$seo_score.total", 70] }, 1, 0] },
          },
        },
      },
    ]),
    Product.aggregate([{ $group: { _id: "$task_status", count: { $sum: 1 } } }]),
    Product.findOne({}, { wc_synced_at: 1 }).sort({ wc_synced_at: -1 }),
  ]);

  const score = scoreAgg[0] || {};

  const statusCounts: Record<TaskStatus, number> = {
    idle: 0,
    pending: 0,
    processing: 0,
    done: 0,
    approved: 0,
    rejected: 0,
  };
  for (const s of statusAgg) {
    if (s._id in statusCounts) statusCounts[s._id as TaskStatus] = s.count;
  }

  const stats: OverviewStats = {
    total,
    avgScore: Math.round(score.avg ?? 0),
    minScore: score.min ?? 0,
    maxScore: score.max ?? 0,
    below50: score.below50 ?? 0,
    above70: score.above70 ?? 0,
    lastSync: lastSyncDoc?.wc_synced_at
      ? new Date(lastSyncDoc.wc_synced_at).toISOString()
      : null,
    statusCounts,
  };

  return NextResponse.json(stats);
}
