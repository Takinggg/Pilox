"use client";

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Workflow graph state management — single source of truth for the canvas.
 * Undo/redo uses snapshot-based history with a freeze guard (inspired by n8n's command pattern).
 * Auto-save debounced at 2s after last mutation.
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

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  addNode: (node: Node) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;

  getNodesAndEdges: () => { nodes: Node[]; edges: Edge[] };
  markClean: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

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

// ── Snapshot-based history with freeze guard ─────────

type Snapshot = { nodes: Node[]; edges: Edge[] };

const MAX_HISTORY = 50;

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

  // Ref-based getters to avoid stale closures
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── History ────────────────────────────────────────
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const frozenRef = useRef(false); // true during undo/redo to block history pushes
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /** Save current state to undo stack before a mutation. */
  const saveSnapshot = useCallback(() => {
    if (frozenRef.current) return;
    undoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    // New action invalidates redo
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    frozenRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    // Unfreeze after React commits the update
    setTimeout(() => { frozenRef.current = false; }, 50);
  }, [setNodes, setEdges]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const snap = undoStack.current.pop()!;
    // Push current state to redo
    redoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    });
    applySnapshot(snap);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    setIsDirty(true);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const snap = redoStack.current.pop()!;
    // Push current state to undo
    undoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    });
    applySnapshot(snap);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    setIsDirty(true);
  }, [applySnapshot]);

  // ── Wrapped change handlers ────────────────────────

  const wrappedOnNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Save snapshot before meaningful changes
      const meaningful = changes.some((c) => c.type === "add" || c.type === "remove" || c.type === "replace");
      if (meaningful) saveSnapshot();
      onNodesChange(changes);
      setIsDirty(true);
    },
    [onNodesChange, saveSnapshot],
  );

  const wrappedOnEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const meaningful = changes.some((c) => c.type === "add" || c.type === "remove" || c.type === "replace");
      if (meaningful) saveSnapshot();
      onEdgesChange(changes);
      setIsDirty(true);
    },
    [onEdgesChange, saveSnapshot],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      saveSnapshot();
      setNodes((nds) => {
        const addButtonIds = new Set<string>();
        setEdges((eds) => {
          for (const e of eds) {
            if (e.source === connection.source) {
              const targetNode = nds.find((n) => n.id === e.target);
              if (targetNode?.type === WfNodeType.ADD_BUTTON) {
                addButtonIds.add(e.target);
              }
            }
          }
          const cleaned = eds.filter(
            (e) => !addButtonIds.has(e.source) && !addButtonIds.has(e.target),
          );
          return addEdge(
            { ...connection, type: "straightLine", data: { parentStepId: connection.source } },
            cleaned,
          );
        });
        return addButtonIds.size > 0 ? nds.filter((n) => !addButtonIds.has(n.id)) : nds;
      });
      setIsDirty(true);
    },
    [setNodes, setEdges, saveSnapshot],
  );

  const addNode = useCallback(
    (node: Node) => {
      saveSnapshot();
      setNodes((nds) => [...nds, node]);
      setIsDirty(true);
    },
    [setNodes, saveSnapshot],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      saveSnapshot();
      setNodes((nds) => {
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
    },
    [setNodes, setEdges, saveSnapshot],
  );

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      saveSnapshot();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, saveSnapshot],
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
