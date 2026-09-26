import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";
import { enhanceProductWithAI } from "../../../../../server-lib/services/ai-enhancer.js";
import { buildContext } from "../../../../../server-lib/lib/obsidian.js";

/**
 * POST /api/products/[id]/ai-enhance
 *
 * Body: {
 *   mode?: 'seo' | 'content' | 'all'   (default 'all')
 *   provider?: 'openrouter' | 'ollama'  (default from AI_PROVIDER env)
 *   model?: string                       (override model)
 *   context?: string                     (extra context, e.g. from Obsidian)
 * }
 *
 * Вызывает AI напрямую (синхронно, без BullMQ) и сохраняет результат как
 * ai_suggestion + task_status='done' — товар появляется в Queue для review,
 * как и при обработке через worker.
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

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine, use defaults
  }

  const { mode = "all", provider, model, context = "", obsidianNotes = [] } = body;

  const doc = await Product.findOne({ wc_id: wcId });
  if (!doc) {
    return NextResponse.json({ error: "Product not found in MongoDB" }, { status: 404 });
  }

  doc.task_status = "processing";
  await doc.save();

  try {
    const productData = {
      id: doc.wc_id,
      sku: doc.sku,
      slug: doc.slug,
      name: doc.name,
      title: doc.title,
      meta_title: doc.meta_title,
      meta_description: doc.meta_description,
      focus_keyword: doc.focus_keyword,
      description: doc.description,
      short_description: doc.short_description,
    };

    const obsidianContext = await buildContext(obsidianNotes);
    const fullContext = [context, obsidianContext].filter(Boolean).join("\n\n---\n\n");

    const enhanced = await enhanceProductWithAI(productData, { mode, provider, model, context: fullContext });

    doc.ai_suggestion = {
      ...enhanced,
      mode,
      generated_at: new Date(),
    };
    doc.task_status = "done";
    doc.history.push({
      action: "ai_enhance",
      changes: [],
      note: `AI enhance from dashboard (mode: ${mode}, provider: ${enhanced._meta?.provider}${obsidianNotes.length ? `, context: ${obsidianNotes.join(", ")}` : ""})`,
      created_at: new Date(),
    } as any);
    await doc.save();

    return NextResponse.json({ ok: true, ai_suggestion: doc.ai_suggestion });
  } catch (err: any) {
    doc.task_status = "idle";
    await doc.save();
    return NextResponse.json({ error: err.message || "AI enhancement failed" }, { status: 500 });
  }
}
