import type { TagGraphResult } from '../../types';

// --- Physics simulation constants (tag graph) --------------------------------
export const ALPHA_DECAY = 0.993; // simulation cool-down per frame
const VELOCITY_DAMPING = 0.55; // fraction of velocity retained after each step
const SPEED_CAP = 12; // max node speed per frame (px)
const GRAVITY_BASE = 0.008; // center-gravity coefficient (degree-scaled)
const CLUSTER_COHESION = 0.015; // pull toward cluster centroid
const REPULSION_FORCE = 40; // ForceAtlas2-style degree-proportional repulsion
const EDGE_IDEAL_DIST_BASE = 80; // base ideal edge length (px), shrinks with weight
const EDGE_ATTRACTION = 0.008; // edge spring coefficient
// -----------------------------------------------------------------------------

export interface GraphNode {
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

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

// 8 distinct cluster colors for dark backgrounds
export const CLUSTER_COLORS = [
  '#238636', // green
  '#58a6ff', // blue
  '#d29922', // orange
  '#bc8cff', // purple
  '#f778ba', // pink
  '#3fb950', // bright green
  '#79c0ff', // light blue
  '#ffa657', // light orange
];

export function getClusterColor(cluster: number, alpha = 1): string {
  const hex = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
  if (alpha === 1) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
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
    const ra = find(a),
      rb = find(b);
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

export function buildGraphFromApi(data: TagGraphResult) {
  const nodes: GraphNode[] = data.nodes.map((t) => ({
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

  const edges: GraphEdge[] = data.edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  assignClusters(nodes, edges);
  computeDegrees(nodes, edges);
  initClusterLayout(nodes);

  return { nodes, edges };
}

export function simulate(nodes: GraphNode[], edges: GraphEdge[], alpha: number) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const multiCluster = new Set(nodes.map((n) => n.cluster)).size > 1;

  // 1. Center gravity — degree-proportional so hubs anchor the layout
  for (const node of nodes) {
    const gravity = GRAVITY_BASE * (1 + node.degree * 0.3) * alpha;
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
    for (const c of centroids.values()) {
      c.x /= c.n;
      c.y /= c.n;
    }

    for (const node of nodes) {
      const c = centroids.get(node.cluster)!;
      node.vx += (c.x - node.x) * CLUSTER_COHESION * alpha;
      node.vy += (c.y - node.y) * CLUSTER_COHESION * alpha;
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
      const force = (clusterBoost * degFactor * REPULSION_FORCE * alpha) / dist;
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

    const idealDist = (EDGE_IDEAL_DIST_BASE + a.radius + b.radius) / (1 + Math.log(edge.weight));
    const force = (dist - idealDist) * EDGE_ATTRACTION * alpha * Math.sqrt(edge.weight);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // 5. Velocity damping + speed cap + position update
  for (const node of nodes) {
    node.vx *= VELOCITY_DAMPING;
    node.vy *= VELOCITY_DAMPING;

    // Prevent overshooting
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > SPEED_CAP) {
      node.vx = (node.vx / speed) * SPEED_CAP;
      node.vy = (node.vy / speed) * SPEED_CAP;
    }

    node.x += node.vx;
    node.y += node.vy;
  }
}
