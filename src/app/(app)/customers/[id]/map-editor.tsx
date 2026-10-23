"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnBeforeDelete,
  type OnDelete,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { DeviceIcon } from "@/components/device-icon";
import { collapseSpaces } from "@/lib/customers/input";
import {
  CONNECTION_LABEL_MAX_LENGTH,
  DEVICE_NAME_MAX_LENGTH,
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  defaultDeviceName,
  type DeviceType,
} from "@/lib/map/input";
import type { CustomerMap } from "@/lib/map/queries";
import {
  createConnection,
  createDevice,
  deleteMapElements,
  moveDevices,
  updateConnection,
  updateDevice,
  type MapActionResult,
} from "./map-actions";
import {
  ConnectionEdgeView,
  DeviceNodeView,
  type ConnectionEdge,
  type DeviceNode,
} from "./map-elements";

const nodeTypes = { device: DeviceNodeView };
const edgeTypes = { connection: ConnectionEdgeView };

// React Flow's own screen-reader texts, in the interface language.
const ariaLabelConfig = {
  "node.a11yDescription.default":
    "Enter o espacio para seleccionar el dispositivo. Supr para borrarlo, Escape para cancelar.",
  "node.a11yDescription.keyboardDisabled":
    "Enter o espacio para seleccionar el dispositivo y las flechas para moverlo. Supr para " +
    "borrarlo, Escape para cancelar.",
  "edge.a11yDescription.default":
    "Enter o espacio para seleccionar la conexión. Supr para borrarla, Escape para cancelar.",
  "controls.ariaLabel": "Controles del mapa",
  "controls.zoomIn.ariaLabel": "Acercar",
  "controls.zoomOut.ariaLabel": "Alejar",
  "controls.fitView.ariaLabel": "Ver todo el mapa",
  "controls.interactive.ariaLabel": "Bloquear o desbloquear el mapa",
  "minimap.ariaLabel": "Minimapa",
  "handle.ariaLabel": "Punto de conexión",
};

const DRAG_TYPE = "application/x-device-type";
// About half a device box, so a new device lands centred where it is dropped.
const NODE_HALF_SIZE = { x: 56, y: 36 };
const SAVE_FAILED = "No se pudo guardar el último cambio. Revisá la conexión y recargá la página.";

// Room taken by a device on the map, a bit more than its box.
const SLOT = { x: 140, y: 110 };

function freeSpot(start: { x: number; y: number }, nodes: DeviceNode[]): { x: number; y: number } {
  for (let i = 0; i < 25; i++) {
    const spot = { x: start.x + (i % 5) * SLOT.x, y: start.y + Math.floor(i / 5) * SLOT.y };
    const taken = nodes.some(
      (node) =>
        Math.abs(node.position.x - spot.x) < SLOT.x && Math.abs(node.position.y - spot.y) < SLOT.y,
    );
    if (!taken) return spot;
  }
  return start;
}

function toNode(device: CustomerMap["devices"][number]): DeviceNode {
  return {
    id: device.id,
    type: "device",
    position: { x: device.positionX, y: device.positionY },
    data: { name: device.name, type: device.type },
    ariaLabel: device.name,
  };
}

function toEdge(connection: CustomerMap["connections"][number]): ConnectionEdge {
  return {
    id: connection.id,
    type: "connection",
    source: connection.sourceId,
    target: connection.targetId,
    data: { label: connection.label },
    ariaLabel: connection.label ? `Conexión ${connection.label}` : "Conexión",
  };
}

// Changes are saved one after the other, in the order they were made: a
// connection is never sent before the device it points to.
function useAutosave() {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback((run: () => Promise<MapActionResult>) => {
    setPending((count) => count + 1);
    queue.current = queue.current
      .then(run)
      .then(
        (result) => {
          if (result.error) setError(result.error);
        },
        () => setError(SAVE_FAILED),
      )
      .finally(() => setPending((count) => count - 1));
  }, []);

  // Leaving while a change is on its way would lose it.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  return { save, saving: pending > 0, error };
}

export function MapEditor(props: { customerId: string; map: CustomerMap }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ customerId, map }: { customerId: string; map: CustomerMap }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>(map.devices.map(toNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState<ConnectionEdge>(
    map.connections.map(toEdge),
  );
  const { screenToFlowPosition, deleteElements } = useReactFlow<DeviceNode, ConnectionEdge>();
  const { save, saving, error } = useAutosave();
  const canvas = useRef<HTMLDivElement>(null);

  const addDevice = (type: DeviceType, at: { x: number; y: number }) => {
    const id = crypto.randomUUID();
    const name = defaultDeviceName(type, nodes.map((node) => node.data.name));
    const position = { x: Math.round(at.x), y: Math.round(at.y) };
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { id, type: "device", position, data: { name, type }, ariaLabel: name, selected: true },
    ]);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    save(() => createDevice(customerId, { id, type, name, ...position }));
  };

  // A click on the palette drops the device in the middle of what is on
  // screen, or in the first free spot to its right and below, so new devices
  // don't stack on top of each other.
  const addAtCentre = (type: DeviceType) => {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    const centre = screenToFlowPosition({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const start = { x: centre.x - NODE_HALF_SIZE.x, y: centre.y - NODE_HALF_SIZE.y };
    addDevice(type, freeSpot(start, nodes));
  };

  const onDrop = (event: DragEvent) => {
    const type = event.dataTransfer.getData(DRAG_TYPE) as DeviceType;
    if (!DEVICE_TYPES.includes(type)) return;
    event.preventDefault();
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addDevice(type, { x: point.x - NODE_HALF_SIZE.x, y: point.y - NODE_HALF_SIZE.y });
  };

  const onConnect = (connection: Connection) => {
    if (connection.source === connection.target) return;
    const id = crypto.randomUUID();
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    // Selected, so the panel offers to label it right away.
    setEdges((current) => [
      ...current.map((edge) => ({ ...edge, selected: false })),
      {
        id,
        type: "connection",
        source: connection.source,
        target: connection.target,
        data: { label: "" },
        ariaLabel: "Conexión",
        selected: true,
      },
    ]);
    save(() =>
      createConnection(customerId, {
        id,
        sourceId: connection.source,
        targetId: connection.target,
        label: "",
      }),
    );
  };

  // A position change that is not mid-drag is the end of a drag (of one
  // device or a selection) or a move with the arrow keys: that is saved.
  const handleNodesChange = (changes: NodeChange<DeviceNode>[]) => {
    onNodesChange(changes);
    const moves = changes.flatMap((change) =>
      change.type === "position" && change.position && !change.dragging
        ? [{ id: change.id, x: Math.round(change.position.x), y: Math.round(change.position.y) }]
        : [],
    );
    if (moves.length > 0) save(() => moveDevices(customerId, moves));
  };

  // A device takes its connections, and later its fields and history, with it.
  const onBeforeDelete: OnBeforeDelete<DeviceNode, ConnectionEdge> = async ({ nodes: doomed }) => {
    if (doomed.length === 0) return true;
    const question =
      doomed.length === 1
        ? `¿Borrar «${doomed[0].data.name}»? Se borra con sus conexiones y todo lo que tenga ` +
          "cargado."
        : `¿Borrar ${doomed.length} dispositivos? Se borran con sus conexiones y todo lo que ` +
          "tengan cargado.";
    return window.confirm(question);
  };

  const onDelete: OnDelete<DeviceNode, ConnectionEdge> = ({ nodes: gone, edges: goneEdges }) => {
    const deviceIds = gone.map((node) => node.id);
    const connectionIds = goneEdges.map((edge) => edge.id);
    save(() => deleteMapElements(customerId, { deviceIds, connectionIds }));
  };

  const renameDevice = (id: string, name: string) =>
    setNodes((current) =>
      current.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, name }, ariaLabel: name } : node,
      ),
    );

  const saveDevice = (id: string, data: { name: string; type: DeviceType }) => {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, data, ariaLabel: data.name } : node)),
    );
    save(() => updateDevice(customerId, { id, ...data }));
  };

  const relabelConnection = (id: string, label: string) =>
    setEdges((current) =>
      current.map((edge) =>
        edge.id === id
          ? { ...edge, data: { label }, ariaLabel: label ? `Conexión ${label}` : "Conexión" }
          : edge,
      ),
    );

  const saveConnection = (id: string, label: string) => {
    relabelConnection(id, label);
    save(() => updateConnection(customerId, { id, label }));
  };

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  // The panels only show for a single selected element.
  const single = selectedNodes.length + selectedEdges.length === 1;
  const selectedNode = single ? selectedNodes[0] : undefined;
  const selectedEdge = single ? selectedEdges[0] : undefined;

  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label="Agregar dispositivo"
        className="flex w-36 shrink-0 flex-col gap-1 overflow-y-auto border-r border-neutral-200 p-2"
      >
        <p className="px-1 pb-1 text-xs text-neutral-500">Click o arrastrá al mapa</p>
        {DEVICE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, type);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => addAtCentre(type)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
          >
            <DeviceIcon type={type} className="size-5 shrink-0" />
            {DEVICE_TYPE_LABELS[type]}
          </button>
        ))}
      </aside>

      <div
        ref={canvas}
        className="relative min-w-0 flex-1"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onBeforeDelete={onBeforeDelete}
          onDelete={onDelete}
          isValidConnection={(connection) => connection.source !== connection.target}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Delete", "Backspace"]}
          // Double click is for opening the device sheet, not for zooming.
          zoomOnDoubleClick={false}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.2}
          ariaLabelConfig={ariaLabelConfig}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>

        {nodes.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-neutral-500">
            El mapa está vacío. Agregá el primer dispositivo desde la izquierda.
          </p>
        )}

        <div className="absolute top-2 right-2 flex max-w-72 flex-col items-end gap-2">
          <SaveStatus saving={saving} error={error} />
          {selectedNode && (
            <DevicePanel
              key={selectedNode.id}
              node={selectedNode}
              onRename={(name) => renameDevice(selectedNode.id, name)}
              onSave={(data) => saveDevice(selectedNode.id, data)}
              onDelete={() => deleteElements({ nodes: [{ id: selectedNode.id }] })}
            />
          )}
          {selectedEdge && (
            <ConnectionPanel
              key={selectedEdge.id}
              edge={selectedEdge}
              onRelabel={(label) => relabelConnection(selectedEdge.id, label)}
              onSave={(label) => saveConnection(selectedEdge.id, label)}
              onDelete={() => deleteElements({ edges: [{ id: selectedEdge.id }] })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SaveStatus({ saving, error }: { saving: boolean; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-sm">
        {error}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-600 shadow-sm"
    >
      {saving ? "Guardando…" : "Guardado"}
    </p>
  );
}

const panelClass =
  "flex w-64 flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-md";
const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 " +
  "focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const deleteButtonClass =
  "self-start rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50";

// The name is saved when the field loses focus or on Enter; the map shows it
// while it is typed. An empty name goes back to the last one saved.
function DevicePanel({
  node,
  onRename,
  onSave,
  onDelete,
}: {
  node: DeviceNode;
  onRename: (name: string) => void;
  onSave: (data: { name: string; type: DeviceType }) => void;
  onDelete: () => void;
}) {
  const saved = useRef(node.data);
  const [name, setName] = useState(node.data.name);

  const commit = (type: DeviceType) => {
    const clean = collapseSpaces(name);
    if (!clean) {
      setName(saved.current.name);
      onRename(saved.current.name);
      return;
    }
    if (clean === saved.current.name && type === saved.current.type) return;
    saved.current = { name: clean, type };
    setName(clean);
    onSave(saved.current);
  };

  return (
    <section aria-label="Dispositivo seleccionado" className={panelClass}>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
        Nombre
        <input
          value={name}
          maxLength={DEVICE_NAME_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            onRename(event.target.value);
          }}
          onBlur={() => commit(node.data.type)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(node.data.type);
          }}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
        Tipo
        <select
          value={node.data.type}
          onChange={(event) => commit(event.target.value as DeviceType)}
          className={fieldClass}
        >
          {DEVICE_TYPES.map((type) => (
            <option key={type} value={type}>
              {DEVICE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onDelete} className={deleteButtonClass}>
        Borrar dispositivo
      </button>
    </section>
  );
}

function ConnectionPanel({
  edge,
  onRelabel,
  onSave,
  onDelete,
}: {
  edge: ConnectionEdge;
  onRelabel: (label: string) => void;
  onSave: (label: string) => void;
  onDelete: () => void;
}) {
  const initial = edge.data?.label ?? "";
  const saved = useRef(initial);
  const [label, setLabel] = useState(initial);

  const commit = () => {
    const clean = collapseSpaces(label);
    setLabel(clean);
    if (clean === saved.current) return;
    saved.current = clean;
    onSave(clean);
  };

  return (
    <section aria-label="Conexión seleccionada" className={panelClass}>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-700">
        Etiqueta
        <input
          value={label}
          maxLength={CONNECTION_LABEL_MAX_LENGTH}
          autoComplete="off"
          placeholder="WAN1, VPN IPsec, VLAN 20…"
          onChange={(event) => {
            setLabel(event.target.value);
            onRelabel(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className={fieldClass}
        />
      </label>
      <button type="button" onClick={onDelete} className={deleteButtonClass}>
        Borrar conexión
      </button>
    </section>
  );
}
