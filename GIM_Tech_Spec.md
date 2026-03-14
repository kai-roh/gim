# GIM (Geometry based Integrated Modeling) Tech Spec

## 1. 시스템 개요

기업 사옥 프로젝트의 기획 컨텍스트를 입력하면, 사용자가 선택한 건축가 AI 패널과 전문가(법률/규제, 구조) 패널이 다자 토론과 전문 검증을 통해 설계안을 확정하고, 수직 노드 그래프가 웹 기반 Three.js 3D 매스로 실시간 생성되며, 평가 모델의 피드백이 다시 토론장으로 돌아오는 순환 설계 시스템.

### GIM vs BIM

|  | BIM | GIM |
|---|---|---|
| 단계 | 실시설계/시공 | 아이디어/기획설계 |
| 데이터 | 자재, 구조, MEP | 층별 프로그램, 공간 관계, 브랜드 정체성 |
| 정밀도 | mm 단위 | 매스 레벨 (층 단위 그리드) |
| 목적 | 시공 문서화 | 설계 의사결정 지원 |
| AI 활용 | 간섭 체크, 물량 산출 | 배치 추론, 건축가+전문가 토론, 피드백 루프 |

---

## 2. 시스템 아키텍처

### 2.1 전체 워크플로우

```
[사용자 입력]
기업 사옥 기획 컨텍스트 (브랜드, 대지, 규모, 프로그램, 조건)
+ 건축가 패널 선택 (20인 풀에서 2~5명)
+ 전문가 패널 자동 구성 (법률/규제, 구조)
    │
    ▼
[건축가 토론장] ◄──────────────────────┐
    │                                │
    ▼                                │
[전문가 검증 패널]                      │
법률/규제 전문가 + 구조 전문가            │
    │                                │
    ▼                                │
[수직 노드 그래프 생성/수정]              │
    │                                │
    ▼                                │
[웹 기반 3D 매스 모델링 (Three.js)]      │
    │                                │
    ▼                                │
[평가 모델] ─── 피드백 리포트 ────────────┘
    │
    ◄── 사용자 중간 개입 시에도
         건축가 토론장에 정보 주입
```

루프 종료 조건:
- 평가 모델의 종합 점수가 임계값 이상
- 전문가 패널이 "승인" 판정
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
│  │        Expert Review Panel                │  │
│  │  - 법률/규제 전문가 (자동 참여)              │  │
│  │  - 구조 전문가 (자동 참여)                   │  │
│  │  - 설계안 검증 + 수정 권고                   │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│  ┌───────────────▼───────────────────────────┐  │
│  │     Skills (RAG / Prompt Engineering)      │  │
│  │  - corporate_hq_design_skill               │  │
│  │  - brand_identity_skill                    │  │
│  │  - spatial_quality_skill                   │  │
│  │  - code_compliance_skill                   │  │
│  │  - program_stacking_skill                  │  │
│  │  - structural_review_skill                 │  │
│  └───────────────┬───────────────────────────┘  │
│                  │                               │
│  ┌───────────────▼───────────────────────────┐  │
│  │  Evaluation Engine (평가 모델)              │  │
│  │  구조 실현성 / 법규 적합도 / 브랜드 / 공간 품질  │  │
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
│ Vertical Node    │   │   Web 3D        │
│ Graph Engine     │◄─►│  (Three.js)     │
└──────────────────┘   └─────────────────┘
```

### 2.3 4-윈도우 UI 레이아웃

```
┌────────────────┬──────────────────┬────────────────────────────┐
│  W1: Architect │  W2: Vertical    │  W3: 3D Mass               │
│  Forum         │  Node Graph      │  Viewer                    │
│                │                  │                            │
│  건축가 패널     │  수직 노드 그래프   │  Web 3D (Three.js)         │
│  전문가 패널     │  지하~옥상         │  매스 뷰포트                 │
│  토론 로그       │  실시간 편집       │  매스 + 층별 공간 관계 표현     │
│  합의/논쟁 표시   │                  │                            │
│                │                  │                            │
│  ◄── 피드백 수신  │  ◄─► 양방향 동기화  │                            │
│  ◄── 사용자 의견  │                  │                            │
│  ◄── 전문가 검증  │                  │                            │
├────────────────┴──────────────────┴────────────────────────────┤
│  W4: Evaluation Dashboard                                      │
│  구조 실현성 | 법규 적합도 | 브랜드 정합성 | 공간 품질 → 종합 점수    │
├────────────────────────────────────────────────────────────────┤
│  Chat Interface (사용자 입력 + 건축가 토론장 개입 + 패널 선택)         │
└────────────────────────────────────────────────────────────────┘
```

윈도우 간 데이터 플로우:

| 방향 | 내용 |
|---|---|
| W1 → W2 | 토론 합의 결과가 수직 노드/엣지로 자동 변환 |
| W2 → W3 | 노드 그래프 변경 시 Three.js 3D 매스 자동 재생성 |
| W3 → W2 | 3D에서 매스 선택/편집 시 노드 그래프 역반영 |
| W3 → W4 | 생성된 3D 모델에 대해 평가 모델 자동 작동 |
| W4 → W1 | 평가 피드백이 건축가 토론장 + 전문가 패널에 자동 전달 |
| Chat → W1 | 사용자 의견이 건축가 토론장에 새로운 의제로 주입 |
| W2 ↔ W3 | 노드 직접 편집 ↔ 3D 실시간 양방향 동기화 |

---

## 3. 토론 시스템 (Design Forum)

### 3.1 개요

건축가 토론장은 두 종류의 참여자로 구성된다:

1. **건축가 패널** (사용자 선택, 2~5명): 서로 다른 건축 철학으로 창의적 설계안을 제안하고 토론
2. **전문가 패널** (자동 구성): 건축가 합의안의 실현 가능성을 검증
   - **법률/규제 전문가**: 건축법, 소방법, 도시계획법 등 법규 적합성 검토
   - **구조 전문가**: 구조적 실현 가능성, 시공성, 안전성 검토

### 3.2 20인 건축가 클론 풀

**Category A: 실무 마스터 (Design Practice Masters)**

| # | 클론 ID | 참조 건축가 | 대표작 | 핵심 키워드 |
|---|---|---|---|---|
| 1 | `adrian_smith` | Adrian Smith (SOM) | Burj Khalifa, Jeddah Tower | 구조적 우아함, 기하학적 형상, 셋백 |
| 2 | `gensler` | Gensler (Jun Xia) | Shanghai Tower | 이중외피, 수직도시, 지속가능성 |
| 3 | `bjarke_ingels` | Bjarke Ingels (BIG) | Google HQ, CopenHill | 실용적 유토피아, 프로그램 하이브리드, 유희 |
| 4 | `mvrdv` | MVRDV (Winy Maas) | Markthal, Valley | 데이터 기반 형태, 적층, 공공성 |
| 5 | `renzo_piano` | Renzo Piano | The Shard, Centre Pompidou | 경량 구조, 빛의 건축, 도시 맥락 |
| 6 | `fazlur_khan` | Fazlur Rahman Khan (SOM) | Willis Tower | 번들튜브, 구조 합리주의, 효율 |
| 7 | `snohetta` | Snøhetta | Oslo Opera House | 풍경 건축, 공공 접근, 소재 탐구 |
| 8 | `ole_scheeren` | Ole Scheeren | Interlace, MahaNakhon | 수평 도시, 복셀 적층, 공동체 |
| 9 | `thomas_heatherwick` | Thomas Heatherwick | Vessel, Coal Drops Yard | 조각적 구조, 촉각 소재, 몰입 경험 |
| 10 | `kpf` | Kohn Pedersen Fox | Lotte World Tower | 점진적 테이퍼, 도시 맥락, 실용 |

**Category B: 건축 사상 마스터 (Architectural Visionaries)**

| # | 클론 ID | 참조 건축가 | 건축 사조 | 핵심 키워드 |
|---|---|---|---|---|
| 11 | `le_corbusier` | Le Corbusier | 모더니즘 | 필로티, 옥상정원, 자유평면, 기계미학 |
| 12 | `frank_lloyd_wright` | Frank Lloyd Wright | 유기적 건축 | 자연통합, 유기체적 성장, 수평성 |
| 13 | `mies` | Mies van der Rohe | 모더니즘 | Less is more, 유니버설 스페이스, 비례 |
| 14 | `gaudi` | Antoni Gaudi | 자연주의 | 곡선은 신의 선, 자연 구조역학 |
| 15 | `kahn` | Louis Kahn | 기념비적 모더니즘 | served/servant, 빛과 그림자, 무게감 |
| 16 | `aalto` | Alvar Aalto | 북유럽 모더니즘 | 인간 중심, 목재+곡선, 따뜻한 모더니즘 |
| 17 | `ando` | Tadao Ando | 미니멀리즘 | 노출콘크리트, 빛/물/바람, 명상적 공간 |
| 18 | `foster` | Norman Foster | 하이테크 건축 | 기술+지속가능성, 다이어그리드, 에코건축 |
| 19 | `hadid` | Zaha Hadid | 해체주의/파라메트릭 | 유선형, 비정형, 수직수평 규칙 파괴 |
| 20 | `koolhaas` | Rem Koolhaas | 프로그램 건축 | 프로그램 우선, 도시적 충돌, 복잡성 |

### 3.3 전문가 패널 (자동 구성)

건축가 토론과 별도로, 설계안의 실현 가능성을 검증하는 전문가 패널이 자동으로 참여한다.

| 전문가 | 역할 | 검증 항목 | 개입 시점 |
|---|---|---|---|
| **법률/규제 전문가** | 관련 법규 적합성 검토 | 건축법, 소방법, 주차장법, 도시계획법, 건폐율/용적률, 일조권, 피난규정 | 건축가 합의 후, 평가 피드백 시 |
| **구조 전문가** | 구조적 실현 가능성 검토 | 구조 시스템 적정성, 스팬 검토, 하중 검토, 특수 형태의 시공성, 내진 기준 | 건축가 합의 후, 평가 피드백 시 |

전문가 패널의 검증 결과:
- **승인**: 설계안이 법규/구조적으로 실현 가능 → 노드 그래프 생성 진행
- **조건부 승인**: 경미한 수정 필요 → 수정 권고사항과 함께 노드 그래프 생성
- **수정 필요**: 중대한 문제 발견 → 건축가 토론장에 피드백으로 전달, 재토론

### 3.4 건축가 클론 프로필 스키마

```yaml
architect_clone:
  id: string           # "hadid"
  reference: string    # "Zaha Hadid"
  category: enum       # design_practice_master | architectural_visionary

  # 설계 원칙
  design_principles:
    - string           # "parametric_fluidity"
    - string           # "spatial_continuity"

  # 공간 선호
  spatial_preferences:
    ground_strategy: string        # "urban_connectivity" | "brand_statement" | "fluid_ground"
    form_language: string          # "organic" | "geometric" | "hybrid" | "sculptural" | "minimal"
    facade_approach: string        # "expressive" | "restrained" | "contextual" | "iconic"
    interior_philosophy: string    # "open_plan" | "cellular" | "hybrid" | "fluid"
    material_expression: string    # "concrete" | "glass_steel" | "timber" | "mixed" | "experimental"
    light_strategy: string         # "natural_dramatic" | "ambient" | "controlled" | "theatrical"

  # 구조/표현 선호
  expression_rules:
    structure_expression: string   # "exposed" | "hidden" | "celebrated" | "integrated"
    facade_language: string        # "curtain_wall" | "parametric" | "textured" | "minimal"
    material_palette: string[]     # ["concrete", "glass", "steel"]
    sustainability_approach: string # "passive" | "active_tech" | "biomimicry" | "traditional"

  # 토론 성향 (멀티에이전트 토론 시 행동 결정)
  discussion_style:
    assertiveness: number          # 0~1 주장 강도
    compromise_willingness: number # 0~1 타협 의지
    focus_priority: string[]       # ["form", "experience", "sustainability", "program", "context"]

  # 참조 지식 베이스
  knowledge_base:
    representative_buildings: string[]
    design_philosophy: string      # 자연어 서술 (LLM 시스템 프롬프트에 포함)
    era_context: string            # 활동 시대 맥락
```

### 3.5 전문가 프로필 스키마

```yaml
expert_profile:
  id: string           # "legal_expert" | "structural_expert"
  type: enum           # legal_regulatory | structural_engineering

  # 법률/규제 전문가
  legal_regulatory:
    jurisdiction: string[]         # ["건축법", "소방법", "주차장법", "도시계획법"]
    focus_areas:
      - 건폐율/용적률 검토
      - 일조권/조망권
      - 피난규정 (피난계단, 피난안전구역)
      - 장애인 접근성
      - 주차 대수 충족
      - 환경영향평가 해당 여부

  # 구조 전문가
  structural_engineering:
    focus_areas:
      - 구조 시스템 적정성 (라멘, 브레이스, 전단벽 등)
      - 스팬 검토 (캔틸레버, 대공간)
      - 하중 검토 (수직하중, 수평하중)
      - 특수 형태의 시공성
      - 내진 기준 적합성
      - 기초 구조 검토

  # 검증 출력 형식
  review_output:
    verdict: enum                  # approved | conditionally_approved | revision_required
    issues: string[]
    recommendations: string[]
    severity: enum                 # info | warning | critical
```

### 3.6 토론 프로토콜

```
[Phase 1: 발제]
사용자 컨텍스트 수신 → 각 건축가가 독립적으로 초기 제안 제시
  (층별로 다른 건축가 스타일 적용 가능성 포함)
    │
    ▼
[Phase 2: 교차 비평]
각 건축가가 다른 건축가의 제안에 대해 비평 및 대안 제시
    │
    ▼
[Phase 3: 수렴]
공통 합의점 도출 + 쟁점 정리 + 층별 스타일 배분 합의
    │
    ▼
[Phase 3.5: 전문가 검증]
법률/규제 전문가: 건축법/소방법 적합성 검토
구조 전문가: 구조적 실현 가능성 검토
  → 승인 / 조건부 승인 / 수정 필요 판정
  → 수정 필요 시 Phase 2로 복귀 (검증 피드백 포함)
    │
    ▼
[Phase 4: 확정]
합의된 기획안 + 전문가 승인 + 미합의 대안 목록 출력
    │
    ▼
[반복 트리거]
평가 피드백 수신 시 → Phase 2부터 재개 (전문가 재검증 포함)
사용자 의견 수신 시 → Phase 1에 새 의제로 추가 후 Phase 2부터 재개
```

### 3.7 토론장 입출력 구조

**입력:**

| 소스 | 시점 | 예시 |
|---|---|---|
| 사용자 컨텍스트 | 최초 입력 또는 추가 의견 | "1~2층은 체험형 리테일 공간으로, 브랜드 경험이 극대화되도록" |
| 평가 모델 피드백 | 3D 모델 생성 후 자동 | "구조적으로 3층 캔틸레버 스팬 12m 초과, 보강 필요" |
| 전문가 검증 피드백 | 건축가 합의 후 | "소방법상 피난계단 2개소 이상 필요, 현재 설계안은 1개소" |
| 사용자 중간 개입 | 언제든지 | "4층은 Ando 스타일의 명상적 공간으로 바꿔줘" |

**출력:**

| 출력 | 형식 | 수신처 |
|---|---|---|
| 확정 기획안 | 구조화된 JSON | 수직 노드 그래프 생성기 |
| 토론 로그 | Markdown | W1 (사용자 열람) |
| 전문가 검증 리포트 | JSON | 평가 대시보드 + 토론장 |
| 미합의 대안 목록 | JSON | SOT 저장 (추후 재참조) |

---

## 4. 수직 빌딩 노드 스키마

### 4.1 노드 그래프 구조

기업 사옥은 5~20층 규모의 중저층 건물에 최적화되어 있으며, 각 층마다 서로 다른 건축가 스타일이 공존할 수 있는 구조를 지원한다.

```
[옥상] ──── 루프가든 ─── 이벤트스페이스 ─── 기계실
  │
[상층 7~8F] ── 임원실 ─── 회의실 ─── 라운지 ─── 코어
  │
[중층 4~6F] ── 오픈오피스 ─── 협업공간 ─── 코어
  │
[중층 3F] ── 카페테리아 ─── 피트니스 ─── 갤러리
  │
[저층 1~2F] ── 로비 ─── 체험형리테일 ─── 전시공간 ─── 공공보이드
  │
[지하 B1~B2] ── 주차 ─── 기계실 ─── 창고
```

### 4.2 노드 스키마

```yaml
floor_node:
  # 식별
  id: string              # "F3_cafe_zone_A"
  name: string            # "3층 카페테리아 존 A"
  floor_level: integer    # 3
  floor_zone: enum        # basement | ground | lower | middle | upper | penthouse | rooftop
  function: enum          # 아래 4.4 분류 참조

  # 위치
  position: string        # center | north | south | east | west | northeast | ...

  # 물리적 제약
  constraints: string[]

  # 추상 속성 (0.0 ~ 1.0)
  abstract:
    publicity: number         # 공공성 (1F 로비 → 높음, 임원층 → 낮음)
    brand_expression: number  # 브랜드 표현 강도
    spatial_quality: number   # 공간 품질 (천장고, 자연광, 조망)
    flexibility: number       # 용도 가변성
    prestige: number          # 위상/상징성
    experience: number        # 체험적 가치

  # 건축가 스타일 태그
  style_ref: string       # 해당 영역의 건축 스타일 참조 (nullable, 예: "hadid")
  tags: string[]          # ["브랜드체험", "공공보이드", "더블하이트"]

  # 기하학 참조
  geometry_ref: string    # Three.js mesh ID (nullable)
```

### 4.3 엣지 타입

**수직 노드 그래프 엣지 (Voxel Graph):**

| 관계 | 의미 | 속성 |
|---|---|---|
| `STACKED_ON` | 수직 적층 (층간 관계) | structural_continuity: boolean |
| `ADJACENT_TO` | 같은 층 내 수평 인접 | wall_type: open / solid / glazed |
| `VERTICAL_CONNECT` | 수직 동선 연결 | via: elevator / stair / escalator / void |
| `SERVED_BY` | 기능적 종속 | 코어/기계실 → 오피스/리테일 |
| `VISUAL_CONNECT` | 시각적 연결 (아트리움/보이드) | degree: 0.0~1.0, spans_floors: integer |
| `ZONE_BOUNDARY` | 수직 존 경계 | transition_type: hard / gradient |
| `FACES` | 외부 조건 대면 | target: view / road / park / landmark |
| `STYLE_BOUNDARY` | 건축 스타일 전환 경계 | from_style / to_style |
| `STRUCTURAL_TRANSFER` | 구조 전이 (특수 구간) | system: cantilever / truss / transfer_beam |
| `PROGRAM_LINK` | 프로그램 그래프 연결 | weight, rationale |

**프로그램 그래프 엣지 (Building-GAN Local Graph 적용):**

건축가 토론 합의 결과를 프로그램 인접 관계 그래프로 정형화한다. 이 그래프가 수직 노드 그래프 자동 생성의 입력(제약 조건)이 된다.

| 관계 | 의미 | 예시 |
|---|---|---|
| `PROGRAM_ADJACENT` (positive) | 인접 배치 필요 | 오피스 ↔ 코어, 로비 ↔ 리테일 |
| `PROGRAM_SEPARATE_SAME_ZONE` (negative) | 같은 존 내 분리 필요 | 기계실 ↔ 로비, 주차 ↔ 리테일 |
| `PROGRAM_SEPARATE_CROSS_ZONE` (negative) | 다른 존 간 분리 제약 | 지하주차 ↔ 체험공간 |
| `VERTICAL_CONTINUITY` | 수직 정렬 필수 | 코어는 전층 동일 위치, 샤프트 연속 |

이 positive/negative 엣지 구조는 Building-GAN의 contrastive learning 방식에서 차용한 것으로, 프로그램 배치의 제약 조건을 명시적으로 인코딩한다.

### 4.4 노드 function 분류

| 카테고리 | function enum 값 | 적용 존 |
|---|---|---|
| CORE | elevator_core, stairwell, service_shaft, elevator_lobby | 전층 관통 |
| OFFICE | open_office, premium_office, executive_suite, coworking, focus_room | 중/상층부 |
| EXPERIENCE | brand_showroom, exhibition_hall, experiential_retail, gallery, installation_space | 저층부 |
| RETAIL | retail, restaurant, cafe, flagship_store | 저층부/1층 |
| PUBLIC | lobby, public_void, atrium, community_space, event_space | 저층부/특수 |
| SOCIAL | lounge, rooftop_bar, sky_garden, fitness, library, meditation_room | 중간/상층부 |
| AMENITY | cafeteria, meeting_room, conference_hall, auditorium, nursery | 중층부 |
| MECHANICAL | mechanical_room, electrical_room, server_room | 지하/중간 |
| PARKING | parking, loading_dock, bicycle_storage | 지하부 |

### 4.5 층별 스타일 배분

GIM의 독특한 특징: 각 층/영역에 서로 다른 건축가의 스타일을 배분할 수 있다. 이 배분은 건축가 토론에서 합의되며, 각 건축가가 자신의 강점을 발휘할 수 있는 영역을 협상한다.

```yaml
style_distribution:
  "1F": "heatherwick"     # 몰입 경험, 아이코닉 로비
  "2F": "hadid"           # 유선형 동선의 체험 리테일
  "3F": "heatherwick"     # 조각적, 촉각적 브랜드 체험
  "4F": "hadid"           # 유동적 곡면의 소셜 허브
  "5F": "mies"            # 유니버설 스페이스 오픈 오피스
  "6F": "mies"            # 유니버설 스페이스 오픈 오피스
  "7F": "ando"            # 노출콘크리트, 명상적 임원 공간
  "8F": "bjarke_ingels"   # 유희적, 개방적 루프가든
```

### 4.6 3-그래프 아키텍처 (Building-GAN 적용)

Autodesk AI Lab의 Building-GAN(ICCV 2021)에서 제안된 3-그래프 건물 표현 체계를 GIM에 적용한다.

#### 개념 매핑

```
Building-GAN                          GIM
─────────────                         ───
Global Graph (FAR, 용도 비율)     ←→   Project SOT (대지 제약, 용적률, 프로그램 비율)
Local Graph (버블 다이어그램)      ←→   건축가 토론 합의 출력 (프로그램 인접 관계)
Voxel Graph (3D 공간 격자)        ←→   수직 노드 그래프 (층별 프로그램 배치)
Cross-Modal Attention             ←→   합의 → 노드 그래프 자동 변환 브릿지
Multi-Scale Discriminator         ←→   3-스케일 평가 (층→존→빌딩)
```

#### 데이터 플로우

```
[건축가 토론 합의 + 전문가 승인]
    │
    ▼
[프로그램 그래프 생성]
 - 노드: 프로그램 타입 + 수직 존 + 목표 비율 + 스타일 참조
 - positive 엣지: 인접 배치 제약
 - negative 엣지: 분리 배치 제약
    │
    ▼
[크로스모달 변환 (Cross-Modal Bridge)]
 - 프로그램 그래프 노드 → 수직 노드 그래프 노드로 매핑
 - 같은 수직 존 내에서만 매핑 (story-level alignment)
 - Gumbel-softmax 기반 프로그램 타입 할당 (Building-GAN 방식)
    │
    ▼
[수직 노드 그래프 자동 생성]
 - 프로그램 제약을 만족하는 층별 노드 배치
 - 연결성 정확도(Connectivity Accuracy) 검증
 - 층별 스타일 배분 반영
```

#### 층 위치 인코딩 (Floor Positional Encoding)

Building-GAN의 사인파 위치 인코딩을 기업 사옥에 맞게 적용한다.

```
PE(floor, 2i)   = sin(floor / 10000^(2i/d))
PE(floor, 2i+1) = cos(floor / 10000^(2i/d))

d = 128 (인코딩 차원)
max_len = 30 (중저층 기업 사옥 대응, Building-GAN 원본은 20)
```

각 노드의 `floor_level`을 이 벡터로 인코딩하여, 수직적 위치 관계(위/아래, 거리)를 연속적 벡터 공간에서 표현한다. 이를 통해:
- 인접 층(1층 차이)과 원거리 층(5층 차이)의 관계가 자연스럽게 구분
- 수직 존 경계를 학습 가능한 패턴으로 인코딩
- 스타일 전환층, 특수 기능층의 위치를 벡터로 표현

#### 프로그램 그래프 스키마

```yaml
program_graph:
  nodes:
    - id: string              # "pg_office_mid"
      program_type: string    # function enum 값
      target_zone: string     # 목표 수직 존
      floor_range: [int, int] # 배치 가능 층 범위
      area_ratio: number      # 전체 면적 대비 목표 비율
      style_ref: string       # 건축가 스타일 참조 (nullable)

  edges:
    - source: string
      target: string
      type: enum              # PROGRAM_ADJACENT | PROGRAM_SEPARATE_SAME_ZONE
                              # | PROGRAM_SEPARATE_CROSS_ZONE | VERTICAL_CONTINUITY
      weight: number          # 0.0~1.0 (제약 강도)
      rationale: string       # "건축가 토론에서 합의된 이유"
```

#### Building-GAN 원본 대비 GIM 적용 변경점

| 항목 | Building-GAN 원본 | GIM 적용 |
|---|---|---|
| 프로그램 타입 | 6개 (residential, commercial 등) | 30+개 (기업 사옥 특화 function enum) |
| 복셀 격자 | 50×40×40 (중저층 비례) | 30×20×20 (기업 사옥 수직 종횡비) |
| 층 위치 인코딩 | max_len=20 | max_len=30 |
| 엣지 타입 | 수평 인접만 | 수직 연속성 제약 + 스타일 경계 추가 |
| 평가 스케일 | story + building (2-스케일) | floor + zone + building (3-스케일) |
| 입력 소스 | 정적 버블 다이어그램 | 건축가 토론 합의 + 전문가 검증 (동적, 반복 가능) |
| 훈련 데이터 | 96,000 건물 샘플 | 룰 기반 + LLM 추론 하이브리드 (데이터 없이 시작) |
| 스타일 | 단일 | 층별 다중 건축가 스타일 배분 |

> **참고**: Building-GAN은 대규모 훈련 데이터(96K 샘플)로 GNN을 학습시키는 방식이지만, GIM은 해커톤 단계에서 훈련 데이터가 없으므로 **룰 기반 배치 + LLM 추론**으로 프로그램 그래프 → 수직 노드 그래프 변환을 수행한다. Building-GAN의 3-그래프 구조와 프로그램 인접 제약 표현 체계를 차용하되, 생성 방식은 GNN 대신 기업 사옥 설계 룰셋 + Claude 추론으로 대체한다. 향후 프로젝트 데이터가 축적되면 GNN 기반 생성으로 전환 가능하다.

### 4.7 실시간 노드 편집

지원 편집 작업:
- 노드 추가/삭제: 특정 층에 새 프로그램 추가 또는 제거
- 노드 이동: 프로그램의 층 변경 (예: 소셜 허브를 3F에서 4F로)
- 속성 변경: 추상 속성 값, 스타일 참조 실시간 조정
- 엣지 추가/삭제: 공간 관계 연결 변경
- 존 경계 변경: 영역 경계 변경
- 스타일 재배분: 층별 건축가 스타일 변경

편집 → 반영 플로우:
```
W2 노드 편집 이벤트
    │
    ▼
노드 그래프 업데이트 (React Context + useReducer)
    │
    ├─► W3 Three.js: 변경된 노드/엣지만 delta 전송 → 3D 매스 재생성
    │
    └─► W4 평가 모델: 변경 사항에 대한 즉시 재평가 (500ms 디바운스)
            │
            ▼
        피드백 → W1 건축가 토론장 + 전문가 패널
```

Undo/Redo 지원:
- 그래프 스냅샷 스택 (최대 50개)
- Ctrl+Z / Ctrl+Shift+Z 키보드 단축키

---

## 5. 평가 모델 (Evaluation Engine)

### 5.1 평가 차원

| 차원 | 평가 항목 | 평가 방식 |
|---|---|---|
| 구조 실현성 | 스팬 적정성, 구조 시스템, 특수 형태 시공성, 내진 | 룰 기반 + 전문가 검증 |
| 법규 적합도 | 건폐율, 용적률, 피난규정, 일조권, 주차, 접근성 | 룰 기반 + 전문가 검증 |
| 브랜드 정합성 | 브랜드 철학과 공간의 일치도, 체험 동선 | LLM 추론 |
| 공간 품질 | 자연광, 조망, 천장고, 공간 흐름, 동선 효율 | 파라미터 기반 |
| 프로그램 적합성 | 면적 배분, 기능 인접성, 동선 효율 | 그래프 분석 |
| 도시 맥락 | 저층부 공공 기여도, 보행 접근성, 도시 경관 조화 | LLM 추론 |
| 그래프 연결성 | 프로그램 인접 관계 유지율, 수직 연속성 정합도 | 그래프 분석 (Building-GAN 메트릭) |

#### 연결성 정확도 (Connectivity Accuracy)

Building-GAN에서 도입된 정량 메트릭을 GIM 평가 모델에 적용한다.

```
Connectivity Accuracy = (유지된 positive 엣지 수) / (전체 positive 엣지 수)
```

- 건축가 토론에서 합의한 프로그램 인접 관계(positive 엣지)가 최종 노드 그래프에서 실제로 유지되는 비율
- 수직 연속성 정합도: 코어, 엘리베이터 샤프트 등 전층 관통 요소의 수직 정렬 유지 비율
- 이 메트릭이 낮으면 → 평가 피드백에 "합의된 인접 관계 미충족" 이슈로 건축가 토론장에 전달

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
  "expert_review": {
    "legal": {
      "verdict": "approved | conditionally_approved | revision_required",
      "issues": ["string"],
      "severity": "info | warning | critical"
    },
    "structural": {
      "verdict": "approved | conditionally_approved | revision_required",
      "issues": ["string"],
      "severity": "info | warning | critical"
    }
  },
  "priority_actions": ["string"]
}
```

dimension_key: `structural`, `code_compliance`, `brand_identity`, `spatial_quality`, `program_fitness`, `urban_context`, `connectivity`

---

## 6. 기업 사옥 설계 룰셋

```yaml
corporate_hq_design_rules:
  structural:
    max_cantilever_span: 8m        # 보강 없이 가능한 최대 캔틸레버
    max_span_without_column: 15m   # 무주 공간 최대 스팬
    floor_load_office: 300kg/sqm   # 사무실 활하중
    floor_load_retail: 500kg/sqm   # 리테일 활하중
    seismic_zone: "한국 내진설계 기준" # 건축물 내진설계기준

  legal_regulatory:
    bcr_limit: "대지면적의 60% 이하 (일반상업지역)"
    far_limit: "용적률 상한 (용도지역별)"
    fire_stair_count: "6층 이상 직통계단 2개소 이상"
    fire_stair_distance: "보행거리 40m 이내"
    parking_ratio: "시설면적 150sqm당 1대 (지역별 차이)"
    accessibility: "장애인 동선 확보 (장애인편의법)"
    setback: "도로사선제한, 인접대지경계선 이격"

  spatial_quality:
    min_ceiling_height_office: 2.7m
    min_ceiling_height_retail: 3.0m
    natural_light_ratio: 0.5       # 자연광 도달 면적 비율
    core_to_perimeter_max: 12m     # 코어~외벽 최대 거리

  program:
    office_ratio: 0.40~0.55        # 전체 면적 대비 사무실
    amenity_ratio: 0.10~0.15       # 편의시설 비율
    common_ratio: 0.15~0.25        # 공용/로비/동선
    net_to_gross_target: 0.65~0.75 # 전용률
```

---

## 7. 데이터 교환 체계

### 7.1 포맷 매핑

| 구간 | 포맷 | 이유 |
|---|---|---|
| 사용자 컨텍스트 → LLM | Markdown | 자유 서술 + 구조적 힌트 |
| 건축가 토론 합의 → 노드 그래프 | JSON (function calling) | 구조화 + 스키마 검증 |
| 전문가 검증 결과 | JSON | 구조화된 verdict + issues |
| 건축가 클론 프로필 | YAML | 사람이 직접 편집 |
| 설계 룰셋 | YAML | 동일 이유 |
| 노드 그래프 → W2 시각화 | JSON → D3 | 실시간 렌더링 |
| 노드 그래프 → W3 3D 매스 | JSON → Three.js | 웹 기반 3D 렌더링 |
| W3 3D 변경 → 노드 그래프 역동기화 | JSON diff | 변경분만 전송 (이벤트 기반) |
| 평가 결과 → 건축가 토론장 | JSON | 구조화된 점수 + 이슈 목록 |
| 대지/프로그램 정량 데이터 | CSV | 면적표 등 테이블형 |
| 프로젝트 SOT | JSON (단일 파일) | 전체 상태 스냅샷 + 버전 관리 |
| 토론 로그 | Markdown | 사람이 읽기 쉬운 형식 |

### 7.2 SOT (Source of Trust) JSON 구조

```json
{
  "project_id": "gentlemonster_hq_2026",
  "version": "number",
  "iteration": "number",
  "company": {
    "name": "Gentle Monster",
    "brand_philosophy": "미래적 감각, 예술적 경험, 경계 파괴",
    "identity_keywords": ["avant-garde", "experiential", "boundary-breaking"]
  },
  "site": {
    "location": "서울 성수동",
    "dimensions": [40, 30],
    "far": 500,
    "bcr": 60,
    "height_limit": 50,
    "context": {
      "north": "주거지역",
      "south": "성수역 방면 대로",
      "east": "소규모 카페 거리",
      "west": "공원"
    }
  },
  "architect_panel": ["hadid", "heatherwick", "bjarke_ingels", "ando"],
  "expert_panel": ["legal_regulatory", "structural_engineering"],
  "discussion_log": [
    {
      "round": "number",
      "trigger": "initial_context | evaluation_feedback | user_intervention | expert_feedback",
      "architect_consensus": "string",
      "expert_review": {
        "legal": "approved | conditionally_approved | revision_required",
        "structural": "approved | conditionally_approved | revision_required"
      },
      "dissent": ["string"]
    }
  ],
  "style_distribution": {
    "1F": "heatherwick",
    "2F": "hadid",
    "3F": "heatherwick",
    "4F": "hadid",
    "5F": "mies",
    "6F": "mies",
    "7F": "ando",
    "8F": "bjarke_ingels"
  },
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
| LLM | Claude API (function calling) | 구조화된 JSON 출력 + 긴 컨텍스트 + 멀티에이전트 토론 |
| 토론 엔진 | Claude multi-turn + system prompt per clone | 클론별 독립 시스템 프롬프트로 성격 분리, 전문가 별도 프롬프트 |
| 평가 모델 | TypeScript 룰 엔진 + Claude 추론 | 정량 룰 + 정성적 판단 혼합 |
| 프론트엔드 | Next.js (App Router) | 4-윈도우 레이아웃 + SSE 실시간 업데이트 |
| 그래프 시각화 | D3.js v7 (수직 레이아웃 커스텀) | 수직 노드 그래프 특화 시각화 |
| 3D 웹 뷰어 | Three.js | 브라우저 기반 3D 매스 렌더링, Rhino MCP 대체 |
| 상태 관리 | React Context + useReducer | 그래프/포럼 상태 관리, 편집 undo/redo |
| 실시간 스트리밍 | SSE (Server-Sent Events) | 건축가 토론 토큰 단위 스트리밍 |
| 데이터 포맷 | JSON, YAML, Markdown | 구간별 최적 포맷 분리 |
| 모노레포 | npm workspaces | @gim/core + @gim/web 패키지 분리 |

---

## 9. API 설계

### 9.1 Backend API Endpoints

```
# 그래프
GET    /api/graph                          # 현재 노드 그래프 조회
POST   /api/graph/save                     # 그래프 저장

# 건축가 패널
GET    /api/architects                     # 20인 클론 풀 목록
GET    /api/architects/:id                 # 클론 프로필 상세

# 토론
POST   /api/forum/start                    # 세션 생성, sessionId 반환
GET    /api/forum/stream?sessionId=xxx     # SSE 스트림 (토큰 단위 스트리밍)
POST   /api/forum/:sessionId/next-phase    # 다음 페이즈 진행
POST   /api/forum/:sessionId/inject        # 사용자 의견 주입
GET    /api/forum/:sessionId/result        # 현재 포럼 결과

# 평가
POST   /api/evaluate                       # 평가 실행
```

### 9.2 SSE Event Types

```
# 포럼 스트리밍 이벤트
forum:architect_started    # 건축가 응답 시작
forum:token                # 토큰 단위 스트리밍
forum:architect_complete   # 건축가 응답 완료
forum:expert_started       # 전문가 검증 시작
forum:expert_complete      # 전문가 검증 완료
forum:phase_complete       # 페이즈 완료

# 그래프 이벤트
graph:generated            # 그래프 자동 생성 완료
graph:updated              # 그래프 업데이트

# 평가 이벤트
evaluation:result          # 평가 결과
evaluation:started         # 평가 시작 알림
```

### 9.3 세션 관리

세션은 인메모리 Map으로 관리한다 (MVP 단계, DB 불필요). Next.js App Router의 모듈 격리를 우회하기 위해 `globalThis` 패턴을 사용한다.

```typescript
interface SessionEntry {
  session: ForumSession;
  status: "idle" | "running" | "completed" | "error";
  currentPhaseResponses: { id: string; response: ArchitectResponse }[];
  error?: string;
  abortController?: AbortController;
}

const globalKey = "__gim_session_store__" as const;
function getStore(): Map<string, SessionEntry> {
  const g = globalThis as any;
  if (!g[globalKey]) {
    g[globalKey] = new Map<string, SessionEntry>();
  }
  return g[globalKey];
}
export const sessionStore = getStore();
```

---

## 10. 디렉토리 구조

```
GIM/
├── packages/
│   ├── core/                         # @gim/core — 핵심 비즈니스 로직
│   │   ├── package.json
│   │   ├── index.ts                  # barrel export
│   │   ├── forum/
│   │   │   ├── forum-engine.ts       # 토론 엔진 (멀티에이전트 오케스트레이션)
│   │   │   ├── run-forum.ts          # CLI 진입점
│   │   │   ├── architect-loader.ts   # YAML 프로필 로더
│   │   │   └── types.ts              # ForumSession, ArchitectResponse 등
│   │   ├── graph/
│   │   │   ├── types.ts              # FloorNode, Edge, VerticalNodeGraph 타입
│   │   │   ├── builder.ts            # 토론 합의 → 노드 그래프 변환
│   │   │   ├── operations.ts         # 노드 그래프 CRUD (immutable)
│   │   │   ├── evaluation.ts         # 7차원 평가 엔진
│   │   │   └── metrics.ts            # 연결성 정확도 등 메트릭
│   │   └── types/
│   │       └── index.ts              # 공유 타입 정의
│   │
│   └── web/                          # @gim/web — Next.js App
│       ├── package.json
│       ├── next.config.ts
│       ├── .env.local                # → 루트 .env 심볼릭 링크
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx
│           │   └── api/              # API Routes
│           │       ├── graph/
│           │       │   ├── route.ts          # GET /api/graph
│           │       │   └── save/route.ts     # POST /api/graph/save
│           │       ├── architects/
│           │       │   ├── route.ts          # GET /api/architects
│           │       │   └── [id]/route.ts     # GET /api/architects/:id
│           │       ├── forum/
│           │       │   ├── start/route.ts    # POST /api/forum/start
│           │       │   ├── stream/route.ts   # GET /api/forum/stream (SSE)
│           │       │   └── [sessionId]/
│           │       │       ├── next-phase/route.ts
│           │       │       ├── inject/route.ts
│           │       │       └── result/route.ts
│           │       └── evaluate/route.ts
│           ├── components/
│           │   ├── AppShell.tsx           # 4-윈도우 레이아웃 + 키보드 단축키
│           │   ├── ForumPanel.tsx         # W1: 건축가+전문가 토론장
│           │   ├── TowerMinimap.tsx       # 타워 미니맵
│           │   ├── VerticalGraphViewer.tsx # W2: D3 수직 그래프
│           │   ├── MassViewer3D.tsx       # W3: Three.js 3D 매스 뷰어
│           │   ├── NodeInspector.tsx      # 노드 상세 정보 패널
│           │   ├── NodeEditor.tsx         # 노드 편집 패널 (undo/redo)
│           │   ├── EvaluationDashboard.tsx # W4: 7축 레이더 차트
│           │   └── ChatInterface.tsx      # 채팅 인터페이스 (CLI 커맨드)
│           └── lib/
│               ├── graph-context.tsx      # 그래프 상태 관리 (Context + useReducer)
│               ├── forum-context.tsx      # 포럼 상태 관리 + SSE 연결
│               ├── session-store.ts       # 세션 스토어 (globalThis)
│               ├── graph-colors.ts        # 노드/존 컬러 매핑
│               └── graph-renderer.ts      # D3 렌더링 유틸리티
│
├── data/
│   ├── architects/                   # 건축가 클론 프로필 (YAML)
│   │   ├── adrian_smith.yaml
│   │   ├── hadid.yaml
│   │   ├── koolhaas.yaml
│   │   └── ... (20개)
│   ├── experts/                      # 전문가 프로필 (YAML)
│   │   ├── legal_regulatory.yaml
│   │   └── structural_engineering.yaml
│   └── rules/
│       └── corporate_hq_design_rules.yaml
│
├── graph_output/                     # 생성된 그래프 데이터
│   └── vertical_node_graph.json
│
└── package.json                      # workspaces 설정
```
