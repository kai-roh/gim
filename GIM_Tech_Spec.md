# GIM (Geometry based Integrated Modeling) Tech Spec

## 1. 시스템 개요

초고층 빌딩 기획 컨텍스트를 입력하면, 사용자가 선택한 거장 건축가 AI 패널이 토론을 통해 설계안을 확정하고, 수직 노드 그래프가 Rhino 3D 모델로 실시간 생성되며, 평가 모델의 피드백이 다시 토론장으로 돌아오는 순환 설계 시스템.

### GIM vs BIM

|  | BIM | GIM |
|---|---|---|
| 단계 | 실시설계/시공 | 아이디어/기획설계 |
| 데이터 | 자재, 구조, MEP | 층별 프로그램, 공간 관계, 수직 동선 |
| 정밀도 | mm 단위 | 매스 레벨 (층 단위 그리드) |
| 목적 | 시공 문서화 | 설계 의사결정 지원 |
| AI 활용 | 간섭 체크, 물량 산출 | 배치 추론, 건축가 토론, 피드백 루프 |

---

## 2. 시스템 아키텍처

### 2.1 전체 워크플로우

```
[사용자 입력]
빌딩 기획 컨텍스트 (대지, 규모, 프로그램, 조건)
+ 건축가 패널 선택 (20인 풀에서 2~5명)
    │
    ▼
[건축가 토론장] ◄──────────────────────┐
    │                                │
    ▼                                │
[수직 노드 그래프 생성/수정]              │
    │                                │
    ▼                                │
[Rhino MCP 3D 모델링]                  │
    │                                │
    ▼                                │
[평가 모델] ─── 피드백 리포트 ────────────┘
    │
    ◄── 사용자 중간 개입 시에도
         건축가 토론장에 정보 주입
```

루프 종료 조건:
- 평가 모델의 종합 점수가 임계값 이상
- 사용자가 "확정" 명령
- 최대 반복 횟수 도달

### 2.2 컴포넌트 다이어그램

```
┌─────────────────────────────────────────────────┐
│                  Chat Interface                  │
│      (자연어 컨텍스트 + 사용자 의견 + 패널 선택)      │
└───────────────────┬─────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────┐
│               LLM Orchestrator                   │
│  ┌───────────────────────────────────────────┐  │
│  │        Architect Forum Engine              │  │
│  │  ┌──────────────────────────────────┐     │  │
│  │  │  20인 건축가 클론 풀               │     │  │
│  │  │  사용자 선택에 따라 2~5명 활성화     │     │  │
│  │  └──────────┬───────────────────────┘     │  │
│  │             ▼                              │  │
│  │  [토론 프로토콜: 발제→반론→수정→합의]          │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│  ┌───────────────▼───────────────────────────┐  │
│  │     Skills (RAG / Prompt Engineering)      │  │
│  │  - supertall_structure_skill               │  │
│  │  - vertical_zoning_skill                   │  │
│  │  - wind_solar_analysis_skill               │  │
│  │  - code_compliance_skill                   │  │
│  │  - program_stacking_skill                  │  │
│  │  - core_planning_skill                     │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│  ┌───────────────▼───────────────────────────┐  │
│  │  Evaluation Engine (평가 모델)              │  │
│  │  구조 안정성 / 환경 성능 / 법규 / 경제성        │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│  ┌───────────────▼───────────────────────────┐  │
│  │  Project SOT (per-project context)         │  │
│  └───────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │
          ┌─────────┴──────────┐
          │                    │
┌─────────▼────────┐   ┌──────▼──────────┐
│ Vertical Node    │   │   MCP Bridge    │
│ Graph (NetworkX) │◄─►│  (Rhino/GH)     │
└──────────────────┘   └──────┬──────────┘
                              │
                     ┌────────▼─────────┐
                     │   3D Viewport    │
                     │   (Rhino/Web)    │
                     └──────────────────┘
```

### 2.3 4-윈도우 UI 레이아웃

```
┌────────────────┬──────────────────┬────────────────────────────┐
│  W1: Architect │  W2: Vertical    │  W3: 3D Mass               │
│  Forum         │  Node Graph      │  Modeling                  │
│                │                  │                            │
│  건축가 패널     │  수직 노드 그래프   │  Rhino/Web 3D 뷰포트        │
│  토론 로그       │  지하~옥상         │  매스 + 층별 공간 관계 표현     │
│  합의/논쟁 표시   │  실시간 편집       │                            │
│                │                  │                            │
│  ◄── 피드백 수신  │  ◄─► 양방향 동기화  │                            │
│  ◄── 사용자 의견  │                  │                            │
├────────────────┴──────────────────┴────────────────────────────┤
│  W4: Evaluation Dashboard                                      │
│  구조 안정성 | 환경 성능 | 법규 적합도 | 경제성 → 종합 점수 + 이슈 목록  │
├────────────────────────────────────────────────────────────────┤
│  Chat Interface (사용자 입력 + 건축가 토론장 개입 + 패널 선택)         │
└────────────────────────────────────────────────────────────────┘
```

윈도우 간 데이터 플로우:

| 방향 | 내용 |
|---|---|
| W1 → W2 | 토론 합의 결과가 수직 노드/엣지로 자동 변환 |
| W2 → W3 | 노드 그래프 변경 시 Rhino MCP를 통해 3D 매스 자동 재생성 |
| W3 → W2 | Rhino에서 매스 수동 변경 시 노드 그래프 역반영 |
| W3 → W4 | 생성된 3D 모델에 대해 평가 모델 자동 작동 |
| W4 → W1 | 평가 피드백이 건축가 토론장에 자동 전달, 추가 논의 트리거 |
| Chat → W1 | 사용자 의견이 건축가 토론장에 새로운 의제로 주입 |
| W2 ↔ W3 | 노드 직접 편집 ↔ 3D 실시간 양방향 동기화 |

---

## 3. 건축가 토론 시스템 (Architect Forum)

### 3.1 개요

서로 다른 건축 철학을 가진 AI 건축가들이 하나의 초고층 프로젝트를 두고 구조화된 토론을 수행하며, 합의 또는 대안을 도출하는 멀티에이전트 시스템. 사용자는 20인 클론 풀에서 2~5명을 선택하여 토론 패널을 구성한다.

### 3.2 20인 건축가 클론 풀

**Category A: 초고층 실무 마스터 (Supertall Specialists)**

| # | 클론 ID | 참조 건축가 | 대표 초고층 | 핵심 키워드 |
|---|---|---|---|---|
| 1 | `adrian_smith` | Adrian Smith (SOM) | Burj Khalifa | Y자 평면, 나선 셋백, 와류 분산, 이슬람 기하학 |
| 2 | `gensler` | Gensler (Jun Xia) | Shanghai Tower | 120도 트위스트, 풍하중 24% 감소, 이중외피, 수직도시 |
| 3 | `cy_lee` | C.Y. Lee | Taipei 101 | 대나무 절(節) 형상, TMD 660t, 내진/내풍 이중설계 |
| 4 | `cesar_pelli` | César Pelli | Petronas Twin Towers | 이슬람 8각성, 스카이브리지, 쌍탑 대칭, 문화적 상징 |
| 5 | `david_childs` | David Childs (SOM) | One World Trade Center | 사각→팔각 모핑, 안전 최우선, 기념비+오피스 이중기능 |
| 6 | `fazlur_khan` | Fazlur Rahman Khan (SOM) | Willis Tower | 번들튜브 구조, 구조 합리주의, 높이별 단면 축소 |
| 7 | `renzo_piano` | Renzo Piano | The Shard | 유리 파편 형상, 빛의 변화, 도시 스카이라인 재정의 |
| 8 | `im_pei` | I.M. Pei | Bank of China Tower | 삼각 트러스, 기둥 최소화, 기하학적 날카로움 |
| 9 | `william_van_alen` | William Van Alen | Chrysler Building | 아르데코, 스테인리스 첨탑, 브랜드 정체성의 건축화 |
| 10 | `kpf` | Kohn Pedersen Fox | Lotte World Tower | 도자기 곡선, 점진적 테이퍼, 상층부 다이어그리드 |

**Category B: 건축 사상 마스터 (Architectural Visionaries)**

| # | 클론 ID | 참조 건축가 | 건축 사조 | 핵심 키워드 |
|---|---|---|---|---|
| 11 | `le_corbusier` | Le Corbusier | 모더니즘 | 필로티, 옥상정원, 자유평면, 기계미학, 모듈러 |
| 12 | `frank_lloyd_wright` | Frank Lloyd Wright | 유기적 건축 | 자연통합, 수평성, 프레리 스타일, 유기체적 성장 |
| 13 | `mies` | Mies van der Rohe | 모더니즘 | Less is more, 철골+유리, 유니버설 스페이스, 비례 |
| 14 | `gaudi` | Antoni Gaudi | 자연주의 | 곡선은 신의 선, 자연 구조역학, 포물선 아치 |
| 15 | `kahn` | Louis Kahn | 기념비적 모더니즘 | served/servant, 빛과 그림자, 재료 본질, 무게감 |
| 16 | `aalto` | Alvar Aalto | 북유럽 모더니즘 | 인간 중심, 목재+곡선, 따뜻한 모더니즘, 통합설계 |
| 17 | `ando` | Tadao Ando | 미니멀리즘 | 노출콘크리트, 빛/물/바람, 명상적 공간, 자연도입 |
| 18 | `foster` | Norman Foster | 하이테크 건축 | 기술+지속가능성, 구조 노출, 다이어그리드, 에코건축 |
| 19 | `hadid` | Zaha Hadid | 해체주의/파라메트릭 | 유선형, 비정형, 파라메트릭, 수직수평 규칙 파괴 |
| 20 | `koolhaas` | Rem Koolhaas | 프로그램 건축 | 프로그램 우선, 도시적 충돌, 예측불가 배열, 복잡성 |

### 3.3 건축가 클론 프로필 스키마

```yaml
architect_clone:
  id: string           # "foster_v1"
  reference: string    # "Norman Foster"
  category: enum       # supertall_specialist | architectural_visionary

  # 초고층 설계 원칙
  supertall_principles:
    - string           # "tech_driven_sustainability"

  # 수직 조닝 선호
  vertical_preferences:
    base_strategy: string          # "urban_connectivity" | "monumental_entry" | "fluid_ground"
    tower_form: string             # "tapered" | "twisted" | "setback" | "uniform" | "organic"
    top_strategy: string           # "crowned" | "dissolving" | "occupied_roof" | "spire"
    core_philosophy: string        # "central_core" | "peripheral_core" | "bundled_tube" | "diagrid"
    sky_lobby_preference: boolean
    mixed_use_transition: string   # "hard_separation" | "gradient" | "interleaved"

  # 구조/표현 선호
  expression_rules:
    structure_expression: string   # "exposed_diagrid" | "hidden" | "exoskeleton" | "truss"
    facade_language: string        # "curtain_wall" | "double_skin" | "parametric" | "art_deco"
    material_palette: string[]     # ["steel", "glass", "aluminum"]
    sustainability_approach: string # "passive" | "active_tech" | "biomimicry" | "traditional"

  # 토론 성향 (멀티에이전트 토론 시 행동 결정)
  discussion_style:
    assertiveness: number          # 0~1 주장 강도
    compromise_willingness: number # 0~1 타협 의지
    focus_priority: string[]       # ["structure", "sustainability", "urban_context", "form", "program"]

  # 참조 지식 베이스
  knowledge_base:
    representative_buildings: string[]
    design_philosophy: string      # 자연어 서술 (LLM 시스템 프롬프트에 포함)
    era_context: string            # 활동 시대 맥락
```

### 3.4 토론 프로토콜

```
[Phase 1: 발제]
사용자 컨텍스트 수신 → 각 건축가가 독립적으로 초기 제안 제시
    │
    ▼
[Phase 2: 교차 비평]
각 건축가가 다른 건축가의 제안에 대해 비평 및 대안 제시
    │
    ▼
[Phase 3: 수렴]
공통 합의점 도출 + 쟁점 정리
    │
    ▼
[Phase 4: 확정]
합의된 기획안 + 미합의 대안 목록 출력
    │
    ▼
[반복 트리거]
평가 피드백 수신 시 → Phase 2부터 재개
사용자 의견 수신 시 → Phase 1에 새 의제로 추가 후 Phase 2부터 재개
```

### 3.5 토론장 입출력 구조

**입력:**

| 소스 | 시점 | 예시 |
|---|---|---|
| 사용자 컨텍스트 | 최초 입력 또는 추가 의견 | "저층부에 공공 보이드를 크게 넣고 싶어" |
| 평가 모델 피드백 | 3D 모델 생성 후 자동 | "50층 이상 풍하중 초과, 코어 면적 15% 부족" |
| 사용자 중간 개입 | 언제든지 | "Foster 의견이 마음에 들어, 그 방향으로" |

**출력:**

| 출력 | 형식 | 수신처 |
|---|---|---|
| 확정 기획안 | 구조화된 JSON | 수직 노드 그래프 생성기 |
| 토론 로그 | Markdown | W1 (사용자 열람) |
| 미합의 대안 목록 | JSON | SOT 저장 (추후 재참조) |

---

## 4. 수직 빌딩 노드 스키마

### 4.1 노드 그래프 구조

초고층 빌딩은 지하부터 옥상까지 수직으로 길게 늘어진 층별 구조이며, 각 층에 수평으로 여러 노드가 배치된다.

```
[옥상] ──── 헬리패드 ─── 전망대 ─── 기계실
  │
[고층 50~60F] ── 스카이라운지 ─── 호텔객실 ─── 코어
  │
[고층 40~49F] ── 호텔객실 ─── 코어 ─── 서비스
  │
[중간기계층 39F] ── 기계실 ─── 피난안전구역
  │
[중층 25~38F] ── 오피스 ─── 코어 ─── 회의실
  │
[스카이로비 24F] ── 스카이로비 ─── 라운지 ─── 셔틀EV
  │
[중층 15~23F] ── 오피스 ─── 코어 ─── 회의실
  │
[저층 6~14F] ── 프리미엄오피스 ─── 코어 ─── 지원시설
  │
[저층 1~5F] ── 로비 ─── 리테일 ─── 문화시설 ─── 공공보이드
  │
[지하 B1~B2] ── 주차 ─── 기계실 ─── 저장공간
```

### 4.2 노드 스키마

```yaml
floor_node:
  # 식별
  id: string              # "F25_office_zone_A"
  name: string            # "25층 오피스 존 A"
  floor_level: integer    # 25
  floor_zone: enum        # basement | podium | low_rise | mid_rise | high_rise
                          # | sky_lobby | mechanical | crown | rooftop
  function: enum          # 아래 4.4 분류 참조

  # 물리적 제약
  constraints:
    area: number          # sqm (해당 층 내 점유 면적)
    height: number        # 층고 (m)
    position: string      # core_adjacent | perimeter | corner | center
    orientation: string   # N | S | E | W | NE | SE | SW | NW | all

  # 추상 속성 (0.0 ~ 1.0)
  abstract:
    publicity: number     # 공공성
    view_premium: number  # 조망 가치
    structural_load: number  # 구조 하중 중요도
    vertical_flow: number    # 수직 동선 의존도
    flexibility: number      # 용도 가변성
    prestige: number         # 위상/상징성

  # 비정형 태그
  tags: string[]          # ["랜드마크", "도시접점", "바람정원"]

  # 기하학 참조
  geometry_ref: string    # Rhino object GUID (nullable)
```

### 4.3 엣지 타입

| 관계 | 의미 | 속성 |
|---|---|---|
| `STACKED_ON` | 수직 적층 (층간 관계) | structural_continuity: boolean |
| `ADJACENT_TO` | 같은 층 내 수평 인접 | wall_type: open / solid / glazed |
| `VERTICAL_CONNECT` | 수직 동선 연결 | via: elevator / stair / escalator / void |
| `SERVED_BY` | 기능적 종속 | 코어/기계층 → 오피스/호텔 |
| `VISUAL_CONNECT` | 시각적 연결 (아트리움/보이드) | degree: 0.0~1.0, spans_floors: integer |
| `ZONE_BOUNDARY` | 수직 존 경계 | transition_type: hard / gradient / sky_lobby |
| `FACES` | 외부 조건 대면 | target: view / road / adjacent_building / park |
| `STRUCTURAL_TRANSFER` | 구조 전이 (트랜스퍼 층) | system: outrigger / belt_truss / mega_column |

### 4.4 노드 function 분류

| 카테고리 | function enum 값 | 적용 존 |
|---|---|---|
| CORE | elevator_core, stair_core, service_shaft, mep_shaft | 전층 관통 |
| OFFICE | open_office, enclosed_office, co_work, executive_floor | 중/저층부 |
| HOTEL | guest_room, suite, hotel_lobby, banquet | 고층부 |
| RETAIL | retail_unit, anchor_tenant, food_hall | 저층부/포디움 |
| PUBLIC | lobby, plaza, public_void, gallery, observation | 저층부/옥상 |
| SOCIAL | sky_lobby, sky_garden, lounge, restaurant, fitness | 중간/고층부 |
| MECHANICAL | mechanical_floor, refuge_floor, cooling_tower | 중간기계층/옥상 |
| PARKING | underground_parking, loading_dock, car_lift | 지하부 |
| STRUCTURAL | transfer_floor, outrigger_level, mega_column_node | 구조 전이층 |

### 4.5 실시간 노드 편집

지원 편집 작업:
- 노드 추가/삭제: 특정 층에 새 프로그램 추가 또는 제거
- 노드 이동: 프로그램의 층 변경 (예: 스카이로비를 24F에서 30F로)
- 속성 변경: 면적, 층고, 추상 속성 값 실시간 조정
- 엣지 추가/삭제: 공간 관계 연결 변경
- 존 경계 변경: podium 끝나는 층수 변경 등

편집 → 반영 플로우:
```
W2 노드 편집 이벤트
    │
    ▼
노드 그래프 업데이트 (NetworkX)
    │
    ├─► W3 Rhino MCP: 변경된 노드/엣지만 delta 전송 → 3D 재생성
    │
    └─► W4 평가 모델: 변경 사항에 대한 즉시 재평가
            │
            ▼
        피드백 → W1 건축가 토론장
```

---

## 5. 평가 모델 (Evaluation Engine)

### 5.1 평가 차원

| 차원 | 평가 항목 | 평가 방식 |
|---|---|---|
| 구조 안정성 | 코어 비율, 슬래브 스팬, 종횡비, 풍하중 개략 검토 | 룰 기반 + LLM 추론 |
| 환경 성능 | 조망률, 일조 시뮬레이션(개략), 바람 영향, 에너지 등급 추정 | 파라미터 기반 |
| 법규 적합도 | 용적률, 건폐율, 높이 제한, 일조권, 피난 규정 | 룰 기반 |
| 경제성 | 연면적 대비 전용률, 프리미엄 층 비율, 주차 대수 충족 | 산식 기반 |
| 도시 맥락 | 저층부 공공 기여도, 보행 접근성, 주변 스카이라인 조화 | LLM 추론 |
| 3D 형태 | Rhino 모델 기반 매스 비례, 입면 일관성, 구조체 정합성 | 3D 분석 룰 + MCP |

### 5.2 피드백 출력 스키마

```json
{
  "evaluation_id": "string",
  "timestamp": "ISO 8601",
  "overall_score": "number (0~100)",
  "dimensions": {
    "<dimension_key>": {
      "score": "number (0~100)",
      "issues": ["string"],
      "suggestions": ["string"]
    }
  },
  "priority_actions": ["string"]
}
```

dimension_key: `structural`, `environmental`, `code_compliance`, `economic`, `urban_context`, `3d_form`

---

## 6. 초고층 설계 룰셋

```yaml
supertall_design_rules:
  structural:
    max_aspect_ratio: 1:8        # 높이:최소폭
    core_area_ratio: 0.20~0.30   # 기준층 대비
    outrigger_interval: 20~30F   # 아웃리거/벨트트러스 간격
    transfer_floor_trigger: true # 저층부 확장 시 구조 전이 필수

  vertical_zoning:
    podium_height: 3~7F
    sky_lobby_interval: 20~30F
    mechanical_floor_interval: 15~25F
    refuge_floor_interval: "매 25층 이내 (건축법)"
    crown_start: "상위 5~10%"

  core_planning:
    elevator_zone_count: 2~4     # 수직 존 분할
    shuttle_elevator: true       # 스카이로비 셔틀
    service_elevator_ratio: 0.15 # 전체 EV 대비
    fire_stair_count: "최소 2, 피난 동선 분리"

  floor_plate:
    typical_depth: 12~15m        # 코어~외벽
    floor_to_floor:
      office: 4.0~4.2m
      hotel: 3.2~3.6m
      retail: 4.5~6.0m
      mechanical: 4.5~6.0m
    net_to_gross_target: 0.60~0.68

  envelope:
    curtain_wall_performance: "U-value < 1.5"
    wind_design_speed: "지역별 기본풍속 기준"
    vortex_shedding: "종횡비 > 1:6 시 형상 검토 필수"
```

---

## 7. 데이터 교환 체계

### 7.1 포맷 매핑

| 구간 | 포맷 | 이유 |
|---|---|---|
| 사용자 컨텍스트 → LLM | Markdown | 자유 서술 + 구조적 힌트 |
| 건축가 토론 합의 → 노드 그래프 | JSON (function calling) | 구조화 + 스키마 검증 |
| 건축가 클론 프로필 | YAML | 사람이 직접 편집 |
| 초고층 룰셋 | YAML | 동일 이유 |
| 노드 그래프 → W2 시각화 | JSON → D3/Cytoscape | 실시간 렌더링 |
| 노드 그래프 → W3 Rhino MCP | JSON → Python Script | MCP 브릿지 경유 |
| W3 Rhino 변경 → 노드 그래프 역동기화 | JSON diff | 변경분만 전송 (이벤트 기반) |
| 평가 결과 → 건축가 토론장 | JSON | 구조화된 점수 + 이슈 목록 |
| 대지/프로그램 정량 데이터 | CSV | 면적표 등 테이블형 |
| 프로젝트 SOT | JSON (단일 파일) | 전체 상태 스냅샷 + 버전 관리 |
| 토론 로그 | Markdown | 사람이 읽기 쉬운 형식 |

### 7.2 SOT (Source of Trust) JSON 구조

```json
{
  "project_id": "string",
  "version": "number",
  "iteration": "number",
  "site": {
    "dimensions": [80, 60],
    "far": 1000,
    "bcr": 60,
    "height_limit": 300,
    "context": {
      "north": "string",
      "south": "string",
      "east": "string",
      "west": "string"
    }
  },
  "architect_panel": ["string"],
  "architect_pool_version": "string",
  "discussion_log": [
    {
      "round": "number",
      "trigger": "initial_context | evaluation_feedback | user_intervention",
      "panel": ["string"],
      "consensus": "string",
      "dissent": ["string"]
    }
  ],
  "vertical_node_graph": {
    "zones": [
      {
        "zone": "string",
        "floors": ["number", "number"],
        "nodes": []
      }
    ],
    "edges": []
  },
  "evaluation_history": [],
  "selected_option": "string",
  "history": []
}
```

---

## 8. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 노드 그래프 저장 | NetworkX | 빠른 프로토타이핑 |
| LLM | Claude API (function calling) | 구조화된 JSON 출력 + 긴 컨텍스트 + 멀티에이전트 토론 |
| 토론 엔진 | Claude multi-turn + system prompt per clone | 클론별 독립 시스템 프롬프트로 성격 분리 |
| 평가 모델 | Python 룰 엔진 + Claude 추론 | 정량 룰 + 정성적 판단 혼합 |
| 3D 평가 | Rhino/GH 스크립트 + Python | 매스 비례, 구조 정합성, 풍하중 개략 분석 |
| 모델링 연결 | RhinoMCP | POC 검증 완료 |
| 프론트엔드 | Next.js | 4-윈도우 레이아웃 + 실시간 업데이트 |
| 그래프 시각화 | D3.js (수직 레이아웃 커스텀) | 수직 노드 그래프 특화 시각화 |
| 3D 웹 뷰어 | Three.js | 브라우저 기반 매스 확인 |
| 실시간 동기화 | WebSocket | 노드 편집 → 3D 반영 실시간 |
| 데이터 포맷 | JSON, YAML, CSV, Markdown | 구간별 최적 포맷 분리 |

---

## 9. API 설계 (초안)

### 9.1 Backend API Endpoints

```
# 프로젝트
POST   /api/projects                    # 새 프로젝트 생성 (컨텍스트 입력)
GET    /api/projects/:id                # 프로젝트 SOT 조회
PUT    /api/projects/:id                # 프로젝트 업데이트

# 건축가 패널
GET    /api/architects                  # 20인 클론 풀 목록
GET    /api/architects/:id              # 클론 프로필 상세
POST   /api/projects/:id/panel          # 패널 선택/변경

# 토론
POST   /api/projects/:id/forum/start    # 토론 시작
POST   /api/projects/:id/forum/inject   # 사용자 의견 주입
GET    /api/projects/:id/forum/log      # 토론 로그 조회
POST   /api/projects/:id/forum/resume   # 피드백 기반 토론 재개

# 노드 그래프
GET    /api/projects/:id/graph          # 현재 노드 그래프 조회
PATCH  /api/projects/:id/graph/nodes    # 노드 추가/수정/삭제
PATCH  /api/projects/:id/graph/edges    # 엣지 추가/수정/삭제

# 3D 모델링
POST   /api/projects/:id/rhino/generate # 노드 그래프 → 3D 생성 요청
POST   /api/projects/:id/rhino/sync     # Rhino 변경 → 노드 그래프 역동기화

# 평가
POST   /api/projects/:id/evaluate       # 평가 실행
GET    /api/projects/:id/evaluations     # 평가 히스토리 조회
```

### 9.2 WebSocket Events

```
# Client → Server
ws:graph:node:update      # 노드 편집
ws:graph:edge:update      # 엣지 편집
ws:forum:inject           # 사용자 의견 실시간 주입

# Server → Client
ws:forum:message          # 건축가 토론 메시지 스트리밍
ws:forum:consensus        # 합의 결과
ws:graph:updated          # 노드 그래프 업데이트
ws:rhino:model:updated    # 3D 모델 업데이트
ws:evaluation:result      # 평가 결과
ws:evaluation:started     # 평가 시작 알림
ws:loop:iteration         # 피드백 루프 반복 알림
```

---

## 10. 디렉토리 구조 (안)

```
gim/
├── apps/
│   └── web/                          # Next.js 프론트엔드
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── api/                  # API Routes
│       │       ├── projects/
│       │       ├── architects/
│       │       ├── forum/
│       │       ├── graph/
│       │       ├── rhino/
│       │       └── evaluate/
│       ├── components/
│       │   ├── layout/
│       │   │   └── FourWindowLayout.tsx
│       │   ├── forum/                # W1: 건축가 토론장
│       │   │   ├── ForumPanel.tsx
│       │   │   ├── ArchitectSelector.tsx
│       │   │   └── DiscussionLog.tsx
│       │   ├── graph/                # W2: 수직 노드 그래프
│       │   │   ├── VerticalGraph.tsx
│       │   │   ├── NodeEditor.tsx
│       │   │   └── ZoneBar.tsx
│       │   ├── viewer/               # W3: 3D 뷰어
│       │   │   └── ThreeViewer.tsx
│       │   ├── evaluation/           # W4: 평가 대시보드
│       │   │   ├── EvalDashboard.tsx
│       │   │   └── ScoreCard.tsx
│       │   └── chat/
│       │       └── ChatInterface.tsx
│       └── lib/
│           ├── ws.ts                 # WebSocket 클라이언트
│           └── types.ts              # 공유 타입 정의
│
├── packages/
│   ├── core/                         # 핵심 비즈니스 로직
│   │   ├── forum/
│   │   │   ├── engine.ts             # 토론 엔진 (멀티에이전트 오케스트레이션)
│   │   │   ├── protocol.ts           # 토론 프로토콜 (발제→비평→수렴→확정)
│   │   │   └── consensus.ts          # 합의 도출 로직
│   │   ├── graph/
│   │   │   ├── schema.ts             # 노드/엣지 타입 정의
│   │   │   ├── builder.ts            # 토론 합의 → 노드 그래프 변환
│   │   │   └── operations.ts         # 노드 그래프 CRUD
│   │   ├── evaluation/
│   │   │   ├── engine.ts             # 평가 엔진
│   │   │   ├── rules/
│   │   │   │   ├── structural.ts     # 구조 안정성 룰
│   │   │   │   ├── environmental.ts  # 환경 성능 룰
│   │   │   │   ├── compliance.ts     # 법규 적합도 룰
│   │   │   │   ├── economic.ts       # 경제성 룰
│   │   │   │   └── urban.ts          # 도시 맥락 룰
│   │   │   └── feedback.ts           # 피드백 리포트 생성
│   │   ├── sot/
│   │   │   └── project.ts            # SOT 관리 (상태 스냅샷 + 버전)
│   │   └── loop/
│   │       └── controller.ts         # 피드백 루프 컨트롤러
│   │
│   └── rhino-bridge/                 # Rhino MCP 브릿지
│       ├── mcp-client.ts             # MCP 클라이언트
│       ├── graph-to-3d.ts            # 노드 그래프 → 3D 변환
│       ├── sync.ts                   # 양방향 동기화
│       └── analysis.ts              # 3D 형태 분석
│
├── data/
│   ├── architects/                   # 건축가 클론 프로필 (YAML)
│   │   ├── adrian_smith.yaml
│   │   ├── foster.yaml
│   │   ├── hadid.yaml
│   │   ├── koolhaas.yaml
│   │   └── ... (20개)
│   └── rules/
│       └── supertall_design_rules.yaml
│
└── rhino/                            # Rhino/Grasshopper 스크립트
    ├── mass_generator.py             # 매스 생성
    ├── delta_updater.py              # delta 기반 업데이트
    └── form_analysis.py              # 3D 형태 분석
```
