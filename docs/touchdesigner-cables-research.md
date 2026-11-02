# Ambient Lab — TouchDesigner AI와 cables.gl 적용 조사

조사일: 2026-11-02 · 대상: dp-sts / Moonwater · 상태: 조사와 도입 제안, 설치·연동 실증 전

## 판단

현재 조합은 여러 선택지 중 하나다. **대화하면서 실제 노드와 시각을 고치는 작업실에는 TouchDesigner + 공식 TDMCP를 우선 시험하고, 웹에서 사용자가 조작하고 공유하는 작품에는 cables.gl을 우선 시험하는 안**을 권한다. 이는 아래 기능 자료와 현재 프로젝트 요구를 연결한 판단이며 성능 벤치마크 결과는 아니다.

음악 도구까지 동시에 교체할 필요는 없다. Strudel과 기존 음원·패턴은 유지하며 시각 엔진을 비교할 수 있다. 더 깊은 음색 설계가 필요할 때 SuperCollider 같은 합성 엔진을 별도로 검토한다.

## 1. 현재 구성부터 바로잡기

처음 제안은 Strudel로 음악, WebGL로 프랙털, OpenCV로 분석하는 구성이었다. 그러나 현재 Moonwater 구현은 다음과 같다.

- `tools/moonwater-score.mjs`: 실제 Strudel 패턴을 조회하여 이벤트를 생성한다.
- `python/media/src/ambient_media/moonwater.py`: Python으로 음색을 합성하고 NumPy·OpenCV로 시각을 그린다. OpenCV가 흐림·굴절 이미지 변형·입자 합성·크기 변환도 맡는다.
- 따라서 최근 파일을 ‘Strudel 브라우저 소리 그대로 + WebGL 프랙털 출력’이라고 설명하면 부정확하다.

이 차이는 이번 조사에서 소스를 읽어 확인했다. 시각 엔진 변경은 설계 언어만 바꾸는 일이 아니라 실제 렌더 경로를 추가하는 일이다.

## 2. 대안 비교

아래 적합성은 이번 작품을 위한 판단이다. 제품 기능의 근거는 각 링크에 있다.

| 구성 | 강점 | 이 프로젝트에서의 비용·한계 | 적합한 목적 |
|---|---|---|---|
| Strudel + 직접 작성한 WebGL | 수학·시간축·웹 UI를 코드로 세밀하게 통제 | 빛과 수면, 게이지, 편집 기능을 직접 개발 | 코드 중심의 웹 작품 |
| Strudel 또는 WAV + TouchDesigner | 노드 기반 실시간 조정, GPU 점·형상 처리, 공식 AI 제어 연결 | 앱·프로젝트 운용 학습, 라이선스와 Mac 기능 차이 확인 | 감각 조정, 설치·공연, 대화형 제작 |
| Strudel 또는 Web Audio + cables.gl | 브라우저 시각 패치, 로컬 편집, HTML 배포, 사용자 조작 UI | AI 패치 제어와 장시간 파일 출력은 별도 검증 | 웹에서 체험하는 작품 |
| SuperCollider + 선택한 시각 엔진 | 알고리즘 작곡과 합성 엔진을 분리해 깊은 음색 설계 | 새 언어·엔진과 동기화 연결 비용 | 미세한 드론·공간음·장시간 음색 변화 |
| 음악 + Blender | 물·빛·볼륨·카메라의 정교한 장면 구성 | 높은 품질의 10분 렌더는 장면별 비용 측정 필요 | 물속의 설득력과 최종 영화적 화질 |

SuperCollider는 실시간 합성 서버와 작곡 언어를 분리한 오픈소스 환경이다. Blender Cycles는 경로 추적, 볼륨, Apple Metal GPU 경로를 제공한다. 각 도구가 좋은 음악이나 설득력 있는 바다를 자동으로 보장하지는 않는다. [SuperCollider](https://supercollider.github.io/) · [Blender 렌더링](https://www.blender.org/features/rendering/).

## 3. ‘TouchDesigner 네이티브 AI’의 세 가지 의미

1. **AI가 실제 TD 프로젝트를 편집한다.** 노드 생성·연결·파라미터·코드 수정과 결과 확인. 외부 모델이 연결되어도 결과가 편집 가능한 TD 네트워크로 남는다.
2. **TD 네트워크 안에 에이전트를 넣는다.** 프롬프트·도구·외부 모델을 노드로 구성한다.
3. **생성형 모델의 이미지를 TD로 가져온다.** 확산 모델이 화면을 변형하고 TD가 입력·합성·상호작용을 담당한다.

‘네이티브’라는 표현만으로 모델이 Mac 안에서 실행된다거나, TD 기본 설치에 모든 AI 기능이 포함된다고 해석하면 안 된다.

## 4. 확인한 TouchDesigner AI 사례

### A. Derivative 공식 TDMCP — 이번 프로젝트의 첫 후보

Derivative가 공개한 컴포넌트 기반 MCP 서버다. 에이전트가 OP를 생성·연결하고 DAT·GLSL을 작성하며 출력 이미지, 오류, 처리 시간을 확인할 수 있다. Undo 기록도 지원한다. Codex를 지원 클라이언트로 명시한다. 현재 공개 베타다. [공식 저장소](https://github.com/TouchDesigner/TDMCP).

초기 발표에는 최소 빌드 2025.33070, 현재 저장소에는 2025.33230으로 서로 다르게 적혀 있다. 도입 시에는 현재 릴리스의 요구 빌드인 **2025.33230 이상**을 기준으로 재확인한다. 공식 발표는 2026-09-25 자료다. [발표](https://derivative.ca/community-post/derivative-tdmcp-mcp-server-touchdesigner-beta/75406) · [현재 문서](https://docs.derivative.ca/MCP).

**우리에게 적용:** ‘달은 유지하면서 윤슬 밀도만 낮춰’, ‘수렴을 더 늦게 시작해’ 같은 디렉션을 실제 노드 파라미터로 바꾸고, 캡처를 확인하고 다시 수정한다. 실제 연결과 왕복 호출은 아직 시험하지 않았다.

### B. TWOZERO — 404.zero와 setupdesign의 제작 도구

TouchDesigner 인터페이스에 통합되는 도구다. 내장 MCP로 에이전트가 프로젝트를 다루며, Rudiments는 재사용 컴포넌트, ZOPs는 이미지·영상·오디오 등의 AI 생성 연동을 제공한다. 기본 도구와 MCP는 무료, 생성은 사용량 과금, 일부 라이브러리는 PRO다. [제작자 문서](https://twozero.ai/docs).

Apple Silicon 지원과 설치 시 TD의 Full Disk Access 요구를 명시한다. 자동 연결은 에이전트 설정 파일에 항목을 추가하므로 이번 조사에서는 실행하지 않았다. [요구사항](https://twozero.ai/docs/requirements) · [에이전트 연결](https://twozero.ai/docs/connect-agent).

**우리에게 적용:** AI 연결뿐 아니라 컴포넌트 라이브러리까지 필요해졌을 때 비교할 후보다. 현재 단계에서 공식 TDMCP와 여러 제어 플러그인을 동시에 추가할 필요는 없다.

### C. dotsimulate LOPs — 에이전트 자체를 패치로 구성

Agent, 도구 관리, MCP 서버·클라이언트, 음성 및 외부 생성 파이프라인을 제공한다. 외부 에이전트가 TD를 제어하는 방향과, TD 내부 Agent가 외부 도구를 사용하는 방향을 구분해 문서화했다. [LOPs](https://docs.dotsimulate.com/) · [외부 에이전트 제어](https://docs.dotsimulate.com/guides/external-agent-control/).

**우리에게 적용:** 장기적으로 감각 입력 → 제안 → 파라미터 변경 → 시각 검토를 TD 안에서 다루고 싶을 때 유용한 후보다. 이번 10분 작품을 위해 즉시 에이전트 시스템 전체를 구축하는 것은 과한 범위다.

### D. A Hero’s Return — 실제 전시형 생성 AI 사례

ISEA 2025 논문은 TouchDesigner·StreamDiffusionTD·관객의 볼륨 캡처를 결합한 설치를 설명한다. 여러 처리 장치를 영상 스트림과 OSC로 연결하고, 관객 형상을 생성 이미지에 반영한다. 논문은 프레임 간 불안정성과 합성 경계 문제도 보고한다. 도구 홍보와 구분되는 실제 작품 구현 기록이다. [저자 논문](https://www.isea-symposium-archives.org/wp-content/uploads/2025/09/2025_Froehlich_A-Hero-s-Return-A-performative-installation-utilizing-real-time-diffusion-models.pdf).

**우리에게 적용:** 관찰자 움직임이 공간을 바꾼다는 아이디어에는 참고할 만하다. 다만 달의 지속성과 정확한 푸리에 수렴을 요구하는 이번 작품의 핵심 형상을 확산 모델에 맡기면 통제가 어려워질 수 있다. 이 판단은 논문의 시간적 안정성 문제를 우리 요구에 적용한 추론이다.

## 5. 현재 Mac에서 가능한 범위

로컬 확인: **Apple M1 Max / 메모리 64 GB / macOS 26.5.1**. `/Applications`와 사용자 `Applications`의 깊이 3 이내 검색에서는 TouchDesigner와 cables 앱을 찾지 못했다. 다른 경로의 설치 여부까지 확인한 것은 아니다.

TouchDesigner는 Apple Silicon과 macOS 13 이상을 지원한다. 다만 CUDA 전용 기능과 일부 POP 기능에는 Mac 제한이 있다. 설치 가능성은 확인했지만 이 작품의 목표 프레임레이트는 측정하지 않았다. [시스템 요구사항](https://docs.derivative.ca/System_Requirements) · [Mac 제한](https://docs.derivative.ca/MacOS).

StreamDiffusionTD의 현재 문서상 로컬 경로는 Windows·NVIDIA·CUDA를 요구한다. Mac은 문서상 Daydream 클라우드 경로를 사용할 수 있다. **이 Mac에서 TouchDesigner가 실행된다는 사실과 StreamDiffusionTD 로컬 추론 지원은 별개다.** [제작자 설치 문서](https://dotsimulate.com/docs/streamdiffusiontd/install) · [지원 경로](https://dotsimulate.com/docs/streamdiffusiontd).

Non-Commercial은 비상업 용도와 최대 1280×1280 이미지 제한이 있다. 1280×720 실험과 1920×1080 이상 최종 제작의 라이선스 조건을 나누어 판단해야 한다. [공식 에디션 안내](https://docs.derivative.ca/TouchDesigner_Non-Commercial).

## 6. cables.gl을 어떻게 볼 것인가

### 실시간 노드 편집과 웹 배포

cables는 수학·도형·재질·효과를 연결하는 시각 프로그래밍 도구다. 브라우저 편집 외에 Electron 기반 Standalone이 있고 Apple Silicon용 다운로드도 제공한다. 로컬 자산, 커스텀 OP, npm 패키지 활용이 가능하다. Standalone 배포 페이지는 MIT 라이선스를 명시한다. 외부 자산과 개별 의존성의 권리는 별도로 확인한다. [Standalone](https://cables.gl/standalone) · [구성 설명](https://cables.gl/docs/6_2_standalone/0_general/general).

HTML 내보내기와 전체 패치 내보내기는 다르다. HTML은 실행·배포용이고, 전체 패치는 OP와 자산을 포함해 다시 편집하기 위한 보존 경로다. 둘을 함께 남기는 것이 적절하다. [Import/Export](https://cables.gl/docs/6_2_standalone/4_exporting/exporting).

### 실제 작품 참고

- **Sea, the Beyond — Jia-Rey (Gary) Chang:** 공식 cables 쇼케이스에 등록된 몰입형 VR 작업. 작가는 자연을 고리·점군·기하학으로 다시 해석하고 수중과 공중의 경험이 공존한다고 설명한다. 우리의 ‘바다 감각을 추상 공간으로 옮기기’와 연결되는 참고 사례다. AI 제작 사례라고 주장하지 않는다. [작가 설명](https://www.archgary.com/works/sea-the-beyond/) · [cables 작품 목록](https://cables.gl/made-with-cables/).
- **Asura — MFX:** 제작자 페이지가 cables 사용을 명시하며 웹 데모와 영상 링크를 제공한다. 웹 기반 시청각 작품의 배포 형태를 살펴볼 후보다. 이번 조사에서 실시간 데모 전체를 재생·성능 검증한 것은 아니다. [작품 페이지](https://mfx.drastic.net/view/asura/).

### Strudel과의 연결

cables는 Web Audio 및 Tone.js 연동을 문서화하고, 외부 JavaScript가 패치 변수를 설정하는 API를 제공한다. 이를 이용해 같은 페이지에서 Strudel의 이벤트·실제 오디오 분석값·서사 시간을 cables 파라미터로 전달하는 구성을 설계할 수 있다. **이 결합은 이번 프로젝트의 제안이며 공식 일괄 연동이나 이미 완성된 기능으로 확인한 것은 아니다.** [오디오 OP](https://cables.gl/docs/5_writing_ops/webaudio/webaudio) · [외부 변수 설정](https://cables.gl/docs/4_export_embed/dev_embed_vars/dev_embed_vars).

브라우저에서는 오디오 시작에 사용자 동작이 필요할 수 있고, UDP OSC를 직접 쓰는 구성 대신 WebSocket 브리지 등을 검토해야 한다. 첫 실험은 같은 페이지의 변수 전달 또는 WAV·분석 JSON으로 연결 범위를 줄인다.

### CLI와 AI 지원을 혼동하지 않기

공식 `cables-cli`는 온라인 패치를 내보내고 다운로드하는 도구다. API 키가 필요하며, 로컬 패치를 자연어로 생성하는 AI 에디터가 아니다. 내보내기 대상 폴더를 덮어쓰므로 별도의 새 빌드 폴더를 사용해야 한다. [공식 CLI](https://github.com/cables-gl/cables-cli).

이번 공식 문서·저장소·검색 확인 범위에서는 TDMCP에 대응하는 cables 공식 MCP나 내장 AI 패치 편집기를 확인하지 못했다. ‘없다’고 단정하지는 않는다. 현재 확인한 현실적인 경로는 AI가 커스텀 JavaScript·셰이더를 작성하고, 편집기에서 연결·오류·출력을 확인하는 것이다. [OP 개발](https://cables.gl/docs/5_writing_ops/dev_ops/dev_ops).

### 10분 영상 산출

공식 문서는 Media Recorder를 통한 실시간 영상 기록과 텍스처 다운로드를 안내한다. 이것만으로 10분 음향 포함 녹화, 정확한 프레임 수, 재현성까지 검증됐다고 볼 수 없다. [기록 기능](https://cables.gl/docs/faq/features/recording/recording).

최종 출력에서는 시간과 랜덤 시드를 고정한 프레임 캡처 경로를 만들거나, 실제 녹화의 누락·동기화를 검사해야 한다. 피드백 효과가 있으면 특정 시점만 바로 렌더할 때 결과가 달라질 수 있으므로 초기 상태와 누적 과정을 함께 관리한다. 이는 구현·검증 계획이다.

## 7. dp-sts에 적용할 구체적인 실험

**추천 첫 비교:** 동일한 30초 음원, 동일한 푸리에 계수, 동일한 카메라 기준으로 TouchDesigner와 cables 시안을 비교한다. 이것은 이번 엔진 선택을 위한 실험이며 모든 작품에 강제할 제작 순서는 아니다.

| 감각 디렉션 | 공통 조절값 | 확인할 결과 |
|---|---|---|
| 더 고요하게 | 윤슬 빈도·시야 내 밝은 면적·카메라 속도 | 밝기만 줄인 것이 아니라 사건의 밀도가 줄었는가 |
| 물속에서 달을 본다 | 수면 법선·굴절 강도·흡광·시점 | 하늘 위 달과 수중 시점이 구분되는가 |
| 여러 차원으로 갈라진다 | 깊이층·위상 편차·공간 분리 | 희미한 복제 이상의 공간 관계가 생기는가 |
| 모든 오브제가 정렬된다 | 동일한 조화 성분·정렬 진행도·목표 형상 | 일부 점만 정렬되고 다른 오브제가 무관하게 남지 않는가 |
| 긴 디졸브와 느린 박동 | 지속음 곡선·낮은 에너지·시간차 | 박자마다 번쩍이는 단순 반응을 피하는가 |

기존 Moonwater는 서사적 점 군집만 푸리에 목표로 정렬되고, 수면과 환경 부유물은 다른 규칙으로 움직인다. 사용자의 ‘모든 오브제’ 요구를 충족하려면 대상 집합을 명확히 하고 달·수면·군집의 공통 위상 또는 최종 배치 규칙을 설계해야 한다. 엔진 교체만으로 해결되지 않는다.

푸리에 계수는 두 엔진이 같은 것을 읽도록 한다. 예를 들어 `p(u,t)=Σ c_k(t) exp(i k u)`와 위상 편차 감소를 공통 규칙으로 두고, 각 엔진에서 화면 표현을 달리한다. 오디오 스펙트럼 분석과 형상용 푸리에 합성은 관련되지만 같은 연산이나 같은 목적은 아니다.

검토 항목은 시각적 설득력, 사용자의 조정 편의, 실제 프레임 시간, 오디오 동기화, 10분 내구성, 다시 열었을 때의 복구다. 소프트웨어 출력·오류 검사는 음악의 청각 승인과 별도로 남긴다.

## 8. Nx 작업실과 결합하는 제안

Nx·pnpm·uv 역할은 유지한다. 새 엔진은 교체 가능한 프로젝트로 추가한다. 아래는 **제안 구조이며 생성하지 않았다.**

```text
ambient-lab/
  compositions/moonwater/       # 패턴, 시간축, 푸리에 계수, 선택한 값
  apps/td-studio/               # .toe, 자체 .tox, 외부 DAT·GLSL
  apps/cables-studio/           # .cables, 커스텀 OP, 웹 호스트
  packages/control-schema/     # 시간·호흡·윤슬·정렬 값의 공통 정의
  python/media/                # 오디오·이미지 분석, 파일 검증
  docs/experiments/            # 디렉션·선택 이유·비평
  runs/                       # 버전별 출력물과 실행 기록
```

- **CLI:** 의존성은 pnpm·uv, 프로젝트 생성은 해당 Nx 생성기, 공식 cables 내보내기와 FFmpeg 검증은 Nx 작업으로 연결한다. 현재 CLI가 하지 않는 일을 있다고 가정하지 않는다.
- **네이티브 편집기:** `.toe`·노드·컴포넌트는 TD와 공식 API/MCP로 만들고, `.cables`는 편집기의 실제 스키마와 내보내기로 만든다. 파일 확장자만 붙인 임의 데이터를 프로젝트로 취급하지 않는다.
- **직접 코드 편집:** 작품의 GLSL, JavaScript OP, 분석 코드, 문서와 연결 설정에 사용한다.
- **Python 환경:** TD 내부 Python은 TD가 관리한다. 외부 분석은 uv로 관리한다. uv 환경을 TD 내장 Python에 억지로 덮어씌우지 않는다.
- **실시간과 출력:** 공연·미리보기는 실시간 시계, 검증된 파일 출력은 프레임 시간축을 선택할 수 있게 한다. Nx가 TD의 대화형 편집을 대체하는 것은 아니다.

## 9. 도입 순서에 대한 제안

현재 사용자에게 가장 필요한 것은 고유한 감각을 빠르게 보고 고칠 수 있는 작업실이다. **공식 TDMCP로 TouchDesigner의 작은 윤슬 장면을 먼저 시험**하는 쪽을 우선 추천한다. 웹 체험과 링크 공유가 핵심이면 **cables Standalone + 웹 호스트**를 먼저 선택해도 된다.

시범 범위는 달·수면·한 종류의 점 군집·핵심 게이지 5개 정도로 제한한다. 접속, 실제 노드 생성, 파라미터 변화, 캡처, 저장 후 재열기를 확인한 뒤 장편 렌더를 연결한다. AI 생성 텍스처는 필요할 때 선택적으로 추가한다. 정밀한 푸리에 형상과 달의 지속성은 우선 수학·셰이더로 제어한다.

이번 조사에서는 앱 설치, MCP 등록, 유료 서비스 호출, 외부 자산 업로드, 기존 렌더러 교체를 실행하지 않았다. Hydra 재작업 요청은 사용자가 취소했으므로 적용하지 않는다.
