import type { AiConfig } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiError extends Error {}

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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    const message =
      data?.error?.message ?? (typeof data === "object" ? JSON.stringify(data) : `HTTP ${response.status}`);
    throw new AiError(`AI 请求失败：${message}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AiError("AI 返回为空");
  return content.trim();
}
