"use client";
import ProjectPreview from "../components/ProjectPreview";

export default function PreviewTest() {
  const vfs = {
    files: {
      "package.json": JSON.stringify({
        name: "sample",
        scripts: { start: "vite", dev: "vite" },
        dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
      }),
      "index.html":
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      "src/main.tsx":
        "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);",
      "src/App.tsx": "export default function App() { return <h1>Hello</h1>; }",
    },
    dirs: ["src"],
  };
  return (
    <div className="flex h-screen overflow-hidden">
      {/* sidebar */}
      <div className="w-64 bg-zinc-800 text-white p-4 flex-shrink-0">
        Sidebar (should stay visible)
      </div>
      {/* main column (relative) */}
      <div className="flex flex-col flex-1 min-w-0 h-full max-w-full overflow-hidden relative">
        <div className="h-14 bg-zinc-900 text-white flex items-center px-4">Header</div>
        <main className="flex-1 overflow-y-auto p-4 bg-zinc-950 text-white">Messages area</main>
        <div className="px-3 sm:px-4 pb-2">
          <div className="max-w-4xl w-full mx-auto">
            <ProjectPreview vfs={vfs} />
          </div>
        </div>
      </div>
    </div>
  );
}
