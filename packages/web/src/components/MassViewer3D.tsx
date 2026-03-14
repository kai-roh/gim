"use client";

import React, { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useGraph } from "@/lib/graph-context";
import {
  ZONE_COLORS_HEX,
  FUNC_COLORS_HEX,
} from "@/lib/graph-colors";
import type { FloorNode, FloorZone, VerticalNodeGraph } from "@gim/core";

// ============================================================
// Constants
// ============================================================

const FLOOR_HEIGHTS: Record<string, number> = {
  basement: 3.5,
  ground: 5.5,
  lower: 5.0,
  middle: 4.0,
  upper: 4.0,
  penthouse: 4.5,
  rooftop: 3.0,
};

// Zone-based setback: multiplier of base footprint
const ZONE_SETBACK: Record<string, { sx: number; sz: number }> = {
  basement: { sx: 1.05, sz: 1.05 },
  ground: { sx: 1.0, sz: 1.0 },
  lower: { sx: 0.95, sz: 0.97 },
  middle: { sx: 0.92, sz: 0.94 },
  upper: { sx: 0.88, sz: 0.90 },
  penthouse: { sx: 0.75, sz: 0.80 },
  rooftop: { sx: 0.65, sz: 0.70 },
};

// Style-influenced form modifiers
const STYLE_MODIFIERS: Record<string, {
  slabEdgeRadius?: number;
  facadeOpacity?: number;
  facadeTint?: number;
  slabOverhang?: number;
  metalness?: number;
  roughness?: number;
}> = {
  hadid: { slabEdgeRadius: 0.4, facadeOpacity: 0.35, facadeTint: 0xd0d8e8, metalness: 0.4 },
  ando: { facadeOpacity: 0.15, facadeTint: 0xb0b0a8, roughness: 0.9, metalness: 0.05 },
  mies: { facadeOpacity: 0.5, facadeTint: 0xc0d4e8, metalness: 0.6, roughness: 0.1 },
  bjarke_ingels: { slabOverhang: 1.5, facadeOpacity: 0.4, facadeTint: 0xd0d8c8 },
  heatherwick: { facadeOpacity: 0.25, facadeTint: 0xd8c8b0, roughness: 0.7 },
  koolhaas: { facadeOpacity: 0.45, facadeTint: 0xc8c8d0, metalness: 0.3 },
  le_corbusier: { facadeOpacity: 0.3, facadeTint: 0xe0e0e0, roughness: 0.6 },
  foster: { facadeOpacity: 0.55, facadeTint: 0xb8d0e8, metalness: 0.5, roughness: 0.1 },
  renzo_piano: { facadeOpacity: 0.45, facadeTint: 0xd0dce0, metalness: 0.35 },
};

// Function category → volume emphasis
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

export function MassViewer3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId } = state;
  const prevSelectedRef = useRef<string | null>(null);

  const initScene = useCallback(() => {
    if (!containerRef.current || !graph) return;
    if (sceneRef.current) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);
    scene.fog = new THREE.Fog(0x0a0a12, 80, 250);

    // ---- Camera ----
    const bldgHeight = estimateBuildingHeight(graph);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 500);
    camera.position.set(45, bldgHeight * 0.6, 55);
    camera.lookAt(0, bldgHeight * 0.35, 0);

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // ---- Controls ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, bldgHeight * 0.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 15;
    controls.maxDistance = 200;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.update();

    // ---- Lights ----
    setupLighting(scene, bldgHeight);

    // ---- Environment ----
    buildEnvironment(scene, graph);

    // ---- State ----
    const ref: SceneState = {
      scene,
      camera,
      renderer,
      controls,
      nodeMeshes: new Map(),
      floorGroups: new Map(),
      coreGroup: new THREE.Group(),
      selectableMeshes: [],
      animId: 0,
    };
    sceneRef.current = ref;

    // ---- Build ----
    buildBuilding(ref, graph);

    // ---- Interaction ----
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener("click", (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(ref.selectableMeshes, true);
      if (hits.length > 0) {
        const nodeId = findNodeId(hits[0].object);
        if (nodeId) dispatch({ type: "SELECT_NODE", nodeId });
      } else {
        dispatch({ type: "SELECT_NODE", nodeId: null });
      }
    });

    // ---- Animate ----
    let time = 0;
    function animate() {
      ref.animId = requestAnimationFrame(animate);
      time += 0.005;
      controls.update();

      // Subtle building glow pulse
      ref.floorGroups.forEach((group) => {
        const curtain = group.userData.curtainWall as THREE.Mesh | undefined;
        if (curtain) {
          const mat = curtain.material as THREE.MeshPhysicalMaterial;
          mat.emissiveIntensity = 0.03 + Math.sin(time * 2) * 0.01;
        }
      });

      renderer.render(scene, camera);
    }
    animate();

    // ---- Resize ----
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
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [graph, dispatch]);

  useEffect(() => {
    const cleanup = initScene();
    return cleanup;
  }, [initScene]);

  // ---- Selection highlight ----
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref || !graph) return;

    // Reset all floors
    ref.floorGroups.forEach((group, floor) => {
      const curtain = group.userData.curtainWall as THREE.Mesh | undefined;
      if (curtain) {
        const mat = curtain.material as THREE.MeshPhysicalMaterial;
        mat.emissiveIntensity = selectedNodeId ? 0.01 : 0.03;
      }
    });

    // Reset all node volumes
    ref.nodeMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = selectedNodeId ? 0.02 : 0.08;
      mat.opacity = selectedNodeId ? 0.15 : 0.4;
      mesh.scale.set(1, 1, 1);
    });

    if (selectedNodeId) {
      // Highlight selected node
      const selectedMesh = ref.nodeMeshes.get(selectedNodeId);
      if (selectedMesh) {
        const mat = selectedMesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5;
        mat.opacity = 0.85;
        selectedMesh.scale.set(1.05, 1.15, 1.05);

        // Highlight floor
        const node = graph.nodes.find((n) => n.id === selectedNodeId);
        if (node) {
          const floorGroup = ref.floorGroups.get(node.floor_level);
          if (floorGroup) {
            const curtain = floorGroup.userData.curtainWall as THREE.Mesh | undefined;
            if (curtain) {
              (curtain.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.08;
            }
          }
        }

        ref.controls.target.lerp(selectedMesh.position.clone(), 0.3);
      }

      // Highlight connected
      const connectedIds = new Set<string>();
      for (const e of graph.edges) {
        if (e.source === selectedNodeId) connectedIds.add(e.target);
        if (e.target === selectedNodeId) connectedIds.add(e.source);
      }
      connectedIds.forEach((id) => {
        const mesh = ref.nodeMeshes.get(id);
        if (mesh) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.25;
          mat.opacity = 0.6;
        }
      });
    }

    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId, graph]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Floor legend overlay */}
      {graph && (
        <div style={legendStyle}>
          <div style={{ fontSize: 9, color: "#666", marginBottom: 4 }}>
            {graph.global.site.location} | {graph.nodes.length} nodes
          </div>
          {Object.entries(ZONE_COLORS_HEX).map(([zone, color]) => (
            <div key={zone} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, color: "#555" }}>
              <div style={{ width: 6, height: 6, borderRadius: 1, background: `#${color.toString(16).padStart(6, "0")}` }} />
              {zone}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Types
// ============================================================

interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  nodeMeshes: Map<string, THREE.Mesh>;
  floorGroups: Map<number, THREE.Group>;
  coreGroup: THREE.Group;
  selectableMeshes: THREE.Object3D[];
  animId: number;
}

// ============================================================
// Lighting
// ============================================================

function setupLighting(scene: THREE.Scene, bldgHeight: number) {
  // Hemisphere: sky/ground ambient
  const hemi = new THREE.HemisphereLight(0x1a2040, 0x0a0a10, 0.4);
  scene.add(hemi);

  // Key light (warm, upper right)
  const key = new THREE.DirectionalLight(0xffeedd, 1.2);
  key.position.set(30, bldgHeight * 1.5, 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -40;
  key.shadow.camera.right = 40;
  key.shadow.camera.top = bldgHeight + 10;
  key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = bldgHeight * 3;
  key.shadow.bias = -0.001;
  scene.add(key);

  // Fill light (cool, left side)
  const fill = new THREE.DirectionalLight(0x8899bb, 0.4);
  fill.position.set(-40, bldgHeight * 0.8, -20);
  scene.add(fill);

  // Rim light (back)
  const rim = new THREE.DirectionalLight(0x6677aa, 0.3);
  rim.position.set(-10, bldgHeight * 0.3, -50);
  scene.add(rim);

  // Ground bounce
  const bounce = new THREE.PointLight(0x334455, 0.3, bldgHeight * 2);
  bounce.position.set(0, -2, 0);
  scene.add(bounce);
}

// ============================================================
// Environment (ground, site, context)
// ============================================================

function buildEnvironment(scene: THREE.Scene, graph: VerticalNodeGraph) {
  const [siteW, siteD] = graph.global.site.dimensions; // meters

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e16,
    roughness: 0.95,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Site boundary
  const siteShape = new THREE.Shape();
  const hw = siteW / 2, hd = siteD / 2;
  siteShape.moveTo(-hw, -hd);
  siteShape.lineTo(hw, -hd);
  siteShape.lineTo(hw, hd);
  siteShape.lineTo(-hw, hd);
  siteShape.closePath();

  const siteLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, 0.05, -hd),
      new THREE.Vector3(hw, 0.05, -hd),
      new THREE.Vector3(hw, 0.05, hd),
      new THREE.Vector3(-hw, 0.05, hd),
      new THREE.Vector3(-hw, 0.05, -hd),
    ]),
    new THREE.LineBasicMaterial({ color: 0x2a2a4e, transparent: true, opacity: 0.5 })
  );
  scene.add(siteLine);

  // Subtle grid within site
  const siteGrid = new THREE.GridHelper(Math.max(siteW, siteD) * 1.5, 30, 0x151520, 0x0e0e16);
  siteGrid.position.y = 0;
  scene.add(siteGrid);

  // Context hints (north arrow)
  const arrowGeo = new THREE.ConeGeometry(0.5, 2, 4);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x334455 });
  const arrow = new THREE.Mesh(arrowGeo, arrowMat);
  arrow.position.set(0, 0.5, hd + 5);
  arrow.rotation.x = 0;
  scene.add(arrow);

  const nLabel = makeTextSprite("N", 0x556677);
  nLabel.position.set(0, 2, hd + 5);
  nLabel.scale.set(4, 2, 1);
  scene.add(nLabel);

  // Context direction labels
  const ctx = graph.global.site.context;
  const dirs: [string, string, THREE.Vector3][] = [
    ["N", ctx.north, new THREE.Vector3(0, 1, hd + 10)],
    ["S", ctx.south, new THREE.Vector3(0, 1, -(hd + 10))],
    ["E", ctx.east, new THREE.Vector3(hw + 10, 1, 0)],
    ["W", ctx.west, new THREE.Vector3(-(hw + 10), 1, 0)],
  ];
  for (const [, label, pos] of dirs) {
    if (!label) continue;
    const shortLabel = label.length > 12 ? label.slice(0, 12) + "…" : label;
    const sprite = makeTextSprite(shortLabel, 0x444455);
    sprite.position.copy(pos);
    sprite.scale.set(12, 4, 1);
    scene.add(sprite);
  }
}

// ============================================================
// Building Construction
// ============================================================

function buildBuilding(ref: SceneState, graph: VerticalNodeGraph) {
  const { scene, nodeMeshes, floorGroups, selectableMeshes } = ref;
  const [siteW, siteD] = graph.global.site.dimensions;
  const bcr = graph.global.site.bcr / 100;

  // Base building footprint from site + BCR
  const footprintArea = siteW * siteD * bcr;
  const baseW = Math.sqrt(footprintArea * (siteW / siteD));
  const baseD = footprintArea / baseW;

  // Organize nodes by floor
  const nodesByFloor = new Map<number, FloorNode[]>();
  for (const n of graph.nodes) {
    if (!nodesByFloor.has(n.floor_level)) nodesByFloor.set(n.floor_level, []);
    nodesByFloor.get(n.floor_level)!.push(n);
  }

  const floors = Array.from(nodesByFloor.keys()).sort((a, b) => a - b);
  const minFloor = floors[0];

  // Compute cumulative heights
  const floorYBase = new Map<number, number>();
  const floorHeights = new Map<number, number>();
  let cumY = 0;

  for (const floor of floors) {
    const nodes = nodesByFloor.get(floor)!;
    const zone = nodes[0]?.floor_zone || "middle";

    // Below ground floors start below 0
    if (floor < 0) {
      const h = FLOOR_HEIGHTS[zone] || 3.5;
      floorHeights.set(floor, h);
      floorYBase.set(floor, -(Math.abs(floor) * h));
    } else {
      const h = FLOOR_HEIGHTS[zone] || 4.0;
      floorHeights.set(floor, h);
      floorYBase.set(floor, cumY);
      cumY += h;
    }
  }

  // ---- Core (vertical solid) ----
  const coreW = baseW * 0.2;
  const coreD = baseD * 0.22;
  const coreMinY = floorYBase.get(minFloor) || 0;
  const coreMaxY = cumY;
  const coreH = coreMaxY - coreMinY;

  const coreGeo = new THREE.BoxGeometry(coreW, coreH, coreD);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a3a,
    roughness: 0.8,
    metalness: 0.1,
    emissive: 0x111120,
    emissiveIntensity: 0.05,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0, coreMinY + coreH / 2, 0);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  scene.add(coreMesh);
  ref.coreGroup.add(coreMesh);

  // ---- Build each floor ----
  for (const floor of floors) {
    const nodes = nodesByFloor.get(floor)!;
    const zone = nodes[0]?.floor_zone || "middle";
    const y = floorYBase.get(floor)!;
    const h = floorHeights.get(floor)!;
    const setback = ZONE_SETBACK[zone] || { sx: 1, sz: 1 };

    // Determine dominant style for this floor
    const styleRefs = nodes.map((n) => n.style_ref).filter(Boolean);
    const dominantStyle = styleRefs.length > 0 ? getMostFrequent(styleRefs as string[]) : null;
    const styleMod = dominantStyle ? STYLE_MODIFIERS[dominantStyle] : null;

    const floorW = baseW * setback.sx;
    const floorD = baseD * setback.sz;

    const floorGroup = new THREE.Group();
    floorGroup.userData = { floor, zone, nodes };

    // ---- Floor slab ----
    const slabThickness = 0.35;
    const slabGeo = createSlabGeometry(floorW, slabThickness, floorD, styleMod?.slabEdgeRadius);
    const slabColor = zone === "basement" ? 0x1a1a22 : 0x222230;
    const slabMat = new THREE.MeshStandardMaterial({
      color: slabColor,
      roughness: 0.75,
      metalness: 0.15,
      emissive: 0x0a0a15,
      emissiveIntensity: 0.02,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, y, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    floorGroup.add(slab);

    // ---- Curtain wall / facade ----
    if (floor >= 0) {
      const facadeH = h - slabThickness;
      const facadeOpacity = styleMod?.facadeOpacity ?? 0.3;
      const facadeTint = styleMod?.facadeTint ?? 0xb0c0d8;
      const facadeMetalness = styleMod?.metalness ?? 0.3;
      const facadeRoughness = styleMod?.roughness ?? 0.15;

      const curtainWall = createCurtainWall(
        floorW, facadeH, floorD,
        facadeTint, facadeOpacity, facadeMetalness, facadeRoughness,
        zone, nodes,
      );
      curtainWall.position.set(0, y + slabThickness + facadeH / 2, 0);
      floorGroup.add(curtainWall);
      floorGroup.userData.curtainWall = curtainWall;
    }

    // ---- Program volumes (interior spaces) ----
    const programNodes = nodes.filter((n) => !["elevator_core", "stairwell", "service_shaft", "elevator_lobby"].includes(n.function));

    if (programNodes.length > 0) {
      const volumeH = h * 0.6;
      const volumeY = y + slabThickness + volumeH / 2;
      const usableW = floorW - coreW - 1.5;
      const usableD = floorD - 1.0;

      // Layout program volumes around core
      const layoutPositions = computeProgramLayout(programNodes, usableW, usableD, coreW, coreD);

      for (let i = 0; i < programNodes.length; i++) {
        const node = programNodes[i];
        const layout = layoutPositions[i];
        const cat = getFuncCategory(node.function);
        const color = FUNC_COLORS_HEX[node.function] || ZONE_COLORS_HEX[zone] || 0x555555;

        const vw = layout.w;
        const vd = layout.d;
        const vGeo = new THREE.BoxGeometry(vw, volumeH, vd);
        const vMat = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.4,
          roughness: 0.4,
          metalness: 0.1,
          emissive: color,
          emissiveIntensity: 0.08,
          side: THREE.DoubleSide,
        });

        const vMesh = new THREE.Mesh(vGeo, vMat);
        vMesh.position.set(layout.x, volumeY, layout.z);
        vMesh.userData = { nodeId: node.id, node };
        vMesh.castShadow = true;
        floorGroup.add(vMesh);
        nodeMeshes.set(node.id, vMesh);
        selectableMeshes.push(vMesh);
      }
    }

    // ---- Core nodes (make them selectable via the core mesh area) ----
    const coreNodes = nodes.filter((n) => ["elevator_core", "stairwell", "service_shaft", "elevator_lobby"].includes(n.function));
    for (const cn of coreNodes) {
      // Small invisible clickable mesh at core location for this floor
      const cGeo = new THREE.BoxGeometry(coreW * 0.8, h * 0.5, coreD * 0.8);
      const cMat = new THREE.MeshBasicMaterial({ visible: false });
      const cMesh = new THREE.Mesh(cGeo, cMat);
      cMesh.position.set(0, y + h / 2, 0);
      cMesh.userData = { nodeId: cn.id, node: cn };
      floorGroup.add(cMesh);
      nodeMeshes.set(cn.id, cMesh);
      selectableMeshes.push(cMesh);
    }

    scene.add(floorGroup);
    floorGroups.set(floor, floorGroup);
  }

  // ---- Ground floor canopy / entrance ----
  const groundFloor = floors.find((f) => f === 0 || f === 1);
  if (groundFloor !== undefined) {
    const gy = floorYBase.get(groundFloor) || 0;
    const gSetback = ZONE_SETBACK["ground"] || { sx: 1, sz: 1 };
    const gw = baseW * gSetback.sx;

    // Entrance canopy (south side)
    const canopyGeo = new THREE.BoxGeometry(gw * 0.4, 0.15, 3);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0x151525,
      emissiveIntensity: 0.05,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    const gd = baseD * gSetback.sz;
    canopy.position.set(0, gy + (FLOOR_HEIGHTS["ground"] || 5) * 0.7, -(gd / 2 + 1.5));
    canopy.castShadow = true;
    scene.add(canopy);
  }

  // ---- Rooftop features ----
  const rooftopFloor = floors[floors.length - 1];
  if (rooftopFloor !== undefined) {
    const ry = (floorYBase.get(rooftopFloor) || 0) + (floorHeights.get(rooftopFloor) || 3);
    const rSetback = ZONE_SETBACK["rooftop"] || { sx: 0.65, sz: 0.7 };
    const rw = baseW * rSetback.sx;
    const rd = baseD * rSetback.sz;

    // Rooftop parapet
    const parapetGeo = new THREE.BoxGeometry(rw + 0.5, 1.0, rd + 0.5);
    const parapetEdges = new THREE.EdgesGeometry(parapetGeo);
    const parapetLine = new THREE.LineSegments(
      parapetEdges,
      new THREE.LineBasicMaterial({ color: 0x333345, transparent: true, opacity: 0.4 })
    );
    parapetLine.position.set(0, ry + 0.5, 0);
    scene.add(parapetLine);
  }

  // ---- Floor labels ----
  for (const floor of floors) {
    const y = floorYBase.get(floor)!;
    const h = floorHeights.get(floor)!;
    const zone = nodesByFloor.get(floor)![0]?.floor_zone || "middle";
    const setback = ZONE_SETBACK[zone] || { sx: 1, sz: 1 };
    const fw = baseW * setback.sx;

    const label = floor < 0 ? `B${Math.abs(floor)}` : `${floor}F`;
    const sprite = makeTextSprite(label, 0x445566);
    sprite.position.set(fw / 2 + 3, y + h / 2, 0);
    sprite.scale.set(5, 2.5, 1);
    scene.add(sprite);
  }
}

// ============================================================
// Geometry Helpers
// ============================================================

function createSlabGeometry(
  width: number,
  height: number,
  depth: number,
  edgeRadius?: number,
): THREE.BufferGeometry {
  if (edgeRadius && edgeRadius > 0) {
    // Rounded slab (for parametric styles like Hadid)
    const shape = new THREE.Shape();
    const hw = width / 2, hd = depth / 2;
    const r = Math.min(edgeRadius * 2, hw * 0.3, hd * 0.3);
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    const extrudeSettings = { depth: height, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  return new THREE.BoxGeometry(width, height, depth);
}

function createCurtainWall(
  width: number,
  height: number,
  depth: number,
  tint: number,
  opacity: number,
  metalness: number,
  roughness: number,
  zone: string,
  nodes: FloorNode[],
): THREE.Mesh {
  // Use MeshPhysicalMaterial for glass-like curtain wall
  const geo = new THREE.BoxGeometry(width - 0.1, height, depth - 0.1);

  // Calculate interior light warmth from function
  const hasExperience = nodes.some((n) => getFuncCategory(n.function) === "experience");
  const hasPublic = nodes.some((n) => getFuncCategory(n.function) === "public");
  const emissiveColor = hasExperience ? 0x2a1a08 : hasPublic ? 0x0a1a2a : 0x0a0a18;

  const mat = new THREE.MeshPhysicalMaterial({
    color: tint,
    transparent: true,
    opacity: opacity,
    roughness: roughness,
    metalness: metalness,
    emissive: emissiveColor,
    emissiveIntensity: 0.03,
    side: THREE.DoubleSide,
    transmission: 0.4,
    thickness: 0.1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

// ============================================================
// Program Layout (arrange volumes around core)
// ============================================================

function computeProgramLayout(
  nodes: FloorNode[],
  usableW: number,
  usableD: number,
  coreW: number,
  coreD: number,
): { x: number; z: number; w: number; d: number }[] {
  const n = nodes.length;
  if (n === 0) return [];

  const results: { x: number; z: number; w: number; d: number }[] = [];

  // Divide available space into zones around core
  // Layout: north strip, south strip, east strip, west strip
  const halfCoreW = coreW / 2 + 0.4;
  const halfCoreD = coreD / 2 + 0.4;
  const halfW = usableW / 2 + halfCoreW;
  const halfD = usableD / 2 + halfCoreD;

  // Assign positions based on node.position field
  for (const node of nodes) {
    const pos = node.position || "center";
    let x = 0, z = 0;
    let w = usableW / Math.max(2, Math.ceil(n / 2));
    let d = usableD / Math.max(2, Math.ceil(n / 2));

    // Clamp volume size
    w = Math.min(w, usableW * 0.7);
    d = Math.min(d, usableD * 0.7);
    w = Math.max(w, 2);
    d = Math.max(d, 2);

    switch (pos) {
      case "north": x = 0; z = halfCoreD + d / 2; break;
      case "south": x = 0; z = -(halfCoreD + d / 2); break;
      case "east": x = halfCoreW + w / 2; z = 0; break;
      case "west": x = -(halfCoreW + w / 2); z = 0; break;
      case "northeast": x = halfCoreW + w / 2; z = halfCoreD + d / 2; break;
      case "northwest": x = -(halfCoreW + w / 2); z = halfCoreD + d / 2; break;
      case "southeast": x = halfCoreW + w / 2; z = -(halfCoreD + d / 2); break;
      case "southwest": x = -(halfCoreW + w / 2); z = -(halfCoreD + d / 2); break;
      default: // center — place around the core
        x = 0;
        z = halfCoreD + d / 2;
        break;
    }

    // Clamp within building footprint
    x = Math.max(-(halfW - w / 2), Math.min(halfW - w / 2, x));
    z = Math.max(-(halfD - d / 2), Math.min(halfD - d / 2, z));

    results.push({ x, z, w, d });
  }

  return results;
}

// ============================================================
// Utilities
// ============================================================

function estimateBuildingHeight(graph: VerticalNodeGraph): number {
  const nodesByFloor = new Map<number, FloorNode[]>();
  for (const n of graph.nodes) {
    if (!nodesByFloor.has(n.floor_level)) nodesByFloor.set(n.floor_level, []);
    nodesByFloor.get(n.floor_level)!.push(n);
  }

  let totalH = 0;
  for (const [, nodes] of nodesByFloor) {
    const zone = nodes[0]?.floor_zone || "middle";
    totalH += FLOOR_HEIGHTS[zone] || 4.0;
  }
  return totalH;
}

function getMostFrequent(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const s of arr) counts.set(s, (counts.get(s) || 0) + 1);
  let max = 0, result = arr[0];
  for (const [k, v] of counts) {
    if (v > max) { max = v; result = k; }
  }
  return result;
}

function findNodeId(obj: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData?.nodeId) return current.userData.nodeId;
    current = current.parent;
  }
  return null;
}

function makeTextSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "32px 'SF Mono', 'Fira Code', monospace";
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  return new THREE.Sprite(mat);
}

// ============================================================
// Legend style
// ============================================================

const legendStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  background: "rgba(10,10,18,0.85)",
  border: "1px solid #1a1a2e",
  borderRadius: 4,
  padding: "8px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  pointerEvents: "none",
};
