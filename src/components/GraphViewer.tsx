import { useRef, useEffect, useCallback, useState } from 'react';
import type { StashListItem, TagInfo, TagGraphResult } from '../types';
import { api } from '../api';
import StashGraphCanvas from './StashGraphCanvas';

interface Props {
  stashes: StashListItem[];
  tags: TagInfo[];
  onFilterTag: (tag: string) => void;
  onSelectStash: (id: string) => void;
  onGoHome: () => void;
  analyzeStashId?: string | null;
  onAnalyzeStashConsumed?: () => void;
}

interface GraphNode {
  id: string;
  label: string;
  count: number;
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  cluster: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface PopupState {
  tag: string;
  count: number;
  screenX: number;
  screenY: number;
  connections: { tag: string; weight: number }[];
  stashes: StashListItem[];
  loadingStashes: boolean;
}

// 8 distinct cluster colors for dark backgrounds
const CLUSTER_COLORS = [
  '#238636', // green
  '#58a6ff', // blue
  '#d29922', // orange
  '#bc8cff', // purple
  '#f778ba', // pink
  '#3fb950', // bright green
  '#79c0ff', // light blue
  '#ffa657', // light orange
];

function getClusterColor(cluster: number, alpha = 1): string {
  const hex = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
  if (alpha === 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Simple connected component detection for cluster coloring
function assignClusters(nodes: GraphNode[], edges: GraphEdge[]): void {
  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);

  function find(x: string): string {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) union(e.source, e.target);
  }

  const clusterMap = new Map<string, number>();
  let nextCluster = 0;
  for (const n of nodes) {
    const root = find(n.id);
    if (!clusterMap.has(root)) clusterMap.set(root, nextCluster++);
    n.cluster = clusterMap.get(root)!;
  }
}

function computeDegrees(nodes: GraphNode[], edges: GraphEdge[]): void {
  const degMap = new Map<string, number>();
  for (const n of nodes) degMap.set(n.id, 0);
  for (const e of edges) {
    degMap.set(e.source, (degMap.get(e.source) || 0) + 1);
    degMap.set(e.target, (degMap.get(e.target) || 0) + 1);
  }
  for (const n of nodes) n.degree = degMap.get(n.id) || 0;
}

// Place nodes based on cluster membership for a better starting layout
function initClusterLayout(nodes: GraphNode[]): void {
  const clusters = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    if (!clusters.has(n.cluster)) clusters.set(n.cluster, []);
    clusters.get(n.cluster)!.push(n);
  }

  const clusterIds = [...clusters.keys()];
  const numClusters = clusterIds.length;

  if (numClusters <= 1) {
    // Single cluster: arrange in a circle for even starting positions
    const radius = Math.max(60, nodes.length * 8);
    for (let i = 0; i < nodes.length; i++) {
      const angle = (2 * Math.PI * i) / nodes.length;
      nodes[i].x = Math.cos(angle) * radius;
      nodes[i].y = Math.sin(angle) * radius;
    }
    return;
  }

  // Multiple clusters: place each in a sector around the center
  const clusterSpacing = Math.max(120, numClusters * 60);

  for (let ci = 0; ci < numClusters; ci++) {
    const clusterAngle = (2 * Math.PI * ci) / numClusters;
    const cx = Math.cos(clusterAngle) * clusterSpacing;
    const cy = Math.sin(clusterAngle) * clusterSpacing;

    const clusterNodes = clusters.get(clusterIds[ci])!;
    // Sort by degree: highest-degree node at cluster center
    clusterNodes.sort((a, b) => b.degree - a.degree);

    const innerRadius = Math.max(25, clusterNodes.length * 10);

    if (clusterNodes.length === 1) {
      clusterNodes[0].x = cx;
      clusterNodes[0].y = cy;
    } else {
      // Hub node at center, rest in a ring
      clusterNodes[0].x = cx;
      clusterNodes[0].y = cy;
      for (let ni = 1; ni < clusterNodes.length; ni++) {
        const nodeAngle = (2 * Math.PI * (ni - 1)) / (clusterNodes.length - 1);
        clusterNodes[ni].x = cx + Math.cos(nodeAngle) * innerRadius;
        clusterNodes[ni].y = cy + Math.sin(nodeAngle) * innerRadius;
      }
    }
  }
}

function buildGraph(stashes: StashListItem[], tags: TagInfo[]) {
  const tagMap = new Map(tags.map(t => [t.tag, t.count]));
  const nodes: GraphNode[] = tags.map(t => ({
    id: t.tag,
    label: t.tag,
    count: t.count,
    degree: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: Math.max(6, Math.min(24, 6 + Math.sqrt(t.count) * 4)),
    cluster: 0,
  }));

  const edgeMap = new Map<string, number>();
  for (const stash of stashes) {
    const stashTags = stash.tags.filter(t => tagMap.has(t));
    for (let i = 0; i < stashTags.length; i++) {
      for (let j = i + 1; j < stashTags.length; j++) {
        const key = JSON.stringify([stashTags[i], stashTags[j]].sort());
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      }
    }
  }

  const edges: GraphEdge[] = [];
  for (const [key, weight] of edgeMap) {
    const [source, target] = JSON.parse(key) as [string, string];
    edges.push({ source, target, weight });
  }

  assignClusters(nodes, edges);
  computeDegrees(nodes, edges);
  initClusterLayout(nodes);

  return { nodes, edges };
}

function buildGraphFromApi(data: TagGraphResult) {
  const nodes: GraphNode[] = data.nodes.map(t => ({
    id: t.tag,
    label: t.tag,
    count: t.count,
    degree: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: Math.max(6, Math.min(24, 6 + Math.sqrt(t.count) * 4)),
    cluster: 0,
  }));

  const edges: GraphEdge[] = data.edges.map(e => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  assignClusters(nodes, edges);
  computeDegrees(nodes, edges);
  initClusterLayout(nodes);

  return { nodes, edges };
}

function simulate(nodes: GraphNode[], edges: GraphEdge[], alpha: number) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const multiCluster = new Set(nodes.map(n => n.cluster)).size > 1;

  // 1. Center gravity — degree-proportional so hubs anchor the layout
  for (const node of nodes) {
    const gravity = 0.008 * (1 + node.degree * 0.3) * alpha;
    node.vx -= node.x * gravity;
    node.vy -= node.y * gravity;
  }

  // 2. Cluster cohesion — pull nodes toward their cluster centroid
  if (multiCluster) {
    const centroids = new Map<number, { x: number; y: number; n: number }>();
    for (const node of nodes) {
      const c = centroids.get(node.cluster) || { x: 0, y: 0, n: 0 };
      c.x += node.x;
      c.y += node.y;
      c.n++;
      centroids.set(node.cluster, c);
    }
    for (const c of centroids.values()) { c.x /= c.n; c.y /= c.n; }

    for (const node of nodes) {
      const c = centroids.get(node.cluster)!;
      node.vx += (c.x - node.x) * 0.015 * alpha;
      node.vy += (c.y - node.y) * 0.015 * alpha;
    }
  }

  // 3. Repulsion — ForceAtlas2-inspired: degree-proportional, 1/dist falloff
  //    Cross-cluster pairs get extra repulsion for visual separation
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = a.radius + b.radius + 20;

      const degFactor = (a.degree + 1) * (b.degree + 1);
      const clusterBoost = multiCluster && a.cluster !== b.cluster ? 2.0 : 1.0;
      // 1/dist (not 1/dist²) gives longer-range repulsion → better cluster separation
      const force = clusterBoost * degFactor * 40 * alpha / dist;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;

      // Overlap prevention
      if (dist < minDist) {
        const overlap = (minDist - dist) * 0.5;
        const ox = (dx / dist) * overlap;
        const oy = (dy / dist) * overlap;
        a.x -= ox;
        a.y -= oy;
        b.x += ox;
        b.y += oy;
      }
    }
  }

  // 4. Edge attraction — weight-proportional, ideal distance shrinks with weight
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const idealDist = (80 + a.radius + b.radius) / (1 + Math.log(edge.weight));
    const force = (dist - idealDist) * 0.008 * alpha * Math.sqrt(edge.weight);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // 5. Velocity damping + speed cap + position update
  for (const node of nodes) {
    node.vx *= 0.55;
    node.vy *= 0.55;

    // Prevent overshooting
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > 12) {
      node.vx = (node.vx / speed) * 12;
      node.vy = (node.vy / speed) * 12;
    }

    node.x += node.vx;
    node.y += node.vy;
  }
}

export default function GraphViewer({ stashes, tags, onFilterTag, onSelectStash, onGoHome, analyzeStashId, onAnalyzeStashConsumed }: Props) {
  const [graphTab, setGraphTab] = useState<'tags' | 'stashes'>('stashes');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const alphaRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);
  const isPanningRef = useRef(false);
  const didDragRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hoveredRef = useRef<GraphNode | null>(null);
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [edgeCount, setEdgeCount] = useState(0);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [focusTag, setFocusTag] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(2);
  const hasManyCluster = useRef(false);
  const autoFitDoneRef = useRef(false);
  const targetZoomRef = useRef<number | null>(null);
  const targetPanRef = useRef<{ x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightTag, setHighlightTag] = useState<string | null>(null);
  const highlightTagRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const adjacencyRef = useRef<Set<string> | null>(null);
  const glowThresholdRef = useRef<{ nodeCount: number; value: number } | null>(null);
  const loopRunningRef = useRef(false);
  const startLoopRef = useRef<() => void>(() => {});

  // Rebuild adjacency set for a given node (O(edges) once, then O(1) lookups in draw)
  const rebuildAdjacency = useCallback((nodeId: string | null) => {
    if (!nodeId) { adjacencyRef.current = null; return; }
    const set = new Set<string>();
    for (const e of edgesRef.current) {
      if (e.source === nodeId) set.add(e.target);
      else if (e.target === nodeId) set.add(e.source);
    }
    adjacencyRef.current = set;
  }, []);

  // Sync highlight ref for draw loop
  highlightTagRef.current = highlightTag;
  // Rebuild adjacency when highlight changes (and no hover active)
  if (!hoveredRef.current) {
    rebuildAdjacency(highlightTag);
  }

  // Filtered tags for search dropdown
  const searchResults = searchQuery.length > 0
    ? tags.filter(t => t.tag.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  // Auto-fit: compute zoom/pan to show all nodes within the viewport (smooth)
  const autoFit = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = nodesRef.current;
    if (!canvas || nodes.length === 0) return;

    const dpr = devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w <= 0 || h <= 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const pad = node.radius + 25;
      minX = Math.min(minX, node.x - pad);
      maxX = Math.max(maxX, node.x + pad);
      minY = Math.min(minY, node.y - pad);
      maxY = Math.max(maxY, node.y + pad);
    }

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    if (graphW <= 0 || graphH <= 0) return;

    const padding = 60;
    const zoom = Math.max(0.2, Math.min(
      (w - padding * 2) / graphW,
      (h - padding * 2) / graphH,
      1.5
    ));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    targetZoomRef.current = zoom;
    targetPanRef.current = { x: -cx * zoom, y: -cy * zoom };
    startLoopRef.current();
  }, []);

  // Compute top 20% threshold for glow effect (cached until node count changes)
  const getGlowThreshold = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length < 5) return Infinity;
    const cached = glowThresholdRef.current;
    if (cached && cached.nodeCount === nodes.length) return cached.value;
    const counts = nodes.map(n => n.count).sort((a, b) => b - a);
    const value = counts[Math.floor(counts.length * 0.2)] || counts[0];
    glowThresholdRef.current = { nodeCount: nodes.length, value };
    return value;
  }, []);

  // Build graph data
  useEffect(() => {
    if (focusTag) return; // Focus mode handles its own graph
    const { nodes, edges } = buildGraph(stashes, tags);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setEdgeCount(edges.length);
    hasManyCluster.current = new Set(nodes.map(n => n.cluster)).size > 1;
    glowThresholdRef.current = null;
    alphaRef.current = 1;
    autoFitDoneRef.current = false;
    startLoop();
  }, [stashes, tags, focusTag, graphTab]);

  // Focus mode: fetch subgraph from server
  useEffect(() => {
    if (!focusTag) return;
    let cancelled = false;
    api.getTagGraph({ tag: focusTag, depth: focusDepth }).then(data => {
      if (cancelled) return;
      const { nodes, edges } = buildGraphFromApi(data);
      nodesRef.current = nodes;
      edgesRef.current = edges;
      setEdgeCount(edges.length);
      hasManyCluster.current = new Set(nodes.map(n => n.cluster)).size > 1;
      glowThresholdRef.current = null;
      alphaRef.current = 1;
      autoFitDoneRef.current = false;
      startLoop();
    }).catch(err => {
      console.error('Failed to load focus graph:', err);
    });
    return () => { cancelled = true; };
  }, [focusTag, focusDepth]);

  const screenToWorld = useCallback((sx: number, sy: number, canvas: HTMLCanvasElement) => {
    const cx = canvas.width / (2 * devicePixelRatio);
    const cy = canvas.height / (2 * devicePixelRatio);
    return {
      x: (sx - cx - panRef.current.x) / zoomRef.current,
      y: (sy - cy - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (dx * dx + dy * dy <= (node.radius + 4) * (node.radius + 4)) {
        return node;
      }
    }
    return null;
  }, []);

  // Drawing
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + panRef.current.x, h / 2 + panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const hovered = hoveredRef.current;
    const highlighted = highlightTagRef.current ? nodeMap.get(highlightTagRef.current) || null : null;
    // Active node: hover takes priority over persistent highlight
    const activeNode = hovered || highlighted;
    const zoom = zoomRef.current;
    const glowThreshold = getGlowThreshold();
    const useClusterColors = hasManyCluster.current;

    // Draw edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const isActive = activeNode && (activeNode.id === edge.source || activeNode.id === edge.target);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      // Dashed for weak connections
      if (edge.weight <= 2 && !isActive) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      const baseOpacity = Math.min(0.3 + edge.weight * 0.15, 0.8);
      ctx.strokeStyle = isActive
        ? 'rgba(88, 166, 255, 0.6)'
        : `rgba(88, 166, 255, ${baseOpacity * 0.5})`;
      ctx.lineWidth = Math.min(1 + edge.weight * 0.8, 5) * (isActive ? 1.5 : 1);
      ctx.stroke();
      ctx.setLineDash([]);

      // Edge weight labels at high zoom
      if (zoom > 1.5 && edge.weight > 1) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.font = '500 9px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isActive ? 'rgba(88, 166, 255, 0.9)' : 'rgba(150, 160, 175, 0.6)';
        ctx.fillText(String(edge.weight), mx, my);
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const isHovered = hovered && hovered.id === node.id;
      const isHighlighted = highlighted && highlighted.id === node.id;
      const isFocusNode = isHovered || isHighlighted;
      const isConnected = activeNode && adjacencyRef.current?.has(node.id);

      const baseColor = useClusterColors
        ? CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length]
        : '#238636';

      // Pulsing ring for highlighted (located) node
      if (isHighlighted && !isHovered) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(88, 166, 255, ${0.3 + pulse * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Glow for high-count nodes
      if (node.count >= glowThreshold) {
        const gradient = ctx.createRadialGradient(
          node.x, node.y, node.radius,
          node.x, node.y, node.radius * 2.2
        );
        const glowColor = isFocusNode ? '#58a6ff' : baseColor;
        const gr = parseInt(glowColor.slice(1, 3), 16);
        const gg = parseInt(glowColor.slice(3, 5), 16);
        const gb = parseInt(glowColor.slice(5, 7), 16);
        gradient.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0.3)`);
        gradient.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

      if (isFocusNode) {
        ctx.fillStyle = '#58a6ff';
      } else if (isConnected) {
        ctx.fillStyle = getClusterColor(node.cluster, 0.7);
      } else if (activeNode) {
        ctx.fillStyle = getClusterColor(node.cluster, 0.2);
      } else {
        ctx.fillStyle = baseColor;
      }
      ctx.fill();

      // Node border
      ctx.strokeStyle = isFocusNode ? '#79c0ff' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = isFocusNode ? 2 : 1;
      ctx.stroke();

      // Count badge inside node (when big enough)
      if (node.radius >= 10) {
        const badgeFontSize = Math.max(8, Math.min(12, node.radius * 0.7));
        ctx.font = `700 ${badgeFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(String(node.count), node.x, node.y);
      }

      // Label below node
      const fontSize = Math.max(15, Math.min(19, node.radius * 1.1));
      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = node.y + node.radius + fontSize + 2;

      // Zoom-dependent label visibility
      if (zoom < 0.7) {
        // Low zoom: only active/highlighted label
        if (isFocusNode) {
          ctx.fillStyle = '#e6edf3';
          ctx.fillText(node.label, node.x, labelY);
        }
      } else if (zoom > 1.5) {
        // High zoom: label with count
        if (isFocusNode || isConnected || !activeNode) {
          ctx.fillStyle = isFocusNode ? '#e6edf3' : 'rgba(230, 237, 243, 0.7)';
          ctx.fillText(`${node.label} (${node.count})`, node.x, labelY);
        }
      } else {
        // Normal zoom: label only
        if (isFocusNode || isConnected || !activeNode) {
          ctx.fillStyle = isFocusNode ? '#e6edf3' : 'rgba(230, 237, 243, 0.7)';
          ctx.fillText(node.label, node.x, labelY);
        }
      }
    }

    ctx.restore();
  }, [getGlowThreshold]);

  // Start/restart the animation loop (idempotent — safe to call if already running)
  const startLoop = useCallback(() => {
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;

    const tick = () => {
      let needsFrame = false;

      if (alphaRef.current > 0.001) {
        simulate(nodesRef.current, edgesRef.current, alphaRef.current);
        alphaRef.current *= 0.993;
        needsFrame = true;

        // Auto-fit once layout has partially settled (~0.85s at 60fps)
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
          needsFrame = true;
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
          needsFrame = true;
        }
      }

      // Highlighted node has pulsing animation
      if (highlightTagRef.current) needsFrame = true;

      draw();

      if (needsFrame) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        loopRunningRef.current = false;
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [draw, autoFit]);

  startLoopRef.current = startLoop;

  // Start animation loop on mount and when dependencies change
  useEffect(() => {
    startLoop();
    return () => {
      cancelAnimationFrame(animRef.current);
      loopRunningRef.current = false;
    };
  }, [startLoop, graphTab]);

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
      startLoopRef.current();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [graphTab]);

  // Get connections for a node
  const getConnections = useCallback((nodeId: string): { tag: string; weight: number }[] => {
    const conns: { tag: string; weight: number }[] = [];
    for (const edge of edgesRef.current) {
      if (edge.source === nodeId) conns.push({ tag: edge.target, weight: edge.weight });
      else if (edge.target === nodeId) conns.push({ tag: edge.source, weight: edge.weight });
    }
    return conns.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, []);

  // Show popup for a node
  const showPopup = useCallback((node: GraphNode, screenX: number, screenY: number) => {
    const connections = getConnections(node.id);
    setPopup({
      tag: node.id,
      count: node.count,
      screenX,
      screenY,
      connections,
      stashes: [],
      loadingStashes: true,
    });

    // Fetch stashes with this tag
    api.listStashes({ tag: node.id, limit: 3 }).then(res => {
      setPopup(prev => prev && prev.tag === node.id
        ? { ...prev, stashes: res.stashes, loadingStashes: false }
        : prev
      );
    }).catch(() => {
      setPopup(prev => prev && prev.tag === node.id
        ? { ...prev, loadingStashes: false }
        : prev
      );
    });
  }, [getConnections]);

  // Close popup
  const closePopup = useCallback(() => setPopup(null), []);

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      // Cancel smooth animation on user interaction
      targetZoomRef.current = null;
      targetPanRef.current = null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      didDragRef.current = false;

      if (node) {
        dragRef.current = { node, offsetX: wx - node.x, offsetY: wy - node.y };
        alphaRef.current = Math.max(alphaRef.current, 0.3);
        startLoopRef.current();
      } else {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
        // Close popup and clear highlight when clicking empty canvas
        closePopup();
        setHighlightTag(null);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragRef.current) {
        didDragRef.current = true;
        const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
        dragRef.current.node.x = wx - dragRef.current.offsetX;
        dragRef.current.node.y = wy - dragRef.current.offsetY;
        dragRef.current.node.vx = 0;
        dragRef.current.node.vy = 0;
        alphaRef.current = Math.max(alphaRef.current, 0.1);
        startLoopRef.current();
        return;
      }

      if (isPanningRef.current) {
        didDragRef.current = true;
        panRef.current.x = panStartRef.current.panX + (e.clientX - panStartRef.current.x);
        panRef.current.y = panStartRef.current.panY + (e.clientY - panStartRef.current.y);
        startLoopRef.current();
        return;
      }

      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      if (node !== hoveredRef.current) {
        hoveredRef.current = node;
        rebuildAdjacency(node?.id ?? highlightTagRef.current);
        canvas.style.cursor = node ? 'pointer' : 'grab';
        setHoveredTag(node ? node.label : null);
        startLoopRef.current();
      }
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
      }
      isPanningRef.current = false;
    };

    const onClick = (e: MouseEvent) => {
      if (didDragRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(wx, wy);
      if (node) {
        showPopup(node, e.clientX, e.clientY);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Cancel smooth animation on user zoom
      targetZoomRef.current = null;
      targetPanRef.current = null;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(5, zoomRef.current * factor));

      // Zoom toward cursor
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cx = canvas.width / (2 * devicePixelRatio);
      const cy = canvas.height / (2 * devicePixelRatio);

      const wx = sx - cx - panRef.current.x;
      const wy = sy - cy - panRef.current.y;
      panRef.current.x -= wx * (newZoom / zoomRef.current - 1);
      panRef.current.y -= wy * (newZoom / zoomRef.current - 1);

      zoomRef.current = newZoom;
      startLoopRef.current();
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
  }, [screenToWorld, findNodeAt, showPopup, closePopup, graphTab]);

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
        // Pinch start
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
          startLoopRef.current();
        } else {
          panStartRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
          closePopup();
          setHighlightTag(null);
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
          startLoopRef.current();
        }
        lastPinchDist = dist;
        const rect = canvas.getBoundingClientRect();
        pinchMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
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
          startLoopRef.current();
          return;
        }

        // Pan
        const dx = touch.clientX - panStartRef.current.x;
        const dy = touch.clientY - panStartRef.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          e.preventDefault();
          isTouchPanning = true;
          panRef.current.x = panStartRef.current.panX + dx;
          panRef.current.y = panStartRef.current.panY + dy;
          startLoopRef.current();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinching && e.touches.length < 2) {
        isPinching = false;
        lastPinchDist = 0;
        // Recapture single remaining touch as new pan start
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          panStartRef.current = { x: touch.clientX, y: touch.clientY, panX: panRef.current.x, panY: panRef.current.y };
        }
        return;
      }

      if (dragRef.current) {
        // Tap on node (no drag movement) → show popup
        if (!isTouchDragging && Date.now() - touchStartTime < 300) {
          const t = e.changedTouches[0];
          showPopup(dragRef.current.node, t.clientX, t.clientY);
        }
        dragRef.current = null;
        isTouchDragging = false;
        return;
      }

      // Tap on empty space (no pan movement)
      if (!isTouchPanning && Date.now() - touchStartTime < 300) {
        const t = e.changedTouches[0];
        const dist = Math.sqrt((t.clientX - touchStartPos.x) ** 2 + (t.clientY - touchStartPos.y) ** 2);
        if (dist < 10) {
          closePopup();
          setHighlightTag(null);
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
  }, [screenToWorld, findNodeAt, showPopup, closePopup, graphTab]);

  // Close popup on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopup();
        setHighlightTag(null);
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePopup]);

  const handleResetView = () => {
    targetZoomRef.current = null;
    targetPanRef.current = null;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    alphaRef.current = 1;
    autoFitDoneRef.current = false;
    glowThresholdRef.current = null;
    setPopup(null);
    setHighlightTag(null);
    setSearchQuery('');
    setSearchOpen(false);
    if (focusTag) {
      setFocusTag(null);
    } else {
      const { nodes, edges } = buildGraph(stashes, tags);
      nodesRef.current = nodes;
      edgesRef.current = edges;
      setEdgeCount(edges.length);
      hasManyCluster.current = new Set(nodes.map(n => n.cluster)).size > 1;
    }
    startLoopRef.current();
  };

  const handleFocusTag = (tag: string) => {
    setPopup(null);
    setHighlightTag(null);
    targetZoomRef.current = null;
    targetPanRef.current = null;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    setFocusTag(tag);
  };

  const handleClearFocus = () => {
    setFocusTag(null);
    targetZoomRef.current = null;
    targetPanRef.current = null;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    alphaRef.current = 1;
    autoFitDoneRef.current = false;
    startLoopRef.current();
  };

  const handleDepthChange = (delta: number) => {
    setFocusDepth(prev => Math.max(1, Math.min(4, prev + delta)));
  };

  // Locate: pan to a tag and highlight it
  const handleLocateTag = (tagId: string) => {
    const node = nodesRef.current.find(n => n.id === tagId);
    if (!node) return;

    // Zoom in if too far out
    if (zoomRef.current < 0.8) zoomRef.current = 0.8;

    // Pan to center on the node
    panRef.current.x = -node.x * zoomRef.current;
    panRef.current.y = -node.y * zoomRef.current;

    setHighlightTag(tagId);
    setSearchQuery('');
    setSearchOpen(false);
    setPopup(null);
    startLoopRef.current();
  };

  // Clear highlight
  const clearHighlight = () => {
    setHighlightTag(null);
    startLoopRef.current();
  };

  // Compute popup position clamped to viewport
  const getPopupStyle = (): React.CSSProperties => {
    if (!popup) return { display: 'none' };
    const container = containerRef.current;
    if (!container) return { display: 'none' };

    const rect = container.getBoundingClientRect();
    const popupWidth = 280;
    const popupMaxHeight = 340;

    let left = popup.screenX - rect.left + 12;
    let top = popup.screenY - rect.top - 20;

    // Clamp to container
    if (left + popupWidth > rect.width) left = left - popupWidth - 24;
    if (left < 8) left = 8;
    if (top + popupMaxHeight > rect.height) top = rect.height - popupMaxHeight - 8;
    if (top < 8) top = 8;

    return { left, top };
  };

  const nodeCount = focusTag
    ? nodesRef.current.length
    : tags.length;

  const isStashTab = graphTab === 'stashes';

  const tabSwitcher = (
    <div className="graph-tab-switcher">
      <button className={`graph-tab-btn ${isStashTab ? 'active' : ''}`} onClick={() => setGraphTab('stashes')}>Stashes</button>
      <button className={`graph-tab-btn ${!isStashTab ? 'active' : ''}`} onClick={() => setGraphTab('tags')}>Tags</button>
    </div>
  );

  if (isStashTab) {
    return (
      <div className="graph-viewer">
        <div className="graph-header">
          <div className="graph-title">
            <button className="graph-back-btn" onClick={onGoHome} title="Back to dashboard">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
              </svg>
            </button>
            {tabSwitcher}
          </div>
        </div>
        <StashGraphCanvas onSelectStash={onSelectStash} analyzeStashId={analyzeStashId} onAnalyzeStashConsumed={onAnalyzeStashConsumed} />
      </div>
    );
  }

  return (
    <div className="graph-viewer">
      <div className="graph-header">
        <div className="graph-title">
          <button className="graph-back-btn" onClick={onGoHome} title="Back to dashboard">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z" />
            </svg>
          </button>
          {tabSwitcher}
          <span className="graph-stats">{nodeCount} tags · {edgeCount} connections</span>
        </div>
        <div className="graph-actions">
          {focusTag && (
            <div className="graph-focus-indicator">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
              </svg>
              <span>{focusTag}</span>
              <span className="graph-focus-depth">
                <button
                  className="graph-depth-btn"
                  onClick={() => handleDepthChange(-1)}
                  disabled={focusDepth <= 1}
                  title="Decrease depth"
                >-</button>
                <span>depth {focusDepth}</span>
                <button
                  className="graph-depth-btn"
                  onClick={() => handleDepthChange(1)}
                  disabled={focusDepth >= 4}
                  title="Increase depth"
                >+</button>
              </span>
              <button className="graph-focus-clear" onClick={handleClearFocus} title="Clear focus">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
          )}
          {highlightTag && !focusTag && (
            <div className="graph-highlight-indicator">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
              </svg>
              <span>{highlightTag}</span>
              <button className="graph-highlight-focus" onClick={() => handleFocusTag(highlightTag)} title="Focus on this tag">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                </svg>
                Focus
              </button>
              <button className="graph-highlight-clear" onClick={clearHighlight} title="Clear highlight">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
          )}
          {hoveredTag && !popup && !highlightTag && (
            <span className="graph-hover-info">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
              {hoveredTag}
            </span>
          )}
          <div className="graph-search-wrapper">
            <div className="graph-search-box">
              <svg className="graph-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="graph-search-input"
                placeholder="Search tags..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => { setTimeout(() => setSearchOpen(false), 150); }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchOpen(false);
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  } else if (e.key === 'Enter' && searchResults.length > 0) {
                    const tag = searchResults[0].tag;
                    const inGraph = nodesRef.current.some(n => n.id === tag);
                    if (inGraph) {
                      handleLocateTag(tag);
                    } else {
                      handleFocusTag(tag);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  className="graph-search-clear"
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                  title="Clear search"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              )}
            </div>
            {searchOpen && searchQuery && (
              <div className="graph-search-dropdown">
                {searchResults.length > 0 ? searchResults.map(t => {
                  const inGraph = nodesRef.current.some(n => n.id === t.tag);
                  return (
                    <div key={t.tag} className="graph-search-result">
                      <button
                        className="graph-search-result-locate"
                        onClick={() => inGraph ? handleLocateTag(t.tag) : handleFocusTag(t.tag)}
                        title={inGraph ? 'Locate in graph' : 'Not in current view — click to focus'}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                        </svg>
                        <span className="graph-search-result-name">{t.tag}</span>
                        <span className="graph-search-result-count">{t.count}</span>
                        {!inGraph && <span className="graph-search-result-badge">not in view</span>}
                      </button>
                      <button
                        className="graph-search-result-focus"
                        onClick={() => handleFocusTag(t.tag)}
                        title="Focus graph on this tag"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                        </svg>
                      </button>
                    </div>
                  );
                }) : (
                  <div className="graph-search-empty">No tags found</div>
                )}
              </div>
            )}
          </div>
          <button className="btn graph-reset-btn" onClick={handleResetView} title="Reset graph layout and zoom">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.38 8A4.62 4.62 0 0 1 8 3.38a4.63 4.63 0 0 1 3.27 1.35L9.74 6.26h4.51V1.75l-1.49 1.49A6.12 6.12 0 0 0 8 1.88 6.13 6.13 0 0 0 1.88 8Z" />
              <path d="M12.62 8A4.62 4.62 0 0 1 8 12.62a4.63 4.63 0 0 1-3.27-1.35l1.53-1.53H1.75v4.51l1.49-1.49A6.12 6.12 0 0 0 8 14.12 6.13 6.13 0 0 0 14.12 8Z" />
            </svg>
            Reset
          </button>
        </div>
      </div>
      <div className="graph-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="graph-canvas" style={{ cursor: 'grab', touchAction: 'none' }} />
        {tags.length === 0 && !focusTag && (
          <div className="graph-empty">
            <svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
              <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            <p>No tags to visualize. Add tags to your stashes to see the graph.</p>
          </div>
        )}

        {/* Node click popup */}
        {popup && (
          <div className="graph-node-popup" style={getPopupStyle()} role="dialog" aria-label={`Tag: ${popup.tag}`}>
            <div className="graph-popup-header">
              <div className="graph-popup-tag">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
                </svg>
                <strong>{popup.tag}</strong>
              </div>
              <button className="graph-popup-close" onClick={closePopup} title="Close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
            <div className="graph-popup-count">Used in {popup.count} {popup.count === 1 ? 'stash' : 'stashes'}</div>

            {popup.connections.length > 0 && (
              <div className="graph-popup-section">
                <div className="graph-popup-section-title">Connected Tags</div>
                <div className="graph-popup-connections">
                  {popup.connections.map(c => (
                    <span key={c.tag} className="graph-popup-conn-tag">
                      {c.tag}
                      <span className="graph-popup-conn-weight">{c.weight}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="graph-popup-section">
              <div className="graph-popup-section-title">Stashes</div>
              {popup.loadingStashes ? (
                <div className="graph-popup-loading">Loading...</div>
              ) : popup.stashes.length > 0 ? (
                <div className="graph-popup-stashes">
                  {popup.stashes.map(s => (
                    <button
                      key={s.id}
                      className="graph-popup-stash"
                      onClick={() => { closePopup(); onSelectStash(s.id); }}
                    >
                      <span className="graph-popup-stash-name">{s.name || 'Untitled'}</span>
                      <span className="graph-popup-stash-meta">
                        {s.files.length} {s.files.length === 1 ? 'file' : 'files'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="graph-popup-loading">No stashes found</div>
              )}
            </div>

            <div className="graph-popup-actions">
              <button className="graph-popup-action-btn graph-popup-action-filter" onClick={() => { closePopup(); onFilterTag(popup.tag); }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M.75 3h14.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
                </svg>
                Filter Dashboard
              </button>
              <button className="graph-popup-action-btn graph-popup-action-focus" onClick={() => handleFocusTag(popup.tag)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
                </svg>
                Focus Graph
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
