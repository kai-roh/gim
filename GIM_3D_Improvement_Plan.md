# GIM 3D 매스 렌더링 개선 계획

## 현재 구현 상태 (2025-03-15 기준)

### 해결된 문제들

원래 병목이었던 "노드 = 박스, 엣지 = 스택" 구조는 **이미 해결됨**:

```
건축가 토론 합의 (풍부한 형태 서술)
    │
    ▼
ArchitectFormDNA (20개 건축가별 파라미터) ← 구현됨
    │
    ▼
FloorNode + FloorGeometry (기하학 파라미터 포함) ← 구현됨
    │
    ▼
Per-floor ExtrudeGeometry + Loft Surface ← 구현됨
    │
    ▼
건축가별 차별화된 3D 매스
```

### 구현 완료 항목

| 기능 | 파일 | 상태 |
|---|---|---|
| FloorNode 확장 (area, dimensions, ceiling_height, facade_exposure, form) | `core/graph/types.ts` | ✅ |
| FloorGeometry 인터페이스 (rotation, scale, offset, outline, corner, facade) | `core/graph/types.ts` | ✅ |
| ArchitectFormDNA (20개 건축가 정의) | `web/src/lib/architect-form.ts` | ✅ |
| 7가지 플레이트 형상 (rectangular, rounded, elliptical, hexagonal, organic, L_shape, chamfered) | `architect-form.ts` | ✅ |
| Per-floor transforms (twist, taper, bulge, shift) | `architect-form.ts` → `generateFloorOutline()` | ✅ |
| ExtrudeGeometry 기반 층별 렌더링 | `MassViewer3D.tsx` | ✅ |
| Void cuts (건축가별 보이드) | `architect-form.ts` → `isInVoidCut()` | ✅ |
| Terrace generation | `architect-form.ts` → `shouldHaveTerrace()` | ✅ |
| Structural expression (diagrid, exoskeleton, columns) | `MassViewer3D.tsx` | ✅ |
| Roof treatments (flat, sloped, garden, crown, sculptural) | `MassViewer3D.tsx` | ✅ |
| Pilotis support | `MassViewer3D.tsx` | ✅ |
| **Loft 보간 (smooth/sculptural)** | `MassViewer3D.tsx` → `buildLoftSurface()` | ✅ |
| **transitionStyle (smooth/crisp/abrupt/minimal/sculptural)** | `architect-form.ts` | ✅ |
| **facadeInclination** | `architect-form.ts` + `MassViewer3D.tsx` | ✅ |
| **style_ref 전파 (builder → node)** | `core/graph/builder.ts` | ✅ |

---

## transitionStyle별 렌더링 차이

건축가 스타일 차이의 핵심은 **층간 전환 방식**:

| transitionStyle | 보간 방식 | 건축가 | 시각적 결과 |
|---|---|---|---|
| smooth | Catmull-Rom 스플라인 loft | Hadid, Gaudi, Aalto, Snohetta | 유기적 연속 곡면, 층 경계 소멸 |
| crisp | 층별 독립 slab+facade | Foster, Adrian Smith, Gensler, KPF, Renzo Piano, BIG, FLW | 정밀한 기하학, 명확한 수평선 |
| abrupt | 층별 독립, 불연속 shift/void | Koolhaas, MVRDV, Ole Scheeren | 돌출/함몰, 프로그램적 충돌 |
| minimal | 변형 최소, 순수 형태 | Mies, Ando, Le Corbusier, Kahn, Fazlur Khan | 절제된 직육면체, 빛의 슬릿/구조 |
| sculptural | 고밀도 스플라인 loft | Heatherwick | 조각적 비반복 표면 |

---

## 남은 개선 항목

### 1. LLM 기반 기하학 추출 (Phase 2+)

현재 FormDNA는 **하드코딩**. 토론 결과에서 동적으로 기하학 파라미터를 추출하는 파이프라인 미구현.

**구현 방향:**
- 수렴 페이즈 완료 후, Claude function calling으로 토론 합의 텍스트 → `building_geometry` JSON 변환
- FormDNA 파라미터를 동적으로 오버라이드 (twist 각도, void 위치 등을 토론에서 구체적으로 언급한 값으로 대체)
- 현재 20개 FormDNA를 base template로 유지하되, 토론 결과에 의해 per-project 커스터마이징

**평가:** 비용 대비 효과가 낮음. 현재 FormDNA 20개 파라미터로 충분한 형태 다양성 달성. LLM 추가 호출은 비용/지연 증가. **후순위**.

### 2. CSG 보이드 (선택적)

현재 void cut은 투명도 변경으로만 표현. 실제 기하학적 구멍(CSG boolean subtraction)은 미구현.

**구현 방향:**
```typescript
// three-bvh-csg 라이브러리 활용
import { SUBTRACTION, Evaluator, Brush } from 'three-bvh-csg';

const towerBrush = new Brush(loftGeometry);
const voidBrush = new Brush(voidBoxGeometry);
const result = evaluator.evaluate(towerBrush, voidBrush, SUBTRACTION);
```

**평가:** 시각적 임팩트 높지만, `three-bvh-csg` 의존성 추가 필요 + loft geometry와의 CSG는 성능 이슈 가능성. **Loft가 안정화된 후 진행**.

### 3. 프로그램 볼륨의 기하학적 표현 강화

현재 프로그램 볼륨은 BoxGeometry로 건물 내부에 배치. 프로그램 크기가 건물 외형에 영향을 주는 Koolhaas 스타일의 "프로그램이 형태를 결정" 로직 미구현.

**구현 방향:**
- `abrupt` transitionStyle 건축가: 큰 프로그램 노드(event_space, auditorium 등)가 있는 층에서 outline을 해당 방향으로 돌출
- `form.cantilever` 필드가 있는 노드의 층에서 실제 캔틸레버 표현

### 4. 입면 디테일

현재 입면은 단일 MeshPhysicalMaterial. 건축가별 입면 패턴(멀리언 간격, 루버, 더블스킨 등) 미표현.

**구현 방향 (Phase 4+):**
- 입면 텍스처 맵 또는 인스턴스드 멀리언 기하학
- 건축가별 입면 패턴 (Ando: 콘크리트 패널 + 빛의 슬릿, Foster: 다이아몬드 그리드, Mies: I-beam 멀리언)

---

## 현재 아키텍처 요약

```
ArchitectFormDNA (20 definitions)
├── plateShape: 7 types
├── transforms: twist, taper, bulge, shiftX/Z
├── corners: chamfer, round
├── mass: voidCuts[], terraceFrequency/Depth
├── facade: color, opacity, metalness, roughness
├── structure: diagrid, exoskeleton, columns
├── transition: transitionStyle (5 types)
└── inclination: facadeInclination

FloorNode.geometry (FloorGeometry)
├── rotation, scale_x/z, offset_x/z
├── floor_height, slab_thickness
├── is_void
├── corner_treatment, corner_radius
├── facade_opacity, facade_inclination
└── outline: [x, z][]

MassViewer3D Rendering Pipeline
├── Per-floor: ExtrudeGeometry(outline) → slab + facade
├── Loft: Catmull-Rom interpolation between outlines (smooth/sculptural only)
├── Structure: diagrid/exoskeleton/columns per floor
├── Void: isInVoidCut() → transparent facade
├── Terrace: shouldHaveTerrace() → green slab + inset
└── Roof: 5 styles (flat/sloped/garden/crown/sculptural)
```
