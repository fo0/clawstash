import { useRef, useEffect, useCallback, useState } from 'react';
import type { StashGraphNode, StashGraphEdge, StashGraphResult } from '../types';
import { api } from '../api';

interface Props {
  onSelectStash: (id: string) => void;
  analyzeStashId?: string | null;
  onAnalyzeStashConsumed?: () => void;
}

interface RenderNode extends StashGraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  cluster: number;
  degree: number;
}

interface PopupState {
  node: StashGraphNode;
  screenX: number;
  screenY: number;
  connections: { id: string; label: string; type: string; weight: number }[];
}

const COLORS = {
  stash: '#58a6ff',
  tag: '#238636',
  version: '#d29922',
  has_tag: 'rgba(35, 134, 54, 0.3)',
  shared_tags: 'rgba(88, 166, 255, 0.5)',
  version_of: 'rgba(210, 153, 34, 0.5)',
  temporal_proximity: 'rgba(188, 140, 255, 0.25)',
};

function edgeColor(type: string): string {
  return COLORS[type as keyof typeof COLORS] || 'rgba(139, 148, 158, 0.3)';
}

function computeRadius(node: StashGraphNode): number {
  if (node.type === 'stash') return Math.max(10, Math.min(28, 10 + Math.sqrt(node.file_count || 1) * 4));
  if (node.type === 'tag') return Math.max(6, Math.min(20, 6 + Math.sqrt(node.count || 1) * 3));
  return 5; // version
}

function buildRenderNodes(data: StashGraphResult): { nodes: RenderNode[]; edges: StashGraphEdge[] } {
  const nodes: RenderNode[] = data.nodes.map((n, i) => ({
    ...n,
    x: Math.cos(2 * Math.PI * i / data.nodes.length) * 200,
    y: Math.sin(2 * Math.PI * i / data.nodes.length) * 200,
    vx: 0,
    vy: 0,
    radius: computeRadius(n),
    cluster: 0,
    degree: 0,
  }));

  // Compute degrees
  const degMap = new Map<string, number>();
  for (const e of data.edges) {
    degMap.set(e.source, (degMap.get(e.source) || 0) + 1);
    degMap.set(e.target, (degMap.get(e.target) || 0) + 1);
  }
  for (const n of nodes) n.degree = degMap.get(n.id) || 0;

  return { nodes, edges: data.edges };
}

function simulate(nodes: RenderNode[], edges: StashGraphEdge[], alpha: number, _timelineMode: boolean, _timeRange: { min: number; max: number }, _canvasW: number) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Center gravity
  for (const node of nodes) {
    const gravity = 0.006 * (1 + node.degree * 0.2) * alpha;
    node.vx -= node.x * gravity;
    node.vy -= node.y * gravity;
  }

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = a.radius + b.radius + 8;
      const degFactor = (a.degree + 1) * (b.degree + 1);
      const force = degFactor * 15 * alpha / dist;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
      if (dist < minDist) {
        const overlap = (minDist - dist) * 0.5;
        const ox = (dx / dist) * overlap, oy = (dy / dist) * overlap;
        a.x -= ox; a.y -= oy; b.x += ox; b.y += oy;
      }
    }
  }

  // Edge attraction
  for (const edge of edges) {
    const a = nodeMap.get(edge.source), b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = edge.type === 'has_tag' ? 0.012 : edge.type === 'shared_tags' ? 0.01 : edge.type === 'version_of' ? 0.02 : 0.002;
    const idealDist = edge.type === 'version_of' ? 20 : edge.type === 'has_tag' ? 20 : 50;
    const force = (dist - idealDist) * strength * alpha * Math.sqrt(edge.weight);
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }

  // Damping + update
  for (const node of nodes) {
    node.vx *= 0.55; node.vy *= 0.55;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > 12) { node.vx = (node.vx / speed) * 12; node.vy = (node.vy / speed) * 12; }
    node.x += node.vx; node.y += node.vy;
  }
}

function drawStashNode(ctx: CanvasRenderingContext2D, node: RenderNode, isActive: boolean, isConnected: boolean, dimmed: boolean, isAnalysed: boolean) {
  const w = node.radius * 2.2, h = node.radius * 1.6, r = 4;
  const x = node.x - w / 2, y = node.y - h / 2;

  // Glow effect for analysed stashes
  if (isAnalysed) {
    ctx.save();
    ctx.shadowColor = '#58a6ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, r + 2);
    ctx.fillStyle = 'rgba(88, 166, 255, 0.12)';
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = isAnalysed ? '#79c0ff' : isActive ? '#79c0ff' : isConnected ? 'rgba(88, 166, 255, 0.7)' : dimmed ? 'rgba(88, 166, 255, 0.2)' : COLORS.stash;
  ctx.fill();
  ctx.strokeStyle = isAnalysed ? '#a5d6ff' : isActive ? '#fff' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = isAnalysed ? 2.5 : isActive ? 2 : 1;
  ctx.stroke();

  // Version badge
  if (node.version && node.version > 1) {
    const badge = `v${node.version}`;
    ctx.font = '600 8px -apple-system, BlinkMacSystemFont, sans-serif';
    const bw = ctx.measureText(badge).width + 6;
    ctx.fillStyle = 'rgba(210, 153, 34, 0.9)';
    ctx.beginPath();
    ctx.roundRect(node.x + w / 2 - bw + 2, y - 4, bw, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, node.x + w / 2 - bw / 2 + 2, y + 2);
  }
}

function drawTagNode(ctx: CanvasRenderingContext2D, node: RenderNode, isActive: boolean, isConnected: boolean, dimmed: boolean, isIgnored: boolean) {
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
  if (isIgnored) {
    ctx.fillStyle = 'rgba(110, 118, 129, 0.25)';
  } else {
    ctx.fillStyle = isActive ? '#3fb950' : isConnected ? 'rgba(35, 134, 54, 0.7)' : dimmed ? 'rgba(35, 134, 54, 0.2)' : COLORS.tag;
  }
  ctx.fill();
  if (isIgnored) {
    ctx.strokeStyle = 'rgba(110, 118, 129, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
  } else {
    ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isActive ? 2 : 1;
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (node.radius >= 8 && node.count) {
    ctx.font = `700 ${Math.max(7, node.radius * 0.65)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isIgnored ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.9)';
    ctx.fillText(String(node.count), node.x, node.y);
  }
}

function drawVersionNode(ctx: CanvasRenderingContext2D, node: RenderNode, isActive: boolean, isConnected: boolean, dimmed: boolean) {
  const s = node.radius * 1.2;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.rect(-s / 2, -s / 2, s, s);
  ctx.fillStyle = isActive ? '#ffa657' : isConnected ? 'rgba(210, 153, 34, 0.7)' : dimmed ? 'rgba(210, 153, 34, 0.2)' : COLORS.version;
  ctx.fill();
  ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.15)';
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.stroke();
  ctx.restore();
}

export default function StashGraphCanvas({ onSelectStash, analyzeStashId, onAnalyzeStashConsumed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<RenderNode[]>([]);
  const edgesRef = useRef<StashGraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const alphaRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{ node: RenderNode; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef(false);
  const didDragRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hoveredRef = useRef<RenderNode | null>(null);
  const autoFitDoneRef = useRef(false);
  const targetZoomRef = useRef<number | null>(null);
  const targetPanRef = useRef<{ x: number; y: number } | null>(null);

  const [popup, setPopup] = useState<PopupState | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [analysedStashes, setAnalysedStashes] = useState<Set<string>>(new Set());
  const [defaultDepth, setDefaultDepth] = useState(1);
  const [ignoredTags, setIgnoredTags] = useState<Set<string>>(new Set());
  const ignoredTagsRef = useRef<Set<string>>(new Set());
  const [trackedTags, setTrackedTags] = useState<Set<string>>(new Set());
  const trackedTagsRef = useRef<Set<string>>(new Set());
  const allNodesRef = useRef<RenderNode[]>([]);
  const allEdgesRef = useRef<StashGraphEdge[]>([]);
  const analysedStashesRef = useRef<Set<string>>(new Set());

  // Auto-fit (smooth: sets targets, animation loop interpolates)
  const autoFit = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = nodesRef.current;
    if (!canvas || nodes.length === 0) return;
    const dpr = devicePixelRatio;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    if (w <= 0 || h <= 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const pad = node.radius + 25;
      minX = Math.min(minX, node.x - pad); maxX = Math.max(maxX, node.x + pad);
      minY = Math.min(minY, node.y - pad); maxY = Math.max(maxY, node.y + pad);
    }
    const graphW = maxX - minX, graphH = maxY - minY;
    if (graphW <= 0 || graphH <= 0) return;
    const padding = 60;
    const zoom = Math.max(0.2, Math.min((w - padding * 2) / graphW, (h - padding * 2) / graphH, 1.5));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    targetZoomRef.current = zoom;
    targetPanRef.current = { x: -cx * zoom, y: -cy * zoom };
  }, []);

  // Filter nodes/edges based on analysed stashes (ignoring tags in ignoredTags)
  const applyVisibilityFilter = useCallback((allNodes: RenderNode[], allEdges: StashGraphEdge[], analysed: Set<string>, ignored: Set<string>) => {
    // Build a set of ignored tag node IDs
    const ignoredTagIds = new Set<string>();
    for (const n of allNodes) {
      if (n.type === 'tag' && ignored.has(n.label)) ignoredTagIds.add(n.id);
    }
    // Active edges: edges NOT connected to ignored tags (used for BFS & relationships)
    let activeEdges = allEdges.filter(e => !ignoredTagIds.has(e.source) && !ignoredTagIds.has(e.target));

    // If tags are ignored, re-check shared_tags edges using edge metadata
    // Remove edges where all shared tags are ignored (or metadata missing)
    if (ignored.size > 0) {
      activeEdges = activeEdges.filter(e => {
        if (e.type !== 'shared_tags') return true;
        const sharedTagNames = e.metadata?.shared_tags || [];
        // If no metadata, we can't verify which tags are shared → remove when tags are ignored
        if (sharedTagNames.length === 0) return false;
        // Keep edge only if at least one shared tag is NOT ignored
        return sharedTagNames.some((t: string) => !ignored.has(t));
      });
    }
    // has_tag edges TO ignored tags — only keep edges to analysed stashes (rendered gray)
    const ignoredTagEdges = allEdges.filter(e => {
      if (e.type !== 'has_tag') return false;
      if (!ignoredTagIds.has(e.source) && !ignoredTagIds.has(e.target)) return false;
      // Only keep edge if the non-tag end is an analysed stash
      const stashEnd = ignoredTagIds.has(e.source) ? e.target : e.source;
      return analysed.has(stashEnd);
    });

    if (analysed.size === 0) {
      // Show only stash nodes and shared_tags edges between stashes
      const visibleNodes = allNodes.filter(n => n.type === 'stash');
      const visibleIds = new Set(visibleNodes.map(n => n.id));
      const visibleEdges = activeEdges.filter(e => e.type === 'shared_tags' && visibleIds.has(e.source) && visibleIds.has(e.target));
      return { nodes: visibleNodes, edges: visibleEdges };
    }

    const visibleIds = new Set<string>();

    // Start with analysed stashes
    for (const sid of analysed) visibleIds.add(sid);

    // BFS from analysed stashes using only tag-based edges (has_tag, shared_tags)
    // temporal_proximity and version_of edges are supplementary and should not expand the reachable set
    const tagBasedEdges = activeEdges.filter(e => e.type === 'has_tag' || e.type === 'shared_tags');
    const queue: { id: string; depth: number }[] = [];
    for (const sid of analysed) queue.push({ id: sid, depth: 0 });
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= defaultDepth) continue;
      for (const e of tagBasedEdges) {
        const neighbor = e.source === id ? e.target : e.target === id ? e.source : null;
        if (neighbor && !visibleIds.has(neighbor)) {
          visibleIds.add(neighbor);
          queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }

    // Find stashes reachable via active shared_tags edges from already-visible stashes
    // (shared_tags are direct stash↔stash relationships, not counted by BFS depth)
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of tagBasedEdges) {
        if (e.type !== 'shared_tags') continue;
        const hasSource = visibleIds.has(e.source);
        const hasTarget = visibleIds.has(e.target);
        if (hasSource && !hasTarget) { visibleIds.add(e.target); changed = true; }
        if (hasTarget && !hasSource) { visibleIds.add(e.source); changed = true; }
      }
    }

    // Add ignored tag nodes that are connected to analysed stashes (rendered gray)
    for (const e of ignoredTagEdges) {
      const tagEnd = ignoredTagIds.has(e.source) ? e.source : e.target;
      visibleIds.add(tagEnd);
    }

    const visibleNodes = allNodes.filter(n => visibleIds.has(n.id));
    // Build node type map for efficient lookup
    const nodeTypeMap = new Map(allNodes.map(n => [n.id, n.type]));
    // Combine active edges + ignored tag edges (both filtered to visible nodes)
    // In analysis mode: only show has_tag edges connecting to analysed (root) stashes
    const visibleActiveEdges = activeEdges.filter(e => {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return false;
      if (analysed.size > 0 && e.type === 'has_tag') {
        const stashEnd = nodeTypeMap.get(e.source) === 'stash' ? e.source : nodeTypeMap.get(e.target) === 'stash' ? e.target : null;
        if (stashEnd && !analysed.has(stashEnd)) return false;
      }
      return true;
    });
    const visibleIgnoredEdges = ignoredTagEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
    const visibleEdges = [...visibleActiveEdges, ...visibleIgnoredEdges];
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [defaultDepth]);

  // Handle analyzeStashId from external navigation
  useEffect(() => {
    if (analyzeStashId && allNodesRef.current.length > 0) {
      const stashNode = allNodesRef.current.find(n => n.id === analyzeStashId && n.type === 'stash');
      if (stashNode) {
        setAnalysedStashes(prev => {
          const next = new Set(prev);
          next.add(analyzeStashId);
          analysedStashesRef.current = next;
          return next;
        });
      }
      onAnalyzeStashConsumed?.();
    }
  }, [analyzeStashId, onAnalyzeStashConsumed]);

  // Animation restart helper — stored before data-fetch so it can be used in useEffect deps
  const tickRef = useRef<(() => void) | null>(null);
  const kickAnimation = useCallback(() => {
    if (!animRef.current && tickRef.current) {
      animRef.current = requestAnimationFrame(tickRef.current);
    }
  }, []);

  // Fetch data
  useEffect(() => {
    setLoading(true);
    api.getStashGraph({ mode: 'relations' })
      .then(data => {
        const { nodes, edges } = buildRenderNodes(data);
        allNodesRef.current = nodes;
        allEdgesRef.current = edges;

        // If there's a pending analyzeStashId, apply it now
        let initialAnalysed = analysedStashes;
        if (analyzeStashId) {
          const stashNode = nodes.find(n => n.id === analyzeStashId && n.type === 'stash');
          if (stashNode) {
            initialAnalysed = new Set([analyzeStashId]);
            analysedStashesRef.current = initialAnalysed;
            setAnalysedStashes(initialAnalysed);
          }
          onAnalyzeStashConsumed?.();
        }

        const { nodes: filtered, edges: filteredEdges } = applyVisibilityFilter(nodes, edges, initialAnalysed, ignoredTagsRef.current);
        nodesRef.current = filtered;
        edgesRef.current = filteredEdges;
        setNodeCount(filtered.length);
        setEdgeCount(filteredEdges.length);

        alphaRef.current = 1;
        autoFitDoneRef.current = false;
        setLoading(false);
        kickAnimation();
      })
      .catch(err => {
        console.error('Failed to load stash graph:', err);
        setLoading(false);
      });
  }, [applyVisibilityFilter, kickAnimation]);

  // Re-filter when analysedStashes or defaultDepth changes
  useEffect(() => {
    if (allNodesRef.current.length === 0) return;
    const { nodes, edges } = applyVisibilityFilter(allNodesRef.current, allEdgesRef.current, analysedStashes, ignoredTags);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setNodeCount(nodes.length);
    setEdgeCount(edges.length);
    alphaRef.current = 1;
    autoFitDoneRef.current = false;
    kickAnimation();
  }, [analysedStashes, defaultDepth, ignoredTags, applyVisibilityFilter, kickAnimation]);

  const screenToWorld = useCallback((sx: number, sy: number, canvas: HTMLCanvasElement) => {
    const cx = canvas.width / (2 * devicePixelRatio), cy = canvas.height / (2 * devicePixelRatio);
    return { x: (sx - cx - panRef.current.x) / zoomRef.current, y: (sy - cy - panRef.current.y) / zoomRef.current };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      const hitR = node.type === 'stash' ? Math.max(node.radius * 1.1, node.radius + 4) : node.radius + 4;
      const dx = node.x - wx, dy = node.y - wy;
      if (dx * dx + dy * dy <= hitR * hitR) return node;
    }
    return null;
  }, []);

  const getConnections = useCallback((nodeId: string) => {
    const conns: { id: string; label: string; type: string; weight: number }[] = [];
    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));
    for (const edge of edgesRef.current) {
      if (edge.source === nodeId) {
        const t = nodeMap.get(edge.target);
        if (t) conns.push({ id: t.id, label: t.label, type: edge.type, weight: edge.weight });
      } else if (edge.target === nodeId) {
        const s = nodeMap.get(edge.source);
        if (s) conns.push({ id: s.id, label: s.label, type: edge.type, weight: edge.weight });
      }
    }
    return conns.sort((a, b) => b.weight - a.weight).slice(0, 8);
  }, []);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = devicePixelRatio;
    const w = canvas.width / dpr, h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + panRef.current.x, h / 2 + panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const hovered = hoveredRef.current;
    const zoom = zoomRef.current;

    // Draw edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // When hovering a tag OR tracking tags in analysis mode: compute highlight paths (tag → root → referenced stashes)
    const hoveredTagPaths: { rootId: string; stashId: string }[] = [];
    // Collect tag IDs to highlight: hovered tag + all tracked tags
    const highlightTagIds = new Set<string>();
    if (hovered && hovered.type === 'tag' && analysedStashesRef.current.size > 0) {
      highlightTagIds.add(hovered.id);
    }
    // Add tracked tag node IDs
    if (trackedTagsRef.current.size > 0 && analysedStashesRef.current.size > 0) {
      for (const n of nodes) {
        if (n.type === 'tag' && trackedTagsRef.current.has(n.label)) {
          highlightTagIds.add(n.id);
        }
      }
    }
    // Compute paths for all highlighted tags
    if (highlightTagIds.size > 0) {
      const allEdges = allEdgesRef.current;
      for (const tagId of highlightTagIds) {
        const connectedStashIds: string[] = [];
        const rootStashIds: string[] = [];
        for (const e of allEdges) {
          if (e.type !== 'has_tag') continue;
          const isSource = e.source === tagId;
          const isTarget = e.target === tagId;
          if (!isSource && !isTarget) continue;
          const stashEnd = isSource ? e.target : e.source;
          if (analysedStashesRef.current.has(stashEnd)) {
            rootStashIds.push(stashEnd);
          } else {
            connectedStashIds.push(stashEnd);
          }
        }
        for (const rootId of rootStashIds) {
          for (const stashId of connectedStashIds) {
            if (nodeMap.has(stashId)) {
              hoveredTagPaths.push({ rootId, stashId });
            }
          }
        }
      }
    }
    // Build set of tracked tag node IDs for edge coloring
    const trackedTagNodeIds = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'tag' && trackedTagsRef.current.has(n.label)) {
        trackedTagNodeIds.add(n.id);
      }
    }

    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const isActive = hovered && (hovered.id === edge.source || hovered.id === edge.target);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      // Check if this edge connects to an ignored tag
      const edgeToIgnoredTag = (a.type === 'tag' && ignoredTagsRef.current.has(a.label)) || (b.type === 'tag' && ignoredTagsRef.current.has(b.label));

      if (edgeToIgnoredTag) {
        ctx.setLineDash([3, 3]);
      } else if (edge.type === 'temporal_proximity' || (edge.type === 'has_tag' && !isActive)) {
        ctx.setLineDash([3, 3]);
      } else {
        ctx.setLineDash([]);
      }

      // Green highlight for edges connected to hovered tag or tracked tags
      const isHoveredTagEdge = hovered && hovered.type === 'tag' && isActive;
      const isTrackedTagEdge = trackedTagNodeIds.has(edge.source) || trackedTagNodeIds.has(edge.target);
      ctx.strokeStyle = edgeToIgnoredTag ? 'rgba(110, 118, 129, 0.25)' : (isHoveredTagEdge || isTrackedTagEdge) ? 'rgba(35, 134, 54, 0.85)' : isActive ? 'rgba(88, 166, 255, 0.7)' : edgeColor(edge.type);
      ctx.lineWidth = edgeToIgnoredTag ? 1 : Math.min(1 + edge.weight * 0.6, 4) * (isActive ? 1.5 : 1);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow for version_of
      if (edge.type === 'version_of') {
        const dx = b.x - a.x, dy = b.y - a.y;
        const mx = a.x + dx * 0.7, my = a.y + dy * 0.7;
        const angle = Math.atan2(dy, dx);
        const arrowLen = 6;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - arrowLen * Math.cos(angle - 0.4), my - arrowLen * Math.sin(angle - 0.4));
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - arrowLen * Math.cos(angle + 0.4), my - arrowLen * Math.sin(angle + 0.4));
        ctx.strokeStyle = isActive ? 'rgba(210, 153, 34, 0.9)' : 'rgba(210, 153, 34, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw hover-highlight paths for tag hover: root stash → referenced stash (dashed, highlighted)
    for (const { rootId, stashId } of hoveredTagPaths) {
      const rootNode = nodeMap.get(rootId);
      const stashNode = nodeMap.get(stashId);
      if (!rootNode || !stashNode) continue;
      ctx.beginPath();
      ctx.moveTo(rootNode.x, rootNode.y);
      ctx.lineTo(stashNode.x, stashNode.y);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(35, 134, 54, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Build set of node IDs highlighted by tag-hover paths (root stashes + referenced stashes)
    const tagHoverHighlightIds = new Set<string>();
    for (const { rootId, stashId } of hoveredTagPaths) {
      tagHoverHighlightIds.add(rootId);
      tagHoverHighlightIds.add(stashId);
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hovered && hovered.id === node.id;
      const isConnected = hovered && (
        edges.some(e => (e.source === hovered.id && e.target === node.id) || (e.target === hovered.id && e.source === node.id))
        || tagHoverHighlightIds.has(node.id)
      );
      const dimmed = !!hovered && !isHovered && !isConnected;

      const isAnalysed = node.type === 'stash' && analysedStashesRef.current.has(node.id);
      const isIgnoredTag = node.type === 'tag' && ignoredTagsRef.current.has(node.label);
      if (node.type === 'stash') drawStashNode(ctx, node, !!isHovered, !!isConnected, dimmed, isAnalysed);
      else if (node.type === 'tag') drawTagNode(ctx, node, !!isHovered, !!isConnected, dimmed, isIgnoredTag);
      else drawVersionNode(ctx, node, !!isHovered, !!isConnected, dimmed);

      // Label
      const fontSize = node.type === 'stash' ? Math.max(16, Math.min(20, node.radius * 1.05)) : Math.max(14, Math.min(18, node.radius * 1.15));
      ctx.font = `${isAnalysed ? '600' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = node.y + node.radius + fontSize + 3;

      // Ignored tag labels are always dimmed
      const labelColor = isIgnoredTag ? 'rgba(110, 118, 129, 0.45)' : undefined;

      if (zoom < 0.35) {
        // Very far out: only show hovered or analysed
        if (isHovered || isAnalysed) { ctx.fillStyle = labelColor || (isAnalysed ? '#a5d6ff' : '#e6edf3'); ctx.fillText(node.label, node.x, labelY); }
      } else if (zoom < 0.55) {
        // Medium-far: show hovered, analysed, and stash names
        if (isHovered || isAnalysed || (node.type === 'stash' && !dimmed) || isIgnoredTag) {
          ctx.fillStyle = labelColor || (isAnalysed ? '#a5d6ff' : isHovered ? '#e6edf3' : 'rgba(230, 237, 243, 0.5)');
          const label = node.type === 'stash' && node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label;
          ctx.fillText(label, node.x, labelY);
        }
      } else if (!dimmed || isHovered || isConnected || isAnalysed || isIgnoredTag) {
        ctx.fillStyle = labelColor || (isAnalysed ? '#a5d6ff' : isHovered ? '#e6edf3' : 'rgba(230, 237, 243, 0.7)');
        const label = node.type === 'stash' && node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label;
        ctx.fillText(label, node.x, labelY);
      }
    }

    ctx.restore();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tick = () => {
      const cw = (canvas.width || 800) / devicePixelRatio;
      if (alphaRef.current > 0.001) {
        simulate(nodesRef.current, edgesRef.current, alphaRef.current, false, { min: 0, max: 0 }, cw);
        alphaRef.current *= 0.993;
        if (!autoFitDoneRef.current && alphaRef.current < 0.7) {
          autoFitDoneRef.current = true;
          autoFit();
        }
      }

      // Smooth interpolation toward target zoom/pan
      const lerpSpeed = 0.08;
      if (targetZoomRef.current !== null) {
        const dz = targetZoomRef.current - zoomRef.current;
        if (Math.abs(dz) < 0.001) {
          zoomRef.current = targetZoomRef.current;
          targetZoomRef.current = null;
        } else {
          zoomRef.current += dz * lerpSpeed;
        }
      }
      if (targetPanRef.current !== null) {
        const dx = targetPanRef.current.x - panRef.current.x;
        const dy = targetPanRef.current.y - panRef.current.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          panRef.current.x = targetPanRef.current.x;
          panRef.current.y = targetPanRef.current.y;
          targetPanRef.current = null;
        } else {
          panRef.current.x += dx * lerpSpeed;
          panRef.current.y += dy * lerpSpeed;
        }
      }

      draw();

      // Only continue animation when there is work to do
      const simulationActive = alphaRef.current > 0.001;
      const zoomAnimating = targetZoomRef.current !== null;
      const panAnimating = targetPanRef.current !== null;
      if (simulationActive || zoomAnimating || panAnimating || dragRef.current) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = 0;
      }
    };
    tickRef.current = tick;
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw, autoFit]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const dpr = devicePixelRatio;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      // Cancel smooth animation on user interaction
      targetZoomRef.current = null;
      targetPanRef.current = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      didDragRef.current = false;
      if (node) {
        dragRef.current = { node, offsetX: wx - node.x, offsetY: wy - node.y };
        alphaRef.current = Math.max(alphaRef.current, 0.3);
      } else {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
        setPopup(null);
      }
      kickAnimation();
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (dragRef.current) {
        didDragRef.current = true;
        const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
        dragRef.current.node.x = wx - dragRef.current.offsetX;
        dragRef.current.node.y = wy - dragRef.current.offsetY;
        dragRef.current.node.vx = 0; dragRef.current.node.vy = 0;
        alphaRef.current = Math.max(alphaRef.current, 0.1);
        kickAnimation();
        return;
      }
      if (isPanningRef.current) {
        didDragRef.current = true;
        panRef.current.x = panStartRef.current.panX + (e.clientX - panStartRef.current.x);
        panRef.current.y = panStartRef.current.panY + (e.clientY - panStartRef.current.y);
        kickAnimation();
        return;
      }
      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      if (node !== hoveredRef.current) {
        hoveredRef.current = node;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        setHoveredLabel(node ? node.label : null);
      }
    };

    const onMouseUp = () => { dragRef.current = null; isPanningRef.current = false; };

    const onClick = (e: MouseEvent) => {
      if (didDragRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      if (node) {
        if (node.type === 'stash') {
          setPopup({ node, screenX: e.clientX, screenY: e.clientY, connections: getConnections(node.id) });
        } else if (node.type === 'tag') {
          setPopup({ node, screenX: e.clientX, screenY: e.clientY, connections: getConnections(node.id) });
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Cancel smooth animation on user zoom
      targetZoomRef.current = null;
      targetPanRef.current = null;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(5, zoomRef.current * factor));
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const cx = canvas.width / (2 * devicePixelRatio), cy = canvas.height / (2 * devicePixelRatio);
      const wx = sx - cx - panRef.current.x, wy = sy - cy - panRef.current.y;
      panRef.current.x -= wx * (newZoom / zoomRef.current - 1);
      panRef.current.y -= wy * (newZoom / zoomRef.current - 1);
      zoomRef.current = newZoom;
      kickAnimation();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [screenToWorld, findNodeAt, getConnections, kickAnimation]);

  // Touch events for mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let lastPinchDist = 0;
    let pinchMidpoint = { x: 0, y: 0 };
    let isTouchDragging = false;
    let isTouchPanning = false;
    let isPinching = false;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);

    const onTouchStart = (e: TouchEvent) => {
      targetZoomRef.current = null;
      targetPanRef.current = null;

      if (e.touches.length === 2) {
        e.preventDefault();
        isPinching = true;
        isTouchDragging = false;
        isTouchPanning = false;
        dragRef.current = null;
        lastPinchDist = getTouchDist(e.touches[0], e.touches[1]);
        const rect = canvas.getBoundingClientRect();
        pinchMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const sx = touch.clientX - rect.left;
        const sy = touch.clientY - rect.top;
        const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
        const node = findNodeAt(wx, wy);

        touchStartTime = Date.now();
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        isTouchDragging = false;
        isTouchPanning = false;
        isPinching = false;

        if (node) {
          e.preventDefault();
          dragRef.current = { node, offsetX: wx - node.x, offsetY: wy - node.y };
          alphaRef.current = Math.max(alphaRef.current, 0.3);
          kickAnimation();
        } else {
          panStartRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
          setPopup(null);
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinching = true;
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        if (lastPinchDist > 0) {
          const factor = dist / lastPinchDist;
          const newZoom = Math.max(0.2, Math.min(5, zoomRef.current * factor));
          const cx = canvas.width / (2 * devicePixelRatio);
          const cy = canvas.height / (2 * devicePixelRatio);
          const wx = pinchMidpoint.x - cx - panRef.current.x;
          const wy = pinchMidpoint.y - cy - panRef.current.y;
          panRef.current.x -= wx * (newZoom / zoomRef.current - 1);
          panRef.current.y -= wy * (newZoom / zoomRef.current - 1);
          zoomRef.current = newZoom;
        }
        lastPinchDist = dist;
        const rect = canvas.getBoundingClientRect();
        pinchMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
        kickAnimation();
        return;
      }

      if (e.touches.length === 1 && !isPinching) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const sx = touch.clientX - rect.left;
        const sy = touch.clientY - rect.top;

        if (dragRef.current) {
          e.preventDefault();
          const moveDist = Math.sqrt((touch.clientX - touchStartPos.x) ** 2 + (touch.clientY - touchStartPos.y) ** 2);
          if (moveDist > 8) isTouchDragging = true;
          const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
          dragRef.current.node.x = wx - dragRef.current.offsetX;
          dragRef.current.node.y = wy - dragRef.current.offsetY;
          dragRef.current.node.vx = 0;
          dragRef.current.node.vy = 0;
          alphaRef.current = Math.max(alphaRef.current, 0.1);
          kickAnimation();
          return;
        }

        const dx = touch.clientX - panStartRef.current.x;
        const dy = touch.clientY - panStartRef.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          e.preventDefault();
          isTouchPanning = true;
          panRef.current.x = panStartRef.current.panX + dx;
          panRef.current.y = panStartRef.current.panY + dy;
          kickAnimation();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        lastPinchDist = 0;
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          panStartRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
        }
        return;
      }

      if (dragRef.current) {
        if (!isTouchDragging && Date.now() - touchStartTime < 300) {
          const t = e.changedTouches[0];
          const node = dragRef.current.node;
          if (node.type === 'stash' || node.type === 'tag') {
            setPopup({ node, screenX: t.clientX, screenY: t.clientY, connections: getConnections(node.id) });
          }
        }
        dragRef.current = null;
        isTouchDragging = false;
        return;
      }

      if (!isTouchPanning && Date.now() - touchStartTime < 300) {
        const t = e.changedTouches[0];
        const dist = Math.sqrt((t.clientX - touchStartPos.x) ** 2 + (t.clientY - touchStartPos.y) ** 2);
        if (dist < 10) {
          setPopup(null);
        }
      }

      isTouchPanning = false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [screenToWorld, findNodeAt, getConnections, kickAnimation]);

  // Escape to close popup
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopup(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleReset = () => {
    targetZoomRef.current = null;
    targetPanRef.current = null;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    alphaRef.current = 1;
    autoFitDoneRef.current = false;
    setPopup(null);
    kickAnimation();
  };

  const getPopupStyle = (): React.CSSProperties => {
    if (!popup) return { display: 'none' };
    const container = containerRef.current;
    if (!container) return { display: 'none' };
    const rect = container.getBoundingClientRect();
    const popupWidth = 300;
    let left = popup.screenX - rect.left + 12;
    let top = popup.screenY - rect.top - 20;
    if (left + popupWidth > rect.width) left = left - popupWidth - 24;
    if (left < 8) left = 8;
    if (top + 340 > rect.height) top = rect.height - 348;
    if (top < 8) top = 8;
    return { left, top };
  };

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleAnalyse = (stashId: string) => {
    setAnalysedStashes(prev => {
      const next = new Set(prev);
      if (next.has(stashId)) {
        next.delete(stashId);
      } else {
        next.add(stashId);
      }
      analysedStashesRef.current = next;
      return next;
    });
    setPopup(null);
  };

  const handleClearAnalysis = () => {
    const empty = new Set<string>();
    analysedStashesRef.current = empty;
    setAnalysedStashes(empty);
    const emptyTags = new Set<string>();
    ignoredTagsRef.current = emptyTags;
    setIgnoredTags(emptyTags);
    const emptyTracked = new Set<string>();
    trackedTagsRef.current = emptyTracked;
    setTrackedTags(emptyTracked);
  };

  const handleToggleTrackTag = (tagName: string) => {
    setTrackedTags(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      trackedTagsRef.current = next;
      return next;
    });
  };

  const handleToggleIgnoreTag = (tagName: string) => {
    setIgnoredTags(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      ignoredTagsRef.current = next;
      return next;
    });
  };

  return (
    <>
      <div className="graph-actions" style={{ marginBottom: 12 }}>
        <span className="graph-stats">{nodeCount} nodes · {edgeCount} edges</span>
        <div className="stash-graph-depth-control">
          <label>Tiefe:</label>
          <button
            className="graph-depth-btn"
            onClick={() => setDefaultDepth(d => Math.max(1, d - 1))}
            disabled={defaultDepth <= 1}
            title="Tiefe verringern"
          >-</button>
          <span className="stash-graph-depth-value">{defaultDepth}</span>
          <button
            className="graph-depth-btn"
            onClick={() => setDefaultDepth(d => Math.min(5, d + 1))}
            disabled={defaultDepth >= 5}
            title="Tiefe erhöhen"
          >+</button>
        </div>
        {analysedStashes.size > 0 && (
          <button className="btn graph-reset-btn" onClick={handleClearAnalysis} title="Analyse zurücksetzen">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
            Analyse zurücksetzen ({analysedStashes.size})
          </button>
        )}
        {trackedTags.size > 0 && (
          <span className="graph-ignored-tags-info" style={{ color: 'rgba(35, 134, 54, 0.9)' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.8">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            {trackedTags.size} Tag{trackedTags.size !== 1 ? 's' : ''} verfolgt
          </span>
        )}
        {ignoredTags.size > 0 && (
          <span className="graph-ignored-tags-info">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            {ignoredTags.size} Tag{ignoredTags.size !== 1 ? 's' : ''} ignoriert
          </span>
        )}
        {hoveredLabel && !popup && (
          <span className="graph-hover-info">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            {hoveredLabel}
          </span>
        )}
        <button className="btn graph-reset-btn" onClick={handleReset} title="Reset graph layout and zoom">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.38 8A4.62 4.62 0 0 1 8 3.38a4.63 4.63 0 0 1 3.27 1.35L9.74 6.26h4.51V1.75l-1.49 1.49A6.12 6.12 0 0 0 8 1.88 6.13 6.13 0 0 0 1.88 8Z" />
            <path d="M12.62 8A4.62 4.62 0 0 1 8 12.62a4.63 4.63 0 0 1-3.27-1.35l1.53-1.53H1.75v4.51l1.49-1.49A6.12 6.12 0 0 0 8 14.12 6.13 6.13 0 0 0 14.12 8Z" />
          </svg>
          Reset
        </button>
      </div>
      <div className="graph-canvas-container" ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} className="graph-canvas" style={{ cursor: 'grab', touchAction: 'none' }} />

        {loading && (
          <div className="graph-empty">
            <p>Loading stash graph...</p>
          </div>
        )}

        {!loading && nodeCount === 0 && (
          <div className="graph-empty">
            <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
              <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
            </svg>
            <p>No stashes to visualize. Create stashes to see the graph.</p>
          </div>
        )}

        {/* Legend */}
        {!loading && nodeCount > 0 && (
          <div className="stash-graph-legend">
            <div className="stash-graph-legend-item">
              <span className="stash-graph-legend-rect" style={{ background: COLORS.stash }} />
              <span>Stash</span>
            </div>
            {analysedStashes.size > 0 && (
              <div className="stash-graph-legend-item">
                <span className="stash-graph-legend-circle" style={{ background: COLORS.tag }} />
                <span>Tag</span>
              </div>
            )}
          </div>
        )}

        {/* Popup */}
        {popup && popup.node.type === 'stash' && (
          <div className="graph-node-popup" style={getPopupStyle()} role="dialog">
            <div className="graph-popup-header">
              <div className="graph-popup-tag">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                </svg>
                <strong>{popup.node.label}</strong>
              </div>
              <button className="graph-popup-close" onClick={() => setPopup(null)} title="Close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            <div className="stash-graph-popup-meta">
              {popup.node.file_count !== undefined && (
                <span>{popup.node.file_count} {popup.node.file_count === 1 ? 'file' : 'files'}</span>
              )}
              {popup.node.total_size !== undefined && (
                <span>{formatSize(popup.node.total_size)}</span>
              )}
              {popup.node.version !== undefined && popup.node.version > 1 && (
                <span className="stash-graph-popup-version">v{popup.node.version}</span>
              )}
            </div>

            {popup.node.created_at && (
              <div className="stash-graph-popup-times">
                <div>Created: {new Date(popup.node.created_at).toLocaleString('de-DE')}</div>
                {popup.node.updated_at && popup.node.updated_at !== popup.node.created_at && (
                  <div>Updated: {new Date(popup.node.updated_at).toLocaleString('de-DE')}</div>
                )}
              </div>
            )}

            {popup.node.tags && popup.node.tags.length > 0 && (
              <div className="graph-popup-section">
                <div className="graph-popup-section-title">Tags <span style={{ fontSize: '0.75em', opacity: 0.5 }}>(Klick zum Ignorieren)</span></div>
                <div className="graph-popup-connections">
                  {popup.node.tags.map(t => (
                    <span
                      key={t}
                      className={`graph-popup-conn-tag graph-popup-conn-tag-toggle${ignoredTags.has(t) ? ' graph-popup-conn-tag-ignored' : ''}`}
                      onClick={() => handleToggleIgnoreTag(t)}
                      title={ignoredTags.has(t) ? `Tag "${t}" wieder berücksichtigen` : `Tag "${t}" ignorieren`}
                    >
                      {t}
                      {ignoredTags.has(t) && (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: 4, opacity: 0.6 }}>
                          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                        </svg>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {popup.connections.length > 0 && (
              <div className="graph-popup-section">
                <div className="graph-popup-section-title">Connections</div>
                <div className="graph-popup-connections">
                  {popup.connections.filter(c => c.type === 'shared_tags').map(c => (
                    <span key={c.id} className="graph-popup-conn-tag">
                      {c.label}
                      <span className="graph-popup-conn-weight">{c.weight}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="graph-popup-actions">
              <button className="graph-popup-action-btn graph-popup-action-analyse" onClick={() => handleAnalyse(popup.node.id)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                </svg>
                {analysedStashes.has(popup.node.id) ? 'Analyse beenden' : 'Analyse'}
              </button>
              <button className="graph-popup-action-btn graph-popup-action-filter" onClick={() => { setPopup(null); onSelectStash(popup.node.id); }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z" />
                </svg>
                Open Stash
              </button>
            </div>
          </div>
        )}

        {/* Tag Popup */}
        {popup && popup.node.type === 'tag' && (
          <div className="graph-node-popup" style={getPopupStyle()} role="dialog">
            <div className="graph-popup-header">
              <div className="graph-popup-tag">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                </svg>
                <strong>{popup.node.label}</strong>
              </div>
              <button className="graph-popup-close" onClick={() => setPopup(null)} title="Close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            {popup.node.count !== undefined && (
              <div className="stash-graph-popup-meta">
                <span>{popup.node.count} Stash{popup.node.count !== 1 ? 'es' : ''}</span>
              </div>
            )}

            <div className="graph-popup-actions">
              <button
                className={`graph-popup-action-btn ${ignoredTags.has(popup.node.label) ? 'graph-popup-action-analyse' : 'graph-popup-action-filter'}`}
                onClick={() => { handleToggleIgnoreTag(popup.node.label); setPopup(null); }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  {ignoredTags.has(popup.node.label) ? (
                    <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                  ) : (
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  )}
                </svg>
                {ignoredTags.has(popup.node.label) ? 'Aktivieren' : 'Deaktivieren'}
              </button>
              <button
                className={`graph-popup-action-btn ${trackedTags.has(popup.node.label) ? 'graph-popup-action-filter' : 'graph-popup-action-analyse'}`}
                style={trackedTags.has(popup.node.label) ? { background: 'rgba(35, 134, 54, 0.15)', borderColor: 'rgba(35, 134, 54, 0.4)' } : {}}
                onClick={() => { handleToggleTrackTag(popup.node.label); setPopup(null); }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8.75 1.75a.75.75 0 0 0-1.5 0V5H4a.75.75 0 0 0 0 1.5h3.25v3.25a.75.75 0 0 0 1.5 0V6.5H12A.75.75 0 0 0 12 5H8.75V1.75ZM4 13a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5H4Z" />
                </svg>
                {trackedTags.has(popup.node.label) ? 'Nicht mehr verfolgen' : 'Verfolgen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
