"use client";
import ProjectPreview from "../../components/ProjectPreview";

export default function PreviewTest() {
  const vfs = {
    files: {
      "package.json": JSON.stringify({
        name: "sample",
        dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
      }),
      "index.html":
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      "src/main.tsx":
        "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);",
      "src/App.tsx":
        "export default function App() { return <h1>Hello from live preview</h1>; }",
    },
    dirs: ["src"],
  };
  return (
    <div className="p-6 max-w-3xl">
      <ProjectPreview vfs={vfs} />
    </div>
  );
}
