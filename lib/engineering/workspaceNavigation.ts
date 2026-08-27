import type { WorkspaceVersion } from "./types";

export const WORKSPACE_ROUTES: ReadonlyArray<{
  id: WorkspaceVersion;
  label: string;
  href: string;
}> = [
  { id: "v1", label: "Engineer", href: "/engineer" },
  { id: "v2", label: "Optimize", href: "/optimize" },
];

export function workspaceFromPathname(pathname: string): WorkspaceVersion | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/engineer" || normalized === "/enginner") return "v1";
  if (normalized === "/optimize") return "v2";
  return null;
}

export interface WorkspaceNavigationGesture {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Preserve normal new-tab/new-window behavior for modified link clicks. */
export function isPlainWorkspaceNavigation(event: WorkspaceNavigationGesture): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
