import { NextRequest, NextResponse } from "next/server";
import {
  getFailedJobs,
  retryFailedJob,
  removeFailedJob,
} from "../../../../server-lib/queue/queue.js";

/**
 * GET /api/queue/failed
 * Список упавших AI-задач (BullMQ) с причиной ошибки.
 *
 * Требует Redis. Если Redis недоступен, возвращает пустой список с ok:false,
 * чтобы UI мог показать соответствующее сообщение без падения.
 */
export async function GET() {
  try {
    const jobs = await getFailedJobs(50);
    return NextResponse.json({ ok: true, jobs });
  } catch (err: any) {
    return NextResponse.json({ ok: false, jobs: [], error: err.message });
  }
}

/**
 * POST /api/queue/failed
 * Body: { jobId: string, action: 'retry' | 'remove' }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { jobId, action } = body;
  if (!jobId || !["retry", "remove"].includes(action)) {
    return NextResponse.json({ error: "jobId and valid action required" }, { status: 400 });
  }

  try {
    if (action === "retry") {
      await retryFailedJob(jobId);
    } else {
      await removeFailedJob(jobId);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
