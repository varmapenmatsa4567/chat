"use client";
import DiagramCard from "../components/diagrams/DiagramCard";

const diagram = {
  type: "diagram" as const,
  diagramType: "flowchart" as const,
  title: "User Login Flow",
  description: "Authentication flow from login to dashboard.",
  code: "flowchart TD\n    A([User]) --> B[Login Page]\n    B --> C[Auth API]\n    C --> D{Valid?}\n    D -->|Yes| E[Dashboard]\n    D -->|No| F[Error]",
};

export default function DiagramTest() {
  return (
    <div className="p-6 max-w-3xl">
      <DiagramCard diagram={diagram} id="mermaid-test-0" />
    </div>
  );
}
