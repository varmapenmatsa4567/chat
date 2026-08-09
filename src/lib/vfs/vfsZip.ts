// Zips the whole VFS (or emits a single file) as a downloadable data URL.
import JSZip from "jszip";
import type { VirtualFileSystem } from "./VirtualFileSystem";

const MIME: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  jsx: "text/javascript",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  md: "text/markdown",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain",
  yaml: "text/yaml",
  yml: "text/yaml",
  lock: "application/json",
  map: "application/json",
};

export type DownloadResult = {
  filename: string;
  dataUrl: string;
  size: number;
};

export async function zipVfs(
  vfs: VirtualFileSystem,
  filename = "project.zip"
): Promise<DownloadResult> {
  const zip = new JSZip();
  for (const path of vfs.allFilePaths()) {
    zip.file(path, vfs.getContent(path) ?? "");
  }
  const base64 = await zip.generateAsync({
    type: "base64",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  // Approximate uncompressed byte size from base64 length.
  const size = Math.round((base64.length * 3) / 4);
  return {
    filename,
    dataUrl: `data:application/zip;base64,${base64}`,
    size,
  };
}

export function fileToDataUrl(
  content: string,
  filename: string
): DownloadResult {
  const base64 = Buffer.from(content, "utf-8").toString("base64");
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const mime = MIME[ext] ?? "text/plain";
  return {
    filename,
    dataUrl: `data:${mime};base64,${base64}`,
    size: Buffer.byteLength(content, "utf-8"),
  };
}
