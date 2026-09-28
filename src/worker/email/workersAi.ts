import { EXTRACTION_JSON_SCHEMA, ExtractionError, SYSTEM_PROMPT, toSegments, userMessage } from "./prompt";
import type { ExtractedSegment } from "./segments";

/**
 * 用 Cloudflare Workers AI 识别邮件正文（Workers 免费计划每天含 10,000 Neurons，
 * 一封确认邮件约几百 Neurons）。模型需支持 JSON Mode（response_format.json_schema）。
 */
export const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** 模型上下文约 24K tokens，给提示词和输出留出余量。 */
const MAX_INPUT_TOKENS = 18_000;

/** 粗略估算 token 数：中日韩字符约 1 token/字，其余约 4 字符/token。 */
export function estimateTokens(s: string): number {
  const cjk = (s.match(/[　-鿿가-힯＀-￯]/g) ?? []).length;
  return cjk + Math.ceil((s.length - cjk) / 4);
}

export async function extractWithWorkersAi(
  ai: Ai,
  subject: string,
  text: string,
): Promise<ExtractedSegment[]> {
  const tokens = estimateTokens(text);
  if (tokens > MAX_INPUT_TOKENS) {
    throw new ExtractionError(`邮件正文过长（约 ${tokens} tokens，上限 ${MAX_INPUT_TOKENS}），没有送去识别`);
  }
  let result: { response?: unknown };
  try {
    result = (await ai.run(WORKERS_AI_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage(subject, text) },
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA },
      max_tokens: 4096,
      temperature: 0,
    })) as { response?: unknown };
  } catch (err) {
    throw new ExtractionError(`Workers AI 出错：${err instanceof Error ? err.message : String(err)}`);
  }
  // JSON Mode 下 response 通常已是对象；个别情况下是 JSON 字符串
  let output = result.response;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new ExtractionError("模型没有返回合法的 JSON");
    }
  }
  return toSegments(output);
}
