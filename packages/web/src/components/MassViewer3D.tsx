"use client";

import React, { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useGraph } from "@/lib/graph-context";
import {
  ZONE_COLORS_HEX,
  FUNC_COLORS_HEX,
  EDGE_COLORS_HEX,
} from "@/lib/graph-colors";

// Position offsets for floor plan layout
const POSITION_OFFSETS: Record<string, { x: number; z: number }> = {
  center: { x: 0, z: 0 },
  north: { x: 0, z: 1 },
  south: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
  northeast: { x: 0.7, z: 0.7 },
  northwest: { x: -0.7, z: 0.7 },
  southeast: { x: 0.7, z: -0.7 },
  southwest: { x: -0.7, z: -0.7 },
};

function getRadiusForZone(zone: string): number {
  const map: Record<string, number> = {
    basement: 12, podium: 14, low_rise: 12, mid_rise: 10,
    sky_lobby: 8, high_rise: 9, mechanical: 10, crown: 7, rooftop: 6,
  };
  return map[zone] || 10;
}

const FLOOR_SPACING = 4.0;

export function MassViewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    nodeMeshes: Map<string, THREE.Mesh>;
    edgeLines: Map<string, THREE.LineSegments>;
    floorPlates: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    nodePositions: Map<string, { x: number; y: number; z: number }>;
    animId: number;
  } | null>(null);

  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId } = state;
  const prevSelectedRef = useRef<string | null>(null);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current || !graph) return;
    if (sceneRef.current) return; // already initialized

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08080f);
    scene.fog = new THREE.FogExp2(0x08080f, 0.0015);

    const totalH = graph.global.total_floors * FLOOR_SPACING;
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);
    camera.position.set(totalH * 0.7, totalH * 0.5, totalH * 0.9);
    camera.lookAt(0, totalH * 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, totalH * 0.4, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 20;
    controls.maxDistance = 800;
    controls.update();

    // Lights
    scene.add(new THREE.AmbientLight(0x404060, 0.6));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(50, 200, 100);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x6688cc, 0.3);
    dir2.position.set(-80, 100, -60);
    scene.add(dir2);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    scene.add(ground);

    const grid = new THREE.GridHelper(400, 40, 0x1a1a2e, 0x111118);
    grid.position.y = -1.5;
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const ref = {
      scene,
      camera,
      renderer,
      controls,
      nodeMeshes: new Map<string, THREE.Mesh>(),
      edgeLines: new Map<string, THREE.LineSegments>(),
      floorPlates: [] as THREE.Mesh[],
      raycaster,
      mouse,
      nodePositions: new Map<string, { x: number; y: number; z: number }>(),
      animId: 0,
    };
    sceneRef.current = ref;

    // Build scene content
    buildSceneContent(ref, graph);

    // Event handlers
    renderer.domElement.addEventListener("click", (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(Array.from(ref.nodeMeshes.values()));
      if (hits.length > 0) {
        const nodeId = (hits[0].object as any).userData.nodeId;
        dispatch({ type: "SELECT_NODE", nodeId });
      }
    });

    // Animate
    function animate() {
      ref.animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(ref.animId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [graph, dispatch]);

  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  // Handle selection changes
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;

    const prevId = prevSelectedRef.current;

    // Reset previous
    if (prevId) {
      const prevMesh = ref.nodeMeshes.get(prevId);
      if (prevMesh) {
        (prevMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1;
        prevMesh.scale.set(1, 1, 1);
      }
    }

    // Reset all node dim states
    for (const [id, m] of ref.nodeMeshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (id !== selectedNodeId) {
        mat.emissiveIntensity = selectedNodeId ? 0.03 : 0.1;
      }
    }

    // Highlight selected
    if (selectedNodeId) {
      const mesh = ref.nodeMeshes.get(selectedNodeId);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.6;
        mesh.scale.set(1.4, 1.4, 1.4);
        ref.controls.target.lerp(mesh.position.clone(), 0.3);
      }

      // Highlight connected
      const connectedIds = new Set<string>();
      for (const e of graph.edges) {
        if (e.source === selectedNodeId) connectedIds.add(e.target);
        if (e.target === selectedNodeId) connectedIds.add(e.source);
      }
      for (const [id, m] of ref.nodeMeshes) {
        if (id !== selectedNodeId && connectedIds.has(id)) {
          (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
        }
      }
    }

    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId, graph]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}

interface SceneRef {
  scene: THREE.Scene;
  nodeMeshes: Map<string, THREE.Mesh>;
  edgeLines: Map<string, THREE.LineSegments>;
  floorPlates: THREE.Mesh[];
  nodePositions: Map<string, { x: number; y: number; z: number }>;
}

function buildSceneContent(
  ref: SceneRef,
  graph: any
) {
  const { scene, nodeMeshes, edgeLines, floorPlates, nodePositions } = ref;

  const nodesByFloor = new Map<number, any[]>();
  for (const n of graph.nodes) {
    if (!nodesByFloor.has(n.floor_level)) nodesByFloor.set(n.floor_level, []);
    nodesByFloor.get(n.floor_level)!.push(n);
  }

  const floors = Array.from(nodesByFloor.keys()).sort((a: number, b: number) => a - b);
  const minFloor = floors[0];

  // Create floor plates and compute node positions
  for (const floor of floors) {
    const nodes = nodesByFloor.get(floor)!;
    const y = (floor - minFloor) * FLOOR_SPACING;
    const zone = nodes[0]?.floor_zone || "mid_rise";
    const baseR = getRadiusForZone(zone);

    const posCount: Record<string, number> = {};

    for (const node of nodes) {
      const pos = node.position || "center";
      const offset = POSITION_OFFSETS[pos] || POSITION_OFFSETS.center;
      posCount[pos] = (posCount[pos] || 0) + 1;
      const dupOffset = (posCount[pos] - 1) * 1.5;

      const isCore = ["elevator_core", "elevator_lobby"].includes(node.function);
      const r = isCore ? 2 : baseR;

      const x = offset.x * r + (dupOffset > 0 ? offset.x * dupOffset : 0);
      const z = offset.z * r + (dupOffset > 0 ? offset.z * dupOffset : 0);

      nodePositions.set(node.id, { x, y, z });
    }

    // Floor plate
    const plateR = baseR + 4;
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(plateR, plateR, 0.12, 6),
      new THREE.MeshStandardMaterial({
        color: ZONE_COLORS_HEX[zone] || 0x333333,
        transparent: true,
        opacity: 0.06,
        roughness: 0.9,
      })
    );
    plate.position.set(0, y, 0);
    scene.add(plate);
    floorPlates.push(plate);
  }

  // Create node meshes
  for (const [nodeId, pos] of nodePositions) {
    const node = graph.nodes.find((n: any) => n.id === nodeId);
    if (!node) continue;

    const func = node.function;
    const isCore = ["elevator_core", "elevator_lobby"].includes(func);
    const isShaft = ["stairwell", "service_shaft"].includes(func);
    const isStructural = ["outrigger", "belt_truss"].includes(func);
    const isSpecial = ["refuge_area", "sky_lounge", "observation_deck", "public_void", "sky_garden"].includes(func);
    const isMech = ["mechanical_room", "electrical_room", "water_tank"].includes(func);
    const isHotel = ["hotel_room", "hotel_suite"].includes(func);
    const isOffice = ["open_office", "premium_office", "executive_suite", "coworking"].includes(func);

    let geo: THREE.BufferGeometry;
    if (isCore) {
      geo = new THREE.CylinderGeometry(0.8, 0.8, FLOOR_SPACING * 0.7, 8);
    } else if (isShaft) {
      geo = new THREE.CylinderGeometry(0.4, 0.4, FLOOR_SPACING * 0.7, 6);
    } else if (isStructural) {
      geo = new THREE.BoxGeometry(4.0, 0.8, 4.0);
    } else if (isSpecial) {
      geo = new THREE.BoxGeometry(2.5, 2.0, 2.5);
    } else if (isMech) {
      geo = new THREE.BoxGeometry(2.0, 1.5, 2.0);
    } else if (isHotel) {
      geo = new THREE.BoxGeometry(1.6, 1.0, 2.4);
    } else if (isOffice) {
      geo = new THREE.BoxGeometry(2.2, 1.0, 2.8);
    } else {
      geo = new THREE.BoxGeometry(1.6, 1.2, 1.6);
    }

    const color = FUNC_COLORS_HEX[func] || ZONE_COLORS_HEX[node.floor_zone] || 0x555555;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.2,
      emissive: color,
      emissiveIntensity: 0.1,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { nodeId, node };
    scene.add(mesh);
    nodeMeshes.set(nodeId, mesh);
  }

  // Create edges
  const edgeTypes = [
    "ADJACENT_TO", "VERTICAL_CONNECT", "ZONE_BOUNDARY",
    "STRUCTURAL_TRANSFER", "PROGRAM_LINK",
  ];
  for (const edgeType of edgeTypes) {
    buildEdgeGroup(scene, edgeLines, graph, edgeType, nodePositions);
  }

  // Floor labels every 10 floors
  for (const floor of floors) {
    if (floor % 10 !== 0 && floor !== minFloor && floor !== floors[floors.length - 1]) continue;
    const y = (floor - minFloor) * FLOOR_SPACING;
    const sprite = makeTextSprite(
      floor < 0 ? "B" + Math.abs(floor) : floor + "F"
    );
    const r = getRadiusForZone("mid_rise") + 14;
    sprite.position.set(r, y, 0);
    sprite.scale.set(8, 4, 1);
    scene.add(sprite);
  }
}

function buildEdgeGroup(
  scene: THREE.Scene,
  edgeLines: Map<string, THREE.LineSegments>,
  graph: any,
  edgeType: string,
  nodePositions: Map<string, { x: number; y: number; z: number }>
) {
  const edges = graph.edges.filter((e: any) => e.type === edgeType);
  const positions: number[] = [];

  for (const edge of edges) {
    const from = nodePositions.get(edge.source);
    const to = nodePositions.get(edge.target);
    if (!from || !to) continue;
    positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
  }

  if (positions.length === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: EDGE_COLORS_HEX[edgeType] || 0x333333,
    transparent: true,
    opacity:
      edgeType === "STACKED_ON" ? 0.08 :
      edgeType === "ADJACENT_TO" ? 0.15 : 0.4,
  });

  const lineSegments = new THREE.LineSegments(geo, mat);
  scene.add(lineSegments);
  edgeLines.set(edgeType, lineSegments);
}

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "28px monospace";
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  return new THREE.Sprite(mat);
}
