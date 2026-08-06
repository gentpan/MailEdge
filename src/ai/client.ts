import type { AiConfig } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiError extends Error {}

type ChatContentPart = string | { text?: unknown; content?: unknown; value?: unknown };

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
    text?: unknown;
    finish_reason?: string | null;
  }>;
  output_text?: unknown;
  error?: { message?: string };
}

/** 兼容字符串、内容块数组，以及少数 OpenAI 兼容网关的 output_text 格式。 */
function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part: ChatContentPart) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      for (const key of ["text", "content", "value"] as const) {
        if (typeof part[key] === "string") return part[key];
      }
      return "";
    })
    .join("");
}

/**
 * OpenAI 兼容的 chat completions 调用。
 * baseUrl 末尾可带或不带 /v1，这里统一拼到 /chat/completions。
 */
export async function chat(
  config: AiConfig,
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  if (!config.apiKey) throw new AiError("尚未配置 AI API Key");

  const base = config.baseUrl.replace(/\/+$/, "");
  const url = /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

  const request = (temperature: number) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

  const parseResponse = async (response: Response) =>
    (await response.json().catch(() => null)) as ChatResponse | null;

  let response = await request(options.temperature ?? 0.4);
  let data = await parseResponse(response);

  // 部分新模型（例如推理模型）只接受 temperature=1。第一次请求会在
  // 参数校验阶段失败，因此自动用兼容值重试，不要求用户修改每个任务的配置。
  const providerError = data?.error?.message ?? "";
  if (!response.ok && /temperature[\s\S]*only\s+1\s+is\s+allowed/i.test(providerError)) {
    response = await request(1);
    data = await parseResponse(response);
  }

  if (!response.ok) {
    const message =
      data?.error?.message ?? (typeof data === "object" ? JSON.stringify(data) : `HTTP ${response.status}`);
    throw new AiError(`AI 请求失败：${message}`);
  }

  const choice = data?.choices?.[0];
  const content =
    extractText(choice?.message?.content) || extractText(choice?.text) || extractText(data?.output_text);
  if (!content.trim()) {
    const finishReason = choice?.finish_reason;
    if (finishReason === "length") {
      throw new AiError("AI 输出长度不足，请提高模型输出上限后重试");
    }
    throw new AiError("AI 返回为空（接口未返回可读文本）");
  }
  return content.trim();
}
