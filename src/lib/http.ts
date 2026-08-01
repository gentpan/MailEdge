/** 解析响应 JSON，解析失败返回 null。渠道返回非 JSON 错误体时兜底。 */
export async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
