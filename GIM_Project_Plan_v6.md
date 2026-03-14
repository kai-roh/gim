# GIM (Geometry based Integrated Modeling) 해커톤 프로젝트 기획안

## 1. 프로젝트 개요

### 한 줄 정의

기업 사옥 프로젝트의 기획 컨텍스트를 입력하면, 사용자가 선택한 건축가 AI 패널과 전문가(법률/규제, 구조) 패널이 다자 토론과 전문 검증을 통해 설계안을 확정하고, 수직 노드 그래프가 웹 기반 3D 매스로 실시간 생성되며, 평가 모델의 피드백이 다시 토론장으로 돌아오는 순환 설계 시스템

### 핵심 질문

기업 사옥 설계는 브랜드 정체성, 공간 혁신, 구조적 실현 가능성, 법규 적합성을 동시에 고려해야 하는 복합 의사결정이다. 단일 관점으로는 최적해에 도달할 수 없다. 만약 서로 다른 건축 철학을 가진 거장들이 하나의 프로젝트를 두고 실시간으로 토론하고, 법률/구조 전문가가 실현 가능성을 검증하며, 그 결과가 즉시 3D로 구현되고 자동 평가 피드백이 돌아온다면, 기업 사옥 설계의 초기 의사결정 품질은 근본적으로 달라진다.

### GIM vs BIM

|  | BIM | GIM |
|---|---|---|
| 단계 | 실시설계/시공 | 아이디어/기획설계 |
| 데이터 | 자재, 구조, MEP | 층별 프로그램, 공간 관계, 브랜드 정체성 |
| 정밀도 | mm 단위 | 매스 레벨 (층 단위 그리드) |
| 목적 | 시공 문서화 | 설계 의사결정 지원 |
| AI 활용 | 간섭 체크, 물량 산출 | 배치 추론, 건축가+전문가 토론, 피드백 루프 |

### 왜 기업 사옥인가?

기존 초고층 빌딩 프로젝트는 풍하중, 피난안전구역, 코어 비율 등 엄격한 법규 제약이 많아 창의적 설계의 폭이 좁다. 반면 기업 사옥 프로젝트는:

- **브랜드 정체성 표현**: 젠틀몬스터 사옥, Apple Park, Google Bjarke처럼 기업의 철학이 건축으로 구현
- **층별 다양성**: 각 층/영역마다 서로 다른 건축가의 스타일이 공존할 수 있음 (1층 리테일은 Hadid 스타일, 사무공간은 Mies 스타일, 옥상은 Ando 스타일)
- **설계 자유도**: 중저층(5~20층) 규모에서 형태적 실험이 가능
- **실제 수요**: 스타트업/테크 기업의 사옥 프로젝트가 증가하는 트렌드

---

## 2. 시스템 설계

### 2.1 전체 워크플로우

```
[사용자]
기업 사옥 기획 컨텍스트 입력
(브랜드, 대지, 규모, 프로그램, 조건)
    │
    ├─► 건축가 패널 선택 (20인 풀에서 2~5명)
    ├─► 전문가 패널 자동 구성 (법률/규제, 구조)
    │
    ▼
┌──────────────────────────────────┐
│    건축가 토론장 (Architect Forum)   │
│                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐│
│  │건축가 A ││건축가 B ││건축가 C ││
│  │(선택)   ││(선택)   ││(선택)  ││
│  └───┬────┘ └───┬────┘ └───┬────┘│
│      │          │          │     │
│      └────┬─────┘──────────┘     │
│           │ 다자 토론 + 합의       │
│           ▼                      │
│    [설계안 초안]                    │
│                                  │
│  ◄── 평가 피드백 수신               │
│  ◄── 사용자 의견 수신               │
│  ◄── 전문가 검증 피드백              │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│   전문가 검증 (Expert Review)       │
│                                  │
│  ┌──────────┐  ┌──────────┐      │
│  │법률/규제   │  │구조 전문가 │      │
│  │전문가     │  │          │      │
│  └──────────┘  └──────────┘      │
│                                  │
│  설계안 검토 → 실현 가능성 피드백     │
│  법규 적합성 → 수정 권고사항          │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│   수직 노드 그래프 생성              │
│                                  │
│   옥상 ─── [노드] [노드]            │
│    :                             │
│   상층부 ── [노드] [노드] [노드]     │
│    :                             │
│   중층부 ── [노드] [노드] [노드]     │
│    :                             │
│   저층부 ── [노드] [노드] [노드]     │
│    :                             │
│   지하 ─── [노드] [노드]            │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│   웹 기반 3D 매스 모델링              │
│   (Three.js 수직 노드 → 3D 매스)     │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│   평가 모델 (Evaluation Model)     │
│   구조, 법규, 브랜드, 공간 품질 평가   │
│           │                      │
│           ▼                      │
│   피드백 리포트 → 건축가 토론장으로    │
│                + 전문가 검증으로      │
└──────────────────────────────────┘
```

### 2.2 4-윈도우 UI 구조

```
┌────────────────────────────────────────────────────────────────┐
│  GIM - Corporate HQ Design Intelligence                        │
├────────────────┬──────────────────┬────────────────────────────┤
│                │                  │                            │
│  Window 1      │  Window 2        │  Window 3                  │
│  Architect     │  Vertical        │  3D Mass                   │
│  Forum         │  Node Graph      │  Viewer                    │
│                │                  │                            │
│  건축가 패널     │  수직 노드 그래프   │  Web 3D (Three.js)         │
│  전문가 패널     │  지하~옥상         │  매스 뷰포트                 │
│  토론 로그       │  실시간 편집       │                            │
│  합의/논쟁 표시   │                  │  매스 + 층별                │
│                │                  │  공간 관계 표현               │
│  ◄── 피드백 수신  │  ◄─► 양방향 ──►  │                            │
│  ◄── 사용자 의견  │      동기화       │                            │
│  ◄── 전문가 검증  │                  │                            │
├────────────────┴──────────────────┴────────────────────────────┤
│  Window 4: Evaluation Dashboard                                │
│  구조 실현성 | 법규 적합도 | 브랜드 정합성 | 공간 품질 → 종합 점수     │
├────────────────────────────────────────────────────────────────┤
│  Chat Interface (사용자 입력 + 건축가 토론장 개입 + 패널 선택)         │
└────────────────────────────────────────────────────────────────┘
```

윈도우 간 데이터 플로우:

- W1 → W2: 토론 합의 결과가 수직 노드/엣지로 자동 변환
- W2 → W3: 노드 그래프 변경 시 Three.js 3D 매스 자동 재생성
- W3 → W2: 3D에서 매스 선택/편집 시 노드 그래프 역반영
- W3 → W4: 생성된 3D 모델에 대해 평가 모델 자동 작동
- W4 → W1: 평가 피드백이 건축가 토론장 + 전문가 패널에 자동 전달
- Chat → W1: 사용자 의견이 건축가 토론장에 새로운 의제로 주입
- W2 노드 직접 편집 → W3 실시간 반영 (양방향 동기화)

### 2.3 피드백 루프 구조

시스템의 핵심은 단방향 생성이 아닌 **건축가 토론 + 전문가 검증**의 이중 순환 피드백 루프다.

```
[사용자 컨텍스트 입력 + 건축가 패널 선택]
         │
         ▼
[건축가 토론장] ◄─────────────────────────┐
         │                              │
    설계안 초안                           │
         │                              │
         ▼                              │
[전문가 검증 패널]                         │
  법률/규제 전문가: 법규 적합성 검토         │
  구조 전문가: 실현 가능성 검토             │
         │                              │
    검증 완료 / 수정 필요                  │
         │                              │
         ▼                              │
[수직 노드 그래프 생성/수정]                │
         │                              │
         ▼                              │
[웹 기반 3D 매스 모델링 (Three.js)]        │
         │                              │
         ▼                              │
[평가 모델 작동]                          │
         │                              │
    피드백 리포트 ─────────────────────────┘
         │
    ◄── 사용자가 의견 추가 시에도
         건축가 토론장에 정보 주입
```

루프 종료 조건:
- 평가 모델의 종합 점수가 임계값 이상
- 전문가 패널이 "승인" 판정
- 사용자가 "확정" 명령
- 최대 반복 횟수 도달 (과도한 루프 방지)

### 2.4 시스템 아키텍처

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
│  │  Evaluation Engine (평가 모델)              │  │
│  │  구조 / 법규 / 브랜드 / 공간 품질             │  │
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

---

## 3. 토론 시스템 (Design Forum)

### 3.1 개요

건축가 토론장은 두 종류의 참여자로 구성된다:

1. **건축가 패널** (사용자 선택, 2~5명): 서로 다른 건축 철학으로 창의적 설계안을 제안하고 토론
2. **전문가 패널** (자동 구성): 건축가 합의안의 실현 가능성을 검증
   - **법률/규제 전문가**: 건축법, 소방법, 도시계획법 등 법규 적합성 검토
   - **구조 전문가**: 구조적 실현 가능성, 시공성, 안전성 검토

### 3.2 토론 참여자 구조

```
┌─────────────────────────────────────────┐
│          Design Forum                    │
│                                          │
│  [건축가 패널] (사용자 선택 2~5명)          │
│  ┌──────┐ ┌──────┐ ┌──────┐             │
│  │Hadid ││Foster││Ando  │ ...           │
│  └──┬───┘ └──┬───┘ └──┬───┘             │
│     └────┬───┘────────┘                  │
│          │ 창의적 설계 토론                 │
│          ▼                               │
│     [설계안 초안]                          │
│          │                               │
│  ────────┼───────────────────────        │
│          ▼                               │
│  [전문가 패널] (자동 참여)                  │
│  ┌──────────┐  ┌──────────┐              │
│  │법률/규제   │  │구조 전문가 │              │
│  │전문가     │  │          │              │
│  └──────────┘  └──────────┘              │
│     실현 가능성 검증 + 수정 권고             │
│          │                               │
│          ▼                               │
│  승인 → 노드 그래프 생성                    │
│  수정 필요 → 건축가 재토론                   │
└─────────────────────────────────────────┘
```

### 3.3 20인 건축가 클론 풀

사전 구축된 20명의 건축가 클론에서 사용자가 프로젝트에 맞는 패널을 직접 구성한다.

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

### 3.4 전문가 패널 (자동 구성)

건축가 토론과 별도로, 설계안의 실현 가능성을 검증하는 전문가 패널이 자동으로 참여한다.

| 전문가 | 역할 | 검증 항목 | 개입 시점 |
|---|---|---|---|
| **법률/규제 전문가** | 관련 법규 적합성 검토 | 건축법, 소방법, 주차장법, 도시계획법, 건폐율/용적률, 일조권, 피난규정 | 건축가 합의 후, 평가 피드백 시 |
| **구조 전문가** | 구조적 실현 가능성 검토 | 구조 시스템 적정성, 스팬 검토, 하중 검토, 특수 형태의 시공성, 내진 기준 | 건축가 합의 후, 평가 피드백 시 |

전문가 패널의 검증 결과:
- **승인**: 설계안이 법규/구조적으로 실현 가능 → 노드 그래프 생성 진행
- **조건부 승인**: 경미한 수정 필요 → 수정 권고사항과 함께 노드 그래프 생성
- **수정 필요**: 중대한 문제 발견 → 건축가 토론장에 피드백으로 전달, 재토론

### 3.5 패널 선택 인터페이스

```
[패널 구성 화면]

프로젝트: 젠틀몬스터 신사옥 (8층)

건축가를 선택하세요 (2~5명):

  실무 마스터                    건축 사상 마스터
  ┌──────────────────┐         ┌───────────────────┐
  │ □ Adrian Smith   │         │ □ Le Corbusier    │
  │ □ Gensler        │         │ □ Frank L. Wright │
  │ ■ Bjarke Ingels  │         │ □ Mies v.d. Rohe  │
  │ □ MVRDV          │         │ □ Antoni Gaudi    │
  │ □ Renzo Piano    │         │ □ Louis Kahn      │
  │ □ Fazlur Khan    │         │ □ Alvar Aalto     │
  │ □ Snøhetta       │         │ ■ Tadao Ando      │
  │ □ Ole Scheeren   │         │ □ Norman Foster   │
  │ ■ Heatherwick    │         │ ■ Zaha Hadid      │
  │ □ KPF            │         │ □ Rem Koolhaas    │
  └──────────────────┘         └───────────────────┘

  선택된 패널: Bjarke Ingels, Heatherwick, Ando, Hadid (4명)

  자동 참여 전문가:
  ✓ 법률/규제 전문가
  ✓ 구조 전문가

  [토론 시작]
```

선택 가이드 (시스템 추천):
- 브랜드 체험 공간 중심 → Heatherwick, Hadid, Ole Scheeren
- 지속가능/친환경 중심 → Foster, Snøhetta, Gensler
- 형태 실험 중심 → Hadid, Gaudi, Bjarke Ingels
- 프로그램 혁신 중심 → Koolhaas, MVRDV, Bjarke Ingels
- 미니멀/정제 중심 → Ando, Mies, Kahn
- 도시 맥락 통합 → Renzo Piano, Snøhetta, MVRDV

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
[Phase 3.5: 전문가 검증] ◄── 신규
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

입력 소스 4가지:

| 소스 | 시점 | 예시 |
|---|---|---|
| 사용자 컨텍스트 | 최초 입력 또는 추가 의견 | "1~2층은 체험형 리테일 공간으로, 젠틀몬스터 브랜드 경험이 극대화되도록" |
| 평가 모델 피드백 | 3D 모델 생성 후 자동 | "구조적으로 3층 캔틸레버 스팬 12m 초과, 보강 필요" |
| 전문가 검증 피드백 | 건축가 합의 후 | "소방법상 피난계단 2개소 이상 필요, 현재 설계안은 1개소" |
| 사용자 중간 개입 | 언제든지 | "4층은 Ando 스타일의 명상적 공간으로 바꿔줘" |

출력:

| 출력 | 형식 | 수신처 |
|---|---|---|
| 확정 기획안 | 구조화된 JSON | 수직 노드 그래프 생성기 |
| 토론 로그 | Markdown | W1 (사용자 열람) |
| 전문가 검증 리포트 | JSON | 평가 대시보드 + 토론장 |
| 미합의 대안 목록 | JSON | SOT 저장 (추후 재참조) |

### 3.8 건축가 클론 프로필 스키마

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

  # 토론 성향
  discussion_style:
    assertiveness: number          # 0~1
    compromise_willingness: number # 0~1
    focus_priority: string[]       # ["form", "experience", "sustainability", "program", "context"]

  # 참조 지식 베이스
  knowledge_base:
    representative_buildings: string[]
    design_philosophy: string
    era_context: string
```

### 3.9 전문가 프로필 스키마

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

---

## 4. 수직 빌딩 노드 스키마 설계

### 4.1 개요

기업 사옥의 노드 그래프는 5~20층 규모의 중저층 건물에 최적화되어 있으며, 각 층마다 서로 다른 건축가 스타일이 공존할 수 있는 구조를 지원한다.

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

### 4.2 노드 스키마 (기업 사옥 특화)

```yaml
floor_node:
  # 식별
  id: string              # "F3_cafe_zone_A"
  name: string            # "3층 카페테리아 존 A"
  floor_level: integer    # 3
  floor_zone: enum        # basement | ground | lower | middle | upper | penthouse | rooftop
  function: enum          # 아래 분류 참조

  # 위치
  position: string        # center | north | south | east | west | northeast | ...

  # 물리적 제약
  constraints: string[]

  # 추상 속성 (0.0 ~ 1.0)
  abstract:
    publicity: number     # 공공성 (1F 로비 → 높음, 임원층 → 낮음)
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
| `PROGRAM_LINK` | 프로그램 그래프 연결 | weight, rationale |

### 4.4 노드 function 분류 (기업 사옥 특화)

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

GIM의 독특한 특징: 각 층/영역에 서로 다른 건축가의 스타일을 배분할 수 있다.

```
[예시: 젠틀몬스터 사옥]

8F  루프가든 + 이벤트    → Bjarke Ingels 스타일 (유희적, 개방적)
7F  임원실 + 라운지      → Ando 스타일 (노출콘크리트, 명상적)
6F  오픈오피스           → Mies 스타일 (유니버설 스페이스)
5F  오픈오피스           → Mies 스타일 (유니버설 스페이스)
4F  소셜 허브 + 갤러리   → Hadid 스타일 (유동적 곡면, 파라메트릭)
3F  브랜드 체험          → Heatherwick 스타일 (조각적, 촉각적)
2F  체험형 리테일         → Hadid 스타일 (유선형 동선)
1F  로비 + 전시          → Heatherwick 스타일 (몰입 경험, 아이코닉)
B1  주차 + 기계실
B2  주차 + 창고
```

이 배분은 건축가 토론에서 합의되며, 각 건축가가 자신의 강점을 발휘할 수 있는 영역을 협상한다.

---

## 5. 평가 모델 (Evaluation Engine)

### 5.1 개요

3D 모델이 생성될 때마다 자동으로 작동하며, 정량적 평가 결과를 건축가 토론장과 전문가 패널에 피드백한다. 전문가 검증과 자동 평가가 이중으로 설계 품질을 보장한다.

### 5.2 평가 차원

| 차원 | 평가 항목 | 평가 방식 |
|---|---|---|
| 구조 실현성 | 스팬 적정성, 구조 시스템, 특수 형태 시공성, 내진 | 룰 기반 + 전문가 검증 |
| 법규 적합도 | 건폐율, 용적률, 피난규정, 일조권, 주차, 접근성 | 룰 기반 + 전문가 검증 |
| 브랜드 정합성 | 브랜드 철학과 공간의 일치도, 체험 동선 | LLM 추론 |
| 공간 품질 | 자연광, 조망, 천장고, 공간 흐름, 동선 효율 | 파라미터 기반 |
| 프로그램 적합성 | 면적 배분, 기능 인접성, 동선 효율 | 그래프 분석 |
| 도시 맥락 | 저층부 공공 기여도, 보행 접근성, 도시 경관 조화 | LLM 추론 |
| 그래프 연결성 | 프로그램 인접 관계 유지율, 수직 연속성 정합도 | 그래프 분석 (Building-GAN 메트릭) |

### 5.3 피드백 형식

```json
{
  "evaluation_id": "eval_003",
  "timestamp": "2026-03-14T10:30:00",
  "overall_score": 78,
  "dimensions": {
    "structural": {
      "score": 72,
      "issues": [
        "3층 캔틸레버 스팬 12m, 보강 트러스 필요",
        "8층 루프가든 하중 추가 검토 필요"
      ],
      "suggestions": [
        "3층 하부에 V형 기둥 또는 트러스 보강",
        "루프가든 하중을 경량 식재로 저감"
      ]
    },
    "code_compliance": {
      "score": 85,
      "issues": ["피난계단 2개소 필요, 현재 1개소"],
      "suggestions": ["동측에 피난계단 1개소 추가"]
    },
    "brand_identity": {
      "score": 90,
      "issues": [],
      "suggestions": ["1층 전시공간이 브랜드 철학과 잘 부합"]
    },
    "spatial_quality": {
      "score": 75,
      "issues": ["4층 서측 자연광 부족"],
      "suggestions": ["서측 파사드 개구부 확대 또는 라이트웰 삽입"]
    }
  },
  "expert_review": {
    "legal": {
      "verdict": "conditionally_approved",
      "issues": ["피난계단 추가 필요"],
      "severity": "warning"
    },
    "structural": {
      "verdict": "revision_required",
      "issues": ["3층 캔틸레버 구조 보강 필수"],
      "severity": "critical"
    }
  },
  "priority_actions": [
    "3층 캔틸레버 구조 보강 (구조 전문가 critical)",
    "피난계단 추가 (법규 warning)",
    "4층 서측 자연광 개선"
  ]
}
```

---

## 6. 통합 프로세스 플로우

### 6.1 전체 프로세스

```
[Step 1: 사용자 컨텍스트 입력 + 건축가 패널 선택]
기업 정보, 브랜드 철학, 대지 정보, 프로그램, 특수 조건 입력
20인 풀에서 건축가 2~5명 선택 (전문가 패널 자동 구성)
    │
    ▼
[Step 2: 건축가 토론 (Round 1)]
선택된 건축가 클론들이 각자 초기 제안 → 교차 비평 → 합의안 도출
  (층별 스타일 배분 포함)
    │
    ▼
[Step 3: 전문가 검증]
법률/규제 전문가: 법규 적합성 검토
구조 전문가: 구조적 실현 가능성 검토
  → 수정 필요 시 Step 2로 복귀
    │
    ▼
[Step 4: 수직 노드 그래프 자동 생성]
합의된 기획안이 지하~옥상 수직 노드/엣지 그래프로 변환
    │
    ▼
[Step 5: 웹 기반 3D 매스 모델링]
수직 노드 그래프가 Three.js로 3D 매스 자동 생성
    │
    ▼
[Step 6: 평가 모델 작동]
구조/법규/브랜드/공간 자동 평가 → 피드백 리포트 생성
    │
    ├─► 피드백 → 건축가 토론장 + 전문가 패널 (Step 2로 복귀, Round 2~N)
    │
    ├─► 사용자가 의견 추가 시 → 건축가 토론장에 주입
    │
    └─► 사용자가 W2에서 노드 직접 편집 시 → Step 5로 직행
```

### 6.2 기업 사옥 설계 기본 룰셋

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
| 사용자 컨텍스트 → LLM | **Markdown** | 자유 서술 + 구조적 힌트 |
| 건축가 토론 합의 → 노드 그래프 | **JSON** (function calling) | 구조화 + 스키마 검증 |
| 전문가 검증 결과 | **JSON** | 구조화된 verdict + issues |
| 건축가 클론 프로필 | **YAML** | 사람이 직접 편집 |
| 설계 룰셋 | **YAML** | 동일 이유 |
| 노드 그래프 → W2 그래프 시각화 | **JSON** → D3 | 실시간 렌더링 |
| 노드 그래프 → W3 3D 매스 | **JSON** → Three.js | 웹 기반 3D 렌더링 |
| W3 3D 변경 → 노드 그래프 역동기화 | **JSON diff** | 변경분만 전송 (이벤트 기반) |
| 평가 결과 → 건축가 토론장 | **JSON** | 구조화된 점수 + 이슈 목록 |
| 프로젝트 SOT | **JSON** (단일 파일) | 전체 상태 스냅샷 + 버전 관리 |
| 토론 로그 | **Markdown** | 사람이 읽기 쉬운 형식 |

### 7.2 SOT (Source of Trust) JSON 구조

```json
{
  "project_id": "gentlemonster_hq_2026",
  "version": 5,
  "iteration": 3,
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
      "round": 1,
      "trigger": "initial_context",
      "architect_consensus": "sculptural_mass_with_brand_experience_ground",
      "expert_review": {
        "legal": "conditionally_approved",
        "structural": "revision_required"
      },
      "dissent": ["ando: minimal_approach_preferred"]
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
  "vertical_node_graph": {},
  "evaluation_history": [],
  "selected_option": "opt_a",
  "history": []
}
```

---

## 8. 해커톤 실행 계획

### 8.1 24시간 타임라인

**사전 준비 (D-day 이전)**

- 기업 사옥 설계 룰셋 YAML 완성
- 건축가 클론 프로필 20종 작성 (Category A 10 + Category B 10)
- 전문가 프로필 2종 작성 (법률/규제, 구조)
- 토론 프로토콜 프롬프트 설계 및 테스트 (전문가 검증 포함)
- Three.js 3D 매스 뷰어 기본 세팅
- 평가 모델 기본 룰 정의
- 개발 환경 통일

**Phase 1: 코어 구현 (0~8h)**

| 시간 | 태스크 | 담당 |
|---|---|---|
| 0~2h | 노드 스키마 확정 + 데이터 인터페이스 최종 합의 | 이준원, 조현호, 노현섭 |
| 0~2h | Three.js 3D 매스 뷰어 기본 구현 + 개발 환경 통합 확인 | 백건호, 심채윤 |
| 2~5h | 건축가+전문가 토론 엔진 구현 (멀티에이전트 토론 + 전문가 검증) | 노현섭 |
| 2~5h | 노드 스키마 → 수직 노드 그래프 자동 변환 파서 | 이준원, 조현호 |
| 2~5h | Three.js 매스 뷰어: 수직 노드 그래프 → 3D 매스 변환 | 백건호, 심채윤 |
| 5~8h | 코어 모듈 연결 테스트 (컨텍스트 → 토론 → 전문가 검증 → 노드 그래프 → 3D 매스 1회 성공) | 전원 |

**Phase 2: 기능 통합 (8~16h)**

| 시간 | 태스크 | 담당 |
|---|---|---|
| 8~12h | W1 건축가 토론장 UI + 전문가 검증 패널 + 패널 선택 인터페이스 | 노현섭 |
| 8~12h | W2 수직 노드 그래프 시각화 + 실시간 노드 편집 UI | 노현섭 |
| 8~12h | 평가 모델 구현 (구조/법규/브랜드/공간 기본 룰 + 피드백 생성) | 이준원, 조현호 |
| 8~12h | Three.js W2↔W3 양방향 동기화 + 층별 스타일 시각화 | 백건호, 심채윤 |
| 12~16h | 피드백 루프 연결 (평가 → 토론장 + 전문가 자동 전달) + 사용자 중간 개입 기능 | 노현섭, 백건호 |
| 12~16h | 전체 피드백 루프 통합 테스트 (최소 2회 반복 성공) | 전원 |

**Phase 3: 마감 (16~24h)**

| 시간 | 태스크 | 담당 |
|---|---|---|
| 16~20h | W4 평가 대시보드 UI (전문가 검증 결과 포함) + 전체 UI 폴리싱 | 노현섭 |
| 16~20h | 층별 스타일 시각화 + 3D 매스 색상/질감 차별화 | 백건호, 심채윤 |
| 16~20h | 평가 모델 튜닝 + 전문가 검증 품질 강화 | 이준원, 조현호 |
| 20~22h | 데모 시나리오 최종 리허설 (최소 2회) | 전원 |
| 22~24h | 발표 자료 완성 + 예비 시나리오 준비 | 전원 |

### 8.2 역할 분담

| 이름 | 주 역할 | 세부 범위 |
|---|---|---|
| **노현섭** | 건축가 클론+전문가 시스템 + 프론트엔드/백엔드 + LLM 엔지니어링 | 20인 건축가 클론 + 전문가 프로필 설계 및 구축. 멀티에이전트 토론 프로토콜 설계 및 구현 (전문가 검증 단계 포함). W1/W2/W4 UI. 백엔드 API 및 LLM 오케스트레이션. 전체 시스템 아키텍처 |
| **이준원** | 빌딩 노드 스키마 설계 + 평가 모델 | 기업 사옥 노드 스키마 설계. 토론 합의 → 수직 노드 그래프 자동 변환. 평가 모델 룰 정의 (구조/법규 기본 룰). 전문가 검증 로직 지원 |
| **조현호** | 빌딩 노드 스키마 설계 + 평가 모델 | 노드 function 분류 및 존 체계 설계. 엣지 타입 정의 및 관계 제약조건. 평가 차원별 세부 룰 구현. 전문가 피드백 포맷 설계 |
| **백건호** | Three.js 3D 매스 뷰어 + 시각화 | Three.js 3D 매스 뷰어 설계 및 구현. 수직 노드 그래프 → 3D 매스 변환. 층별 스타일 시각화 (색상/형태 차별화). W2-W3 데이터 파이프라인 |
| **심채윤** | Three.js 3D 구현 + 노드 연동 | Three.js 매스 생성 알고리즘. 노드 편집 → 3D delta 재생성 로직. 층별 스타일별 매스 형태 변형 (직선/곡선/유기적). 3D 형태 분석 |

---

## 9. 발표 전략

### 9.1 발표 구성 (10~15분)

| 시간 | 내용 | 비중 |
|---|---|---|
| 0~3분 | 문제 정의: 기업 사옥 설계의 복합 의사결정 + "AI 건축가+전문가 토론" 컨셉 | 20% |
| 3~8분 | 라이브 데모: 젠틀몬스터 사옥, 건축가 선택 → 토론 → 전문가 검증 → 노드 그래프 → 3D → 평가 피드백 → 재토론 | 40% |
| 8~11분 | 시스템 아키텍처: 수직 노드 그래프 + 이중 피드백 루프 (건축가+전문가) | 25% |
| 11~13분 | 확장 가능성: 커스텀 클론, 분야별 전문가 확장, 다양한 건물 유형 | 15% |

### 9.2 스토리 구조

```
[문제 제기]
기업 사옥 설계의 현재: 건축사무소 1개소 + 구조/설비 외주
→ 다양한 건축적 관점의 비교/충돌이 부재
→ 법규/구조 검토는 설계 후반에야 이루어져 재작업 빈번

[핵심 질문]
만약 Hadid, Ando, Bjarke Ingels, Heatherwick이 한 테이블에 앉아
젠틀몬스터의 사옥을 설계한다면?
각 층마다 다른 건축가의 감성이 공존한다면?
법률/구조 전문가가 실시간으로 실현 가능성을 검증한다면?

[제안]
GIM: 20인의 거장 건축가 AI 풀에서 패널을 구성하고,
     전문가가 실현 가능성을 검증하며,
     수직 노드 그래프가 건물을 구조화하고,
     평가 피드백이 다시 토론으로 돌아오는 순환 설계 시스템

[증명]
젠틀몬스터 사옥 8층
→ 1~2층: Heatherwick의 조각적 체험 공간
→ 4층: Hadid의 유동적 소셜 허브
→ 7층: Ando의 명상적 임원 공간
→ 전문가가 "3층 캔틸레버 구조 보강 필요" 피드백
→ 건축가 재토론 → 수정 → 3D 재생성 → 재평가 "85점"

[의미]
이것은 도구가 아니라 설계 의사결정의 새로운 프로토콜이다
```

### 9.3 데모 시나리오

**프로젝트: 젠틀몬스터 성수 신사옥** (8층, 약 4,000평)

```
사용자: "젠틀몬스터 성수 신사옥. 대지 40x30m.
        8층, 높이 약 40m.
        지하 2층 주차 + 기계실.
        1~2층: 체험형 리테일 + 전시공간 + 공공 보이드.
        3층: 브랜드 체험 플로어 (설치미술 + 인터랙티브).
        4층: 소셜 허브 (카페테리아 + 갤러리 + 커뮤니티).
        5~6층: 오픈 오피스.
        7층: 임원실 + 프라이빗 라운지.
        8층: 루프가든 + 이벤트 스페이스.
        브랜드 핵심: avant-garde, 경계 파괴, 미래적 감각."

사용자: [패널 선택] Hadid, Heatherwick, Ando, Bjarke Ingels

--- 건축가 토론 시작 ---

[Heatherwick 발제]
"1~2층이 핵심이다.
 젠틀몬스터의 브랜드는 '경험'에서 시작한다.
 1층 전면을 거대한 움직이는 설치물로 만들어
 길거리에서 보는 것만으로 빨려 들어가게.
 3층까지 이어지는 보이드로 수직적 체험 동선을."

[Hadid 발제]
"건물 전체가 하나의 유기체여야 한다.
 층별 경계를 흐릿하게—유동적 슬래브로
 2층과 3층 사이, 4층과 5층 사이를 시각적으로 연결.
 파사드는 파라메트릭 패널로 빛의 변화를 표현."

[Ando 발제]
"7층 임원 공간은 극도의 절제.
 노출콘크리트 벽, 가늘고 긴 슬릿 창으로
 빛의 드라마만으로 공간을 정의한다.
 아래층의 화려함과 대비되어 더 강렬해진다."

[Bjarke Ingels 발제]
"옥상이 서울의 새로운 광장이 되어야 한다.
 8층 루프가든을 지면에서 올라오는 경사 보행로로 연결.
 건물 자체가 도시의 지형이 되는 것."

--- 교차 비평 ---

[Hadid → Heatherwick]
"1층 움직이는 설치물은 매력적이나
 구조적으로 3층 보이드의 하중을 어떻게 해결하나?"

[Heatherwick → Hadid]
"파라메트릭 파사드의 시공비가 과도하지 않은가?"

--- 합의 ---

"Heatherwick의 1~3층 체험적 보이드 +
 Hadid의 유동적 슬래브 (2~4층 구간) +
 Ando의 7층 절제미 +
 Bjarke의 8층 루프가든-도시 연결
 = 층별 스타일 배분 합의"

--- 전문가 검증 ---

[법률/규제 전문가]
"1. 피난계단 2개소 필요 (6층 이상, 건축법 시행령).
 2. 1~3층 보이드 구간 방화구획 검토 필요.
 3. 건폐율 60% 이내 확인 → 적합."

[구조 전문가]
"1. 3층 높이 보이드 공간의 수평하중 대응 필요.
   → 철골 프레임 보강 또는 전단벽 추가 권고.
 2. 8층 루프가든의 경사 보행로 하중 검토 필요.
 3. 전반적 구조 시스템은 철골 라멘 구조 적합."

→ verdict: 조건부 승인 (수정 반영 후 진행)

--- 수직 노드 그래프 자동 생성 → 3D 매스 모델링 ---

--- 평가 모델 작동 ---

평가: "종합 78점.
       구조: 보이드 구간 보강 필요.
       법규: 피난계단 추가.
       브랜드: 체험 동선 우수.
       공간: 4층 서측 자연광 부족."

--- 피드백 → 건축가 토론 + 전문가 재검증 ---

→ 수정 → 3D 재생성 → 재평가: "86점" + 전문가 승인

--- 사용자 개입 ---

사용자: "4층 Hadid 스타일 공간을
         Ando 스타일의 명상적 갤러리로 바꿔줘."

[토론장에 전달 → 스타일 재배분 논의 → 전문가 재검증]

→ 노드 수정 → 3D 반영 → 재평가
```

---

## 10. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| LLM | Claude API (function calling) | 구조화된 JSON 출력 + 긴 컨텍스트 + 멀티에이전트 토론 |
| 토론 엔진 | Claude multi-turn + system prompt per clone | 클론별 독립 시스템 프롬프트로 성격 분리, 전문가 별도 프롬프트 |
| 평가 모델 | TypeScript 룰 엔진 + Claude 추론 | 정량 룰 + 정성적 판단 혼합 |
| 프론트엔드 | Next.js | 4-윈도우 레이아웃 + 실시간 업데이트 |
| 그래프 시각화 | D3.js (수직 레이아웃 커스텀) | 수직 노드 그래프 특화 시각화 |
| 3D 웹 뷰어 | Three.js | 브라우저 기반 3D 매스 렌더링 |
| 실시간 동기화 | React Context + SSE | 노드 편집 → 3D 반영 실시간 |
| 데이터 포맷 | JSON, YAML, Markdown | 구간별 최적 포맷 분리 |
| 모노레포 | npm workspaces | @gim/core + @gim/web 패키지 분리 |

---

## 11. 확장 로드맵

**Phase 1: 해커톤 (24시간)**

- 기업 사옥 수직 노드 스키마
- 20인 건축가 클론 풀 + 전문가 패널 2종 (데모용 3~4명 건축가 완성도 집중)
- 패널 선택 → 멀티에이전트 토론 → 전문가 검증 → 노드 그래프 → 3D 매스 기본 파이프라인
- 평가 모델 기본 룰 (구조/법규/브랜드/공간) + 전문가 검증
- 피드백 루프 1회 이상 작동 시연
- 층별 스타일 배분 시각화
- 4-윈도우 프로토타입 UI

**Phase 2: 해커톤 이후 1개월**

- 20인 전원 클론 품질 균등화
- 전문가 패널 확장 (MEP, 인테리어, 조경)
- 평가 모델 고도화 (환경 시뮬레이션, 에너지 성능)
- 노드 실시간 편집 ↔ 3D 양방향 동기화 안정화
- 한국 건축법규 스킬 정밀화
- 다양한 프로젝트 유형 지원 (리테일, 문화시설, 주거)

**Phase 3: 3개월**

- 건축사무소가 자사 포트폴리오로 커스텀 클론 생성 → 풀에 등록
- 분야별 전문가 에이전트 확장 (MEP 엔지니어, 조경, 인테리어, 브랜딩)
- 클라이언트 에이전트 (예산/일정 제약 대변)
- 프로젝트 간 노드 그래프 학습 (유사 프로젝트 패턴 추천)
- Rhino/Grasshopper MCP 연동 (정밀 3D 모델링 필요 시)
- 교육용 버전 (건축학과 설계 스튜디오)
- API 공개 (외부 모델링 도구, BIM 소프트웨어 연동)
