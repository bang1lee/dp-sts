# Engine bridge

선택한 WAV와 시간별 제어값, 푸리에 계수를 여러 시각 엔진에서 공유하는 선택형 연결 모듈이다. Nx가 실행을 관리하고 pnpm과 uv가 각각 JS/TS와 Python 환경을 관리한다. 기존 제작·렌더 경로는 계속 사용할 수 있다.

## 실행

저장소 루트에서 실행한다. 출력 폴더는 반드시 새 경로여야 한다.

```sh
pnpm nx run engine-bridge:test
pnpm nx run engine-bridge:typecheck
pnpm nx run engine-bridge:bundle \
  --audio=runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.wav \
  --start=350 --duration=30 \
  --out=runs/engine-bridge-moonwater-v02
```

`runs/engine-bridge-moonwater-v01/`에는 위 음원의 350–380초 구간으로 만든 검증용 묶음이 있다. 음원 선택은 명시적이며 다른 음원을 자동으로 최신본으로 간주하지 않는다.

| 파일              | 용도                                                 |
| ----------------- | ---------------------------------------------------- |
| `audio.wav`       | 선택 구간의 48 kHz 스테레오 PCM24                    |
| `bundle.json`     | 24fps 제어값, 푸리에 계수와 고정 위상, 원본·WAV 해시 |
| `controls.csv`    | 사람이 읽거나 노드로 불러올 제어값                   |
| `cables-op.js`    | 새 cables 커스텀 OP에 넣을 코드                      |
| `td_bridge.py`    | TD 내부에서 새 컴포넌트를 만드는 스크립트            |
| `provenance.json` | 선택한 원본·구간·각 채널의 의미                      |

현재 내보내기는 **Moonwater 연결 실험용 프리셋**이다. RMS는 WAV에서 측정한다. alignment·separation은 작품의 기존 시간축을 표현하는 저작된 곡선이며 breath는 12초 주기의 연출값이다. 호흡 측정값이나 생리 효과를 뜻하지 않는다. 새 작품에서는 이 곡선·주기·형상을 새로 정의해야 한다. 모든 장르에 강제하는 제작 규칙이 아니다.

## 시간과 푸리에 형상

엔진에 공급하는 `Seconds`는 잘라낸 `audio.wav`의 재생 위치이며 0부터 시작한다. 원곡의 시작 위치는 `sourceStart`에 별도로 기록한다. 제어값은 선형 보간하고 구간 밖 시간은 첫·마지막 샘플로 고정한다. 오디오 플레이어의 실제 재생 위치를 기준으로 공급해야 seek와 일시정지가 일치한다. 어댑터 자체는 오디오를 재생하거나 자동 동기화를 수행하지 않는다.

768개 점은 복소 푸리에 합으로 계산한다. alignment가 1에 도달하면 점별 위상 오프셋이 사라져 약간 굴곡진 닫힌 원형 곡선으로 수렴한다. 현재 좌표의 z는 0이다. 이는 공통 수학·연결 검증용 평면 점군이며, 수중 공간 전체와 모든 오브제의 입체 정렬을 구현한 완성 장면은 아니다.

## cables 연결

1. cables에서 새 커스텀 OP를 만들고 `cables-op.js` 내용을 넣는다. 이 파일은 패치 파일이 아니다.
2. `Bundle JSON` 문자열 포트에 `bundle.json` 내용을 공급한다.
3. `Seconds`에 WAV의 실제 재생 시간을 초 단위로 연결한다.
4. `XYZ` 배열은 점 렌더링 입력에, RMS·Alignment·Separation·Breath는 원하는 장면 매개변수에 연결한다.
5. `Error` 출력이 비어 있는지 확인한다. 잘못된 JSON은 이전 점군과 값을 비운다.

외부 호스트에서 이미 로드된 패치를 제어할 경우 `applyToCables(patch, bundle, seconds)`로 `ambient_rms` 등의 패치 변수를 갱신할 수도 있다. 두 방식은 선택지이며 동시에 쓸 필요가 없다. 별도로 실제 오디오 플레이어·렌더 노드를 연결한 30초 네이티브 샘플을 만들었다. 파일과 검증 범위는 [네이티브 샘플 안내](../../docs/native-sample.md)를 참고한다.

## TouchDesigner 연결

TD가 설치·활성화된 뒤 아래 코드를 Text DAT에 넣고 실행한다. 일반 Python 셸에서 실행하는 명령이 아니다.

```python
from pathlib import Path
folder = Path('/Users/light_one/AI_project/Media/ambient-lab/runs/engine-bridge-moonwater-v01')
exec((folder / 'td_bridge.py').read_text())
install(str(folder))
```

`/project1/ambient_bridge` 아래에 controls와 points Script CHOP을 만든다. 같은 이름이 이미 있으면 거부하므로 별도 이름을 지정한다. 새 컴포넌트의 `Seconds` 매개변수에 WAV 재생 위치를 연결하고 points의 tx/ty/tz를 렌더 장면으로 연결한다. 기본 Seconds는 0으로 정지해 있다. 프로젝트 저장·기존 오디오·기존 타임라인은 자동 변경하지 않는다. 이 기본 CHOP 어댑터와 별도로, Script SOP·렌더·오디오·시간 이동을 갖춘 `td-native-final.tox`를 실제 앱에서 실행·재불러오기 검증했다. 사용 방법은 [네이티브 샘플 안내](../../docs/native-sample.md)에 있다.

## 검증 범위

4개 자동 테스트는 데이터 검증, 시간 이동·보간, Python/JS 계산 일치, cables 포트 API 모형에서 잘못된 JSON 처리를 검사한다. 타입 검사도 통과했다. 이 검사는 네이티브 앱에서 완성 장면을 렌더한 증거가 아니다. 설치·실행·미완료 항목은 [현재 확장 상태](../../docs/engine-extension.md)를 참고한다.
