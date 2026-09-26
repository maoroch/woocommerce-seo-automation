import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Category } from "@/lib/models/Category";

export async function GET() {
  await connectDB();
  const categories = await Category.find({})
    .sort({ name: 1 })
    .select("wc_id name slug parent count")
    .lean();
  return NextResponse.json({ categories });
}
