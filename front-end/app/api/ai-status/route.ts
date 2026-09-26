import { NextResponse } from "next/server";
import { checkProviderStatus, DEFAULT_OPENROUTER_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_BASE_URL } from "../../../server-lib/lib/ai-provider.js";

/**
 * GET /api/ai-status
 * Возвращает статус обоих провайдеров — для селектора в UI.
 */
export async function GET() {
  const [openrouter, ollama] = await Promise.all([
    checkProviderStatus("openrouter"),
    checkProviderStatus("ollama"),
  ]);

  return NextResponse.json({
    default: process.env.AI_PROVIDER || "openrouter",
    openrouter: { ...openrouter, defaultModel: DEFAULT_OPENROUTER_MODEL },
    ollama: { ...ollama, defaultModel: DEFAULT_OLLAMA_MODEL, baseUrl: DEFAULT_OLLAMA_BASE_URL },
  });
}
