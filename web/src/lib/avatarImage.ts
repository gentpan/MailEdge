/** 头像上传前在浏览器里处理：居中裁成正方形、缩到 256px，优先编码成 WebP（不支持时退回 PNG）。 */
export const AVATAR_SIZE = 256;

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张图片");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("这张图片无法读取，请换一张");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器无法处理图片");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const png = await encode("image/png");
  if (!png) throw new Error("浏览器无法处理图片");
  return png;
}
