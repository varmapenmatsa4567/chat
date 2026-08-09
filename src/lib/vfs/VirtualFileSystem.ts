// Virtual File System — an in-memory, path-based store of file contents.
//
// Each conversation gets its own isolated VirtualFileSystem instance. The
// underlying storage is a simple Map<string, string> (normalized path → content)
// plus a Set of known directories. The public API is stable so the storage can
// later be swapped for persistent backing without touching callers.
//
// Paths are normalized (collapsed "/", resolved ".", blocked ".." escaping) and
// stored WITHOUT a leading slash, e.g. "src/components/Header.tsx".

type VfsResult = Record<string, unknown>;

function normalizePath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

function parentDir(normPath: string): string {
  const i = normPath.lastIndexOf("/");
  return i === -1 ? "" : normPath.slice(0, i);
}

export type VfsNode = {
  name: string;
  type: "file" | "dir";
  children?: VfsNode[];
};

export class VirtualFileSystem {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  // ---- Files -------------------------------------------------------------

  createFile(path: string, content: string): VfsResult {
    const norm = normalizePath(path);
    if (!norm) return { success: false, error: "Invalid path" };
    this.ensureParents(norm);
    this.files.set(norm, content);
    return { success: true, path: norm };
  }

  readFile(path: string): VfsResult {
    const norm = normalizePath(path);
    if (!norm) return { success: false, error: "Invalid path" };
    if (!this.files.has(norm)) {
      return { success: false, error: "File does not exist", path: norm };
    }
    return { success: true, path: norm, content: this.files.get(norm) };
  }

  updateFile(path: string, content: string): VfsResult {
    const norm = normalizePath(path);
    if (!norm) return { success: false, error: "Invalid path" };
    if (!this.files.has(norm)) {
      return { success: false, error: "File does not exist", path: norm };
    }
    this.files.set(norm, content);
    return { success: true, path: norm };
  }

  deleteFile(path: string): VfsResult {
    const norm = normalizePath(path);
    if (!this.files.has(norm)) {
      return { success: false, error: "File does not exist", path: norm };
    }
    this.files.delete(norm);
    return { success: true, path: norm };
  }

  fileExists(path: string): VfsResult {
    const norm = normalizePath(path);
    const isFile = this.files.has(norm);
    const isDir = this.dirs.has(norm);
    return {
      success: true,
      path: norm,
      exists: isFile || isDir,
      type: isFile ? "file" : isDir ? "dir" : null,
    };
  }

  // ---- Directories -------------------------------------------------------

  createDirectory(path: string): VfsResult {
    const norm = normalizePath(path);
    if (!norm) return { success: false, error: "Invalid path" };
    this.ensureParents(norm);
    this.dirs.add(norm);
    return { success: true, path: norm };
  }

  deleteDirectory(path: string): VfsResult {
    const norm = normalizePath(path);
    if (!norm) return { success: false, error: "Cannot delete the root directory" };
    const prefix = norm + "/";
    let removed = 0;
    for (const f of [...this.files.keys()]) {
      if (f === norm || f.startsWith(prefix)) {
        this.files.delete(f);
        removed++;
      }
    }
    for (const d of [...this.dirs]) {
      if (d === norm || d.startsWith(prefix)) {
        this.dirs.delete(d);
      }
    }
    return { success: true, path: norm, removed };
  }

  // ---- Listing / searching ----------------------------------------------

  listFiles(dir = ""): VfsResult {
    const norm = normalizePath(dir);
    const prefix = norm ? norm + "/" : "";
    const filesInDir: { path: string; name: string }[] = [];
    for (const f of this.files.keys()) {
      if (!prefix || f.startsWith(prefix)) {
        const rest = prefix ? f.slice(prefix.length) : f;
        if (rest && !rest.includes("/")) {
          filesInDir.push({ path: f, name: rest });
        }
      }
    }
    const dirsInDir: { path: string; name: string }[] = [];
    for (const d of this.dirs) {
      if (d === norm) continue;
      if (!prefix || d.startsWith(prefix)) {
        const rest = prefix ? d.slice(prefix.length) : d;
        if (rest && !rest.includes("/")) {
          dirsInDir.push({ path: d, name: rest });
        }
      }
    }
    return {
      success: true,
      directory: norm,
      files: filesInDir.sort((a, b) => a.name.localeCompare(b.name)),
      directories: dirsInDir.sort((a, b) => a.name.localeCompare(b.name)),
      totalFiles: this.files.size,
    };
  }

  searchFiles(query: string): VfsResult {
    const q = query.trim().toLowerCase();
    const matches = [...this.files.keys()]
      .filter((p) => {
        const base = p.split("/").pop() ?? "";
        return !q || p.toLowerCase().includes(q) || base.toLowerCase().includes(q);
      })
      .sort();
    return { success: true, query: query, matches, count: matches.length };
  }

  getFileTree(): VfsResult {
    const root: VfsNode = { name: "project", type: "dir", children: [] };
    const dirNodes = new Map<string, VfsNode>();
    dirNodes.set("", root);

    const ensureDir = (path: string): VfsNode => {
      let node = dirNodes.get(path);
      if (node) return node;
      const parent = parentDir(path);
      const parentNode = ensureDir(parent);
      node = { name: path.split("/").pop() ?? path, type: "dir", children: [] };
      parentNode.children!.push(node);
      dirNodes.set(path, node);
      return node;
    };

    for (const d of [...this.dirs].sort()) {
      ensureDir(d);
    }
    // Ensure every file's directory chain exists even if not explicitly created.
    for (const f of this.files.keys()) {
      const p = parentDir(f);
      if (p) ensureDir(p);
    }

    for (const [path, content] of [...this.files.entries()].sort()) {
      const parent = parentDir(path);
      const parentNode = dirNodes.get(parent) ?? ensureDir(parent);
      parentNode.children!.push({
        name: path.split("/").pop() ?? path,
        type: "file",
      });
    }

    return { success: true, root };
  }

  clearProject(): VfsResult {
    const count = this.files.size;
    this.files.clear();
    this.dirs.clear();
    return { success: true, clearedFiles: count };
  }

  // ---- Internals ---------------------------------------------------------

  private ensureParents(path: string) {
    let p = parentDir(path);
    while (p !== "") {
      this.dirs.add(p);
      p = parentDir(p);
    }
  }

  get fileCount(): number {
    return this.files.size;
  }

  // ---- Serialization -----------------------------------------------------

  toJSON() {
    return { files: Object.fromEntries(this.files), dirs: [...this.dirs] };
  }

  static fromJSON(data: { files?: Record<string, string>; dirs?: string[] }): VirtualFileSystem {
    const vfs = new VirtualFileSystem();
    for (const [path, content] of Object.entries(data.files ?? {})) {
      const norm = normalizePath(path);
      if (norm) {
        vfs.ensureParents(norm);
        vfs.files.set(norm, content);
      }
    }
    for (const d of data.dirs ?? []) {
      const norm = normalizePath(d);
      if (norm) vfs.dirs.add(norm);
    }
    return vfs;
  }

  /** All file paths (sorted), used by the zip helper. */
  allFilePaths(): string[] {
    return [...this.files.keys()].sort();
  }

  getContent(path: string): string | undefined {
    return this.files.get(normalizePath(path));
  }
}
