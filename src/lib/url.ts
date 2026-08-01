/** 去掉 URL 末尾的多余斜杠，拼接路径时避免出现双斜杠。 */
export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
