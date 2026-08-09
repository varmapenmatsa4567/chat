// Slash-command registry for the chat input.
//
// Each command auto-completes in the input when the user types "/". Add future
// commands here (e.g. "/download", "/clear") — they'll show up in the
// auto-complete automatically. The client maps a command string to its action.

export type SlashCommand = {
  command: string; // e.g. "/preview"
  description: string; // shown in the auto-complete dropdown
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/preview",
    description: "Show the live preview of the current project",
  },
  // Future commands go here.
];

// The part of the input that comes after "/" (used to filter the dropdown).
export function commandQueryFromInput(value: string): string {
  if (!value.startsWith("/")) return "";
  const after = value.slice(1);
  // Only while there's no space yet (still typing the command name).
  if (after.includes(" ")) return "";
  return after;
}
