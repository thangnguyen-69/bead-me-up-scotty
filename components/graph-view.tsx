"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon, typeIconName } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { useAddDep } from "@/hooks/use-beads";
import { FilterBar } from "@/components/filter-bar";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { matchesFilters, labelOptionsFrom, assigneeOptionsFrom } from "@/lib/filters";
import { catColor, typeColor } from "@/lib/beads-view";
import { buildEpicGraphScope, graphDependencyLayers } from "@/lib/graph-epic";
import { graphNeighborhood } from "@/lib/graph-neighborhood";
import type { Bead } from "@/lib/schema";

type Progress = { closed: number; total: number };

type BeadNodeData = {
  bead: Bead;
  onOpen: (id: string) => void;
  outsideEpic?: boolean;
  milestone?: boolean;
  progress?: Progress | null;
};

type EpicNodeData = {
  bead: Bead;
  onOpen: (id: string) => void;
  progress: Progress;
};

const SpotlightContext = React.createContext<{ selected: string | null; active: Set<string> | null }>({ selected: null, active: null });

/** Milestones are bd's `milestone` type or anything labelled deliverable/milestone. */
function isMilestone(bead: Bead): boolean {
  return (
    bead.issue_type === "milestone" ||
    (bead.labels ?? []).some((label) => label === "deliverable" || label === "milestone")
  );
}

function cleanTitle(bead: Bead): string {
  return bead.title.replace(/\s*\([^)]*\)\s*/, "");
}

function ProgressBar({ progress }: { progress: Progress }) {
  const pct = progress.total ? Math.round((progress.closed / progress.total) * 100) : 0;
  return (
    <div className="flex items-center gap-[6px]" title={`${progress.closed} of ${progress.total} done`}>
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: catColor("closed") }} />
      </div>
      <span className="font-mono text-[10px] text-[var(--text-3)]">
        {progress.closed}/{progress.total}
      </span>
    </div>
  );
}

function BeadNode({ data }: NodeProps) {
  const { bead, onOpen, outsideEpic, milestone, progress } = data as unknown as BeadNodeData;
  const { selectedBeadId, selectBead } = useApp();
  const spotlight = React.useContext(SpotlightContext);
  const selected = selectedBeadId === bead.id;
  return (
    <div
      style={{
        opacity: !spotlight.active || spotlight.active.has(bead.id) ? 1 : 0.2,
        outline: spotlight.active && spotlight.selected === bead.id ? "2.5px solid var(--brand)" : undefined,
        outlineOffset: 3,
        width: milestone ? MILESTONE_WIDTH : CARD_WIDTH,
      }}
      role="button"
      tabIndex={0}
      data-keyboard-bead-id={bead.id}
      data-epic-scope={outsideEpic ? "outside" : "inside"}
      data-milestone={milestone ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onClick={() => {
        selectBead(bead.id);
        onOpen(bead.id);
      }}
      className={`cursor-pointer rounded-[11px] bg-[var(--surface)] p-[9px_11px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        milestone ? "border-2" : "border"
      } ${
        selected
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : milestone
            ? "border-[var(--brand)]"
            : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--text-3)" }} />
      <div className="mb-[5px] flex items-center gap-[6px]">
        {milestone && (
          <span aria-label="Milestone" title="Milestone" className="flex text-[var(--brand)]">
            <Icon name="milestone" size={12} />
          </span>
        )}
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <Icon name={typeIconName(bead.issue_type)} size={12} style={{ color: typeColor(bead.issue_type) }} />
      </div>
      {outsideEpic && (
        <div className="mb-[5px] w-fit rounded-full bg-[var(--surface-3)] px-[6px] py-[2px] text-[9px] font-[650] uppercase tracking-[.04em] text-[var(--text-3)]">
          Outside epic
        </div>
      )}
      <div className="break-words text-[12px] font-[550] leading-[1.3] text-[var(--text)] [overflow-wrap:anywhere] [text-wrap:pretty]">
        {cleanTitle(bead)}
      </div>
      {milestone && progress && progress.total > 0 && (
        <div className="mt-[6px]">
          <ProgressBar progress={progress} />
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: "var(--text-3)" }} />
    </div>
  );
}

/** An epic drawn as a box that contains its children (React Flow sub-flow parent). */
function EpicGroupNode({ data }: NodeProps) {
  const { bead, onOpen, progress } = data as unknown as EpicNodeData;
  const { selectedBeadId, selectBead } = useApp();
  const spotlight = React.useContext(SpotlightContext);
  const selected = selectedBeadId === bead.id;
  return (
    <div
      className={`h-full w-full rounded-[16px] border-2 ${
        selected ? "border-[var(--brand)]" : "border-[var(--border-strong)]"
      }`}
      style={{
        background: "color-mix(in srgb, var(--brand) 5%, transparent)",
        opacity: !spotlight.active || spotlight.active.has(bead.id) ? 1 : 0.35,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ top: 28, background: "var(--text-3)" }} />
      <div
        role="button"
        tabIndex={0}
        data-keyboard-bead-id={bead.id}
        aria-current={selected ? "true" : undefined}
        onFocus={() => selectBead(bead.id)}
        onClick={() => {
          selectBead(bead.id);
          onOpen(bead.id);
        }}
        className="flex cursor-pointer flex-col gap-[5px] rounded-t-[14px] border-b border-border bg-[var(--surface)] px-[14px] py-[9px] hover:bg-[var(--surface-2)] focus-visible:outline-none"
        style={{ height: EPIC_HEADER - 12 }}
      >
        <div className="flex items-center gap-[7px]">
          <Icon name={typeIconName(bead.issue_type)} size={13} style={{ color: typeColor(bead.issue_type) }} />
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
          <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
          <span className="truncate text-[13px] font-[650] text-[var(--text)]">{cleanTitle(bead)}</span>
        </div>
        {progress.total > 0 && (
          <div className="max-w-[260px]">
            <ProgressBar progress={progress} />
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ top: 28, background: "var(--text-3)" }} />
    </div>
  );
}

const nodeTypes = { bead: BeadNode, epic: EpicGroupNode };

const FLOW_BLOCKING = new Set(["blocks", "conditional-blocks", "waits-for"]);

const CARD_WIDTH = 170;
const MILESTONE_WIDTH = 200;
// A new blocking layer gets a wide gap (room for arrows); a crowded layer that
// wraps into extra sub-columns uses a tight one so a wrap doesn't read as a step.
const COL = 290;
const WRAP_COL = 212;
const MAX_ROWS = 8;
// Sibling sub-epic boxes pack into rows up to this width to suit wide screens.
const ROW_WIDTH = 2200;
const ROW_GAP = 14;
const BOX_PAD = 18;
const BOX_GAP = 26;
const EPIC_HEADER = 70;
const MIN_BOX_WIDTH = 340;

function nodeSpan(bead: Bead, outsideEpic = false, milestone = false): number {
  // At 170px wide, 16 characters per line is deliberately conservative. The
  // estimate is uncapped so unusually long titles still reserve enough room.
  const titleLines = Math.max(1, Math.ceil(cleanTitle(bead).length / 16));
  return 68 + titleLines * 18 + (outsideEpic ? 24 : 0) + (milestone ? 20 : 0) + ROW_GAP;
}

function styledEdges(beads: Bead[], boxedEpicIds: Set<string>): Edge[] {
  const present = new Set(beads.map((bead) => bead.id));
  const edgeIds = new Set<string>();
  const edges: Edge[] = [];
  for (const bead of beads) {
    for (const dependency of bead.dependencies ?? []) {
      if (!present.has(dependency.depends_on_id)) continue;
      // Membership in an epic is shown by the box, so no line is needed.
      if (dependency.type === "parent-child" && boxedEpicIds.has(dependency.depends_on_id)) continue;
      const id = `${bead.id}->${dependency.depends_on_id}:${dependency.type}`;
      if (edgeIds.has(id)) continue;
      edgeIds.add(id);
      const blocking = FLOW_BLOCKING.has(dependency.type);
      const related = dependency.type === "related" || dependency.type === "relates-to";
      const subtask = dependency.type === "parent-child";
      edges.push({
        // IDs remain canonical dependent -> prerequisite so the spotlight can
        // compare them directly with graphNeighborhood. Drawn prerequisite ->
        // dependent (a subtask hangs off its parent), so arrows read left to right.
        id,
        source: dependency.depends_on_id,
        target: bead.id,
        animated: blocking,
        markerEnd: blocking ? { type: MarkerType.ArrowClosed, color: "#ef4444", width: 18, height: 18 } : undefined,
        style: {
          stroke: blocking ? "#ef4444" : related ? "var(--brand)" : "var(--text-3)",
          strokeWidth: blocking ? 2 : subtask ? 1.2 : 1.6,
          strokeDasharray: related ? "5 4" : subtask ? "2 4" : undefined,
        },
      });
    }
  }
  return edges;
}

function liveGraphBeads(beads: Bead[], alwaysVisible = new Set<string>()): Bead[] {
  const active = beads.filter((bead) => bead.status !== "closed" || alwaysVisible.has(bead.id));
  const activeIds = new Set(active.map((bead) => bead.id));
  const linked = new Set<string>();
  for (const bead of active) {
    for (const dependency of bead.dependencies ?? []) {
      if (dependency.type === "parent-child" || !activeIds.has(dependency.depends_on_id)) continue;
      linked.add(bead.id);
      linked.add(dependency.depends_on_id);
    }
  }
  return active.filter(
    (bead) =>
      alwaysVisible.has(bead.id) ||
      bead.issue_type === "epic" ||
      linked.has(bead.id) ||
      (bead.dependencies ?? []).some(
        (dependency) =>
          dependency.type === "parent-child" && activeIds.has(dependency.depends_on_id),
      ),
  );
}

type Placement = { bead: Bead; x: number; y: number };

/**
 * Place beads left -> right by blocking order (prerequisite before dependent).
 * A layer taller than MAX_ROWS wraps into extra sub-columns so a big "can
 * start now" layer doesn't become one endless column.
 */
function placeLayers(
  beads: Bead[],
  originX: number,
  originY: number,
  outsideIds: Set<string>,
): { placements: Placement[]; width: number; height: number } {
  if (!beads.length) return { placements: [], width: 0, height: 0 };
  const layers = graphDependencyLayers(beads);
  const byLayer = new Map<number, Bead[]>();
  for (const bead of beads) {
    const layer = layers.get(bead.id) ?? 0;
    const current = byLayer.get(layer);
    if (current) current.push(bead);
    else byLayer.set(layer, [bead]);
  }
  const placements: Placement[] = [];
  let x = originX;
  let height = 0;
  let first = true;
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    if (!first) x += COL - WRAP_COL;
    first = false;
    const layerBeads = byLayer.get(layer)!;
    // Milestones first, then priority, so the important cards lead each layer.
    layerBeads.sort(
      (a, b) =>
        Number(isMilestone(b)) - Number(isMilestone(a)) ||
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    );
    for (let start = 0; start < layerBeads.length; start += MAX_ROWS) {
      let y = originY;
      for (const bead of layerBeads.slice(start, start + MAX_ROWS)) {
        placements.push({ bead, x, y });
        y += nodeSpan(bead, outsideIds.has(bead.id), isMilestone(bead));
      }
      height = Math.max(height, y - originY);
      x += WRAP_COL;
    }
  }
  return { placements, width: x - originX - (WRAP_COL - MILESTONE_WIDTH), height };
}

/** Parent-child children per parent id over ALL beads (for progress + ancestry). */
function hierarchy(beads: Bead[]) {
  const parentOf = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const bead of beads) {
    const dependency = (bead.dependencies ?? []).find((d) => d.type === "parent-child");
    if (!dependency) continue;
    parentOf.set(bead.id, dependency.depends_on_id);
    const current = children.get(dependency.depends_on_id);
    if (current) current.push(bead.id);
    else children.set(dependency.depends_on_id, [bead.id]);
  }
  return { parentOf, children };
}

/** Closed / total over every non-epic descendant, filters ignored. */
function descendantProgress(
  id: string,
  children: Map<string, string[]>,
  byId: Map<string, Bead>,
): Progress {
  let closed = 0;
  let total = 0;
  const seen = new Set<string>([id]);
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const bead = byId.get(next);
    if (bead && bead.issue_type !== "epic") {
      total += 1;
      if (bead.status === "closed") closed += 1;
    }
    stack.push(...(children.get(next) ?? []));
  }
  return { closed, total };
}

/**
 * Epics become boxes holding their children; everything else is laid out
 * by blocking order inside its nearest visible epic. `rootId` (epic scope)
 * forces that epic to be the single top-level box; `outsideIds` beads stay
 * unboxed to its right.
 */
function groupedLayout(
  visible: Bead[],
  all: Bead[],
  onOpen: (id: string) => void,
  outsideIds: Set<string> = new Set(),
  rootId?: string,
): { nodes: Node[]; edges: Edge[] } {
  const allById = new Map(all.map((bead) => [bead.id, bead]));
  const { parentOf, children } = hierarchy(all);
  const visibleIds = new Set(visible.map((bead) => bead.id));
  const boxIds = new Set(
    visible.filter((bead) => bead.issue_type === "epic" && !outsideIds.has(bead.id)).map((bead) => bead.id),
  );
  if (rootId && visibleIds.has(rootId)) boxIds.add(rootId);

  // Nearest visible epic ancestor, walking through hidden or non-epic parents
  // so a child whose direct parent is filtered out stays inside its epic.
  const containerOf = new Map<string, string | null>();
  for (const bead of visible) {
    if (outsideIds.has(bead.id) || bead.id === rootId) {
      containerOf.set(bead.id, null);
      continue;
    }
    let cursor = parentOf.get(bead.id);
    const seen = new Set<string>([bead.id]);
    let container: string | null = null;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      if (boxIds.has(cursor)) {
        container = cursor;
        break;
      }
      cursor = parentOf.get(cursor);
    }
    containerOf.set(bead.id, container);
  }

  // A parent-child cycle between epics would leave both boxes nested in each
  // other and neither emitted; lift any box on such a cycle to the top level.
  for (const id of boxIds) {
    const seen = new Set<string>();
    let cursor = containerOf.get(id) ?? null;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      cursor = containerOf.get(cursor) ?? null;
    }
    if (cursor) containerOf.set(id, null);
  }

  const members = new Map<string | null, Bead[]>();
  for (const bead of visible) {
    const key = containerOf.get(bead.id) ?? null;
    const current = members.get(key);
    if (current) current.push(bead);
    else members.set(key, [bead]);
  }

  type Measured = { width: number; height: number; items: Placement[]; boxes: Array<{ id: string; x: number; y: number }> };
  const measured = new Map<string, Measured>();
  const measuring = new Set<string>();
  const measure = (id: string): Measured => {
    const done = measured.get(id);
    if (done) return done;
    measuring.add(id);
    const inside = members.get(id) ?? [];
    const items = inside.filter((bead) => !boxIds.has(bead.id));
    const subEpics = inside
      .filter((bead) => boxIds.has(bead.id) && !measuring.has(bead.id))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const layered = placeLayers(items, BOX_PAD, EPIC_HEADER, outsideIds);
    let y = EPIC_HEADER + layered.height + (items.length && subEpics.length ? BOX_GAP / 2 : 0);
    let width = Math.max(MIN_BOX_WIDTH, layered.width + BOX_PAD * 2);
    const boxes: Measured["boxes"] = [];
    let rowX = BOX_PAD;
    let rowHeight = 0;
    for (const sub of subEpics) {
      const size = measure(sub.id);
      if (rowX > BOX_PAD && rowX + size.width > ROW_WIDTH) {
        y += rowHeight + BOX_GAP;
        rowX = BOX_PAD;
        rowHeight = 0;
      }
      boxes.push({ id: sub.id, x: rowX, y });
      rowX += size.width + BOX_GAP;
      rowHeight = Math.max(rowHeight, size.height);
      width = Math.max(width, rowX - BOX_GAP + BOX_PAD);
    }
    if (subEpics.length) y += rowHeight;
    const result = { width, height: Math.max(y, EPIC_HEADER) + BOX_PAD, items: layered.placements, boxes };
    measuring.delete(id);
    measured.set(id, result);
    return result;
  };

  const nodes: Node[] = [];
  const beadNode = (bead: Bead, x: number, y: number, parentId?: string): Node => {
    const milestone = isMilestone(bead);
    return {
      id: bead.id,
      type: "bead",
      position: { x, y },
      ...(parentId ? { parentId } : {}),
      data: {
        bead,
        onOpen,
        outsideEpic: outsideIds.has(bead.id),
        milestone,
        progress: milestone ? descendantProgress(bead.id, children, allById) : null,
      },
    };
  };
  // Parents must precede their children in the array (React Flow sub-flows).
  const emitBox = (id: string, x: number, y: number, parentId?: string) => {
    const size = measure(id);
    nodes.push({
      id,
      type: "epic",
      position: { x, y },
      ...(parentId ? { parentId } : {}),
      style: { width: size.width, height: size.height },
      data: { bead: allById.get(id)!, onOpen, progress: descendantProgress(id, children, allById) },
    });
    for (const item of size.items) nodes.push(beadNode(item.bead, item.x, item.y, id));
    for (const box of size.boxes) emitBox(box.id, box.x, box.y, id);
  };

  const topLevel = members.get(null) ?? [];
  const topBoxes = topLevel
    .filter((bead) => boxIds.has(bead.id))
    .sort((a, b) => Number(b.id === rootId) - Number(a.id === rootId) || a.priority - b.priority || a.id.localeCompare(b.id));
  // Top-level boxes pack into rows like sub-epics, so many small epics don't
  // become one endless column that fitView shrinks to nothing.
  let y = 0;
  let rowX = 0;
  let rowHeight = 0;
  let widest = 0;
  for (const box of topBoxes) {
    const size = measure(box.id);
    if (rowX > 0 && rowX + size.width > ROW_WIDTH) {
      y += rowHeight + BOX_GAP * 2;
      rowX = 0;
      rowHeight = 0;
    }
    emitBox(box.id, rowX, y);
    rowX += size.width + BOX_GAP * 2;
    rowHeight = Math.max(rowHeight, size.height);
    widest = Math.max(widest, rowX - BOX_GAP * 2);
  }
  if (topBoxes.length) y += rowHeight + BOX_GAP * 2;

  const outside = topLevel.filter((bead) => outsideIds.has(bead.id) && !boxIds.has(bead.id));
  const loose = topLevel.filter((bead) => !outsideIds.has(bead.id) && !boxIds.has(bead.id));
  // Epic scope: outside neighbours sit to the right of the epic's box.
  for (const item of placeLayers(outside, topBoxes.length ? widest + 80 : 0, 0, outsideIds).placements) {
    nodes.push(beadNode(item.bead, item.x, item.y));
  }
  // Whole graph: work with no epic goes below the boxes, still in blocking order.
  for (const item of placeLayers(loose, 0, y, outsideIds).placements) {
    nodes.push(beadNode(item.bead, item.x, item.y));
  }

  return { nodes, edges: styledEdges(visible, boxIds) };
}

export function GraphView() {
  const { beads, humanAllowlist, openDetail, readOnly } = useApp();
  // Same URL-backed facet filters as the Board and List views.
  const { filters, setFilters, showArchived, setShowArchived, clearFilters } =
    useUrlFilters();
  const labelOptions = React.useMemo(() => labelOptionsFrom(beads), [beads]);
  const assigneeOptions = React.useMemo(() => assigneeOptionsFrom(beads), [beads]);
  const [epicId, setEpicId] = React.useState("");
  const [liveOnly, setLiveOnly] = React.useState(false);
  const [spotlight, setSpotlight] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const activateNode = React.useCallback((id: string) => {
    if (spotlight) setFocusId(id);
    else openDetail(id);
  }, [spotlight, openDetail]);
  const addDep = useAddDep();
  // Recenter/fit the graph on the current nodes (bead mpe).
  const rf = React.useRef<ReactFlowInstance | null>(null);
  const center = React.useCallback(() => rf.current?.fitView({ padding: 0.2, minZoom: 0.02, duration: 400 }), []);

  const epics = React.useMemo(
    () =>
      beads
        .filter(
          (bead) =>
            bead.issue_type === "epic" && !(bead.labels ?? []).includes("archived"),
        )
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    [beads],
  );
  const effectiveEpicId = epics.some((epic) => epic.id === epicId) ? epicId : "";

  // Archived beads stay hidden unless the archived toggle is on; closed and
  // unlinked work remains visible by default. Epic scope adds only direct
  // outside neighbors. Facet filters apply after scoping so a filtered-out
  // intermediate bead doesn't cut its descendants out of the epic scope.
  const { nodes, edges, considered } = React.useMemo(() => {
    const matches = (bead: Bead) => matchesFilters(bead, filters, humanAllowlist);
    const nonArchived = showArchived
      ? beads
      : beads.filter((bead) => !(bead.labels ?? []).includes("archived"));
    if (effectiveEpicId) {
      const scope = buildEpicGraphScope(nonArchived, effectiveEpicId);
      const filtered = scope.beads.filter(
        (bead) => bead.id === effectiveEpicId || matches(bead),
      );
      const visible = liveOnly
        ? liveGraphBeads(filtered, new Set([effectiveEpicId]))
        : filtered;
      return {
        ...groupedLayout(visible, beads, activateNode, scope.outsideIds, effectiveEpicId),
        considered: scope.beads.length,
      };
    }
    const filtered = nonArchived.filter(matches);
    const visible = liveOnly ? liveGraphBeads(filtered) : filtered;
    return { ...groupedLayout(visible, beads, activateNode), considered: nonArchived.length };
  }, [beads, activateNode, effectiveEpicId, liveOnly, filters, showArchived, humanAllowlist]);
  // Re-fit the canvas whenever the filtered set changes.
  const filterKey = React.useMemo(() => JSON.stringify([filters, showArchived]), [filters, showArchived]);
  const hidden = Math.max(0, considered - nodes.length);
  const focus = React.useMemo(() => {
    if (!spotlight || !focusId || !nodes.some(n => n.id === focusId)) return null;
    return graphNeighborhood(beads, new Set(nodes.map(n => n.id)), focusId);
  }, [beads, nodes, spotlight, focusId]);
  // Keep React Flow node objects stable while highlighting. Replacing raw
  // nodes discards their measured dimensions and briefly hides click targets.
  const spotlightContext = React.useMemo(() => ({ selected: focusId, active: focus?.all ?? null }), [focusId, focus]);
  const shownEdges = React.useMemo(() => focus ? edges.map(e => {
    const lit = focus.edgeIds.has(e.id) && focus.all.has(e.source) && focus.all.has(e.target);
    return { ...e, style: { ...e.style, opacity: lit ? 1 : 0.12 }, animated: lit && e.animated };
  }) : edges, [edges, focus]);


  const onConnect = React.useCallback(
    (c: Connection) => {
      if (readOnly) return;
      if (c.source && c.target && c.source !== c.target) {
        // Edges read prerequisite -> dependent, so the target receives a
        // dependency on the source.
        addDep.mutate({ id: c.target, dependsOnId: c.source, type: "blocks" });
      }
    },
    [addDep, readOnly],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="basis-full">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Dependency graph</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            {spotlight
              ? "Left → right: prerequisite → dependent · select to spotlight active blocking chains; double-click for details"
              : readOnly
                ? "Left → right: prerequisite → dependent · select a bead to view its details"
                : "Left → right: prerequisite → dependent · drag a prerequisite onto its dependent"}
            {" · "}{nodes.length} beads shown
            {hidden > 0 && (
              <>
                {" · "}
                <span title="Clear the filters or turn off Live dependencies only to include hidden beads.">
                  {hidden} hidden by filter
                </span>
              </>
            )}
          </span>
        </div>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          labelOptions={labelOptions}
          assigneeOptions={assigneeOptions}
          showArchived={showArchived}
          onShowArchived={setShowArchived}
          onClearAllAction={clearFilters}
        />
        <select
          aria-label="Graph scope"
          value={effectiveEpicId}
          onChange={(event) => {
            setEpicId(event.target.value);
            setFocusId(null);
          }}
          title="Scope the graph to an epic and its descendants"
          className="h-9 max-w-[280px] flex-shrink-0 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[12.5px] font-[550] text-[var(--text-2)] outline-none hover:bg-[var(--surface-3)]"
        >
          <option value="">All beads</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.id} · {epic.title}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
          <input type="checkbox" checked={spotlight} className="accent-[var(--brand)]"
            onChange={e => { setSpotlight(e.target.checked); setFocusId(null); }} />
          Spotlight dependencies
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => { setLiveOnly(e.target.checked); setFocusId(null); }}
            className="accent-[var(--brand)]"
          />
          Live dependencies only
        </label>
        <button
          onClick={center}
          title="Center the graph on all issues"
          className="flex h-9 flex-shrink-0 items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[12px] text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
        >
          <Icon name="target" size={15} />
          <span>Center</span>
        </button>
        {spotlight && (
          <div className="flex h-9 basis-full items-center">
            {focus && focusId ? (
              <button onClick={() => setFocusId(null)} title="Clear the dependency spotlight"
                className="flex h-9 items-center gap-2 rounded-[9px] bg-[var(--brand-weak)] px-3 text-[12px] text-[var(--brand)]">
                <span className="font-mono">{focusId}</span>
                <span>{focus.up} upstream · {focus.down} downstream</span>
                <Icon name="x" size={13} />
              </button>
            ) : <span className="text-[12px] text-[var(--text-3)]">Choose a bead to highlight its blocking chains.</span>}
          </div>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <SpotlightContext.Provider value={spotlightContext}>
        <ReactFlow
          key={`${effectiveEpicId || "all"}:${liveOnly ? "live" : "complete"}:${filterKey}`}
          nodes={nodes}
          edges={shownEdges}
          zoomOnDoubleClick={!spotlight}
          onPaneClick={() => setFocusId(null)}
          onNodeDoubleClick={(_, node) => { if (spotlight) openDetail(node.id); }}
          nodeTypes={nodeTypes}
          nodesConnectable={!readOnly}
          onConnect={onConnect}
          onInit={(inst) => {
            rf.current = inst;
          }}
          minZoom={0.02}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.02 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} color="var(--border)" />
          <Controls fitViewOptions={{ padding: 0.2, minZoom: 0.02 }} />
        </ReactFlow>
        </SpotlightContext.Provider>
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-[360px] rounded-[12px] border border-border bg-[var(--surface)] p-[16px_18px] text-center shadow-[var(--shadow)]">
              <div className="text-[13px] font-[650] text-[var(--text)]">
                {liveOnly && considered > 0 ? "No live dependencies" : "No beads to show"}
              </div>
              <p className="m-0 mt-[6px] text-[12px] leading-[1.5] text-[var(--text-2)]">
                {considered === 0
                  ? "There are no non-archived beads in this project."
                  : "The current filter hides all beads. Show all beads to inspect completed work or create new dependencies."}
              </p>
              {liveOnly && considered > 0 && (
                <button
                  onClick={() => setLiveOnly(false)}
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                >
                  Show all beads
                </button>
              )}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-[18px] left-1/2 flex -translate-x-1/2 gap-[18px] rounded-[11px] border border-border bg-[var(--surface)] p-[9px_16px] text-[11.5px] text-[var(--text-2)] shadow-[var(--shadow)]">
          <span className="flex items-center gap-[6px]">
            <span className="flex items-center">
              <span className="h-[2px] w-[14px] bg-[#ef4444]" />
              <span className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-[#ef4444]" />
            </span>
            must finish first
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[12px] w-[18px] rounded-[4px] border-2 border-[var(--border-strong)]" />
            epic
          </span>
          <span className="flex items-center gap-[6px]">
            <Icon name="milestone" size={13} className="text-[var(--brand)]" />
            milestone
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-0 w-[18px] border-t-2 border-dotted border-[var(--text-3)]" />
            subtask
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-0 w-[18px] border-t-2 border-dashed border-[var(--brand)]" />
            related
          </span>
        </div>
      </div>
    </div>
  );
}
