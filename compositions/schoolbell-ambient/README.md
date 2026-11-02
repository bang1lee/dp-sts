# 학교종 — 저녁 공기 (v01)

92초 길이의 느린 앰비언트 시안. 4/4, 48 BPM에서 학교종 선율 8마디를 두 번 연주한다. 첫 선율은 3초부터 시작하고 두 번째는 43초에 시작하며, 끝에는 잔향과 페이드가 남는다. 선율은 G3–A3–E3–D3–C3 음역이고, 저음 중심의 화음과 2·3배음, 미세한 디튜닝, 고역 통과된 어두운 잔향을 더했다. 타악기와 종 샘플은 사용하지 않았다.

이 음원은 Strudel 1.3.0의 `note(mini(...)).queryArc(...)`로 음표를 만들고 Superdough의 sine/triangle 신시사이저를 Chromium `OfflineAudioContext`에서 합성한 것이다. 원곡 녹음은 분석에만 사용했으며 출력에 포함되지 않았다. Aphex Twin의 #3 공개 미리듣기 29.7초를 대상으로 한 통계적 분석을 참고한 시안이며, 전체 곡과 똑같다는 뜻이 아니다. 별도 청취 평가는 실시하지 않았다.

## 파일과 재생성

- `score.json`: 음정, 마디, 화음, 템포 및 렌더 길이
- `../../tools/schoolbell-render.mjs`: 독립 Strudel 음성 합성과 Web Audio 공간 처리 및 WAV/MP3 인코딩
- `../../tools/schoolbell-verify.py`: WAV 및 악보 이벤트의 기계적 검사, 스펙트럼·스테레오 측정
- `../../runs/schoolbell-ambient-v01/`: 최종 WAV, MP3, 이벤트 목록, 결과 manifest, 분석 JSON. `drafts/`에 이전 렌더 두 개 보존

프로젝트 루트에서 아래 명령을 실행한다. 기존 v01 출력 파일을 덮어쓰므로 보존이 필요한 경우 먼저 해당 폴더를 복사한다. Chromium/Chrome, 프로젝트 pnpm 의존성, ffmpeg, Python의 numpy/scipy가 필요하다.

```sh
node tools/schoolbell-render.mjs
uv run --project python/media python tools/schoolbell-verify.py
```

WAV는 48 kHz, 24-bit 스테레오 PCM이며 MP3는 320 kbps 스테레오다. 렌더 엔진·브라우저에 따른 비트 단위 재현성은 별도로 검증하지 않았다. 검증 결과와 SHA-256은 `analysis.json`, `render-manifest.json`에 기록한다.

## 비교의 범위

최종 시안의 유효 구간 8–80초 기준 스펙트럼 중심은 268 Hz, 좌우 상관은 0.897이다. 참조 미리듣기 전체에서는 각각 248 Hz, 0.930으로 측정됐다. 분석 구간과 연주되는 음이 다르며, 이 값이 청감상 유사성이나 동일성을 보증하지는 않는다.

## v02 마스터

`runs/schoolbell-ambient-v02/`는 v01 WAV에 대역이 넓고 완만한 중간·측면 주파수 곡선을 한 번 적용한 마스터다. 선율과 재생 길이는 유지하며 250–500 Hz와 스테레오 폭을 조정한다. 원곡 녹음은 이 과정의 오디오 입력으로 사용되지 않았다. v01은 보존되어 있다.

```sh
uv run --project python/media python tools/schoolbell-master.py
```

v02의 8–80초 구간 중심 주파수는 243 Hz, 좌우 상관은 0.954다. 미리듣기의 분석값 248 Hz, 0.930과 가까워졌지만, 분석 구간과 선율이 다르므로 동일한 소리라는 근거는 아니다. 측정값과 처리 곡선은 v02 `analysis.json`에 기록했다. WAV와 MP3는 각각 48 kHz 24-bit 스테레오 PCM과 320 kbps 스테레오다.
