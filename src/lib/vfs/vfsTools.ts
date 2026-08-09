// Turns a VirtualFileSystem into AgentTools the model can call, plus two
// download tools that emit a `download` event to the client (single file or
// whole-project zip).

import type {
  AgentTool,
  AgentStreamEvent,
} from "../agent/types";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { VirtualFileSystem } from "./VirtualFileSystem";
import { zipVfs, fileToDataUrl } from "./vfsZip";

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? "");
}

function def(
  name: string,
  description: string,
  properties: Json,
  required: string[]
): ChatCompletionFunctionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

export function createVfsTools(
  vfs: VirtualFileSystem,
  emit: (evt: AgentStreamEvent) => void
): AgentTool[] {
  const ok = (r: Json) => JSON.stringify(r);

  // For file-mutating tools, emit the updated snapshot so the client can show
  // the live preview as soon as files are created (not only at the end).
  const mutating = (r: Json) => {
    emit({ type: "vfs", snapshot: vfs.toJSON() });
    return JSON.stringify(r);
  };

  const tools: AgentTool[] = [
    {
      definition: def(
        "create_file",
        "Create a file at the given path with the given content. Overwrites if the file already exists. Use this to scaffold a project (e.g. package.json, src/App.tsx).",
        { path: { type: "string", description: "File path, e.g. src/App.tsx" }, content: { type: "string", description: "Full file content" } },
        ["path", "content"]
      ),
      run: async (a) => mutating(vfs.createFile(str(a.path), str(a.content))),
    },
    {
      definition: def(
        "read_file",
        "Read the full content of a file at the given path. Returns an error if the file does not exist.",
        { path: { type: "string", description: "File path, e.g. src/App.tsx" } },
        ["path"]
      ),
      run: async (a) => ok(vfs.readFile(str(a.path))),
    },
    {
      definition: def(
        "update_file",
        "Replace the content of an existing file at the given path. Returns an error if the file does not exist.",
        { path: { type: "string", description: "File path" }, content: { type: "string", description: "New full file content" } },
        ["path", "content"]
      ),
      run: async (a) => mutating(vfs.updateFile(str(a.path), str(a.content))),
    },
    {
      definition: def(
        "delete_file",
        "Delete a file at the given path. Returns an error if it does not exist.",
        { path: { type: "string", description: "File path" } },
        ["path"]
      ),
      run: async (a) => mutating(vfs.deleteFile(str(a.path))),
    },
    {
      definition: def(
        "file_exists",
        "Check whether a file or directory exists at the given path.",
        { path: { type: "string", description: "File or directory path" } },
        ["path"]
      ),
      run: async (a) => ok(vfs.fileExists(str(a.path))),
    },
    {
      definition: def(
        "list_files",
        "List the files and subdirectories directly inside a directory. Omit the path to list the project root.",
        { path: { type: "string", description: "Directory path (optional), default is the root" } },
        []
      ),
      run: async (a) => ok(vfs.listFiles(str(a.path ?? ""))),
    },
    {
      definition: def(
        "create_directory",
        "Create an (empty) directory at the given path. Parent directories are created as needed.",
        { path: { type: "string", description: "Directory path, e.g. src/components" } },
        ["path"]
      ),
      run: async (a) => mutating(vfs.createDirectory(str(a.path))),
    },
    {
      definition: def(
        "delete_directory",
        "Delete a directory and everything inside it (recursive). Cannot delete the root.",
        { path: { type: "string", description: "Directory path" } },
        ["path"]
      ),
      run: async (a) => mutating(vfs.deleteDirectory(str(a.path))),
    },
    {
      definition: def(
        "search_files",
        "Search for files whose path or name contains the given text. Useful before editing to find which file to change.",
        { query: { type: "string", description: "Search text (case-insensitive)" } },
        ["query"]
      ),
      run: async (a) => ok(vfs.searchFiles(str(a.query))),
    },
    {
      definition: def(
        "get_file_tree",
        "Return the full tree of files and directories in the project. Use this to see the whole project structure at a glance.",
        {},
        []
      ),
      run: async () => ok(vfs.getFileTree()),
    },
    {
      definition: def(
        "clear_project",
        "Delete every file and directory in the project's virtual filesystem, starting fresh.",
        {},
        []
      ),
      run: async () => mutating(vfs.clearProject()),
    },
    {
      definition: def(
        "download_file",
        "Emit a single file from the project as a downloadable file to the user. Call this when the user asks for a specific file, after creating/updating it in the VFS.",
        { path: { type: "string", description: "Path of the file to download" } },
        ["path"]
      ),
      run: async (a) => {
        const res = vfs.readFile(str(a.path));
        if (!res.success) return ok(res);
        const filename = (res.path as string).split("/").pop() ?? "file.txt";
        const dl = fileToDataUrl(res.content as string, filename);
        emit({ type: "download", filename: dl.filename, dataUrl: dl.dataUrl, size: dl.size });
        return ok({ success: true, path: res.path, downloaded: dl.filename });
      },
    },
    {
      definition: def(
        "download_project",
        "Zip the entire project's virtual filesystem and emit it as a single downloadable .zip to the user. Call this when the user asks to download the project or the whole folder.",
        { name: { type: "string", description: "Optional zip filename without extension (default: project)" } },
        []
      ),
      run: async (a) => {
        const base = str(a.name ?? "").trim() || "project";
        const filename = base.endsWith(".zip") ? base : `${base}.zip`;
        const dl = await zipVfs(vfs, filename);
        emit({ type: "download", filename: dl.filename, dataUrl: dl.dataUrl, size: dl.size });
        return ok({ success: true, files: vfs.fileCount, downloaded: dl.filename, sizeBytes: dl.size });
      },
    },
  ];

  return tools;
}
