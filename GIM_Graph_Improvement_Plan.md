# SpatialMassGraph 전환 스펙

## 0. 전환 동기

현재 `VerticalNodeGraph`는 **층별 공간 단위(FloorNode)**로 600~700개 노드를 생성한다.
이는 세밀한 평면 배치에는 유리하나, 건축가 토론의 출력 단위(매스 분절, 공간 관계)와 추상도가 맞지 않는다.

```
현재: 건축가 토론 → vertical_zoning(층별 배분) → builder.ts(템플릿) → 600+노드 FloorNode
목표: 건축가 토론 → mass_entities/relations(매스 분절) → 6~12노드 SpatialMassGraph
```

핵심 이점:
- LLM 출력과 그래프 추상도 일치 → 중간 변환 단계(builder.ts) 제거
- 건축적 의도(narrative)가 노드에 직접 포함
- 평가가 건축적 판단(매스 관계)에 집중 가능

---

## 1. 영향 범위 분석

### 1.1 core 패키지 변경 대상

| 파일 (현재 경로) | 규모 | 처리 |
|---|---|---|
| `graph/types.ts` | FloorNode, VoxelEdge, VerticalNodeGraph, ProgramGraph 등 전체 타입 | MassNode, MassRelation, SpatialMassGraph 타입으로 **교체** |
| `graph/program-graph.ts` (23KB) | ForumResult → ProgramGraph 변환, `normalizeFunctionName()` 127개 매핑 | **삭제**. 단, `normalizeFunctionName()` 매핑은 LLM 프롬프트의 label 가이드라인으로 흡수 |
| `graph/builder.ts` (26KB) | ProgramGraph → VerticalNodeGraph 변환, 층별 템플릿, FormDNA 적용 | **삭제**. LLM이 SpatialMassGraph를 직접 출력 |
| `graph/evaluation.ts` (11.7KB) | 7차원 평가 (connectivity, structural, code_compliance, brand, spatial) | 2-Tier 평가로 **재작성**. 기존 code_compliance/structural 룰셋은 Tier 1의 전문가 검증으로 이관 |
| `graph/metrics.ts` (5.2KB) | 3차원 메트릭 (connectivity, vertical_continuity, zone_coverage) | SpatialMassGraph용 메트릭으로 **재작성** |
| `graph/operations.ts` (3.8KB) | addNode/removeNode/updateNode 등 CRUD | MassNode/MassRelation CRUD로 **재작성** (구조 유사, 타입만 변경) |
| `graph/rules.ts` | DesignRules, 인접성 규칙 60+개 | 인접성 규칙을 MassRelation.program_constraint로 흡수. DesignRules 중 구조/법규는 **보존** |
| `forum/types.ts` | ArchitectResponse.proposal.vertical_zoning | mass_proposal 구조로 **교체** |
| `forum/forum-engine.ts` (12.8KB) | buildPhasePrompt(), parseArchitectResponse() | Phase 3a 추가 + convergence 출력 스키마 변경. **부분 수정** |
| `form/architect-form.ts` | ArchitectFormDNA 20개 정의, generateFloorOutline() | **보존**. architect_influence → FormDNA 블렌딩에 활용 (섹션 6.2 참조) |
| `index.ts` (배럴 익스포트) | 모든 public API | 새 타입/함수로 **갱신** |

### 1.2 web 패키지 변경 대상

| 파일 (현재 경로) | 규모 | 처리 |
|---|---|---|
| `components/MassViewer3D.tsx` (50KB, 1498줄) | Loft surface, zone vertex colors, FormDNA 기반 렌더링 | 관계 기반 배치 + primitive 렌더링으로 **대폭 재작성**. FormDNA 활용은 선택적 유지 (섹션 6.2) |
| `components/VerticalGraphViewer.tsx` (8.5KB) | D3 수직 층별 그래프 | force-directed MassGraph 뷰어로 **전면 재작성** |
| `components/BuildingFloorView.tsx` (13KB) | 층별 트리 뷰 (zone → floor → nodes) | 매스 목록 뷰로 **재작성** (node.label + type + geometry.primitive) |
| `components/NodeInspector.tsx` (19KB) | FloorNode 상세 + 2D 평면도 캔버스 | MassNode narrative 표시로 **재작성**. 2D 평면도 → 매스 다이어그램으로 전환 |
| `components/NodeEditor.tsx` (10.6KB) | FloorNode 속성 편집 (function, zone, position, abstract values) | MassNode 속성 편집으로 **재작성** |
| `components/EvaluationDashboard.tsx` (7KB) | 7축 레이더 차트 | 2-Tier 평가 표시로 **재작성** |
| `components/ForumPanel.tsx` (21.4KB) | 포럼 세션 UI | Phase 3a UI 추가. **부분 수정** |
| `components/AppShell.tsx` (5.6KB) | 레이아웃 + 키보드 단축키 | 그래프 타입 변경에 따른 **부분 수정** |
| `lib/graph-context.tsx` (293줄) | GraphState, GraphAction, graphReducer | SpatialMassGraph 타입으로 **재작성** |
| `lib/forum-context.tsx` (428줄) | ForumState, onGraphGenerated 콜백 | SpatialMassGraph 수신으로 **부분 수정** |
| `lib/graph-colors.ts` | ZONE_COLORS, FUNC_COLORS, EDGE_COLORS | MassNode type별 색상 + MassRelation family별 색상으로 **재작성** |
| `lib/architect-form.ts` | @gim/core FormDNA re-export | **유지** |
| `app/api/graph/route.ts` | vertical_node_graph.json 반환 | spatial_mass_graph.json 반환으로 **수정** |
| `app/api/forum/stream/route.ts` | buildGraphFromForumResult() 호출 | SpatialMassGraph 직접 출력으로 **수정** |

### 1.3 데이터/템플릿 변경

| 파일 | 처리 |
|---|---|
| `data/templates/architect_system.md` | 응답 형식을 vertical_zoning → mass_entities/relations로 **교체** |
| `graph_output/vertical_node_graph.json` | `spatial_mass_graph.json`으로 **교체**. 기존 파일은 아카이브 |
| `forum_results/*.json` | 기존 결과는 읽기 전용 아카이브. 새 세션부터 새 스키마 적용 |

---

## 2. 노드 스키마

### 2.1 노드 타입

```
solid       매스가 있는 건축적 덩어리
void        의도적 비움 (아트리움, 관통 보이드)
core        수직 동선/서비스 코어
connector   연결 요소 (브릿지, 램프)
```

### 2.2 MassNode

```yaml
mass_node:
  id: string                    # "mass_01"
  type: enum                    # solid | void | core | connector
  label: string                 # "공공 포디움"
  ground_contact: boolean       # true면 렌더러가 저층부 특수 처리

  # 층 범위 (렌더러의 Y축 배치 + 평가의 법규 검토에 필수)
  floor_range: [number, number] # [1, 3] → 1~3층 차지. 렌더러가 Y 높이 계산에 사용
  floor_zone: enum              # basement | ground | lower | middle | upper | penthouse | rooftop

  geometry:
    primitive: enum             # block | bar | plate | ring | tower | bridge
    scale:
      category: enum            # small | medium | large | extra_large
      hint:
        width: number           # m (확정값. range 대신 단일값)
        depth: number           # m
        height: number          # m (floor_range × 층고에서 자동 산출 가능)
    proportion: enum            # compact | elongated | slender | broad
    skin: enum                  # opaque | mixed | transparent
    porosity: enum              # solid | porous | open
    span_character: enum        # single | stacked | multi_level

  # 건축적 의도 (LLM이 직접 작성)
  narrative:
    intent_text: string
    architectural_description: string
    facade_text: string
    architect_influence: map    # { "koolhaas": 0.6, "hadid": 0.4 }
    discussion_trace: string

  # 프로그램 매핑 (기존 NodeFunction 활용)
  programs: string[]            # ["lobby", "brand_showroom", "cafe"]
                                # 현재 types.ts의 NodeFunction enum 값 사용

  mesh_id: string               # nullable, 렌더링 후 할당
```

**변경 사항 (원본 대비):**
- `floor_range` 추가: 없으면 렌더러가 Y 위치를 결정할 수 없고, 법규 평가(피난층 간격 등)도 불가
- `floor_zone` 추가: 기존 zone 체계와의 연속성 + 색상 매핑 유지
- `scale.hint`를 range → 단일값으로 변경: LLM이 range를 출력하면 렌더러의 확정 로직이 필요해짐. 단일값이면 즉시 사용 가능
- `programs` 배열 추가: 하나의 매스가 여러 프로그램을 포함할 수 있음 (예: 포디움 = lobby + retail + cafe). 평가의 Program Coverage 계산에 필수

### 2.3 primitive → Three.js 매핑

| primitive | Geometry | 비고 |
|---|---|---|
| block | BoxGeometry(w, h, d) | 기본 |
| plate | BoxGeometry(w, h_small, d) | height << width, depth |
| tower | BoxGeometry(w_small, h_tall, d_small) | height >> width, depth |
| bar | BoxGeometry(w_long, h, d_narrow) | width >> depth |
| ring | RingGeometry → ExtrudeGeometry | post-MVP |
| bridge | BoxGeometry + 지지구조 | post-MVP |

MVP: `block`, `plate`, `tower`, `bar` 4종.

### 2.4 porosity/skin → Material 매핑

| porosity | skin | Three.js |
|---|---|---|
| solid | opaque | MeshPhysicalMaterial, opacity: 1.0 |
| solid | mixed | opacity: 0.7 |
| solid | transparent | opacity: 0.3, wireframe overlay |
| porous | mixed | opacity: 0.5 |
| porous | transparent | opacity: 0.3 |
| open | transparent | wireframe only |
| open | opaque | EdgesGeometry (기둥+슬래브 표현) |

MVP: opacity + wireframe 조합만.

### 2.5 architect_influence → FormDNA 블렌딩 (선택적)

`narrative.architect_influence`가 존재하면, 기존 `ARCHITECT_FORM_DNA`에서 해당 건축가의 파라미터를 가중 블렌딩하여 매스의 외형에 반영할 수 있다.

```typescript
// 예시: influence = { "koolhaas": 0.6, "hadid": 0.4 }
// → twist = koolhaas.twist * 0.6 + hadid.twist * 0.4
// → plateShape = 비율이 높은 건축가의 것 사용
```

이는 MVP에서는 생략하고, primitive 기반 렌더링이 안정화된 후 적용한다.
기존 `form/architect-form.ts`의 20개 FormDNA 정의는 이 블렌딩의 base template로 보존한다.

---

## 3. 관계 스키마

### 3.1 링크 패밀리

```
stack         수직 적층
contact       수평/측면 접촉
enclosure     감싸기/포함
intersection  관통/교차
connection    연결 (물리적 통로)
alignment     정렬/축선
```

### 3.2 패밀리 + rule 조합

| 패밀리 | rule | 의미 | 렌더러 동작 |
|---|---|---|---|
| stack | above | A가 B 위에 적층 | B.top_y = A.bottom_y |
| stack | below | A가 B 아래 | above의 역 |
| stack | floating | A가 B 위에 떠 있음 (갭 존재) | B.top_y + gap = A.bottom_y |
| contact | adjacent | A와 B가 측면 접촉 | 바운딩박스 접하도록 배치 |
| contact | touching | 부분 접촉 | 일부만 겹침 허용 |
| enclosure | wraps | A가 B를 감싸고 있음 | B를 A 내부에 배치 |
| enclosure | inside | A가 B 내부에 있음 | wraps의 역 |
| intersection | penetrates | A가 B를 관통 | 메시 겹침 허용 |
| intersection | overlaps | A와 B가 부분 겹침 | 메시 겹침 허용 |
| connection | linked | A와 B가 통로로 연결 | connector 메시 생성 |
| alignment | axis | A와 B가 축선 정렬 | 중심축 일치 |
| alignment | offset | A와 B가 어긋남 | 의도적 오프셋 |

### 3.3 MassRelation

```yaml
mass_relation:
  id: string
  source: string                # mass_node.id
  target: string                # mass_node.id
  family: enum                  # stack | contact | enclosure | intersection | connection | alignment
  rule: string                  # above | below | wraps | penetrates | ...
  strength: enum                # hard | soft
  description: string

  program_constraint: enum      # PROGRAM_ADJACENT | PROGRAM_SEPARATE | VERTICAL_CONTINUITY | null
  constraint_rationale: string  # nullable
```

### 3.4 strength 규칙

- `hard`: 렌더러가 반드시 충족. 위반 시 Tier 1 평가에서 즉시 플래그. Relation Satisfaction Rate에 포함.
- `soft`: 렌더러가 가능하면 반영. 다른 해석 허용. Soft Compliance Rate에 포함.

### 3.5 저장 규칙

- 내부: 정규화된 한 방향만 저장 (source.id < target.id 기준)
- export (MCP/렌더러): 양방향 자동 생성하여 전달

---

## 4. 토론 프로토콜 변경

### 4.1 Phase 구조

```
Phase 1: 발제 (proposal)              ← 기존과 동일
Phase 2: 교차 비평 (cross_critique)    ← 기존과 동일
Phase 3a: 분절 방식 합의 (신규)        ← 매스 단위 6~12개 합의
Phase 3b: 매스 관계 수렴 (convergence) ← 관계 구조 확정
Phase 3.5: 전문가 검증 (expert_review) ← 기존과 동일
Phase 4: 확정                          ← SpatialMassGraph JSON 직접 출력
```

### 4.2 Phase 1~2 변경

기존 `vertical_zoning` 응답 구조를 `mass_proposal`로 교체:

```json
{
  "architect_id": "koolhaas",
  "phase": "proposal",
  "stance": "...",
  "reasoning": "...",
  "mass_proposal": {
    "entities": [
      {
        "label": "공공 포디움",
        "type": "solid",
        "floor_range": [1, 3],
        "programs": ["lobby", "brand_showroom", "cafe"],
        "description": "도시와 빌딩의 접점. 유리와 철골의 개방적 저층부.",
        "geometry_intent": "broad plate, transparent, porous"
      }
    ],
    "key_relations": [
      {
        "source": "오피스 타워",
        "target": "공공 포디움",
        "family": "stack",
        "rule": "above",
        "rationale": "구조적 하중 전달"
      }
    ],
    "form_concept": "..."
  },
  "critique": [],
  "compromise": null
}
```

**architect_system.md 템플릿 변경 필요:**
- 현재: `vertical_zoning[]` 형식 응답 지시
- 변경: `mass_proposal.entities[]` + `mass_proposal.key_relations[]` 형식 응답 지시
- 매스 수 가이드라인 추가: "전체 건물을 6~12개의 건축적 덩어리(매스)로 분절하세요"

### 4.3 Phase 3a: 분절 방식 합의 (신규)

목적: 건축가들이 매스 분절 방식(몇 개의 덩어리로 나눌 것인가)에 합의

**프롬프트 핵심:**
```
각 건축가의 제안을 검토하고, 매스 분절 방식에 대해 합의하세요.
- 최종 매스 수는 6~12개여야 합니다.
- core 노드는 최소 1개 필수입니다.
- 각 매스의 label, type, floor_range, programs를 확정하세요.
```

**validation (코드 레벨):**
```typescript
function validateMassCount(nodes: MassNode[]): ValidationResult {
  const count = nodes.length;
  if (count < 6) return { valid: false, reason: `노드 ${count}개 < 최소 6개. 재시도 필요.` };
  if (count > 12) return { valid: false, reason: `노드 ${count}개 > 최대 12개. 재시도 필요.` };
  if (!nodes.some(n => n.type === 'core')) return { valid: false, reason: 'core 노드 없음.' };
  return { valid: true };
}
// validation 실패 시: LLM에게 피드백과 함께 재시도 요청 (최대 2회)
```

### 4.4 Phase 4: Convergence 출력

Phase 4에서 LLM이 출력하는 JSON. 이것이 직접 SpatialMassGraph가 된다.

```json
{
  "consensus_graph": {
    "nodes": [
      {
        "id": "mass_01",
        "type": "solid",
        "label": "공공 포디움",
        "ground_contact": true,
        "floor_range": [1, 3],
        "floor_zone": "ground",
        "geometry": {
          "primitive": "plate",
          "scale": {
            "category": "large",
            "hint": { "width": 38, "depth": 28, "height": 12 }
          },
          "proportion": "broad",
          "skin": "transparent",
          "porosity": "porous",
          "span_character": "single"
        },
        "narrative": {
          "intent_text": "도시와 빌딩의 접점.",
          "architectural_description": "유리와 철골 프레임의 개방적 저층부. 2개 층 높이의 넓은 플레이트.",
          "facade_text": "투명한 커튼월 + 최소한의 철골 프레임.",
          "architect_influence": { "koolhaas": 0.6, "hadid": 0.4 },
          "discussion_trace": "Koolhaas 도시적 개방 + Hadid 곡면 전환 합의."
        },
        "programs": ["lobby", "brand_showroom", "cafe", "flagship_store"]
      }
    ],
    "relations": [
      {
        "id": "rel_01",
        "source": "mass_02",
        "target": "mass_01",
        "family": "stack",
        "rule": "above",
        "strength": "hard",
        "description": "오피스 타워가 공공 포디움 위에 올라감.",
        "program_constraint": "VERTICAL_CONTINUITY",
        "constraint_rationale": "구조적 하중 전달 경로"
      }
    ]
  },
  "composition_summary": "string",
  "architect_rationale": {
    "koolhaas": "string",
    "hadid": "string"
  },
  "node_count_rationale": "string"
}
```

---

## 5. 평가 모델

### 5.1 2-Tier 구조

**Tier 1 (SpatialMassGraph 생성 직후) — 코드 기반 + LLM**

| 항목 | 방식 | 기존 evaluation.ts 대응 |
|---|---|---|
| 관계 제약 충족도 | 코드: hard relation 위반 검출 | 신규 |
| 프로그램 커버리지 | 코드: 요구 프로그램이 nodes[].programs에 포함되었는지 | zone_coverage 대체 |
| 코어 존재 검증 | 코드: type=core 노드 존재 + floor_range 연속성 | vertical_continuity 대체 |
| 건축적 합리성 | LLM: narrative + composition_summary 기반 추론 | 신규 |
| 브랜드 정합성 | LLM: narrative vs ProjectContext.company 키워드 | brand_identity 대체 |
| 전문가 검증 (법규) | LLM: floor_range + programs 기반. 기존 rules.ts의 fire_stair_count, 피난안전구역 규칙 활용 | code_compliance 이관 |
| 전문가 검증 (구조) | LLM: scale.hint + span_character 기반 개략 검토 | structural_feasibility 이관 |

**Tier 2 (3D 렌더링 후) — 메시 기반**

| 항목 | 방식 |
|---|---|
| 용적률/건폐율 | Three.js 메시 바운딩박스에서 면적/체적 추출 vs ProjectContext.site.far/bcr |
| 구조 스팬 | 메시 실측 치수 vs rules.ts.max_span_without_column (15m) |
| 높이 제한 | 메시 최대 Y vs ProjectContext.site.height_limit |
| 매스 비례 | 종횡비, 매스 간 비례 분석 |

### 5.2 메트릭

```
Relation Satisfaction Rate = (만족 hard relation) / (전체 hard relation)
  → 1.0 미만이면 재토론 트리거

Soft Compliance Rate = (만족 soft relation) / (전체 soft relation)

Program Coverage = (포함된 요구 프로그램) / (전체 요구 프로그램)
  → 요구 프로그램 = ProjectContext.program.uses[].type 매핑

Core Continuity = core 노드의 floor_range가 전체 층 범위를 커버하는지 (boolean)
```

### 5.3 평가 출력

```json
{
  "evaluation_id": "string",
  "tier": 1,
  "overall_score": 78,
  "relation_satisfaction_rate": 1.0,
  "soft_compliance_rate": 0.75,
  "program_coverage": 0.9,
  "core_continuity": true,
  "dimensions": {
    "architectural_rationality": {
      "score": 82,
      "issues": ["포디움과 타워의 비례가 극단적"],
      "suggestions": ["포디움 높이를 12m에서 15m로 조정 검토"]
    },
    "brand_alignment": {
      "score": 90,
      "issues": [],
      "suggestions": []
    }
  },
  "expert_review": {
    "legal": { "verdict": "conditionally_approved", "issues": ["피난계단 간격 확인 필요"], "severity": "warning" },
    "structural": { "verdict": "approved", "issues": [], "severity": "info" }
  },
  "priority_actions": ["core 노드 floor_range를 B1~RF로 확장"]
}
```

---

## 6. Three.js 렌더링 파이프라인

### 6.1 공간 배치 알고리즘 (Constraint Solver)

현재 스펙에서 가장 중요한 부분. relation → 3D 좌표 변환 규칙을 명확히 정의한다.

```
SpatialMassGraph JSON
    │
[1] 토폴로지 정렬 (Topological Sort)
    stack 관계를 DAG로 해석
    ground_contact=true 노드를 Y=0 앵커로 설정
    │
[2] Y축 배치 (수직)
    stack.above: target.top_y → source.bottom_y (빈틈없이 적층)
    stack.floating: target.top_y + gap → source.bottom_y
    floor_range 기반 높이: (floor_range[1] - floor_range[0] + 1) × 층고
    │
[3] X/Z축 배치 (수평)
    1단계: 사이트 중심(0, 0)에서 시작
    2단계: contact.adjacent → 바운딩박스 접하도록 X 또는 Z 오프셋
    3단계: alignment.axis → 중심축 정렬 (X 또는 Z 일치)
    3단계: alignment.offset → 의도적 오프셋 적용
    충돌 감지: 바운딩박스 겹침 시 밀어내기
    │
    미배치 노드: 사이트 범위 내 빈 공간에 그리드 스냅 배치
    │
[4] primitive → Geometry
    hint 수치(width, depth, height)로 BoxGeometry 파라미터 결정
    │
[5] skin/porosity → Material
    매핑 테이블 적용 (섹션 2.4)
    │
[6] 특수 처리
    void: 반투명 마커 (wireframe + 빨간 테두리)
    core: 반투명 기둥 표현 (EdgesGeometry)
    connector: 양 끝 매스 사이에 bridge 메시 생성
    │
[7] enclosure 처리
    wraps: 자식 메시를 부모 내부에 배치 (부모 메시 반투명화)
    inside: wraps의 역방향
```

### 6.2 FormDNA 연계 (post-MVP)

MVP 이후, `narrative.architect_influence`를 활용하여 primitive 위에 FormDNA를 적용:

```
primitive BoxGeometry
    │
architect_influence 가중 블렌딩 → ArchitectFormDNA
    │
generateFloorOutline() → 2D outline
    │
ExtrudeGeometry(outline) → 건축가 스타일이 반영된 매스
```

이렇게 하면 기존 MassViewer3D의 loft/terrace/void cut/structural expression 코드를 재활용할 수 있다.

---

## 7. SOT (Source of Truth) 변경

### 7.1 그래프 스키마

`vertical_node_graph` → `spatial_mass_graph`로 교체.

```json
{
  "project_id": "string",
  "version": 2,
  "iteration": 1,
  "global": {
    "site": { "dimensions": [40, 35], "far": 600, "bcr": 60, "height_limit": 100 },
    "program": { "total_gfa": 10000, "uses": [] },
    "total_floors": 25,
    "basement_floors": 3
  },
  "spatial_mass_graph": {
    "nodes": [],
    "relations": []
  },
  "composition_summary": "string",
  "evaluation_history": []
}
```

**변경 사항:**
- `global` 보존: 사이트 제약 + 프로그램 요구사항은 Tier 2 평가에 필수 (용적률/건폐율/높이 제한 검증)
- `style_distribution` 폐기: 각 노드의 `narrative.architect_influence`로 대체

### 7.2 파일 경로

| 이전 | 이후 |
|---|---|
| `graph_output/vertical_node_graph.json` | `graph_output/spatial_mass_graph.json` |
| `forum_results/{timestamp}.json` | 형식 변경 (mass_proposal 포함) |

---

## 8. W2 그래프 뷰어 변경

### 8.1 VerticalGraphViewer → MassGraphViewer

| 이전 (VerticalGraphViewer.tsx) | 변경 (MassGraphViewer.tsx) |
|---|---|
| 수직 Y축 = floor level, X = 노드 간격 | D3 force-directed 레이아웃 |
| 노드 = NodeFunction enum (40+ 종류) | 노드 = primitive icon + label (6~12개) |
| 엣지 = VoxelEdge 9종류 | 엣지 = MassRelation 6 family |
| ZONE_COLORS 배경 밴드 | 없음 (노드 자체에 type 색상) |

### 8.2 시각화 규칙

- **노드 크기**: `scale.category` 비례 (small=20px, medium=40px, large=60px, extra_large=80px)
- **노드 색상**: type별 (solid=#4488cc, void=#cc4444, core=#888888, connector=#44cc88)
- **노드 형태**: primitive별 아이콘 (block=사각형, tower=세로직사각형, plate=가로직사각형, bar=가로막대)
- **엣지 스타일**:
  - hard: 굵은 실선 (2px)
  - soft: 얇은 점선 (1px, dashed)
  - family별 색상: stack=#334, contact=#343, enclosure=#fa6, intersection=#f66, connection=#6af, alignment=#6fa
- **노드 클릭**: NodeInspector에 narrative (intent_text, architectural_description, discussion_trace) 표시
- **force 파라미터**: stack 관계를 수직으로 정렬하는 커스텀 force 추가

### 8.3 연동 컴포넌트 변경

| 컴포넌트 | 변경 |
|---|---|
| BuildingFloorView | 매스 리스트 뷰로 전환: label + type + floor_range + programs 표시 |
| NodeInspector | MassNode narrative + geometry 표시. 2D 평면도 → 매스 관계 다이어그램 |
| NodeEditor | MassNode 속성 편집: label, type, programs[], geometry.primitive/scale |

---

## 9. 구현 순서

### Phase 1: 타입 + 스키마 (0~3h)

| 작업 | 담당 | 상세 |
|---|---|---|
| MassNode, MassRelation, SpatialMassGraph TypeScript 타입 작성 | 노현섭 | `core/graph/types.ts`에 추가 (기존 타입은 deprecated 주석 처리, 삭제하지 않음) |
| operations.ts CRUD 함수 갱신 | 노현섭 | addMassNode/removeMassNode/updateMassNode + addRelation/removeRelation |
| graph-context.tsx 타입 변경 | 노현섭 | GraphState.graph: SpatialMassGraph, GraphAction 갱신 |

### Phase 2: 토론 엔진 변경 (3~7h)

| 작업 | 담당 | 상세 |
|---|---|---|
| architect_system.md 템플릿 교체 | 노현섭 | vertical_zoning → mass_proposal 응답 형식 |
| forum-engine.ts Phase 3a 추가 | 노현섭 | buildPhasePrompt('mass_consensus') + parseResponse 로직 |
| convergence 출력 스키마 변경 | 노현섭 | SpatialMassGraph JSON 직접 출력 + validateMassCount() |
| forum/types.ts 응답 타입 교체 | 이준원, 조현호 | ArchitectResponse.mass_proposal 타입 추가 |
| builder.ts 호출 제거 | 이준원, 조현호 | forum/stream/route.ts의 buildGraphFromForumResult() → 직접 SpatialMassGraph 사용 |

### Phase 3: 렌더러 전환 (7~14h)

| 작업 | 담당 | 상세 |
|---|---|---|
| 공간 배치 알고리즘 구현 | 백건호, 심채윤 | 섹션 6.1의 constraint solver. 입력: SpatialMassGraph, 출력: 노드별 (x, y, z) 좌표 |
| MassViewer3D primitive 렌더링 | 노현섭 | BoxGeometry 4종 + Material 매핑 + void/core/connector 특수 표현 |
| MassGraphViewer D3 force-directed | 노현섭 | force-directed + stack 수직 정렬 커스텀 force |
| graph-colors.ts 갱신 | 이준원, 조현호 | MassNode type 색상 + MassRelation family 색상 |
| BuildingFloorView → MassListView | 이준원, 조현호 | 매스 목록 + 선택 연동 |

### Phase 4: 평가 + 연동 컴포넌트 (14~20h)

| 작업 | 담당 | 상세 |
|---|---|---|
| Tier 1 평가 (코드 기반) | 이준원, 조현호 | relation satisfaction + program coverage + core continuity |
| Tier 1 평가 (LLM 기반) | 노현섭 | architectural rationality + brand alignment + expert review |
| Tier 2 평가 (메시 기반) | 백건호, 심채윤 | 메시 바운딩박스 → 용적률/건폐율/높이 검증 |
| NodeInspector 재작성 | 이준원, 조현호 | narrative 표시 + 매스 관계 다이어그램 |
| EvaluationDashboard 재작성 | 백건호, 심채윤 | 2-Tier 결과 표시 |

### Phase 5: E2E 통합 (20~26h)

| 작업 | 담당 | 상세 |
|---|---|---|
| 토론→그래프→3D→평가→피드백 루프 | 전원 | ForumPanel에서 토론 완료 → SpatialMassGraph 생성 → MassViewer3D 렌더링 → 평가 → 재토론 트리거 |
| API route 갱신 | 노현섭 | /api/graph → spatial_mass_graph.json, /api/forum/stream → 새 스키마 |
| 기존 데이터 아카이브 | 이준원 | vertical_node_graph.json → archive/, forum_results/ 읽기 전용 유지 |

---

## 10. 리스크와 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| LLM이 6~12개 범위를 벗어남 | Phase 3a 실패 | validateMassCount() + 재시도 2회 + fallback(수동 병합/분할 UI) |
| LLM이 잘못된 relation 출력 (순환 참조, 존재하지 않는 node id) | 렌더러 크래시 | consensus_graph JSON validation 함수 구현: DAG 검증, id 참조 무결성 |
| 공간 배치 알고리즘 미수렴 (충돌 해소 불가) | 렌더러 빈 화면 | fallback: 관계 무시하고 grid 배치 (3×4 등간격) |
| 기존 FormDNA 코드 50KB 폐기에 따른 시각적 퇴보 | 사용자 경험 저하 | MVP에서 primitive만 사용하되, post-MVP에서 FormDNA 블렌딩 복원 (섹션 6.2) |
| 기존 forum_results/*.json 호환성 단절 | 과거 세션 로드 불가 | version 필드로 구분, v1은 읽기 전용 뷰 유지 |
| 26시간 예상 초과 | 일정 지연 | Phase 3(렌더러)가 크리티컬 패스. 배치 알고리즘을 grid fallback으로 시작하고 점진 개선 |
