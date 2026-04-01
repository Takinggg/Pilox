"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Workflow graph state management — single source of truth for the canvas.
 * Adapted from thutasann/workflow-builder WorkflowContext (MIT).
 */

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import { WfNodeType } from "./types";

// ── Types ────────────────────────────────────────────

interface StepSelectorState {
  isOpen: boolean;
  position: { x: number; y: number };
  parentStepId: string | null;
  branchIndex?: number;
}

interface WorkflowContextType {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  stepSelector: StepSelectorState;
  isDirty: boolean;

  // React Flow handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  // Graph mutations
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  addNode: (node: Node) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;

  // Serialization
  getNodesAndEdges: () => { nodes: Node[]; edges: Edge[] };
  markClean: () => void;

  // Undo / redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Step selector
  openStepSelector: (
    parentStepId: string,
    position: { x: number; y: number },
    branchIndex?: number,
  ) => void;
  closeStepSelector: () => void;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}

// ── Provider ─────────────────────────────────────────

interface WorkflowProviderProps {
  children: ReactNode;
  initialNodes?: Node[];
  initialEdges?: Edge[];
}

export function WorkflowProvider({
  children,
  initialNodes = [],
  initialEdges = [],
}: WorkflowProviderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [stepSelector, setStepSelector] = useState<StepSelectorState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    parentStepId: null,
  });

  // Ref-based getter to avoid stale closures in save callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Undo / Redo history ────────────────────────────
  type Snapshot = { nodes: Node[]; edges: Edge[] };
  const historyRef = useRef<Snapshot[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const historyIndexRef = useRef(0);
  const isUndoingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback(() => {
    if (isUndoingRef.current) return;
    const snap: Snapshot = { nodes: nodesRef.current, edges: edgesRef.current };
    const hist = historyRef.current;
    // Trim forward history on new action
    historyRef.current = hist.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoingRef.current = true;
    historyIndexRef.current--;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    setIsDirty(true);
    // Keep the flag true for 2 frames to block change handlers from pushing history
    requestAnimationFrame(() => requestAnimationFrame(() => { isUndoingRef.current = false; }));
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoingRef.current = true;
    historyIndexRef.current++;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    setIsDirty(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { isUndoingRef.current = false; }));
  }, [setNodes, setEdges]);

  // Track dirty state on any mutation
  const wrappedOnNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      setIsDirty(true);
      // Only push history for meaningful changes (add/remove/replace), not position drag
      const meaningful = changes.some((c) => c.type === "add" || c.type === "remove" || c.type === "replace");
      if (meaningful) pushHistory();
    },
    [onNodesChange, pushHistory],
  );

  const wrappedOnEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setIsDirty(true);
      const meaningful = changes.some((c) => c.type === "add" || c.type === "remove" || c.type === "replace");
      if (meaningful) pushHistory();
    },
    [onEdgesChange, pushHistory],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      // Remove any AddButton node that was the previous target of the source
      // (e.g. Start→AddButton chain becomes Start→NewNode)
      setNodes((nds) => {
        const addButtonIds = new Set<string>();
        setEdges((eds) => {
          // Find AddButton nodes connected as target of the same source
          for (const e of eds) {
            if (e.source === connection.source) {
              const targetNode = nds.find((n) => n.id === e.target);
              if (targetNode?.type === WfNodeType.ADD_BUTTON) {
                addButtonIds.add(e.target);
              }
            }
          }
          // Remove edges involving those AddButton nodes
          const cleaned = eds.filter(
            (e) => !addButtonIds.has(e.source) && !addButtonIds.has(e.target),
          );
          return addEdge(
            { ...connection, type: "straightLine", data: { parentStepId: connection.source } },
            cleaned,
          );
        });
        // Remove AddButton nodes themselves
        return addButtonIds.size > 0 ? nds.filter((n) => !addButtonIds.has(n.id)) : nds;
      });
      setIsDirty(true);
      pushHistory();
    },
    [setNodes, setEdges, pushHistory],
  );

  const addNode = useCallback(
    (node: Node) => {
      setNodes((nds) => [...nds, node]);
      setIsDirty(true);
      pushHistory();
    },
    [setNodes, pushHistory],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        // Find edges connected to this node to clean up orphaned add-buttons
        const connectedAddButtons = new Set<string>();
        const currentEdges = edgesRef.current;
        for (const e of currentEdges) {
          if (e.source === nodeId || e.target === nodeId) {
            const otherId = e.source === nodeId ? e.target : e.source;
            const otherNode = nds.find((n) => n.id === otherId);
            if (otherNode?.type === WfNodeType.ADD_BUTTON) {
              connectedAddButtons.add(otherId);
            }
          }
        }
        return nds.filter((n) => n.id !== nodeId && !connectedAddButtons.has(n.id));
      });
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId((curr) => (curr === nodeId ? null : curr));
      setIsDirty(true);
      pushHistory();
    },
    [setNodes, setEdges, pushHistory],
  );

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
      setIsDirty(true);
      pushHistory();
    },
    [setNodes, pushHistory],
  );

  const getNodesAndEdges = useCallback(() => ({
    nodes: nodesRef.current,
    edges: edgesRef.current,
  }), []);

  const markClean = useCallback(() => setIsDirty(false), []);

  const openStepSelector = useCallback(
    (parentStepId: string, position: { x: number; y: number }, branchIndex?: number) => {
      setStepSelector({ isOpen: true, position, parentStepId, branchIndex });
    },
    [],
  );

  const closeStepSelector = useCallback(() => {
    setStepSelector({ isOpen: false, position: { x: 0, y: 0 }, parentStepId: null });
  }, []);

  return (
    <WorkflowContext.Provider
      value={{
        nodes,
        edges,
        selectedNodeId,
        stepSelector,
        isDirty,
        onNodesChange: wrappedOnNodesChange,
        onEdgesChange: wrappedOnEdgesChange,
        onConnect,
        setNodes,
        setEdges,
        addNode,
        deleteNode,
        selectNode,
        updateNodeData,
        getNodesAndEdges,
        markClean,
        undo,
        redo,
        canUndo,
        canRedo,
        openStepSelector,
        closeStepSelector,
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}
