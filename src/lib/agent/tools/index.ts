// Tool registry for the agent. To add a new capability later: create a tool
// file in this directory and add it to one of the arrays below — that's it.

import type { AgentTool } from "../types";
import { webSearchTool } from "./webSearch";
import { readUrlTool } from "./readUrl";

// Web tools gated by the "Web Search" setting (search the web, read URLs).
export const AGENT_TOOLS: AgentTool[] = [webSearchTool, readUrlTool];

// Read-only tools always available in a conversation.
export const READ_TOOLS: AgentTool[] = [readUrlTool];
