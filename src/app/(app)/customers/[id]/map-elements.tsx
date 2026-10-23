"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { DeviceIcon } from "@/components/device-icon";
import { attentionReasons, type DeviceAlerts } from "@/lib/devices/records";
import { isTunnel, type DeviceType } from "@/lib/map/input";
import { useToday } from "./device-records";

// How devices and connections are drawn on the map.

export type DeviceNode = Node<
  { name: string; type: DeviceType; address: string; alerts: DeviceAlerts },
  "device"
>;
export type ConnectionEdge = Edge<{ label: string }, "connection">;

// The handles only start a connection: where an edge is drawn is worked out
// from the two devices (see ConnectionEdgeView), so they are not stored.
const HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

export function DeviceNodeView({ data, selected }: NodeProps<DeviceNode>) {
  const reasons = attentionReasons(data.alerts, useToday());
  const tile = selected
    ? "border-2 border-accent bg-accent-soft ring-4 ring-accent/20"
    : reasons.length > 0
      ? "border border-warn-line bg-warn-soft"
      : "border border-neutral-300 bg-white";
  return (
    <div className="group relative flex w-32 flex-col items-center gap-1.5 text-center">
      <span
        className={`relative flex size-14 items-center justify-center rounded-xl shadow-sm ${tile}`}
      >
        <DeviceIcon
          type={data.type}
          className={`size-8 ${reasons.length > 0 && !selected ? "text-warn-ink" : "text-accent-ink"}`}
        />
        {/* Open incidents or overdue tasks, seen without opening the sheet. */}
        {reasons.length > 0 && (
          <span
            role="img"
            aria-label={`Requiere atención: ${reasons.join(", ")}`}
            title={`Requiere atención: ${reasons.join(", ")}`}
            className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-warn ring-2 ring-white"
          />
        )}
      </span>
      <span className="max-w-full rounded bg-[#fbfbfc] px-1 text-[13px] leading-tight font-semibold break-words text-neutral-900">
        {data.name}
      </span>
      {data.address && (
        <span className="max-w-full truncate rounded bg-[#fbfbfc] px-1 font-mono text-[11px] leading-tight text-neutral-600">
          {data.address}
        </span>
      )}
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className={
            "size-3! border-2! border-white! bg-accent! transition-opacity " +
            (selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        />
      ))}
    </div>
  );
}

// About half the icon tile: a device's box is wider than its icon because of
// the name, and an edge should reach the icon.
const EDGE_HALF_WIDTH = 36;

// Where the line from the centre of `node` towards the centre of `other`
// crosses the border of `node`, so edges meet devices from any side. Sideways
// the border is the icon's, not the name's; the name hides the rest of the line.
function borderPoint(node: InternalNode, other: InternalNode): { x: number; y: number } {
  const boxHalfWidth = (node.measured.width ?? 0) / 2;
  const halfWidth = Math.min(boxHalfWidth, EDGE_HALF_WIDTH);
  const halfHeight = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + boxHalfWidth;
  const cy = node.internals.positionAbsolute.y + halfHeight;
  const dx = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2 - cx;
  const dy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2 - cy;
  if ((dx === 0 && dy === 0) || halfWidth === 0 || halfHeight === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function ConnectionEdgeView({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<ConnectionEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const from = borderPoint(sourceNode, targetNode);
  const to = borderPoint(targetNode, sourceNode);
  const [path, labelX, labelY] = getStraightPath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: to.x,
    targetY: to.y,
  });
  const label = data?.label ?? "";
  const tunnel = isTunnel(label);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? "#14171f" : tunnel ? "#2457d6" : "#9aa3b0",
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: tunnel ? "6 4" : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={
              "nodrag nopan pointer-events-none absolute max-w-40 truncate rounded-md border " +
              "px-1.5 py-0.5 text-[11px] " +
              (tunnel
                ? "border-accent-soft bg-accent-soft font-medium text-accent-ink"
                : "border-neutral-200 bg-white text-neutral-700") +
              (selected ? " border-neutral-900!" : "")
            }
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
