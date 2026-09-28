import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ExtractedSegment } from "./segments";
import { ExtractionError, ExtractionSchema, SYSTEM_PROMPT, toSegments, userMessage } from "./prompt";

/**
 * 可选：配置了 ANTHROPIC_API_KEY 时改用 Claude 识别（结构化输出严格约束 JSON）。
 * 默认用免费的 Workers AI，见 workersAi.ts。
 */

export const EXTRACTION_MODEL = "claude-opus-5";

/** 正文超过这个长度就不送去识别（不静默截断，直接标记失败让用户知道）。 */
export const MAX_EMAIL_CHARS = 60_000;

export async function extractWithClaude(
  apiKey: string,
  subject: string,
  text: string,
): Promise<ExtractedSegment[]> {
  if (text.length > MAX_EMAIL_CHARS) {
    throw new ExtractionError(`邮件正文过长（${text.length} 字，上限 ${MAX_EMAIL_CHARS}），没有送去识别`);
  }
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      // 被安全分类器拒绝时由服务端自动换模型重试
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage(subject, text) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ExtractionError("ANTHROPIC_API_KEY 无效");
    if (err instanceof Anthropic.RateLimitError) throw new ExtractionError("Claude API 限流，请稍后重新解析");
    if (err instanceof Anthropic.APIError)
      throw new ExtractionError(`Claude API 出错（${err.status}）：${err.message}`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ExtractionError("模型拒绝处理这封邮件");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("识别结果过长被截断");
  const parsed = response.parsed_output;
  if (!parsed) throw new ExtractionError("模型没有返回合法的 JSON");
  return toSegments(parsed);
}
