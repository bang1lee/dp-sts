# 동일 데이터로 네이티브 샘플 구성

두 실험은 `runs/engine-native-sample-v01/`의 같은 30초 `audio.wav`와 `bundle.json`을 사용한다. 번들의 RMS 등은 이 오디오에서 미리 분석한 프레임이며 실시간 마이크 분석이 아니다. 그래픽은 두 엔진이 각자 그리므로 픽셀 단위로 같지 않다. `runs/`는 로컬 결과물이며 원본 묶음은 `runs/engine-bridge-moonwater-v01/`에 보존된다.

## TouchDesigner

검증된 `runs/engine-native-sample-v01/td-native-final.tox`를 TouchDesigner 네트워크로 드래그하면 편집 가능한 컴포넌트를 가져올 수 있다. 이 로컬 샘플은 같은 폴더의 `audio.wav`에 대한 절대 경로를 사용하므로 폴더를 옮겼다면 내부 `audio` CHOP의 File을 다시 지정한다.

기본 v03 컴포넌트를 새로 구성하려면 TouchDesigner의 Textport를 Python 모드로 열고 다음 한 줄을 실행한다. 현재 `/project1`에 새로운 `ambient_native` 컴포넌트만 추가하며 기존 노드나 프로젝트 파일을 덮어쓰지 않는다. 같은 이름이 이미 있으면 `name='ambient_native_v02'`처럼 다른 이름을 전달한다.

```python
exec(open('/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01/td_native_scene.py').read()); install('/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01')
```

생성한 기본 컴포넌트에 시간 이동 버튼과 일시정지 시 음소거를 더하려면 별도 Textport 입력에서 다음을 실행한다. 이 작업은 생성한 `ambient_native`에만 적용된다.

```python
exec(open('/Users/light_one/AI_project/Media/ambient-lab/runs/engine-native-sample-v01/td_native_controls.py').read()); configure(path='/project1/ambient_native')
```

최종 TOX에서는 컴포넌트 내부 `out` TOP이 화면, `particles/quads`와 `quads_callbacks`가 입자 생성, `soft_glow`가 발광, `audio`와 `audio_out`이 재생을 담당한다. 컴포넌트를 선택하고 파라미터 창의 Ambient 페이지에서 Density, Sparkle, Scale과 Play / Pause를 조절한다. 저장본 재불러오기 검사에서는 이 페이지가 `/project1/ambient_tox_check/ambient_native_v03`에 있었고, 직접 드래그해 열 때는 해당 위치와 이름이 달라질 수 있다. `local/time`이 30초 독립 재생을 담당하며 Seek Seconds를 입력하고 Go to Seek Time을 눌러 이동한다. 기본 v03 설치 코드에는 Seek 버튼이 없으며 `td_native_controls.py`를 적용해야 한다. 오디오 장치와 시스템 음량도 확인한다. 이 설치 코드는 TouchDesigner 2025.33230에서 생성·렌더·20초 위치 이동을 확인했다. 소리 재생과 청각적 동기화는 별도 확인이 필요하다. 사용자가 원할 때 별도 새 `.toe`나 `.tox`에 저장한다.

## cables Standalone

`runs/engine-native-final-v01/moonwater-final.cables`는 앱에서 편집할 수 있는 패치다. 옆 `ops/` 디렉터리를 함께 유지한다. cables Standalone 0.12.1에서 푸른 입자 고리, Density 0.5의 좌표 1,152개, Audio Element 연결과 실제 오디오 위치의 재생·반복·일시정지 변화를 확인했다. 실제 청취·정밀 동기화는 별도 검증이 필요하다. 아래 단계로 직접 구성할 수도 있다.

1. 새 프로젝트를 별도 이름으로 저장하고 `Op → Create`로 새 OP를 만든다. `runs/engine-native-final-v01/cables-native-op.js` 전체를 코드 편집기에 붙여넣고 저장한다. 필요하면 프로젝트를 다시 열고 OP 선택 창에서 새 OP를 추가한다.
2. `MainLoop`의 trigger → `PointMaterial`의 render → `PointCloudFromArray`의 exe를 연결한다. 새 OP의 XYZ → PointCloudFromArray Positions (내부 포트명은 Array), Point Size → PointMaterial PointSize를 연결한다. PointMaterial에서 Size in Pixels와 Round를 켜고 필요하면 카메라 및 색상을 조절한다.
3. `AudioPlayer`에 같은 폴더의 `audio.wav`를 지정하고 Element 출력 → 새 OP Audio Element를 연결한다. OP는 오디오의 실제 `currentTime`을 매 프레임 읽어 분석 프레임을 선택한다. Element가 없을 때는 Seconds 입력을 사용한다. Actual Seconds 출력에서 선택된 시각을 볼 수 있다. Density, Sparkle, Scale은 새 OP 입력에서 편집한다. 오디오 허용이나 파일 접근을 요청하면 앱에서 승인한다.
4. 저장한 `.cables`를 다시 열고 화면, 음원, 각 조절 항목을 실제로 확인한다. AudioPlayer의 Current Time은 별도 타이머여서 파일 반복 뒤에도 30초를 넘을 수 있다. Audio Element가 연결된 최종 OP의 Actual Seconds는 실제 재생 위치를 사용한다. 프레임 갱신과 오디오 출력 지연을 포함한 정밀 동기화는 검증하지 않았다.

번들을 바꾸면 `node packages/engine-bridge/adapters/build_native_cables.mjs runs/engine-native-final-v01`로 OP 본문을 다시 만들 수 있다. 이 명령은 해당 결과 폴더의 `cables-native-op.js`만 덮어쓴다. 변경된 파일을 cables OP에 다시 반영해야 한다.

## 근거 및 범위

- [TouchDesigner Script SOP](https://docs.derivative.ca/ScriptSOP_Class), [Render 구성](https://docs.derivative.ca/Rendering), [Audio File In](https://docs.derivative.ca/Audio_File_In_CHOP)
- [cables OP 작성](https://cables.gl/docs/5_writing_ops/dev_hello_op/dev_hello_op), [PointCloudFromArray](https://cables.gl/op/Ops.Gl.Meshes.PointCloudFromArray_v2), [PointMaterial](https://cables.gl/op/Ops.Gl.Shader.PointMaterial_v6)
- TouchDesigner v02는 실제 앱에서 실행하여 오류 없는 점 입자 화면과 `td-v02.png`, `td-v02.tox`를 생성했다. v02는 기존 타임라인을 따라간다. 최종 TOX는 실제 앱에서 독립 30초 범위, Seek 버튼의 0초·20초 이동, 서로 다른 프레임, 밀도 50%일 때 지오메트리 점 수 절반, 일시정지 시 오디오 출력 비활성, 빈 오류 목록을 확인했다. 검사 결과는 `td-native-capture.json`에 있다. 저장본을 다시 불러와 720개 프레임, Seek·Jump 파라미터, 출력 뷰어, 빈 오류 목록을 추가로 확인했다. 오디오의 실제 청취·동기화는 아직 검증하지 않았다. cables는 실제 앱에서 입자 고리, 2,304개 좌표, 밀도 50%에서 1,152개 좌표, 오디오 길이와 실제 위치의 재생·반복·일시정지 변화를 확인했다. 최종 버전에서 시킹, 실제 청취와 정밀 동기화는 검증하지 않았다.
