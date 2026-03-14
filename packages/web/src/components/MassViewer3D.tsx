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
// Component
// ============================================================

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  nodeMeshes: Map<string, THREE.Mesh>;
  floorSlabs: Map<number, THREE.Group>;
  selectables: THREE.Object3D[];
  animId: number;
}

export function MassViewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId } = state;

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
    // Ambient: bright enough to read surfaces on all sides
    scene.add(new THREE.HemisphereLight(0x7090c0, 0x1a1820, 0.7));
    // Key (sun): warm, strong, casts crisp shadows
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
    // Fill: cool blue from opposite side
    const fill = new THREE.DirectionalLight(0x80a8d0, 0.6);
    fill.position.set(-40, bldgH * 0.6, -25);
    scene.add(fill);
    // Rim: backlight for silhouette separation
    const rim = new THREE.DirectionalLight(0x90a0cc, 0.45);
    rim.position.set(-15, bldgH * 0.4, -50);
    scene.add(rim);
    // Ground bounce: subtle warm uplight
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

  // ---- Selection ----
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;

    // Reset all dots to default
    ref.nodeMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = selectedNodeId ? 0.08 : 0.25;
      mat.opacity = selectedNodeId ? 0.25 : 0.7;
      mesh.scale.set(1, 1, 1);
    });
    ref.floorSlabs.forEach((group) => {
      group.children.forEach((child) => {
        if ((child as any).userData?.isFacade) {
          const mat = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
          mat.emissiveIntensity = selectedNodeId ? 0.01 : 0.025;
        }
      });
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

      // Highlight floor slab facade
      const node = graph.nodes.find((n) => n.id === selectedNodeId);
      if (node) {
        const group = ref.floorSlabs.get(node.floor_level);
        group?.children.forEach((child) => {
          if ((child as any).userData?.isFacade) {
            const mat = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
            mat.emissiveIntensity = 0.06;
          }
        });
      }
    }
  }, [selectedNodeId, graph]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {graph && (
        <div style={legendStyle}>
          <div style={{ fontSize: 9, color: "#777", marginBottom: 3 }}>
            {graph.global.site.location}
          </div>
          <div style={{ fontSize: 8, color: "#555" }}>
            {graph.nodes.length} nodes | {graph.edges.length} edges
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Environment
// ============================================================

function buildEnvironment(scene: THREE.Scene, graph: VerticalNodeGraph) {
  const [siteW, siteD] = graph.global.site.dimensions;

  // Ground — lighter surface so building shadow reads clearly
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
// Building
// ============================================================

function buildBuilding(ref: SceneState, graph: VerticalNodeGraph) {
  const { scene, nodeMeshes, floorSlabs, selectables } = ref;
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

  // ---- Core (thin translucent spine) ----
  const coreR = Math.min(baseW, baseD) * 0.04;
  const minY = floorY.get(floors[0]) || 0;
  const totalH = cumY - minY;
  const coreGeo = new THREE.CylinderGeometry(coreR, coreR, totalH, 12);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: 0x404860, transparent: true, opacity: 0.2,
    roughness: 0.2, metalness: 0.6,
    emissive: 0x2a2a48, emissiveIntensity: 0.06,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(0, minY + totalH / 2, 0);
  scene.add(core);

  // ---- Per-floor construction ----
  for (let fi = 0; fi < floors.length; fi++) {
    const floor = floors[fi];
    const nodes = nodesByFloor.get(floor)!;
    const zone = nodes[0]?.floor_zone || "middle";
    const y = floorY.get(floor)!;
    const h = floorH.get(floor)!;

    // Per-floor style
    const floorStyle = nodes.find((n) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);

    // Floor index (0-based for above-ground)
    const aboveIdx = floor < 0 ? 0 : aboveGroundFloors.indexOf(floor);
    const floorRatio = totalAbove > 1 ? aboveIdx / (totalAbove - 1) : 0.5;

    // Ground expansion
    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;
    const fW = baseW * groundScale;
    const fD = baseD * groundScale;

    // Use precomputed geometry if available, otherwise generate on-the-fly
    const precomputed = nodes[0]?.geometry;
    const outline = precomputed?.outline ?? generateFloorOutline(floorDNA, fW, fD, aboveIdx, totalAbove);

    // Terrace check
    const hasTerrace = floor > 0 && shouldHaveTerrace(floorDNA, aboveIdx, totalAbove);

    const floorGroup = new THREE.Group();

    // ---- Slab ----
    const slabThick = 0.3;
    const slabShape = outlineToShape(outline);
    const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: slabThick, bevelEnabled: false });
    slabGeo.rotateX(-Math.PI / 2);

    const slabColor = zone === "basement" ? 0x2a2c34 : floor === 0 ? 0x3a3e4a : 0x303440;
    const slabMat = new THREE.MeshStandardMaterial({
      color: slabColor, roughness: 0.6, metalness: 0.15,
      emissive: 0x101418, emissiveIntensity: 0.03,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = y;
    slab.castShadow = true;
    slab.receiveShadow = true;
    floorGroup.add(slab);

    // ---- Slab edge highlight (floor division lines) ----
    const edgeGeo = new THREE.EdgesGeometry(slabGeo);
    const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: 0x5a6078, transparent: true, opacity: 0.6,
    }));
    edgeLine.position.y = y;
    floorGroup.add(edgeLine);

    // ---- Building envelope (outer wall surface per floor) ----
    if (floor >= 0) {
      const facadeH = h - slabThick;
      const wallOutline = hasTerrace
        ? applyTerraceInset(outline, floorDNA.terraceDepth, aboveIdx)
        : outline;

      // Check for void cuts
      const hwApprox = fW / 2;
      const hdApprox = fD / 2;
      const hasVoidFloor = isInVoidCut(floorDNA, floorRatio, 0, 0, hwApprox, hdApprox);

      // Wall surface (ring of vertical panels — no top/bottom caps)
      const wallGeo = buildWallGeometry(wallOutline, facadeH);

      // Interior warmth based on program
      const hasExperience = nodes.some((n) => getFuncCategory(n.function) === "experience");
      const hasPublic = nodes.some((n) => getFuncCategory(n.function) === "public");
      const emColor = hasExperience ? 0x3a2010 : hasPublic ? 0x102a3a : 0x181c24;

      // Glass ratio — higher facadeOpacity = more glass, lower = more solid wall
      const glassRatio = floorDNA.facadeOpacity;
      const wallOpacity = hasVoidFloor ? 0.15 : (0.55 + glassRatio * 0.4); // 0.55–0.95

      const wallMat = new THREE.MeshPhysicalMaterial({
        color: floorDNA.facadeColor,
        transparent: true,
        opacity: wallOpacity,
        roughness: floorDNA.facadeRoughness,
        metalness: Math.min(floorDNA.facadeMetalness + 0.15, 0.85),
        emissive: emColor,
        emissiveIntensity: 0.06 + floorDNA.interiorWarmth * 0.08,
        side: THREE.FrontSide,
        clearcoat: glassRatio > 0.3 ? 0.35 : 0.05,
        clearcoatRoughness: 0.15,
      });

      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.y = y + slabThick;
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData = { isFacade: true };
      floorGroup.add(wall);

      // ---- Mullion grid (vertical + horizontal lines on facade) ----
      const mullionColor = glassRatio > 0.35 ? 0x5a6080 : 0x404858;
      const mullionOpacity = glassRatio > 0.35 ? 0.45 : 0.3;
      addMullionGrid(floorGroup, wallOutline, y + slabThick, facadeH, mullionColor, mullionOpacity);
    }

    // ---- Pilotis (ground floor columns if applicable) ----
    if (floorDNA.pilotis && floor === 0) {
      const colR = 0.3;
      const colH = h;
      const colPositions: [number, number][] = [
        [-fW * 0.3, -fD * 0.3], [fW * 0.3, -fD * 0.3],
        [-fW * 0.3, fD * 0.3], [fW * 0.3, fD * 0.3],
        [0, -fD * 0.35], [0, fD * 0.35],
      ];
      for (const [cx, cz] of colPositions) {
        const colGeo = new THREE.CylinderGeometry(colR, colR, colH, 8);
        const colMat = new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.6, metalness: 0.2 });
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(cx, y + colH / 2, cz);
        col.castShadow = true;
        floorGroup.add(col);
      }
    }

    // ---- Diagrid structure ----
    if (floorDNA.showDiagrid && floor >= 0 && fi < floors.length - 1) {
      addDiagridSegment(floorGroup, outline, y + slabThick, h, floorDNA);
    }

    // ---- Exoskeleton structure ----
    if (floorDNA.showExoskeleton && floor >= 0 && fi < floors.length - 1) {
      addExoskeletonSegment(floorGroup, outline, y + slabThick, h);
    }

    // ---- Column expression ----
    if (floorDNA.columnExpression && floor >= 0) {
      addColumnExpression(floorGroup, outline, y, h);
    }

    // ---- Node dots (small glowing spheres) ----
    const dotR = 0.35;
    const dotGeo = new THREE.SphereGeometry(dotR, 8, 6);
    const dotY = y + h * 0.5;

    for (const node of nodes) {
      const cat = getFuncCategory(node.function);
      const color = FUNC_COLORS_HEX[node.function] || ZONE_COLORS_HEX[zone] || 0x555555;
      const pos = computeDotPosition(node.position, fW, fD, coreR);

      const dotMat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: cat === "core" ? 0.3 : 0.7,
        roughness: 0.2,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.25,
      });

      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(pos.x, dotY, pos.z);
      dot.userData = { nodeId: node.id, node };
      floorGroup.add(dot);
      nodeMeshes.set(node.id, dot);
      selectables.push(dot);
    }

    // ---- Floor label ----
    const label = floor < 0 ? `B${Math.abs(floor)}` : `${floor}F`;
    const sprite = makeLabel(label, 0x6a7890);
    const labelX = fW / 2 + 3;
    sprite.position.set(labelX, y + h / 2, 0);
    sprite.scale.set(4, 2, 1);
    floorGroup.add(sprite);

    scene.add(floorGroup);
    floorSlabs.set(floor, floorGroup);
  }

  // ---- Terrace / setback visualization ----
  // Terrace floors get a green-tinted slab extension
  for (let fi = 0; fi < floors.length; fi++) {
    const floor = floors[fi];
    if (floor <= 0) continue;
    const aboveIdx = aboveGroundFloors.indexOf(floor);
    const floorStyle = nodesByFloor.get(floor)![0]?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);
    if (!shouldHaveTerrace(floorDNA, aboveIdx, totalAbove)) continue;

    const y = floorY.get(floor)!;
    const gScale = floor <= 1 ? floorDNA.groundExpansion : 1;
    const outline = generateFloorOutline(floorDNA, baseW * gScale, baseD * gScale, aboveIdx, totalAbove);
    const terraceOutline = applyTerraceInset(outline, floorDNA.terraceDepth, aboveIdx);

    // Terrace slab (thin green plate where building steps back)
    const terraceGeo = new THREE.ExtrudeGeometry(
      outlineToShape(outline), { depth: 0.15, bevelEnabled: false },
    );
    terraceGeo.rotateX(-Math.PI / 2);
    const terraceMat = new THREE.MeshStandardMaterial({
      color: 0x3a6a3a, roughness: 0.55, metalness: 0.05,
      emissive: 0x2a4a2a, emissiveIntensity: 0.08,
    });
    const terrace = new THREE.Mesh(terraceGeo, terraceMat);
    terrace.position.y = y + 0.3;
    terrace.receiveShadow = true;
    const group = floorSlabs.get(floor);
    if (group) group.add(terrace);
  }

  // ---- Roof treatment ----
  const topFloor = floors[floors.length - 1];
  const topY = (floorY.get(topFloor) || 0) + (floorH.get(topFloor) || 3);
  addRoofTreatment(scene, dominantDNA, baseW, baseD, topY, totalAbove);

  // ---- Loft surface (smooth/sculptural architects) ----
  if (dominantDNA.transitionStyle === "smooth" || dominantDNA.transitionStyle === "sculptural") {
    buildLoftSurface(scene, dominantDNA, baseW, baseD, aboveGroundFloors, floorY, floorH, nodesByFloor);
  }

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
  scene.add(canopy);
}

// ============================================================
// Loft Surface — Smooth Parametric Skin
// ============================================================

/**
 * Creates a continuous loft surface between floor plate outlines.
 * For smooth architects (Hadid, Gaudi, Aalto, Snohetta), this replaces
 * the per-floor discrete facade with a flowing parametric surface.
 *
 * The technique: collect 2D outlines at each floor height, normalize
 * point counts, then build a BufferGeometry by connecting corresponding
 * points between floors with Catmull-Rom interpolation.
 */
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
  const targetPts = 32; // normalize all outlines to this count

  // Collect cross-sections: { height, outline }
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

    // Bottom of floor
    sections.push({ y, outline: normalizeOutline(outline, targetPts) });
    // Top of floor (for correct height)
    sections.push({ y: y + h, outline: normalizeOutline(outline, targetPts) });
  }

  if (sections.length < 2) return;

  // Interpolation segments between sections
  const isSculptural = dna.transitionStyle === "sculptural";
  const interpSegs = isSculptural ? 6 : 4; // more segments = smoother

  // Build interpolated cross-sections using Catmull-Rom
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

  // Build BufferGeometry from loft
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

  // Indices (quad mesh)
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

  // Wireframe overlay (subtle panel lines on curved surface)
  const wireGeo = new THREE.WireframeGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x506080,
    transparent: true,
    opacity: 0.15,
  });
  const wireframe = new THREE.LineSegments(wireGeo, wireMat);
  scene.add(wireframe);
}

/**
 * Catmull-Rom spline interpolation for a single value
 */
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

/**
 * Normalize an outline to exactly `count` evenly-spaced points
 * by resampling along the polygon perimeter.
 */
function normalizeOutline(outline: [number, number][], count: number): [number, number][] {
  if (outline.length === count) return outline;
  if (outline.length === 0) return Array(count).fill([0, 0]) as [number, number][];

  // Compute cumulative arc lengths
  const arcLens: number[] = [0];
  for (let i = 1; i < outline.length; i++) {
    const dx = outline[i][0] - outline[i - 1][0];
    const dz = outline[i][1] - outline[i - 1][1];
    arcLens.push(arcLens[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }
  // Close the loop
  const dx = outline[0][0] - outline[outline.length - 1][0];
  const dz = outline[0][1] - outline[outline.length - 1][1];
  const totalLen = arcLens[arcLens.length - 1] + Math.sqrt(dx * dx + dz * dz);

  const result: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const targetLen = (i / count) * totalLen;

    // Find segment
    let seg = 0;
    for (seg = 0; seg < arcLens.length - 1; seg++) {
      if (arcLens[seg + 1] >= targetLen) break;
    }

    const segLen = seg < arcLens.length - 1
      ? arcLens[seg + 1] - arcLens[seg]
      : totalLen - arcLens[arcLens.length - 1]; // last segment to close

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

/**
 * Build a wall-only surface: ring of vertical quads around the outline.
 * No top/bottom caps — just the outer skin, like a real building envelope.
 */
function buildWallGeometry(outline: [number, number][], height: number): THREE.BufferGeometry {
  const n = outline.length;
  const positions = new Float32Array(n * 6 * 3);
  const normals = new Float32Array(n * 6 * 3);
  const uvs = new Float32Array(n * 6 * 2);

  // Compute total perimeter for UV mapping
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

    // Outward normal
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = dz / len, nz = -dx / len;

    const b = i * 18;
    // Triangle 1: BL, BR, TR
    positions[b]     = x1; positions[b + 1]  = 0;      positions[b + 2]  = z1;
    positions[b + 3] = x2; positions[b + 4]  = 0;      positions[b + 5]  = z2;
    positions[b + 6] = x2; positions[b + 7]  = height; positions[b + 8]  = z2;
    // Triangle 2: BL, TR, TL
    positions[b + 9]  = x1; positions[b + 10] = 0;      positions[b + 11] = z1;
    positions[b + 12] = x2; positions[b + 13] = height; positions[b + 14] = z2;
    positions[b + 15] = x1; positions[b + 16] = height; positions[b + 17] = z1;

    for (let v = 0; v < 6; v++) {
      normals[b + v * 3] = nx;
      normals[b + v * 3 + 1] = 0;
      normals[b + v * 3 + 2] = nz;
    }

    // UVs for texture mapping
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

/**
 * Add mullion lines on the facade — vertical + horizontal divisions
 * that give the building envelope visual detail and scale.
 */
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

  // Vertical mullions — every few outline points
  const step = Math.max(2, Math.floor(n / 16));
  const verts: number[] = [];
  for (let i = 0; i < n; i += step) {
    const [x, z] = outline[i];
    verts.push(x, baseY, z, x, baseY + height, z);
  }

  // Horizontal band at mid-height (spandrel line)
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
    // Diagonal cross
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
    // Vertical strut
    const nx = x * 1.05, nz = z * 1.05; // slightly outside building
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
      // Flat roof - just parapet wireframe
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
  // Inset one side based on seed
  const side = seed % 4; // 0=south, 1=east, 2=north, 3=west
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

/** Place dots within the floor plate based on cardinal position */
function computeDotPosition(
  pos: string,
  floorW: number,
  floorD: number,
  coreR: number,
): { x: number; z: number } {
  const rx = floorW * 0.32; // spread radius X
  const rz = floorD * 0.32; // spread radius Z
  switch (pos) {
    case "north":     return { x: 0,   z: rz };
    case "south":     return { x: 0,   z: -rz };
    case "east":      return { x: rx,  z: 0 };
    case "west":      return { x: -rx, z: 0 };
    case "northeast": return { x: rx * 0.7,  z: rz * 0.7 };
    case "northwest": return { x: -rx * 0.7, z: rz * 0.7 };
    case "southeast": return { x: rx * 0.7,  z: -rz * 0.7 };
    case "southwest": return { x: -rx * 0.7, z: -rz * 0.7 };
    default:          return { x: 0, z: 0 }; // center
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
