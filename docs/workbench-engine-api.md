# 작업실 엔진 계약

`apps/studio/src/workbench-engine.ts`의 `createWorkbenchEngine(canvas, onState)`는 브라우저 안에서 음악과 시각을 만들고 재생한다. `MusicConfig`, `VisualConfig`, `WorkbenchState`, `WorkbenchEngine`을 함께 내보낸다.

- `generate(config)`는 기존 `@ambient-lab/audiovisual/offline`의 Strudel 노트 이벤트와 합성기를 호출해 스테레오 마스터를 생성한다. BPM, MIDI 기준음, 분위기 세 가지, 여백 세 단계, 길이 5~120초, 게인을 받는다. 게인은 생성한 PCM에 적용되며 WAV와 재생에 함께 반영된다. 설정을 바꾼 뒤에는 다시 생성해야 한다.
- `play()`, `pause()`, `seek(seconds)`는 준비된 PCM과 한 재생 위치를 사용한다. 시각 반응의 RMS는 현재 위치의 실제 PCM에서 계산한다. 음악이 준비되기 전에는 독립적인 시각 모션을 보여준다.
- `setVisual(config)`의 모드는 `moonwater`, `fractal`, `mandelbulb`다. 마지막은 3차원 Mandelbulb 거리 추정과 광선 진행을 사용한다. `depth`, `density`, `bloom`, `connection`, `scale`, `motion`, `response`는 각각 0~1이다. 장면 자체의 움직임과 오디오 반응은 별도 매개변수다.
- `getWav()`는 생성한 PCM의 16비트 스테레오 WAV Blob을 돌려준다. `exportVideo(onProgress)`는 설정을 고정하고 처음부터 동일 캔버스와 오디오 시계로 실시간 녹화하며, 0~1 진행률과 WebM Blob을 돌려준다. 오디오는 녹화 스트림으로만 보내므로 내보내기 중 스피커로 중복 재생하지 않는다. 소스 오디오가 끝난 뒤 마지막 화면을 최소 100ms 더 유지해 인코더를 비운다. 끝나면 작업 중이던 위치로 돌아간다.
- `cancelExport()`는 준비 또는 녹화 중인 작업을 취소하고 자원을 정리한다. `dispose()`는 재생·녹화와 WebGL 자원을 해제한다. 녹화 중에는 설정·재생 위치 변경이 거부된다.

WebGL2와 WebM 오디오·영상 MediaRecorder를 지원하는 브라우저가 필요하다. PNG 저장을 위해 WebGL 화면 버퍼를 보존한다. WebM은 실시간 녹화 결과이며 화면 프레임 간격이 가변적일 수 있다. 정확한 프레임 수, MP4, 장시간 작품, 기기 간 동일 렌더링은 보장하지 않는다. 탭이 숨겨지면 녹화가 중단된다. 최대 120초는 브라우저 자원 사용을 제한하는 범위이며, 해당 범위 전체의 실행 성능을 검증했다는 뜻이 아니다.

시각 효과는 모드별로 조절 의미가 다르다. 물결 장면에서는 깊이가 원근과 층 간격, 밀도가 빛 입자 수, 연결이 물결 선 강도다. Julia에서는 깊이가 반복 횟수, 밀도가 세부 선 폭(값이 클수록 넓어짐), 연결이 선 강도다. Mandelbulb에서는 깊이가 반복 횟수, 밀도가 차수, 연결이 가장자리 빛 강도다.

## 공통 음악 문서 v1

음악 생성이 성공한 뒤 `getMusicDocument()`로 버전 1 JSON 객체를 얻는다. 오디오 합성에 실제 전달한 Strudel 이벤트의 시작·길이·음높이·음색 파라미터를 스케줄링 시점에 복사해 사용한다. 이 과정에서 패턴을 다시 질의하거나 별도 음을 생성하지 않는다. 새 생성을 시작하면 이전 문서는 비워지며, 준비 전에는 함수가 오류를 낸다. 반환 객체를 수정해도 엔진의 마스터나 다음 반환값에는 영향을 주지 않는다.

문서는 `schema`, `version`, 초 단위 `timeUnit`, MIDI 기준 `pitchUnit`, 전체 길이, BPM과 초당 사이클, seed, 구간, 트랙과 노트 배열을 포함한다. 현재 편곡에서 구간은 전체 길이를 나타내는 하나이며 sine과 triangle은 실제 생성 이벤트의 음색별 트랙이다. 노트는 `pitchMidi`, `startSeconds`, `durationSeconds`, `trackId`, `velocity`, `sourceGain`, 원본 스칼라 `sourceParameters`를 가진다.

현재 Strudel 패턴은 MIDI velocity를 지정하지 않으므로 `velocity`는 **null**이다. 이벤트 `sourceGain`과 렌더 후에 적용하는 `masterGain`은 따로 보존하며 velocity로 바꾸지 않는다. 시간과 길이는 합성기에 예약된 값이다. 곡 끝을 넘는 이벤트는 문서에 원래 길이로 남지만 PCM은 전체 길이에서 잘린다. 신시사이저의 release 꼬리, 필터, 마스터 페이드는 노트만으로 되돌릴 수 없고, 문서 출력이 다른 엔진에서의 재생이나 동일 음색의 왕복 변환을 뜻하지 않는다. Tone.js·Sardine·SuperCollider 등은 현재 이 문서를 소비하도록 연결한 상태가 아니다.
