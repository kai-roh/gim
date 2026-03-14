"use client";

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import type { ResolvedMassNode, SpatialMassGraph } from "@gim/core";
import { useGraph } from "@/lib/graph-context";
import { massColor } from "@/lib/graph-colors";

const ORTHO_VIEW_HEIGHT = 92;
const CAMERA_OFFSET = new THREE.Vector3(60, 68, 60);
const SUBTRACTABLE_PRIMITIVES = new Set(["block", "bar", "plate", "tower", "bridge"]);
const BOUNDS_EPSILON = 0.05;

type LocalBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type NodeRenderBundle = {
  solidGroup?: THREE.Group;
  solidMeshes: THREE.Mesh[];
  overlayGroup?: THREE.Group;
  overlayLines: THREE.LineSegments[];
};

type BuiltMassScene = {
  massGroup: THREE.Group;
  overlayGroup: THREE.Group;
  bundles: Map<string, NodeRenderBundle>;
  interactables: THREE.Object3D[];
};

type VoidCut = {
  nodeId: string;
  bounds: LocalBounds;
};

type VoidOverlayRecord = {
  hostNode: ResolvedMassNode;
  bounds: LocalBounds[];
};

function createGeometry(node: ResolvedMassNode): THREE.BufferGeometry {
  const { width, depth, height } = node.dimensions;

  switch (node.primitive) {
    case "cylinder":
      return new THREE.CylinderGeometry(width * 0.5, width * 0.5, height, 28);
    case "bridge":
      return new THREE.BoxGeometry(width, Math.max(height, 2.4), Math.max(depth, 3.5));
    case "tower":
      return new THREE.BoxGeometry(width, height, depth);
    case "ring":
      return new THREE.TorusGeometry(
        Math.max(width, depth) * 0.34,
        Math.max(Math.min(width, depth) * 0.12, 1.4),
        18,
        36
      );
    case "plate":
      return new THREE.BoxGeometry(width, Math.max(height, 1.8), depth);
    case "bar":
      return new THREE.BoxGeometry(width, height, depth);
    default:
      return new THREE.BoxGeometry(width, height, depth);
  }
}

function createSolidMaterial(node: ResolvedMassNode): THREE.MeshStandardMaterial {
  const color = new THREE.Color(massColor(node.node_id));
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: node.shell.opacity,
    roughness: node.shell.skin === "opaque" ? 0.64 : 0.42,
    metalness: node.kind === "core" ? 0.18 : 0.08,
    emissive: color.clone().multiplyScalar(node.boolean_operations.length > 0 ? 0.2 : 0.14),
  });
}

function createSolidMesh(
  node: ResolvedMassNode,
  geometry: THREE.BufferGeometry,
  offset?: { x: number; y: number; z: number }
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createSolidMaterial(node));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(offset?.x ?? 0, offset?.y ?? 0, offset?.z ?? 0);
  mesh.userData.nodeId = node.node_id;
  mesh.name = node.node_id;
  return mesh;
}

function createWireframeMaterial(nodeId: string, opacity = 0.94) {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(massColor(nodeId)),
    transparent: true,
    opacity,
    depthTest: false,
  });
}

function applyNodeTransform(group: THREE.Group, node: ResolvedMassNode) {
  group.position.set(node.transform.x, node.transform.y, node.transform.z);
  group.rotation.set(
    node.transform.rotation_x,
    node.transform.rotation_y,
    node.transform.rotation_z
  );
  group.userData.nodeId = node.node_id;
  group.name = node.node_id;
}

function nodeBounds(node: ResolvedMassNode): LocalBounds {
  return {
    minX: -node.dimensions.width / 2,
    maxX: node.dimensions.width / 2,
    minY: -node.dimensions.height / 2,
    maxY: node.dimensions.height / 2,
    minZ: -node.dimensions.depth / 2,
    maxZ: node.dimensions.depth / 2,
  };
}

function boundsSize(bounds: LocalBounds) {
  return {
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    depth: bounds.maxZ - bounds.minZ,
  };
}

function boundsCenter(bounds: LocalBounds) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

function buildNodeMatrix(node: ResolvedMassNode) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      node.transform.rotation_x,
      node.transform.rotation_y,
      node.transform.rotation_z
    )
  );
  matrix.compose(
    new THREE.Vector3(node.transform.x, node.transform.y, node.transform.z),
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );
  return matrix;
}

function boundsCorners(bounds: LocalBounds) {
  return [
    new THREE.Vector3(bounds.minX, bounds.minY, bounds.minZ),
    new THREE.Vector3(bounds.minX, bounds.minY, bounds.maxZ),
    new THREE.Vector3(bounds.minX, bounds.maxY, bounds.minZ),
    new THREE.Vector3(bounds.minX, bounds.maxY, bounds.maxZ),
    new THREE.Vector3(bounds.maxX, bounds.minY, bounds.minZ),
    new THREE.Vector3(bounds.maxX, bounds.minY, bounds.maxZ),
    new THREE.Vector3(bounds.maxX, bounds.maxY, bounds.minZ),
    new THREE.Vector3(bounds.maxX, bounds.maxY, bounds.maxZ),
  ];
}

function intersectBounds(a: LocalBounds, b: LocalBounds): LocalBounds | null {
  const intersection = {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minY: Math.max(a.minY, b.minY),
    maxY: Math.min(a.maxY, b.maxY),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };

  if (
    intersection.maxX - intersection.minX <= BOUNDS_EPSILON ||
    intersection.maxY - intersection.minY <= BOUNDS_EPSILON ||
    intersection.maxZ - intersection.minZ <= BOUNDS_EPSILON
  ) {
    return null;
  }

  return intersection;
}

function subtractBounds(host: LocalBounds, cut: LocalBounds): LocalBounds[] {
  const intersection = intersectBounds(host, cut);
  if (!intersection) return [host];

  const fragments: LocalBounds[] = [];

  if (intersection.minX - host.minX > BOUNDS_EPSILON) {
    fragments.push({
      minX: host.minX,
      maxX: intersection.minX,
      minY: host.minY,
      maxY: host.maxY,
      minZ: host.minZ,
      maxZ: host.maxZ,
    });
  }

  if (host.maxX - intersection.maxX > BOUNDS_EPSILON) {
    fragments.push({
      minX: intersection.maxX,
      maxX: host.maxX,
      minY: host.minY,
      maxY: host.maxY,
      minZ: host.minZ,
      maxZ: host.maxZ,
    });
  }

  if (intersection.minY - host.minY > BOUNDS_EPSILON) {
    fragments.push({
      minX: intersection.minX,
      maxX: intersection.maxX,
      minY: host.minY,
      maxY: intersection.minY,
      minZ: host.minZ,
      maxZ: host.maxZ,
    });
  }

  if (host.maxY - intersection.maxY > BOUNDS_EPSILON) {
    fragments.push({
      minX: intersection.minX,
      maxX: intersection.maxX,
      minY: intersection.maxY,
      maxY: host.maxY,
      minZ: host.minZ,
      maxZ: host.maxZ,
    });
  }

  if (intersection.minZ - host.minZ > BOUNDS_EPSILON) {
    fragments.push({
      minX: intersection.minX,
      maxX: intersection.maxX,
      minY: intersection.minY,
      maxY: intersection.maxY,
      minZ: host.minZ,
      maxZ: intersection.minZ,
    });
  }

  if (host.maxZ - intersection.maxZ > BOUNDS_EPSILON) {
    fragments.push({
      minX: intersection.minX,
      maxX: intersection.maxX,
      minY: intersection.minY,
      maxY: intersection.maxY,
      minZ: intersection.maxZ,
      maxZ: host.maxZ,
    });
  }

  return fragments;
}

function subtractCutsFromBounds(host: LocalBounds, cuts: VoidCut[]) {
  let fragments = [host];
  const overlaps = new Map<string, LocalBounds[]>();

  for (const cut of cuts) {
    const nextFragments: LocalBounds[] = [];
    for (const fragment of fragments) {
      const overlap = intersectBounds(fragment, cut.bounds);
      if (overlap) {
        const current = overlaps.get(cut.nodeId) ?? [];
        current.push(overlap);
        overlaps.set(cut.nodeId, current);
      }
      nextFragments.push(...subtractBounds(fragment, cut.bounds));
    }
    fragments = nextFragments;
  }

  return { fragments, overlaps };
}

function targetBoundsInHostLocal(
  hostNode: ResolvedMassNode,
  targetNode: ResolvedMassNode
): LocalBounds | null {
  const hostMatrixInverse = buildNodeMatrix(hostNode).invert();
  const targetMatrix = buildNodeMatrix(targetNode);
  const hostBounds = nodeBounds(hostNode);
  const points = boundsCorners(nodeBounds(targetNode)).map((point) =>
    point.clone().applyMatrix4(targetMatrix).applyMatrix4(hostMatrixInverse)
  );

  const targetBounds = points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
      minZ: Math.min(acc.minZ, point.z),
      maxZ: Math.max(acc.maxZ, point.z),
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    }
  );

  return intersectBounds(hostBounds, targetBounds);
}

function buildBoundsMesh(node: ResolvedMassNode, bounds: LocalBounds) {
  const size = boundsSize(bounds);
  const center = boundsCenter(bounds);
  const geometry = new THREE.BoxGeometry(size.width, size.height, size.depth);
  return createSolidMesh(node, geometry, center);
}

function buildBoundsWireframe(
  nodeId: string,
  bounds: LocalBounds,
  opacity = 0.94
): THREE.LineSegments {
  const size = boundsSize(bounds);
  const center = boundsCenter(bounds);
  const base = new THREE.BoxGeometry(size.width, size.height, size.depth);
  const geometry = new THREE.EdgesGeometry(base);
  base.dispose();
  const lines = new THREE.LineSegments(geometry, createWireframeMaterial(nodeId, opacity));
  lines.position.set(center.x, center.y, center.z);
  lines.userData.nodeId = nodeId;
  lines.renderOrder = 12;
  return lines;
}

function buildDirectWireframe(node: ResolvedMassNode): THREE.LineSegments {
  const geometry = createGeometry(node);
  const edges = new THREE.EdgesGeometry(geometry);
  geometry.dispose();
  const lines = new THREE.LineSegments(edges, createWireframeMaterial(node.node_id, 0.94));
  lines.userData.nodeId = node.node_id;
  lines.renderOrder = 12;
  return lines;
}

function ensureBundle(
  bundles: Map<string, NodeRenderBundle>,
  nodeId: string
): NodeRenderBundle {
  const existing = bundles.get(nodeId);
  if (existing) return existing;
  const bundle: NodeRenderBundle = {
    solidMeshes: [],
    overlayLines: [],
  };
  bundles.set(nodeId, bundle);
  return bundle;
}

function buildMassScene(graph: SpatialMassGraph): BuiltMassScene {
  const massGroup = new THREE.Group();
  massGroup.name = "resolved_spatial_mass_model";
  const overlayGroup = new THREE.Group();
  overlayGroup.name = "resolved_void_overlays";
  const bundles = new Map<string, NodeRenderBundle>();
  const interactables: THREE.Object3D[] = [];
  const nodesById = new Map(graph.resolved_model.nodes.map((node) => [node.node_id, node]));
  const overlayRecords = new Map<string, VoidOverlayRecord[]>();

  for (const node of graph.resolved_model.nodes) {
    const bundle = ensureBundle(bundles, node.node_id);

    if (node.kind === "void") {
      continue;
    }

    const group = new THREE.Group();
    applyNodeTransform(group, node);

    let fragmentBounds = [nodeBounds(node)];
    if (
      node.boolean_operations.length > 0 &&
      SUBTRACTABLE_PRIMITIVES.has(node.primitive)
    ) {
      const cuts: VoidCut[] = [];
      for (const operation of node.boolean_operations) {
        const targetNode = nodesById.get(operation.target_node_id);
        if (!targetNode) continue;
        const localBounds = targetBoundsInHostLocal(node, targetNode);
        if (!localBounds) continue;
        cuts.push({
          nodeId: targetNode.node_id,
          bounds: localBounds,
        });
      }

      if (cuts.length > 0) {
        const resolved = subtractCutsFromBounds(nodeBounds(node), cuts);
        fragmentBounds = resolved.fragments;

        for (const [voidNodeId, bounds] of resolved.overlaps) {
          const current = overlayRecords.get(voidNodeId) ?? [];
          current.push({
            hostNode: node,
            bounds,
          });
          overlayRecords.set(voidNodeId, current);
        }
      }
    }

    if (fragmentBounds.length === 0) {
      fragmentBounds = [nodeBounds(node)];
    }

    for (const bounds of fragmentBounds) {
      const mesh = buildBoundsMesh(node, bounds);
      group.add(mesh);
      bundle.solidMeshes.push(mesh);
      interactables.push(mesh);
    }

    bundle.solidGroup = group;
    massGroup.add(group);
  }

  for (const node of graph.resolved_model.nodes) {
    if (node.kind !== "void") continue;

    const bundle = ensureBundle(bundles, node.node_id);
    const nodeOverlayGroup = new THREE.Group();
    nodeOverlayGroup.name = `${node.node_id}__overlay`;
    nodeOverlayGroup.visible = false;
    nodeOverlayGroup.userData.nodeId = node.node_id;
    const records = overlayRecords.get(node.node_id) ?? [];

    if (records.length > 0) {
      for (const record of records) {
        const anchorGroup = new THREE.Group();
        applyNodeTransform(anchorGroup, record.hostNode);
        for (const bounds of record.bounds) {
          const lines = buildBoundsWireframe(node.node_id, bounds);
          anchorGroup.add(lines);
          bundle.overlayLines.push(lines);
          interactables.push(lines);
        }
        nodeOverlayGroup.add(anchorGroup);
      }
    } else {
      const anchorGroup = new THREE.Group();
      applyNodeTransform(anchorGroup, node);
      const lines = buildDirectWireframe(node);
      anchorGroup.add(lines);
      bundle.overlayLines.push(lines);
      interactables.push(lines);
      nodeOverlayGroup.add(anchorGroup);
    }

    bundle.overlayGroup = nodeOverlayGroup;
    overlayGroup.add(nodeOverlayGroup);
  }

  return {
    massGroup,
    overlayGroup,
    bundles,
    interactables,
  };
}

function disposeGroup(group: THREE.Group) {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();

  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      if (!disposedGeometries.has(object.geometry)) {
        object.geometry.dispose();
        disposedGeometries.add(object.geometry);
      }

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      }
    }
  });
}

function updateOrthographicCamera(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number
) {
  const safeHeight = Math.max(height, 1);
  const aspect = Math.max(width / safeHeight, 0.5);
  const halfHeight = ORTHO_VIEW_HEIGHT / 2;
  const halfWidth = halfHeight * aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function frameMassGroup(
  camera: THREE.OrthographicCamera,
  controls: OrbitControls,
  group: THREE.Group
) {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    controls.target.set(0, 10, 0);
    camera.position.copy(CAMERA_OFFSET);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const aspect = (camera.right - camera.left) / Math.max(camera.top - camera.bottom, 1);
  const planSpan = Math.max(size.x, size.z, 20);
  const heightSpan = Math.max(size.y, 18);
  const requiredHeight = Math.max(
    heightSpan * 2.1,
    (planSpan * 1.4) / Math.max(aspect, 0.8),
    30
  );

  controls.target.copy(center);
  camera.position.copy(center.clone().add(CAMERA_OFFSET));
  camera.zoom = Math.min(3.4, Math.max(0.65, ORTHO_VIEW_HEIGHT / requiredHeight));
  camera.updateProjectionMatrix();
  controls.update();
}

function buildExportFilename(graph: SpatialMassGraph, extension: "obj" | "stl"): string {
  const createdAt = graph.metadata.created_at
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return `resolved_mass_model_${createdAt}.${extension}`;
}

function triggerDownload(contents: BlobPart, filename: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function applyVisualState(
  graph: SpatialMassGraph | null,
  bundles: Map<string, NodeRenderBundle>,
  selectedNodeId: string | null,
  connectedIds: Set<string>
) {
  if (!graph) return;

  for (const resolvedNode of graph.resolved_model.nodes) {
    const bundle = bundles.get(resolvedNode.node_id);
    if (!bundle) continue;

    const color = new THREE.Color(massColor(resolvedNode.node_id));
    const selected = resolvedNode.node_id === selectedNodeId;
    const connected = connectedIds.has(resolvedNode.node_id);
    const dimmed = Boolean(selectedNodeId) && !selected && !connected;
    const emissiveStrength = selected
      ? 0.24
      : connected
        ? 0.18
        : resolvedNode.boolean_operations.length > 0
          ? 0.18
          : 0.14;
    const opacity = selectedNodeId
      ? selected
        ? 0.98
        : connected
          ? 0.52
          : 0.22
      : resolvedNode.shell.opacity;

    for (const mesh of bundle.solidMeshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(color);
      material.emissive.copy(color.clone().multiplyScalar(emissiveStrength));
      material.opacity = opacity;
      material.transparent = opacity < 0.999;
      material.needsUpdate = true;
      mesh.visible = true;
    }

    if (bundle.solidGroup) {
      bundle.solidGroup.renderOrder = selected ? 4 : connected ? 3 : dimmed ? 1 : 2;
    }

    const overlayVisible = resolvedNode.kind === "void" && selected;
    if (bundle.overlayGroup) {
      bundle.overlayGroup.visible = overlayVisible;
      bundle.overlayGroup.renderOrder = overlayVisible ? 15 : 0;
    }

    for (const lines of bundle.overlayLines) {
      const material = lines.material as THREE.LineBasicMaterial;
      material.color.copy(color);
      material.opacity = overlayVisible ? 0.96 : 0;
      material.transparent = true;
      material.needsUpdate = true;
      lines.visible = overlayVisible;
    }
  }
}

export function MassViewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{
    selectedNodeId: string | null;
    connectedIds: Set<string>;
  }>({
    selectedNodeId: null,
    connectedIds: new Set<string>(),
  });
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    massGroup: THREE.Group;
    overlayGroup: THREE.Group;
    bundles: Map<string, NodeRenderBundle>;
    interactables: THREE.Object3D[];
    animId: number;
  } | null>(null);
  const {
    state,
    dispatch,
    variantHistory,
    activeVariantId,
    regenerateVariant,
    activateVariant,
    setVariantPreview,
  } = useGraph();
  const { graph, selectedNodeId } = state;
  const activeVariant =
    variantHistory.find((variant) => variant.id === activeVariantId) ?? null;

  const connectedIds = useMemo(() => {
    if (!graph || !selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const relation of graph.relations) {
      if (relation.source === selectedNodeId) ids.add(relation.target);
      if (relation.target === selectedNodeId) ids.add(relation.source);
    }
    return ids;
  }, [graph, selectedNodeId]);

  useEffect(() => {
    selectionRef.current = {
      selectedNodeId,
      connectedIds,
    };
  }, [connectedIds, selectedNodeId]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (sceneRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    updateOrthographicCamera(camera, width, height);
    camera.position.copy(CAMERA_OFFSET);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minZoom = 0.5;
    controls.maxZoom = 5;
    controls.target.set(0, 10, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.86));
    const hemi = new THREE.HemisphereLight(0xdce7ff, 0x0d1624, 0.55);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.16);
    dir.position.set(44, 62, 36);
    dir.castShadow = true;
    scene.add(dir);

    const grid = new THREE.GridHelper(160, 16, 0x223044, 0x16202d);
    scene.add(grid);

    const massGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    scene.add(massGroup);
    scene.add(overlayGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 1.8 };
    const mouse = new THREE.Vector2();
    const onCanvasClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const activeObjects = sceneRef.current?.interactables ?? [];
      const hits = raycaster.intersectObjects(activeObjects, true);
      if (hits.length > 0) {
        const nodeId = hits[0].object.userData.nodeId;
        if (nodeId) dispatch({ type: "SELECT_NODE", nodeId });
      } else {
        dispatch({ type: "SELECT_NODE", nodeId: null });
      }
    };

    renderer.domElement.addEventListener("click", onCanvasClick);

    const onResize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      updateOrthographicCamera(camera, nextWidth, nextHeight);
      frameMassGroup(camera, controls, sceneRef.current?.massGroup ?? massGroup);
      renderer.setSize(nextWidth, nextHeight);
    };

    let time = 0;
    const animate = () => {
      const ref = sceneRef.current;
      if (!ref) return;
      ref.animId = requestAnimationFrame(animate);
      time += 0.01;
      controls.update();

      for (const [nodeId, bundle] of ref.bundles) {
        if (!bundle.solidGroup) continue;
        if (selectionRef.current.selectedNodeId && nodeId === selectionRef.current.selectedNodeId) {
          bundle.solidGroup.scale.setScalar(1 + Math.sin(time * 2) * 0.03 + 0.06);
        } else if (selectionRef.current.connectedIds.has(nodeId)) {
          bundle.solidGroup.scale.setScalar(1.02);
        } else {
          bundle.solidGroup.scale.setScalar(1);
        }
      }

      renderer.render(scene, camera);
    };

    window.addEventListener("resize", onResize);
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      massGroup,
      overlayGroup,
      bundles: new Map<string, NodeRenderBundle>(),
      interactables: [],
      animId: 0,
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      cancelAnimationFrame(sceneRef.current?.animId ?? 0);
      scene.remove(massGroup);
      scene.remove(overlayGroup);
      disposeGroup(massGroup);
      disposeGroup(overlayGroup);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;

    ref.scene.remove(ref.massGroup);
    ref.scene.remove(ref.overlayGroup);
    disposeGroup(ref.massGroup);
    disposeGroup(ref.overlayGroup);

    if (!graph) {
      ref.massGroup = new THREE.Group();
      ref.massGroup.name = "resolved_spatial_mass_model";
      ref.overlayGroup = new THREE.Group();
      ref.overlayGroup.name = "resolved_void_overlays";
      ref.bundles = new Map<string, NodeRenderBundle>();
      ref.interactables = [];
      ref.scene.add(ref.massGroup);
      ref.scene.add(ref.overlayGroup);
      return;
    }

    const built = buildMassScene(graph);
    ref.massGroup = built.massGroup;
    ref.overlayGroup = built.overlayGroup;
    ref.bundles = built.bundles;
    ref.interactables = built.interactables;
    ref.scene.add(built.massGroup);
    ref.scene.add(built.overlayGroup);
    frameMassGroup(ref.camera, ref.controls, built.massGroup);
    applyVisualState(graph, built.bundles, selectedNodeId, connectedIds);
  }, [graph]);

  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;
    applyVisualState(graph, ref.bundles, selectedNodeId, connectedIds);
  }, [connectedIds, graph, selectedNodeId]);

  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph || !activeVariantId || activeVariant?.previewDataUrl) return;

    let frameA = 0;
    let frameB = 0;
    frameA = requestAnimationFrame(() => {
      frameB = requestAnimationFrame(() => {
        try {
          const previewDataUrl = ref.renderer.domElement.toDataURL("image/png");
          setVariantPreview(activeVariantId, previewDataUrl);
        } catch {
          return;
        }
      });
    });

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
    };
  }, [activeVariant?.previewDataUrl, activeVariantId, graph, setVariantPreview]);

  const handleExportObj = () => {
    if (!graph) return;
    const ref = sceneRef.current;
    if (!ref) return;
    const exporter = new OBJExporter();
    const obj = exporter.parse(ref.massGroup);
    triggerDownload(obj, buildExportFilename(graph, "obj"), "text/plain;charset=utf-8");
  };

  const handleExportStl = () => {
    if (!graph) return;
    const ref = sceneRef.current;
    if (!ref) return;
    const exporter = new STLExporter();
    const stl = exporter.parse(ref.massGroup, { binary: false }) as string;
    triggerDownload(stl, buildExportFilename(graph, "stl"), "model/stl");
  };

  return (
    <div style={viewerShellStyle}>
      <div style={canvasWrapStyle}>
        <div style={exportBarStyle}>
          <div style={variantBadgeStyle}>
            {graph ? graph.resolved_model.variant_label : "No Variant"}
          </div>
          <button
            type="button"
            onClick={regenerateVariant}
            style={exportButtonStyle}
            disabled={!graph}
          >
            Regen
          </button>
          <button
            type="button"
            onClick={handleExportObj}
            style={exportButtonStyle}
            disabled={!graph}
          >
            Export OBJ
          </button>
          <button
            type="button"
            onClick={handleExportStl}
            style={exportButtonStyle}
            disabled={!graph}
          >
            Export STL
          </button>
        </div>
        <div ref={containerRef} style={canvasStyle} />
      </div>
      <div style={snapshotRailStyle}>
        <div style={snapshotRailHeaderStyle}>
          <span style={snapshotRailTitleStyle}>Variant Snapshots</span>
          <span style={snapshotRailMetaStyle}>{variantHistory.length} saved</span>
        </div>
        <div style={snapshotListStyle}>
          {variantHistory.map((variant) => {
            const active = variant.id === activeVariantId;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => activateVariant(variant.id)}
                style={{
                  ...snapshotButtonStyle,
                  borderColor: active ? "#dce7ff" : "#2a3445",
                  boxShadow: active ? "0 0 0 1px rgba(220,231,255,0.24)" : "none",
                }}
              >
                {variant.previewDataUrl ? (
                  <img
                    src={variant.previewDataUrl}
                    alt={variant.label}
                    style={snapshotImageStyle}
                  />
                ) : (
                  <div style={snapshotPlaceholderStyle}>{variant.label}</div>
                )}
                <div style={snapshotCaptionStyle}>
                  <span style={{ color: active ? "#f4f7ff" : "#dce7ff" }}>{variant.label}</span>
                  <span style={{ color: "#74839b" }}>seed {variant.seed}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const viewerShellStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const canvasWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
};

const exportBarStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 2,
  display: "flex",
  gap: 8,
};

const variantBadgeStyle: React.CSSProperties = {
  border: "1px solid #314764",
  borderRadius: 999,
  background: "rgba(12, 20, 32, 0.9)",
  color: "#dce7ff",
  padding: "8px 12px",
  fontSize: 11,
  lineHeight: 1,
  backdropFilter: "blur(8px)",
};

const exportButtonStyle: React.CSSProperties = {
  border: "1px solid #2f4c73",
  borderRadius: 8,
  background: "rgba(12, 20, 32, 0.88)",
  color: "#dce7ff",
  padding: "8px 12px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};

const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const snapshotRailStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a2e",
  background: "#0d0d15",
  padding: "10px 12px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const snapshotRailHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const snapshotRailTitleStyle: React.CSSProperties = {
  color: "#93a4bc",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const snapshotRailMetaStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 10,
};

const snapshotListStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  overflowX: "auto",
  paddingBottom: 2,
};

const snapshotButtonStyle: React.CSSProperties = {
  minWidth: 110,
  width: 110,
  borderRadius: 10,
  border: "1px solid #2a3445",
  background: "#111520",
  overflow: "hidden",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  flexShrink: 0,
};

const snapshotImageStyle: React.CSSProperties = {
  width: "100%",
  height: 72,
  objectFit: "cover",
  display: "block",
  background: "#08101a",
};

const snapshotPlaceholderStyle: React.CSSProperties = {
  width: "100%",
  height: 72,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg, rgba(64,94,132,0.42), rgba(16,22,34,0.9))",
  color: "#dce7ff",
  fontSize: 11,
};

const snapshotCaptionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px 10px",
  fontSize: 10,
};
