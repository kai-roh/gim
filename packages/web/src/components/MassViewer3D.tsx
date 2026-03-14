"use client";

import React, { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useGraph } from "@/lib/graph-context";
import { ZONE_COLORS_HEX, FUNC_COLORS_HEX } from "@/lib/graph-colors";
import {
  generateFloorOutline,
  getDominantFormDNA,
  getFloorFormDNA,
  shouldHaveTerrace,
  isInVoidCut,
  type ArchitectFormDNA,
} from "@/lib/architect-form";
import type { FloorNode, VerticalNodeGraph } from "@gim/core";

// ============================================================
// Constants
// ============================================================

const DEFAULT_CEILING: Record<string, number> = {
  basement: 3.5, ground: 5.0, lower: 4.5, middle: 3.8, upper: 3.8, penthouse: 4.2, rooftop: 3.5,
};

function getFuncCategory(fn: string): string {
  if (["elevator_core", "stairwell", "elevator_lobby", "service_shaft"].includes(fn)) return "core";
  if (["brand_showroom", "exhibition_hall", "experiential_retail", "gallery", "installation_space"].includes(fn)) return "experience";
  if (["lobby", "public_void", "atrium", "community_space", "event_space"].includes(fn)) return "public";
  if (["open_office", "premium_office", "executive_suite", "coworking", "focus_room"].includes(fn)) return "office";
  if (["lounge", "rooftop_bar", "sky_garden", "meditation_room", "fitness", "library"].includes(fn)) return "social";
  if (["mechanical_room", "electrical_room", "server_room"].includes(fn)) return "mechanical";
  if (["parking", "loading_dock", "bicycle_storage"].includes(fn)) return "parking";
  return "amenity";
}

// ============================================================
// Types
// ============================================================

interface FloorBuildData {
  floor: number;
  y: number;
  h: number;
  zone: string;
  outline: [number, number][];
  floorDNA: ArchitectFormDNA;
  nodes: FloorNode[];
  baseW: number;
  baseD: number;
  coreR: number;
  hasTerrace: boolean;
  aboveIdx: number;
  totalAbove: number;
}

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  nodeMeshes: Map<string, THREE.Mesh>;
  floorSlabs: Map<number, THREE.Group>;
  selectables: THREE.Object3D[];
  animId: number;
  massGroup: THREE.Group;
  detailGroup: THREE.Group;
  floorData: FloorBuildData[];
}

// ============================================================
// Component
// ============================================================

export function MassViewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId, selectedFloor } = state;

  const initScene = useCallback(() => {
    if (!containerRef.current || !graph) return;
    if (sceneRef.current) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    const bldgH = estimateBuildingHeight(graph);

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1e28);
    scene.fog = new THREE.Fog(0x1a1e28, 80, 280);

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 500);
    camera.position.set(40, bldgH * 0.55, 50);
    camera.lookAt(0, bldgH * 0.35, 0);

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    container.appendChild(renderer.domElement);

    // ---- Controls ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, bldgH * 0.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 12;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.update();

    // ---- Lighting ----
    scene.add(new THREE.HemisphereLight(0x7090c0, 0x1a1820, 0.7));
    const key = new THREE.DirectionalLight(0xfff0dd, 1.8);
    key.position.set(30, bldgH * 1.5, 40);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = Math.max(35, bldgH * 0.9);
    key.shadow.camera.left = -sc; key.shadow.camera.right = sc;
    key.shadow.camera.top = bldgH + 10; key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x80a8d0, 0.6);
    fill.position.set(-40, bldgH * 0.6, -25);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x90a0cc, 0.45);
    rim.position.set(-15, bldgH * 0.4, -50);
    scene.add(rim);
    const bounce = new THREE.PointLight(0xddccaa, 0.3, bldgH * 2);
    bounce.position.set(0, -2, 0);
    scene.add(bounce);

    // ---- State ----
    const ref: SceneState = {
      scene, camera, renderer, controls,
      nodeMeshes: new Map(),
      floorSlabs: new Map(),
      selectables: [],
      animId: 0,
      massGroup: new THREE.Group(),
      detailGroup: new THREE.Group(),
      floorData: [],
    };
    sceneRef.current = ref;

    // ---- Build ----
    buildEnvironment(scene, graph);
    buildBuilding(ref, graph);

    // ---- Interaction ----
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    renderer.domElement.addEventListener("click", (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(ref.selectables, true);
      const nodeId = hits.length > 0 ? findNodeId(hits[0].object) : null;
      dispatch({ type: "SELECT_NODE", nodeId });
    });

    // ---- Animate ----
    let t = 0;
    function animate() {
      ref.animId = requestAnimationFrame(animate);
      t += 0.004;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // ---- Resize ----
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(ref.animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [graph, dispatch]);

  useEffect(() => { return initScene(); }, [initScene]);

  // ---- Selected Floor Mode Effect ----
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;

    // Clear previous detail group
    while (ref.detailGroup.children.length > 0) {
      const child = ref.detailGroup.children[0];
      ref.detailGroup.remove(child);
    }
    // Clear selectables and nodeMeshes from detail mode
    ref.selectables.length = 0;
    ref.nodeMeshes.clear();

    if (selectedFloor === null || selectedFloor === undefined) {
      // ---- Mass Mode: fully opaque mass ----
      ref.massGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
          const mat = (obj as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            const m = mat as THREE.MeshPhysicalMaterial;
            if (m.opacity !== undefined) {
              // Restore full opacity — but respect original material settings
              // Mass materials are tagged with userData.massOriginalOpacity
              if (obj.userData?.massOriginalOpacity !== undefined) {
                m.opacity = obj.userData.massOriginalOpacity;
                m.transparent = m.opacity < 1.0;
              }
            }
          }
        }
      });
      // Remove detail group from scene
      if (ref.detailGroup.parent) {
        ref.scene.remove(ref.detailGroup);
      }
    } else {
      // ---- Section Mode: semi-transparent mass + floor details ----
      // Make mass group semi-transparent
      ref.massGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
          const mat = (obj as THREE.Mesh).material;
          if (mat && !Array.isArray(mat)) {
            const m = mat as THREE.MeshPhysicalMaterial;
            if (m.opacity !== undefined) {
              // Store original opacity on first transition
              if (obj.userData.massOriginalOpacity === undefined) {
                obj.userData.massOriginalOpacity = m.opacity;
              }
              m.opacity = 0.15;
              m.transparent = true;
            }
          }
        }
      });

      // Build detail for selected floor + adjacent floors
      const floorNumbers = ref.floorData.map((fd) => fd.floor).sort((a, b) => a - b);
      const selIdx = floorNumbers.indexOf(selectedFloor);

      for (let offset = -1; offset <= 1; offset++) {
        const idx = selIdx + offset;
        if (idx < 0 || idx >= floorNumbers.length) continue;
        const floorNum = floorNumbers[idx];
        const fd = ref.floorData.find((d) => d.floor === floorNum);
        if (!fd) continue;

        const isSelected = offset === 0;
        const group = buildFloorDetail(ref, fd, isSelected);
        ref.detailGroup.add(group);
      }

      // Add detail group to scene
      if (!ref.detailGroup.parent) {
        ref.scene.add(ref.detailGroup);
      }
    }
  }, [selectedFloor, graph]);

  // ---- Node Selection (only active in section mode) ----
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;
    if (selectedFloor === null || selectedFloor === undefined) return;

    // Reset all dots to default
    ref.nodeMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = selectedNodeId ? 0.08 : 0.25;
      mat.opacity = selectedNodeId ? 0.25 : 0.7;
      mesh.scale.set(1, 1, 1);
    });

    if (selectedNodeId) {
      // Selected dot: bright glow + scale up
      const mesh = ref.nodeMeshes.get(selectedNodeId);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.8;
        mat.opacity = 1.0;
        mesh.scale.set(2.2, 2.2, 2.2);
        ref.controls.target.lerp(mesh.position.clone(), 0.3);
      }

      // Connected dots: medium glow
      const connected = new Set<string>();
      for (const e of graph.edges) {
        if (e.source === selectedNodeId) connected.add(e.target);
        if (e.target === selectedNodeId) connected.add(e.source);
      }
      connected.forEach((id) => {
        const m = ref.nodeMeshes.get(id);
        if (m) {
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.4;
          mat.opacity = 0.8;
          m.scale.set(1.4, 1.4, 1.4);
        }
      });
    }
  }, [selectedNodeId, selectedFloor, graph]);

  // Build floor labels for the selector
  const floorLabels = React.useMemo(() => {
    if (!graph) return [];
    const byFloor = new Map<number, FloorNode[]>();
    for (const n of graph.nodes) {
      if (!byFloor.has(n.floor_level)) byFloor.set(n.floor_level, []);
      byFloor.get(n.floor_level)!.push(n);
    }
    return Array.from(byFloor.keys()).sort((a, b) => a - b);
  }, [graph]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Floor Selector Strip */}
      {graph && floorLabels.length > 0 && (
        <div style={floorSelectorStyle}>
          {floorLabels.slice().reverse().map((floor) => {
            const label = floor < 0 ? `B${Math.abs(floor)}` : `${floor}F`;
            const isSelected = selectedFloor === floor;
            return (
              <div
                key={floor}
                onClick={() => {
                  if (isSelected) {
                    dispatch({ type: "SELECT_FLOOR", floor: null });
                  } else {
                    dispatch({ type: "SELECT_FLOOR", floor });
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: 2,
                  background: isSelected ? "rgba(100,140,255,0.25)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 4,
                    borderRadius: 1,
                    background: isSelected
                      ? "#6a8cff"
                      : "rgba(100,120,160,0.35)",
                    transition: "background 0.15s",
                  }}
                />
                <span
                  style={{
                    fontSize: 8,
                    fontFamily: "'SF Mono', monospace",
                    color: isSelected ? "#8aacff" : "#556",
                    lineHeight: 1,
                    userSelect: "none",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {graph && (
        <div style={legendStyle}>
          <div style={{ fontSize: 9, color: "#777", marginBottom: 3 }}>
            {graph.global.site.location}
          </div>
          <div style={{ fontSize: 8, color: "#555" }}>
            {graph.nodes.length} nodes | {graph.edges.length} edges
          </div>
          <div style={{ fontSize: 8, color: "#556", marginTop: 2 }}>
            {selectedFloor !== null && selectedFloor !== undefined
              ? `Floor ${selectedFloor < 0 ? `B${Math.abs(selectedFloor)}` : `${selectedFloor}F`} selected`
              : "Mass view"}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Floor Selector Style
// ============================================================

const floorSelectorStyle: React.CSSProperties = {
  position: "absolute",
  left: 8,
  top: "50%",
  transform: "translateY(-50%)",
  display: "flex",
  flexDirection: "column",
  gap: 1,
  background: "rgba(20,22,30,0.85)",
  border: "1px solid #2a3040",
  borderRadius: 4,
  padding: "6px 4px",
  zIndex: 10,
  maxHeight: "70%",
  overflowY: "auto",
};

// ============================================================
// Environment
// ============================================================

function buildEnvironment(scene: THREE.Scene, graph: VerticalNodeGraph) {
  const [siteW, siteD] = graph.global.site.dimensions;

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.92, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Site boundary
  const hw = siteW / 2, hd = siteD / 2;
  const sitePts = [
    new THREE.Vector3(-hw, 0.02, -hd), new THREE.Vector3(hw, 0.02, -hd),
    new THREE.Vector3(hw, 0.02, hd), new THREE.Vector3(-hw, 0.02, hd),
    new THREE.Vector3(-hw, 0.02, -hd),
  ];
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(sitePts),
    new THREE.LineBasicMaterial({ color: 0x4a5060, transparent: true, opacity: 0.6 }),
  ));

  // Grid
  const grid = new THREE.GridHelper(100, 20, 0x303848, 0x222830);
  grid.position.y = 0.01;
  scene.add(grid);

  // Context labels
  const ctx = graph.global.site.context;
  const labelDirs: [string, THREE.Vector3][] = [
    [ctx.north, new THREE.Vector3(0, 1.5, hd + 8)],
    [ctx.south, new THREE.Vector3(0, 1.5, -(hd + 8))],
    [ctx.east, new THREE.Vector3(hw + 8, 1.5, 0)],
    [ctx.west, new THREE.Vector3(-(hw + 8), 1.5, 0)],
  ];
  for (const [label, pos] of labelDirs) {
    if (!label) continue;
    const txt = label.length > 15 ? label.slice(0, 15) + "…" : label;
    const sprite = makeLabel(txt, 0x6a7088);
    sprite.position.copy(pos);
    sprite.scale.set(10, 3.5, 1);
    scene.add(sprite);
  }

  // North indicator
  const nSprite = makeLabel("N", 0x7088cc);
  nSprite.position.set(0, 2.5, hd + 4);
  nSprite.scale.set(3, 2, 1);
  scene.add(nSprite);
}

// ============================================================
// Building — Compute + Mass View
// ============================================================

function buildBuilding(ref: SceneState, graph: VerticalNodeGraph) {
  const { scene } = ref;
  const [siteW, siteD] = graph.global.site.dimensions;
  const bcr = graph.global.site.bcr / 100;

  // Base footprint from site + BCR
  const footprintArea = siteW * siteD * bcr;
  const baseW = Math.sqrt(footprintArea * (siteW / siteD));
  const baseD = footprintArea / baseW;

  // Get dominant architect FormDNA
  const allStyles = graph.nodes.map((n) => n.style_ref);
  const dominantDNA = getDominantFormDNA(allStyles);

  // Organize by floor
  const nodesByFloor = new Map<number, FloorNode[]>();
  for (const n of graph.nodes) {
    if (!nodesByFloor.has(n.floor_level)) nodesByFloor.set(n.floor_level, []);
    nodesByFloor.get(n.floor_level)!.push(n);
  }
  const floors = Array.from(nodesByFloor.keys()).sort((a, b) => a - b);
  const aboveGroundFloors = floors.filter((f) => f >= 0);
  const totalAbove = aboveGroundFloors.length;

  // Compute cumulative Y positions
  const floorY = new Map<number, number>();
  const floorH = new Map<number, number>();
  let cumY = 0;
  for (const floor of floors) {
    const nodes = nodesByFloor.get(floor)!;
    const zone = nodes[0]?.floor_zone || "middle";
    const h = nodes[0]?.ceiling_height || DEFAULT_CEILING[zone] || 3.8;
    floorH.set(floor, h);
    if (floor < 0) {
      floorY.set(floor, -(Math.abs(floor)) * h);
    } else {
      floorY.set(floor, cumY);
      cumY += h;
    }
  }

  const coreR = Math.min(baseW, baseD) * 0.04;

  // ---- Compute phase: build FloorBuildData[] ----
  const floorDataArr: FloorBuildData[] = [];

  for (let fi = 0; fi < floors.length; fi++) {
    const floor = floors[fi];
    const nodes = nodesByFloor.get(floor)!;
    const zone = nodes[0]?.floor_zone || "middle";
    const y = floorY.get(floor)!;
    const h = floorH.get(floor)!;

    const floorStyle = nodes.find((n) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);

    const aboveIdx = floor < 0 ? 0 : aboveGroundFloors.indexOf(floor);

    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;
    const fW = baseW * groundScale;
    const fD = baseD * groundScale;

    const precomputed = nodes[0]?.geometry;
    const outline = precomputed?.outline ?? generateFloorOutline(floorDNA, fW, fD, aboveIdx, totalAbove);

    const hasTerrace = floor > 0 && shouldHaveTerrace(floorDNA, aboveIdx, totalAbove);

    floorDataArr.push({
      floor,
      y,
      h,
      zone,
      outline,
      floorDNA,
      nodes,
      baseW: fW,
      baseD: fD,
      coreR,
      hasTerrace,
      aboveIdx,
      totalAbove,
    });
  }

  ref.floorData = floorDataArr;

  // ---- Build Mass View ----
  buildMassView(ref, graph, floorDataArr, dominantDNA, baseW, baseD, aboveGroundFloors, floorY, floorH, nodesByFloor);
}

// ============================================================
// Mass View — Shell + Roof + Canopy only
// ============================================================

function buildMassView(
  ref: SceneState,
  graph: VerticalNodeGraph,
  floorDataArr: FloorBuildData[],
  dominantDNA: ArchitectFormDNA,
  baseW: number,
  baseD: number,
  aboveGroundFloors: number[],
  floorY: Map<number, number>,
  floorH: Map<number, number>,
  nodesByFloor: Map<number, FloorNode[]>,
) {
  const massGroup = ref.massGroup;
  const totalAbove = aboveGroundFloors.length;

  // Collect shell sections from above-ground floors
  const shellSections: { y: number; outline: [number, number][] }[] = [];

  for (const fd of floorDataArr) {
    if (fd.floor < 0) continue;
    const wallOutline = fd.hasTerrace
      ? applyTerraceInset(fd.outline, fd.floorDNA.terraceDepth, fd.aboveIdx)
      : fd.outline;
    shellSections.push({ y: fd.y, outline: wallOutline });
  }

  // ---- Continuous exterior shell ----
  if (shellSections.length >= 2) {
    const lastAbove = aboveGroundFloors[aboveGroundFloors.length - 1];
    if (lastAbove !== undefined) {
      const topY = (floorY.get(lastAbove) ?? 0) + (floorH.get(lastAbove) ?? 3.8);
      shellSections.push({ y: topY, outline: shellSections[shellSections.length - 1].outline });
    }
    buildContinuousShellToGroup(massGroup, shellSections, dominantDNA);
  }

  // ---- Loft surface ----
  buildLoftSurfaceToGroup(massGroup, dominantDNA, baseW, baseD, aboveGroundFloors, floorY, floorH, nodesByFloor);

  // ---- Roof treatment ----
  const floors = floorDataArr.map((fd) => fd.floor).sort((a, b) => a - b);
  const topFloor = floors[floors.length - 1];
  const topY = (floorY.get(topFloor) || 0) + (floorH.get(topFloor) || 3);
  addRoofTreatmentToGroup(massGroup, dominantDNA, baseW, baseD, topY, totalAbove);

  // ---- Entrance canopy ----
  const groundY = floorY.get(0) ?? floorY.get(1) ?? 0;
  const groundH = floorH.get(0) ?? floorH.get(1) ?? 5;
  const canopyGeo = new THREE.BoxGeometry(baseW * 0.35, 0.12, 3.5);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x404858, roughness: 0.25, metalness: 0.4,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, groundY + groundH * 0.65, -(baseD / 2 + 1.8));
  canopy.castShadow = true;
  massGroup.add(canopy);

  ref.scene.add(massGroup);
}

// ============================================================
// Floor Detail Builder — on-demand per floor
// ============================================================

function buildFloorDetail(
  ref: SceneState,
  fd: FloorBuildData,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const opacity = isSelected ? 1.0 : 0.3;

  // ---- Slab ----
  const slabThick = 0.3;
  const slabShape = outlineToShape(fd.outline);
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: slabThick, bevelEnabled: false });
  slabGeo.rotateX(-Math.PI / 2);

  const slabColor = fd.zone === "basement" ? 0x2a2c34 : fd.floor === 0 ? 0x3a3e4a : 0x303440;
  const slabMat = new THREE.MeshStandardMaterial({
    color: slabColor, roughness: 0.6, metalness: 0.15,
    emissive: 0x101418, emissiveIntensity: 0.03,
    transparent: !isSelected,
    opacity,
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = fd.y;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  // ---- Node dots ----
  const dotR = 0.35;
  const dotGeo = new THREE.SphereGeometry(dotR, 8, 6);
  const dotY = fd.y + fd.h * 0.5;

  for (const node of fd.nodes) {
    const cat = getFuncCategory(node.function);
    const color = FUNC_COLORS_HEX[node.function] || ZONE_COLORS_HEX[fd.zone] || 0x555555;
    const pos = computeDotPosition(node.position, fd.baseW, fd.baseD, fd.coreR);

    const dotMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: isSelected ? (cat === "core" ? 0.3 : 0.7) : 0.15,
      roughness: 0.2,
      metalness: 0.1,
      emissive: color,
      emissiveIntensity: isSelected ? 0.25 : 0.05,
    });

    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(pos.x, dotY, pos.z);
    dot.userData = { nodeId: node.id, node };
    group.add(dot);

    if (isSelected) {
      ref.nodeMeshes.set(node.id, dot);
      ref.selectables.push(dot);
    }
  }

  // ---- Floor label (only for selected floor) ----
  if (isSelected) {
    const label = fd.floor < 0 ? `B${Math.abs(fd.floor)}` : `${fd.floor}F`;
    const sprite = makeLabel(label, 0x6a7890);
    const labelX = fd.baseW / 2 + 3;
    sprite.position.set(labelX, fd.y + fd.h / 2, 0);
    sprite.scale.set(4, 2, 1);
    group.add(sprite);
  }

  return group;
}

// ============================================================
// Continuous Exterior Shell (to group variant)
// ============================================================

function buildContinuousShellToGroup(
  group: THREE.Group,
  sections: { y: number; outline: [number, number][] }[],
  dna: ArchitectFormDNA,
) {
  if (sections.length < 2) return;

  const targetPts = 40;
  const normalized = sections.map((s) => ({
    y: s.y,
    pts: normalizeOutline(s.outline, targetPts),
  }));

  const rows = normalized.length;
  const cols = targetPts;
  const positions = new Float32Array(rows * cols * 3);

  for (let r = 0; r < rows; r++) {
    const sec = normalized[r];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3;
      positions[idx]     = sec.pts[c][0];
      positions[idx + 1] = sec.y;
      positions[idx + 2] = sec.pts[c][1];
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: dna.facadeColor,
    transparent: false,
    roughness: Math.max(dna.facadeRoughness * 0.7, 0.08),
    metalness: Math.min(dna.facadeMetalness + 0.1, 0.75),
    side: THREE.FrontSide,
    clearcoat: dna.facadeOpacity > 0.4 ? 0.5 : 0.15,
    clearcoatRoughness: 0.1,
    emissive: 0x080c14,
    emissiveIntensity: 0.05,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

// ============================================================
// Loft Surface (to group variant)
// ============================================================

function buildLoftSurfaceToGroup(
  group: THREE.Group,
  dna: ArchitectFormDNA,
  baseW: number,
  baseD: number,
  aboveGroundFloors: number[],
  floorY: Map<number, number>,
  floorH: Map<number, number>,
  nodesByFloor: Map<number, FloorNode[]>,
) {
  if (aboveGroundFloors.length < 2) return;

  const totalAbove = aboveGroundFloors.length;
  const targetPts = 32;

  interface CrossSection {
    y: number;
    outline: [number, number][];
  }

  const sections: CrossSection[] = [];

  for (let fi = 0; fi < aboveGroundFloors.length; fi++) {
    const floor = aboveGroundFloors[fi];
    const y = floorY.get(floor)!;
    const h = floorH.get(floor)!;
    const nodes = nodesByFloor.get(floor)!;

    const floorStyle = nodes.find((n) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dna);
    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;

    const outline = generateFloorOutline(floorDNA, baseW * groundScale, baseD * groundScale, fi, totalAbove);

    sections.push({ y, outline: normalizeOutline(outline, targetPts) });
    sections.push({ y: y + h, outline: normalizeOutline(outline, targetPts) });
  }

  if (sections.length < 2) return;

  const isSculptural = dna.transitionStyle === "sculptural";
  const interpSegs = isSculptural ? 6 : 4;

  const allSections: CrossSection[] = [];

  for (let si = 0; si < sections.length - 1; si++) {
    const s0 = sections[Math.max(0, si - 1)];
    const s1 = sections[si];
    const s2 = sections[si + 1];
    const s3 = sections[Math.min(sections.length - 1, si + 2)];

    allSections.push(s1);

    for (let t = 1; t < interpSegs; t++) {
      const frac = t / interpSegs;
      const interpY = catmullRom(s0.y, s1.y, s2.y, s3.y, frac);
      const interpOutline: [number, number][] = [];

      for (let p = 0; p < targetPts; p++) {
        const x = catmullRom(s0.outline[p][0], s1.outline[p][0], s2.outline[p][0], s3.outline[p][0], frac);
        const z = catmullRom(s0.outline[p][1], s1.outline[p][1], s2.outline[p][1], s3.outline[p][1], frac);
        interpOutline.push([x, z]);
      }

      allSections.push({ y: interpY, outline: interpOutline });
    }
  }
  allSections.push(sections[sections.length - 1]);

  const rows = allSections.length;
  const cols = targetPts;
  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);

  for (let r = 0; r < rows; r++) {
    const sec = allSections[r];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3;
      positions[idx] = sec.outline[c][0];
      positions[idx + 1] = sec.y;
      positions[idx + 2] = sec.outline[c][1];
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: dna.facadeColor,
    transparent: true,
    opacity: 0.55 + dna.facadeOpacity * 0.35,
    roughness: dna.facadeRoughness * 0.8,
    metalness: Math.min(dna.facadeMetalness + 0.15, 0.8),
    side: THREE.DoubleSide,
    clearcoat: 0.3,
    clearcoatRoughness: 0.15,
    emissive: 0x1a2030,
    emissiveIntensity: 0.04,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Wireframe overlay
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x506080,
    transparent: true,
    opacity: 0.15,
  });
  const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  group.add(wireframe);
}

// ============================================================
// Roof Treatment (to group variant)
// ============================================================

function addRoofTreatmentToGroup(group: THREE.Group, dna: ArchitectFormDNA, baseW: number, baseD: number, topY: number, totalFloors: number) {
  const outline = generateFloorOutline(dna, baseW, baseD, totalFloors - 1, totalFloors);

  switch (dna.roofStyle) {
    case "garden": {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x3a6a3a, roughness: 0.65, metalness: 0.05,
        emissive: 0x2a4a2a, emissiveIntensity: 0.08,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY + 0.1;
      mesh.receiveShadow = true;
      group.add(mesh);
      break;
    }
    case "crown": {
      const shape = outlineToShape(outline.map(([x, z]) => [x * 0.85, z * 0.85] as [number, number]));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.5, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3 });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x505878, roughness: 0.25, metalness: 0.55,
        emissive: 0x2a2a48, emissiveIntensity: 0.06,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }
    case "sculptural": {
      const geo = new THREE.SphereGeometry(Math.min(baseW, baseD) * 0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x505868, roughness: 0.35, metalness: 0.35,
        emissive: 0x252838, emissiveIntensity: 0.06,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }
    case "sloped": {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: true, bevelSize: 1.5, bevelSegments: 3, bevelThickness: 1.5 });
      geo.rotateX(-Math.PI / 2);
      geo.scale(1, 0.5, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x404858, roughness: 0.45, metalness: 0.25,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      group.add(mesh);
      break;
    }
    default: {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: 0x4a5068, transparent: true, opacity: 0.45,
      }));
      line.position.y = topY;
      group.add(line);
    }
  }
}

// ============================================================
// Original utility functions (kept unchanged)
// ============================================================

function buildContinuousShell(
  scene: THREE.Scene,
  sections: { y: number; outline: [number, number][] }[],
  dna: ArchitectFormDNA,
) {
  if (sections.length < 2) return;

  const targetPts = 40;
  const normalized = sections.map((s) => ({
    y: s.y,
    pts: normalizeOutline(s.outline, targetPts),
  }));

  const rows = normalized.length;
  const cols = targetPts;
  const positions = new Float32Array(rows * cols * 3);

  for (let r = 0; r < rows; r++) {
    const sec = normalized[r];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3;
      positions[idx]     = sec.pts[c][0];
      positions[idx + 1] = sec.y;
      positions[idx + 2] = sec.pts[c][1];
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: dna.facadeColor,
    transparent: false,
    roughness: Math.max(dna.facadeRoughness * 0.7, 0.08),
    metalness: Math.min(dna.facadeMetalness + 0.1, 0.75),
    side: THREE.FrontSide,
    clearcoat: dna.facadeOpacity > 0.4 ? 0.5 : 0.15,
    clearcoatRoughness: 0.1,
    emissive: 0x080c14,
    emissiveIntensity: 0.05,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildLoftSurface(
  scene: THREE.Scene,
  dna: ArchitectFormDNA,
  baseW: number,
  baseD: number,
  aboveGroundFloors: number[],
  floorY: Map<number, number>,
  floorH: Map<number, number>,
  nodesByFloor: Map<number, FloorNode[]>,
) {
  if (aboveGroundFloors.length < 2) return;

  const totalAbove = aboveGroundFloors.length;
  const targetPts = 32;

  interface CrossSection {
    y: number;
    outline: [number, number][];
  }

  const sections: CrossSection[] = [];

  for (let fi = 0; fi < aboveGroundFloors.length; fi++) {
    const floor = aboveGroundFloors[fi];
    const y = floorY.get(floor)!;
    const h = floorH.get(floor)!;
    const nodes = nodesByFloor.get(floor)!;

    const floorStyle = nodes.find((n) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dna);
    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;

    const outline = generateFloorOutline(floorDNA, baseW * groundScale, baseD * groundScale, fi, totalAbove);

    sections.push({ y, outline: normalizeOutline(outline, targetPts) });
    sections.push({ y: y + h, outline: normalizeOutline(outline, targetPts) });
  }

  if (sections.length < 2) return;

  const isSculptural = dna.transitionStyle === "sculptural";
  const interpSegs = isSculptural ? 6 : 4;

  const allSections: CrossSection[] = [];

  for (let si = 0; si < sections.length - 1; si++) {
    const s0 = sections[Math.max(0, si - 1)];
    const s1 = sections[si];
    const s2 = sections[si + 1];
    const s3 = sections[Math.min(sections.length - 1, si + 2)];

    allSections.push(s1);

    for (let t = 1; t < interpSegs; t++) {
      const frac = t / interpSegs;
      const interpY = catmullRom(s0.y, s1.y, s2.y, s3.y, frac);
      const interpOutline: [number, number][] = [];

      for (let p = 0; p < targetPts; p++) {
        const x = catmullRom(s0.outline[p][0], s1.outline[p][0], s2.outline[p][0], s3.outline[p][0], frac);
        const z = catmullRom(s0.outline[p][1], s1.outline[p][1], s2.outline[p][1], s3.outline[p][1], frac);
        interpOutline.push([x, z]);
      }

      allSections.push({ y: interpY, outline: interpOutline });
    }
  }
  allSections.push(sections[sections.length - 1]);

  const rows = allSections.length;
  const cols = targetPts;
  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);

  for (let r = 0; r < rows; r++) {
    const sec = allSections[r];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3;
      positions[idx] = sec.outline[c][0];
      positions[idx + 1] = sec.y;
      positions[idx + 2] = sec.outline[c][1];
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: dna.facadeColor,
    transparent: true,
    opacity: 0.55 + dna.facadeOpacity * 0.35,
    roughness: dna.facadeRoughness * 0.8,
    metalness: Math.min(dna.facadeMetalness + 0.15, 0.8),
    side: THREE.DoubleSide,
    clearcoat: 0.3,
    clearcoatRoughness: 0.15,
    emissive: 0x1a2030,
    emissiveIntensity: 0.04,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x506080,
    transparent: true,
    opacity: 0.15,
  });
  const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  scene.add(wireframe);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function normalizeOutline(outline: [number, number][], count: number): [number, number][] {
  if (outline.length === count) return outline;
  if (outline.length === 0) return Array(count).fill([0, 0]) as [number, number][];

  const arcLens: number[] = [0];
  for (let i = 1; i < outline.length; i++) {
    const dx = outline[i][0] - outline[i - 1][0];
    const dz = outline[i][1] - outline[i - 1][1];
    arcLens.push(arcLens[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  const dx = outline[0][0] - outline[outline.length - 1][0];
  const dz = outline[0][1] - outline[outline.length - 1][1];
  const totalLen = arcLens[arcLens.length - 1] + Math.sqrt(dx * dx + dz * dz);

  const result: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const targetLen = (i / count) * totalLen;

    let seg = 0;
    for (seg = 0; seg < arcLens.length - 1; seg++) {
      if (arcLens[seg + 1] >= targetLen) break;
    }

    const segLen = seg < arcLens.length - 1
      ? arcLens[seg + 1] - arcLens[seg]
      : totalLen - arcLens[arcLens.length - 1];

    const t = segLen > 0 ? (targetLen - arcLens[seg]) / segLen : 0;

    const p1 = outline[seg];
    const p2 = seg < outline.length - 1 ? outline[seg + 1] : outline[0];

    result.push([
      p1[0] + (p2[0] - p1[0]) * t,
      p1[1] + (p2[1] - p1[1]) * t,
    ]);
  }

  return result;
}

// ============================================================
// Wall Surface Geometry
// ============================================================

function buildWallGeometry(outline: [number, number][], height: number): THREE.BufferGeometry {
  const n = outline.length;
  const positions = new Float32Array(n * 6 * 3);
  const normals = new Float32Array(n * 6 * 3);
  const uvs = new Float32Array(n * 6 * 2);

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outline[i];
    const [x2, z2] = outline[(i + 1) % n];
    perimeter += Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
  }

  let uAccum = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outline[i];
    const [x2, z2] = outline[(i + 1) % n];
    const segLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);

    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = dz / len, nz = -dx / len;

    const b = i * 18;
    positions[b]     = x1; positions[b + 1]  = 0;      positions[b + 2]  = z1;
    positions[b + 3] = x2; positions[b + 4]  = 0;      positions[b + 5]  = z2;
    positions[b + 6] = x2; positions[b + 7]  = height; positions[b + 8]  = z2;
    positions[b + 9]  = x1; positions[b + 10] = 0;      positions[b + 11] = z1;
    positions[b + 12] = x2; positions[b + 13] = height; positions[b + 14] = z2;
    positions[b + 15] = x1; positions[b + 16] = height; positions[b + 17] = z1;

    for (let v = 0; v < 6; v++) {
      normals[b + v * 3] = nx;
      normals[b + v * 3 + 1] = 0;
      normals[b + v * 3 + 2] = nz;
    }

    const u0 = uAccum / perimeter;
    const u1 = (uAccum + segLen) / perimeter;
    const ub = i * 12;
    uvs[ub]     = u0; uvs[ub + 1]  = 0;
    uvs[ub + 2] = u1; uvs[ub + 3]  = 0;
    uvs[ub + 4] = u1; uvs[ub + 5]  = 1;
    uvs[ub + 6] = u0; uvs[ub + 7]  = 0;
    uvs[ub + 8] = u1; uvs[ub + 9]  = 1;
    uvs[ub + 10] = u0; uvs[ub + 11] = 1;

    uAccum += segLen;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function addMullionGrid(
  group: THREE.Group,
  outline: [number, number][],
  baseY: number,
  height: number,
  color: number,
  opacity: number,
) {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const n = outline.length;

  const step = Math.max(2, Math.floor(n / 16));
  const verts: number[] = [];
  for (let i = 0; i < n; i += step) {
    const [x, z] = outline[i];
    verts.push(x, baseY, z, x, baseY + height, z);
  }

  const midY = baseY + height * 0.5;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = outline[i];
    const [x2, z2] = outline[(i + 1) % n];
    verts.push(x1, midY, z1, x2, midY, z2);
  }

  if (verts.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    group.add(new THREE.LineSegments(geo, mat));
  }
}

// ============================================================
// Structural Expression
// ============================================================

function addDiagridSegment(group: THREE.Group, outline: [number, number][], baseY: number, height: number, dna: ArchitectFormDNA) {
  const pts = outline;
  const step = Math.max(3, Math.floor(pts.length / 8));
  const mat = new THREE.LineBasicMaterial({ color: 0x5570cc, transparent: true, opacity: 0.4 });

  for (let i = 0; i < pts.length; i += step) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + step) % pts.length];
    const positions = new Float32Array([
      x1, baseY, z1, x2, baseY + height, z2,
      x2, baseY, z2, x1, baseY + height, z1,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.LineSegments(geo, mat));
  }
}

function addExoskeletonSegment(group: THREE.Group, outline: [number, number][], baseY: number, height: number) {
  const pts = outline;
  const mat = new THREE.LineBasicMaterial({ color: 0x6880a8, transparent: true, opacity: 0.45 });
  const step = Math.max(2, Math.floor(pts.length / 10));

  for (let i = 0; i < pts.length; i += step) {
    const [x, z] = pts[i];
    const nx = x * 1.05, nz = z * 1.05;
    const positions = new Float32Array([nx, baseY, nz, nx, baseY + height, nz]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.LineSegments(geo, mat));
  }
}

function addColumnExpression(group: THREE.Group, outline: [number, number][], baseY: number, height: number) {
  const pts = outline;
  const step = Math.max(3, Math.floor(pts.length / 6));
  const colMat = new THREE.MeshStandardMaterial({ color: 0x404858, roughness: 0.4, metalness: 0.35 });

  for (let i = 0; i < pts.length; i += step) {
    const [x, z] = pts[i];
    const colGeo = new THREE.CylinderGeometry(0.2, 0.2, height, 6);
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, baseY + height / 2, z);
    col.castShadow = true;
    group.add(col);
  }
}

// ============================================================
// Roof Treatment
// ============================================================

function addRoofTreatment(scene: THREE.Scene, dna: ArchitectFormDNA, baseW: number, baseD: number, topY: number, totalFloors: number) {
  const outline = generateFloorOutline(dna, baseW, baseD, totalFloors - 1, totalFloors);

  switch (dna.roofStyle) {
    case "garden": {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x3a6a3a, roughness: 0.65, metalness: 0.05,
        emissive: 0x2a4a2a, emissiveIntensity: 0.08,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY + 0.1;
      mesh.receiveShadow = true;
      scene.add(mesh);
      break;
    }
    case "crown": {
      const shape = outlineToShape(outline.map(([x, z]) => [x * 0.85, z * 0.85] as [number, number]));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.5, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3 });
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x505878, roughness: 0.25, metalness: 0.55,
        emissive: 0x2a2a48, emissiveIntensity: 0.06,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      scene.add(mesh);
      break;
    }
    case "sculptural": {
      const geo = new THREE.SphereGeometry(Math.min(baseW, baseD) * 0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x505868, roughness: 0.35, metalness: 0.35,
        emissive: 0x252838, emissiveIntensity: 0.06,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      scene.add(mesh);
      break;
    }
    case "sloped": {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: true, bevelSize: 1.5, bevelSegments: 3, bevelThickness: 1.5 });
      geo.rotateX(-Math.PI / 2);
      geo.scale(1, 0.5, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x404858, roughness: 0.45, metalness: 0.25,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = topY;
      mesh.castShadow = true;
      scene.add(mesh);
      break;
    }
    default: {
      const shape = outlineToShape(outline);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const edges = new THREE.EdgesGeometry(geo);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: 0x4a5068, transparent: true, opacity: 0.45,
      }));
      line.position.y = topY;
      scene.add(line);
    }
  }
}

// ============================================================
// Geometry Utilities
// ============================================================

function outlineToShape(outline: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(outline[i][0], outline[i][1]);
  }
  shape.closePath();
  return shape;
}

function applyTerraceInset(outline: [number, number][], depth: number, seed: number): [number, number][] {
  const side = seed % 4;
  return outline.map(([x, z]) => {
    switch (side) {
      case 0: return z < 0 ? [x, z + depth] as [number, number] : [x, z] as [number, number];
      case 1: return x > 0 ? [x - depth, z] as [number, number] : [x, z] as [number, number];
      case 2: return z > 0 ? [x, z - depth] as [number, number] : [x, z] as [number, number];
      case 3: return x < 0 ? [x + depth, z] as [number, number] : [x, z] as [number, number];
      default: return [x, z] as [number, number];
    }
  });
}

function computeDotPosition(
  pos: string,
  floorW: number,
  floorD: number,
  coreR: number,
): { x: number; z: number } {
  const rx = floorW * 0.32;
  const rz = floorD * 0.32;
  switch (pos) {
    case "north":     return { x: 0,   z: rz };
    case "south":     return { x: 0,   z: -rz };
    case "east":      return { x: rx,  z: 0 };
    case "west":      return { x: -rx, z: 0 };
    case "northeast": return { x: rx * 0.7,  z: rz * 0.7 };
    case "northwest": return { x: -rx * 0.7, z: rz * 0.7 };
    case "southeast": return { x: rx * 0.7,  z: -rz * 0.7 };
    case "southwest": return { x: -rx * 0.7, z: -rz * 0.7 };
    default:          return { x: 0, z: 0 };
  }
}

function estimateBuildingHeight(graph: VerticalNodeGraph): number {
  let h = 0;
  const byFloor = new Map<number, FloorNode[]>();
  for (const n of graph.nodes) {
    if (!byFloor.has(n.floor_level)) byFloor.set(n.floor_level, []);
    byFloor.get(n.floor_level)!.push(n);
  }
  for (const [, nodes] of byFloor) {
    const zone = nodes[0]?.floor_zone || "middle";
    h += nodes[0]?.ceiling_height || DEFAULT_CEILING[zone] || 3.8;
  }
  return h;
}

function findNodeId(obj: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData?.nodeId) return cur.userData.nodeId;
    cur = cur.parent;
  }
  return null;
}

function makeLabel(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "28px 'SF Mono', monospace";
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
}

const legendStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 10,
  background: "rgba(20,22,30,0.85)",
  border: "1px solid #2a3040",
  borderRadius: 4,
  padding: "6px 8px",
  pointerEvents: "none",
};
