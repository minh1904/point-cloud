"use client";

import { Button, Panel, type PanelProps } from "@atelier/ui";

import { PARAM_GROUPS, paramsInGroup, type GroupId } from "@/params/schema";
import { useParamsStore } from "@/store/params-store";
import { useUiStore } from "@/store/ui-store";

import { CloudPanel } from "../cloud-panel";
import { DepthPanel } from "../depth-panel";
import { DetailPanel } from "../detail-panel";
import { PhotoPanel } from "../photo-panel";

import { ParamControl } from "./param-control";

/** Panel titles, in the order they appear. Also the collapse-all target. */
export const PANEL_ORDER: readonly string[] = [
  "Photo",
  "Depth",
  "Detail",
  "Cloud",
  ...PARAM_GROUPS.map((group) => group.label),
];

/** Collapse state for one panel, wired to the UI store. */
function usePanel(title: string): Omit<PanelProps, "children"> {
  const collapsed = useUiStore((state) => state.collapsed[title] ?? false);
  const setCollapsed = useUiStore((state) => state.setCollapsed);

  return {
    title,
    collapsible: true,
    collapsed,
    onCollapsedChange: (next) => setCollapsed(title, next),
    className: "w-full shrink-0",
  };
}

/**
 * A whole panel, rendered from the schema (P7.2).
 *
 * There is no per-group component any more — no "Motion panel" file listing
 * five sliders. Adding a knob to the Motion group makes it appear here, in
 * declaration order, with its label, range, step and number format already
 * right, because all of those came from the same entry the shader reads.
 */
function GroupPanel({ group, label }: { group: GroupId; label: string }) {
  const panel = usePanel(label);
  const resetGroup = useParamsStore((state) => state.resetGroup);

  return (
    <Panel {...panel}>
      {paramsInGroup(group).map((param) => (
        <ParamControl key={param.key} param={param} />
      ))}
      <Button
        variant="ghost-muted"
        size="sm"
        className="mt-1"
        onClick={() => resetGroup(group)}
      >
        Reset
      </Button>
    </Panel>
  );
}

/**
 * The inspector column (P7.1).
 *
 * It scrolls; its header does not. That matters more than it sounds: before
 * P7.1 the collapse controls were pinned inside the scrolling area with a
 * transparent background, and panels slid visibly underneath them.
 */
export function Inspector() {
  const photoPanel = usePanel("Photo");
  const depthPanel = usePanel("Depth");
  const detailPanel = usePanel("Detail");
  const cloudPanel = usePanel("Cloud");

  const collapsed = useUiStore((state) => state.collapsed);
  const setAllCollapsed = useUiStore((state) => state.setAllCollapsed);
  const closeInspector = useUiStore((state) => state.setInspectorOpen);

  const allCollapsed = PANEL_ORDER.every((panel) => collapsed[panel]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/10 px-2 py-1.5">
        <h2 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          Inspector
        </h2>
        <div className="flex gap-1">
          <Button
            variant="ghost-muted"
            size="xs"
            onClick={() => setAllCollapsed(PANEL_ORDER, !allCollapsed)}
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </Button>
          <Button variant="ghost-muted" size="xs" onClick={() => closeInspector(false)}>
            Hide
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
        <PhotoPanel panel={photoPanel} />
        <DepthPanel panel={depthPanel} />
        <DetailPanel panel={detailPanel} />
        <CloudPanel panel={cloudPanel} />
        {PARAM_GROUPS.map((group) => (
          <GroupPanel key={group.id} group={group.id} label={group.label} />
        ))}
      </div>
    </div>
  );
}
