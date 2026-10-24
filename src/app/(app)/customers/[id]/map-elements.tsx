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
import { DeviceIcon, deviceTint } from "@/components/device-icon";
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
  const tint = deviceTint(data.type);
  // Selected as in Explorer's icon view: the whole item, icon and name, in pale blue.
  return (
    <div
      className={
        "group relative flex w-32 flex-col items-center gap-1 rounded-sm border px-1 py-1 text-center " +
        (selected ? "border-select-line bg-select" : "border-transparent")
      }
    >
      <span
        style={{ background: tint.background, color: tint.ink }}
        className={
          "relative flex size-12 items-center justify-center rounded-sm " +
          (reasons.length > 0 ? "ring-2 ring-warn-line" : "")
        }
      >
        <DeviceIcon type={data.type} className="size-7" />
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
      <span
        className={
          "max-w-full px-1 text-[13px] leading-tight break-words text-neutral-900 " +
          (selected ? "" : "bg-white")
        }
      >
        {data.name}
      </span>
      {data.address && (
        <span
          className={
            "max-w-full truncate px-1 font-mono text-[11px] leading-tight text-neutral-600 " +
            (selected ? "" : "bg-white")
          }
        >
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
            "size-3! rounded-none! border-2! border-white! bg-accent! transition-opacity " +
            (selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
        />
      ))}
    </div>
  );
}

// About half the icon tile: a device's box is wider than its icon because of
// the name, and an edge should reach the icon.
const EDGE_HALF_WIDTH = 30;

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
          stroke: selected ? "#1f2328" : tunnel ? "#2563a8" : "#8a939e",
          strokeWidth: selected ? 2.2 : 1.5,
          strokeDasharray: tunnel ? "6 4" : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={
              "nodrag nopan pointer-events-none absolute max-w-40 truncate rounded-sm border " +
              "px-1.5 py-0.5 text-[11px] " +
              (tunnel
                ? "border-tunnel-line bg-tunnel-soft text-tunnel-ink"
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
