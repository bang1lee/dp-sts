# 두 엔진 공통 샘플

사용자 목표: 하나의 샘플을 cables와 TouchDesigner 두 방향에서 테스트하고, 직접 툴에서 편집하거나 실시간 웹 화면에서 비교·조절한다.

- 입력: `runs/engine-bridge-moonwater-v01/`의 30초 WAV와 제어 데이터.
- 구현 담당: Terra 6.1 ultra 두 작업자. 전체 대화 대신 목표·파일 소유권·입출력·검증 기준만 전달.
- 웹 소유권: `comparison_preview` — `apps/studio/comparison.html`, `src/comparison.*`, 해당 Vite 연결.
- 네이티브 소유권: `native_sample` — 엔진 어댑터, `runs/engine-native-sample-v01/`, `docs/native-sample.md`.
- 총괄: 앱 UI 조작·네이티브 출력 검증·사용자 피드백·기록. 사용자가 열어 둔 앱과 기존 파일을 보존.

## 현재 근거

웹 비교: `http://localhost:4200/comparison.html`. 공유 WAV로 재생/일시정지/시간 이동, 밀도·반짝임·움직임·정렬과 설정 저장을 구현했다. Studio 빌드·타입 검사 통과. expect 자동 검사는 기본 Claude provider 인증 누락으로 시작 전에 종료. 브라우저 방향 시안이며 실제 두 네이티브 엔진의 영상은 아니다.

TouchDesigner: 이번에 다시 확인한 결과 `/Applications/TouchDesigner.app` 2025.33230이 설치되어 있다. 설치본과 설치 디스크의 앱이 동시에 실행 중이므로 경로를 구분한다. 최종 샘플에서 0초·20초 실제 이동, 서로 다른 출력 프레임, 밀도 절반에 대응하는 점 수 감소, 일시정지 시 오디오 출력 정지를 확인했다. `td-native-final.tox`를 다시 불러와 720개 제어 프레임, Seek/Jump, 오디오 경로와 오류 없음도 확인했다. 뷰어는 `/project1/ambient_tox_check/ambient_native_v03/out`에 열었다. 실제 청취에 의한 만족도와 출력 음성의 지연 측정은 이 검증에 포함되지 않는다.

cables: 앱 재시작 후 네이티브 패치의 입자 고리, 밀도 1→0.5에 따른 좌표 배열 2304→1152, 30초 WAV 로드와 재생을 확인했다. 기본 AudioPlayer의 Current Time은 별도 타이머여서 30초를 넘어 증가했다. 이를 그대로 정밀 동기화로 인정하지 않고, 별도 `engine-native-final-v01`의 MoonwaterSync에서 Audio Element.currentTime을 우선 읽도록 수정했다. 실제 앱에서 연결된 element와 Actual Seconds가 별도 타이머와 다른 값을 표시하는 것을 확인했다. 최종 정지·반복 검사 결과는 네이티브 안내에 기록한다.

## 재개

2026-11-03 최종 cables 검수: 실제 앱의 별도 타이머 34.4144초일 때 Actual Seconds 4.222504초로 30초 반복을 확인했다. Pause 이후 Actual Seconds 29.016448초가 후속 화면에서도 유지되었다. 최종 파일은 `runs/engine-native-final-v01/moonwater-final.cables`로 앱에서 저장했다. 밀도 0.5와 Sparkle 0.25의 성긴 파란 입자 고리를 실제 화면에서 확인했다. cables의 임의 시간 seek 및 실제 출력 음성의 지연 측정은 미검증이다. 두 엔진을 사용자에게 편집 가능 상태로 제공하고, 미감 검토는 별도 진행한다.

TouchDesigner 시간 이동은 프레임 경계 이후 확인해야 한다. 최초 동일 Python 평가 안에서 읽은 0초/20초 캡처는 모두20초였으므로 폐기했다. 이후 프레임을 나눈 검사 결과를 `td-native-capture.json`에 기록했고 `td-native-reload.json`으로 재불러오기를 검증했다. 각 엔진의 최종 파일과 검증 상태는 `docs/native-sample.md`에 기록한다.
