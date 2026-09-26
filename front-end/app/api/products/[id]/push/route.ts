import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";
import { pushProductEdits } from "../../../../../server-lib/push.service.js";

/**
 * POST /api/products/[id]/push
 *
 * Body: { name?, meta_title?, meta_description?, focus_keyword?, description?, short_description?, slug? }
 *
 * Записывает изменения в WooCommerce напрямую (с предварительным бэкапом и
 * HTML-валидацией), затем обновляет зеркало в MongoDB + историю.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;
  const wcId = Number(id);

  if (!wcId || isNaN(wcId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  let edits: Record<string, any>;
  try {
    edits = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Разрешаем только редактируемые поля
  const ALLOWED = [
    "name",
    "meta_title",
    "meta_description",
    "focus_keyword",
    "description",
    "short_description",
    "slug",
  ];
  const cleaned: Record<string, any> = {};
  for (const key of ALLOWED) {
    if (edits[key] !== undefined) cleaned[key] = edits[key];
  }

  if (Object.keys(cleaned).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  try {
    const result = await pushProductEdits(wcId, cleaned, Product);

    if (!result.success) {
      return NextResponse.json(
        { error: "HTML validation failed", validationErrors: result.validationErrors },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Push failed" }, { status: 500 });
  }
}
