/** scripts/lib/config.mjs 的类型声明，供测试与编辑器使用 */

export function extractJson(text: string | null | undefined): unknown;

// biome-ignore lint/suspicious/noExplicitAny: JSONC 的结构是任意的，交由调用方断言
export function parseJsonc(raw: string): any;

export function replaceStringValue(raw: string, key: string, value: string): string | null;

export function extractDeployedUrl(text: string | null | undefined): string | null;

export function isUnauthenticated(output: string | null | undefined): boolean;

export function parseAccount(output: string | null | undefined): { name: string; id: string } | null;

export function hasBucket(listOutput: string | null | undefined, name: string): boolean;
