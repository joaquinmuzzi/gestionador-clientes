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
import type { DeviceType } from "@/lib/map/input";
import { useToday } from "./device-records";

// How devices and connections are drawn on the map.

export type DeviceNode = Node<{ name: string; type: DeviceType; alerts: DeviceAlerts }, "device">;
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
  return (
    <div
      className={
        "group relative flex w-28 flex-col items-center gap-1 rounded-lg border bg-white px-2 py-2 " +
        "text-center shadow-sm " +
        (selected ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-300")
      }
    >
      {/* Open incidents or overdue tasks, seen without opening the sheet. */}
      {reasons.length > 0 && (
        <span
          role="img"
          aria-label={`Requiere atención: ${reasons.join(", ")}`}
          title={`Requiere atención: ${reasons.join(", ")}`}
          className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-red-600 ring-2 ring-white"
        />
      )}
      <DeviceIcon type={data.type} className="size-9 text-neutral-800" />
      <span className="w-full text-xs leading-tight font-medium break-words text-neutral-900">
        {data.name}
      </span>
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className={
            "size-3! border-2! border-white! bg-neutral-500! transition-opacity " +
            (selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        />
      ))}
    </div>
  );
}

// Where the line from the centre of `node` towards the centre of `other`
// crosses the border of `node`, so edges meet devices from any side.
function borderPoint(node: InternalNode, other: InternalNode): { x: number; y: number } {
  const halfWidth = (node.measured.width ?? 0) / 2;
  const halfHeight = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + halfWidth;
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: selected ? "#171717" : "#737373", strokeWidth: selected ? 2.5 : 1.5 }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={
              "nodrag nopan pointer-events-none absolute max-w-40 truncate rounded border " +
              "bg-white px-1.5 py-0.5 text-[11px] text-neutral-700 " +
              (selected ? "border-neutral-900" : "border-neutral-300")
            }
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
