// Tool registry for the agent. To add a new capability later: create a tool
// file in this directory and add it to this array — that's it.

import type { AgentTool } from "../types";
import { webSearchTool } from "./webSearch";

export const AGENT_TOOLS: AgentTool[] = [webSearchTool];
