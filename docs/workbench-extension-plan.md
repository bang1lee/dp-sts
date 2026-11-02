# 소리·영상 작업실 확장 계획

## 현재 실행과 기록

작업실은 Strudel로 만든 이벤트에서 오디오를 렌더하고, 동일 이벤트의 초 단위 음악 JSON을 별도로 내보낸다. WebGL 미리보기는 생성 음원의 RMS를 시각 반응에 사용한다. WAV와 WebM은 현 구현의 결과물이다. 음악 JSON은 다른 도구에 전달하기 위한 데이터다. JSON 음표 재편집·재생, 악보 변환이나 다른 엔진 어댑터는 아직 구현되지 않았다.

작업 경로 설정 v2는 음악·화면·악보·입력 도구와 입력→대상 매핑을 **계획으로만** 기록한다. 설정을 바꾸어도 현재 Strudel 생성기, WebGL 장면, RMS 반응을 바꾸지 않는다. 매핑 목록의 RMS→빛 번짐도 계획일 뿐이며, 현재 오디오 반응 기능과 별도로 취급한다. 기존 v1 설정을 불러오면 browser/TouchDesigner/cables 경로와 OpenCV 분석 여부를 v2 계획으로 옮긴다. 재생 중이거나 내보내기 중인 작업을 교체하지 않도록 생성·영상 기록 중에는 파일 불러오기를 제한한다. 256KB를 넘는 파일, 정의되지 않은 도구·매핑, 범위를 벗어난 설정은 거부한다.

음악 JSON과 작업 경로 JSON은 다른 파일이다. 전자는 생성된 음악 이벤트와 출처를 담고, 후자는 UI 매개변수와 향후 연결 계획을 담는다. 설정 불러오기는 음악 JSON을 음표별로 재생하는 기능이 아니다. 음악 매개변수가 현재 생성물과 다르면 새로 생성하기 전까지 WAV·음악 JSON·영상 내보내기를 막는다.

## 도구를 선택할 때

| 도구 | 역할과 사용 시점 | 이 작업실 상태 |
|---|---|---|
| [Strudel](https://strudel.cc/learn/) | 패턴 기반 음악 생성·라이브 코딩 | 음악 생성에 직접 연결 |
| [Strudel Flow](https://xyflow.com/labs/strudel-flow) | 노드로 Strudel 패턴을 만드는 실험 | 참조만; 별도 엔진이나 연결된 기능 아님 |
| [Tone.js](https://tonejs.github.io/) | 브라우저 음향 합성·시간 제어 | 미연결 |
| [Sardine](https://sardine.raphaelforment.fr/configuration.html) · [SuperCollider](https://supercollider.github.io/) | Python 라이브 코딩과 사운드 엔진 | 미연결 |
| [TidalCycles](https://tidalcycles.org/docs/) · SuperCollider | 패턴 라이브 코딩과 기본 SuperDirt 소리 엔진 | 미연결 |
| [Elementary Audio](https://www.elementary.audio/) | 코드로 오디오 처리 그래프 구성 | 미연결 |
| WebGL | 브라우저 실시간 생성 화면 | 현재 미리보기와 WebM 녹화에 연결 |
| [Hydra](https://strudel.cc/learn/hydra/) | 영상 합성과 피드백; Strudel 연동 인터페이스 제공 | 미연결 |
| [TouchDesigner](https://docs.derivative.ca/) · [cables](https://cables.gl/docs) | 별도 앱에서 노드 기반 장면과 합성 | 앱 설치 및 별도 샘플 확인; 작업실과 실시간 연결되지 않음. [샘플 안내](native-sample.md) |
| [Verovio](https://github.com/rism-digital/verovio) | MEI 및 변환된 악보 데이터를 SVG 등으로 표현 | 미연결; 공통 음악 JSON→악보 형식 변환은 별도 구현 필요 |
| [OpenCV](https://docs.opencv.org/) · [MediaPipe TD 커뮤니티 플러그인](https://github.com/torinmb/mediapipe-touchdesigner) | 영상 특징 및 손·몸 동작 입력 | OpenCV는 별도 환경; 이 작업실의 분석·입력에 미연결. 플러그인은 커뮤니티 프로젝트 |
| [FFmpeg](https://ffmpeg.org/documentation.html) | 별도 영상 변환·결합·검사 | 설치됨; 이 페이지에서 자동 실행하지 않음 |
| Nx · pnpm · uv | 작업 실행과 환경 관리 | 기존 환경; 창작 순서를 강제하지 않음 |

도구 자체가 AI 작곡기라는 뜻은 아니다. 시작 예시는 개별 선택을 돕는 계획이며, 기존 작품 확장·웹 작곡·Python 사운드 어느 경로도 한 방향이나 한 순서를 강제하지 않는다.

## 연결을 구현할 때 검증할 경계

1. 입력이 시간·단위·좌표계·출처를 명시하는지 확인한다. 카메라나 오디오 같은 실시간 입력은 파일 캐시로 대체하지 않는다.
2. 정규화·범위·보간·지연·실패 복구를 명시한 매핑 실행기를 별도 구성한다. 계획을 저장했다는 사실만으로 매핑이 작동한다고 표시하지 않는다.
3. 음악 JSON을 받는 어댑터는 음표 시작·길이·음높이·세기와 박자, 트랙, 구간을 확인하고 원본 이벤트와 재생 타임라인을 비교한다. 악보와 재생은 별도의 검증 범위다.
4. 각 도구에서 동일 입력으로 짧은 시각·음악 출력을 실제 만들어 검수하고, 오류와 사용자가 선택한 경로를 남긴다. 외부 앱 실행이나 자료 전송은 별도 권한과 환경을 확인한다.
