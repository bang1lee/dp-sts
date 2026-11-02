# dp-sts — Moonwater

## 최신 시리즈 · Organic Storm — 3분 × 7편

[70초 비교 영상](../../../runs/dp-sts-visual-storm-v01/delivery/comparison.mp4) · [7편 개별 영상 목록](../../../runs/dp-sts-visual-storm-v01/delivery/README.md) · [최종 21프레임 검수 보드](../../../runs/dp-sts-visual-storm-v01/delivery/contact-sheet.jpg)

자연색의 액체·선 5편과 강한 사이키델릭 2편을 각각 180초로 출력했다. 모두 1280×720, 24fps, 4,320프레임, 48kHz 스테레오이며 전체 디코딩과 음원 해시 연결 검사를 통과했다. 자연 5편은 Folktronica Bloom, 강한 2편은 기존 psytrance 음원의 서로 다른 구간을 사용했다. 7곡을 새로 작곡한 것은 아니다.

Terra 6.1 / ultra가 셰이더 심화와 검증·비교 도구를, Astra가 실제 이미지의 복잡도와 가독성 판단을 담당했다. 수정 전후 이미지를 사용자에게 공유했다. [제작·결정 기록](visual-storm.md) · [Astra 이미지 검수](astra-visual-review.md) · [기술 검사 결과](../../../runs/dp-sts-visual-storm-v01/delivery/delivery.json). 표본 시각 수용과 21분 연속 시청·청각 평가는 구분한다.

## 이전 버전 · Folktronica Bloom

[10분 영상](../../../runs/dp-sts-bloom-hydra-v01/dp-sts-hydra.mp4) · [전체 음원](../../../runs/dp-sts-bloom-audio-v01/bloom-master.wav) · [핵심 90초](../../../runs/dp-sts-bloom-audio-v01/bloom-core-90s.wav)

사용자의 “밋밋함을 넘어 신선한 소리를 만들어 달라”는 피드백에 따라 음악을 다시 작곡·합성했다. 84 BPM, 8개 구간, 공명하는 현·응답 선율·베이스와 구분된 타악·입자화/역방향 현 질감으로 구성했다. 새 음악에 맞춰 실제 3D 카메라와 프랙털 입자를 다시 렌더하고 Hydra를 적용했다.

[제작 선택](folktronica-bloom.md) · [시각 비평](vapor-critique.md) · [검증 정보](../../../runs/dp-sts-bloom-hydra-v01/delivery.json). 전체 음악의 직접 청취 승인은 별도다. 아래 버전들은 발전 과정의 기록으로 보존한다.

## Hydra 반응형 재렌더

[최신 10분 Hydra 영상](../../../runs/dp-sts-hydra-v01/dp-sts-hydra.mp4) · [최종 출력 표본](../../../runs/dp-sts-hydra-v01/decoded-contact-sheet.jpg) · [검증 정보](../../../runs/dp-sts-hydra-v01/delivery.json)

600초, 1280×720, 24fps, 14,400프레임. 0초부터 끝까지 한 Hydra 인스턴스의 피드백 이력을 유지했다. 전체 FFmpeg 디코드 검사를 통과했고 JavaScript 실행 오류는 없었다. 오디오 반응 제어를 끈 대조와 비교해 새 시각 반응이 작동함을 확인했다.

아베 마리아 저음 음원을 보존하고 실제 Strudel 패턴과 Hydra 피드백·왜곡·반복을 연결했다. [구현과 검수 범위](hydra-revision.md), [독립 비평](hydra-critique.md)에서 확인한다. Strudel은 121음의 음정·타이밍 검증과 영상 제어에 사용하며, 이번 수정에서 기존 음원을 새로 합성하지 않는다.

## 최신 전달본 · 아베 마리아 저음 편곡

- [10분 최종 영상](../../../runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.mp4)
- [24bit WAV](../../../runs/dp-sts-moonwater-ave-v01/dp-sts-moonwater-ave-master.wav)
- [출력 정보와 해시](../../../runs/dp-sts-moonwater-ave-v01/delivery.json)

600초, 1280×720, 24fps, 14,400프레임, 48kHz 스테레오. 선율 시작은 68.76초다. 121개 원전 선율음의 음정과 음 길이 비율을 보존해 두 옥타브 낮췄다. 최종 음원은 프리마스터보다 5dB 낮춰 약 -18.24 LUFS로 전달한다. 전체 음원 직접 청취 승인이나 종합 예술적 통과를 주장하지 않는다.

영상의 분화·수렴은 실제 디코딩한 시점 표본에서 확인했다. 비평 담당은 540초 이후 닫힌 윤곽과 565–580초 유지가 읽힌다고 기록했다. 달·수면·부유물은 환경으로 유지되고 서사 빛 조각만 푸리에 형상에 정렬되는 구현 범위는 그대로다.

이전 psytrance에서 고요한 수중 앰비언트로 변경한 10분 버전. 달빛을 받은 수면의 윤슬을 물속에서 바라보고, 빛의 분화가 푸리에 합성에 따른 하나의 형상으로 이어지는 작품이다.

## 최신 디렉션과 제작

**최신 음악 수정:** 사용자 청취 피드백에 따라 Bach/Gounod 〈아베 마리아〉 선율을 추가했다. 최신 산출물 폴더는 `runs/dp-sts-moonwater-ave-v01`이며, 아래의 최초 3역할 Strudel 음악과 구분한다. 공개 악보의 121음을 두 옥타브 낮추고 느리게 직접 합성했다. 기존 지속화음·고음 장식은 제거했다. 출처는 [Mutopia #256](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=256), Shamim Mohamed의 공개 도메인 선율 판본이다. 소스 악보·MIDI·추출 데이터는 `assets/scores/ave-maria`에 보존했다.

재실행: `pnpm nx run media:moonwater-melody`. 출력 폴더가 이미 있으면 덮어쓰지 않고 중단한다. 영상 기하는 v02를 재사용하고, 기존 음원의 밝기 반응을 새 RMS 기준으로 근사 재매핑한다. 인코딩된 픽셀과 가산 입자를 사용하므로 원래 렌더를 새 음원으로 완전히 재계산한 것과 동일하다고 보장하지 않는다.

- [사용자 원문·서사·구현 선택](direction.md)
- [독립 비평과 실제 관찰](critique.md)
- 음악: Strudel에서 새로 질의한 48 BPM 패턴 이벤트. 부드러운 저음 박동, 열린 지속화음, 드문 은빛 고음. Python 오프라인 합성 및 긴 잔향. 기존 psytrance 음원 재사용 없음.
- 영상: NumPy/OpenCV 절차적 수면, 굴절된 달, 빛기둥과 조각들. 짙은 청흑색과 은빛. 물리적으로 정확한 수중 광학을 주장하지 않는다.
- 동기화: 공통 600초 서사와 실제 WAV의 프레임별 RMS. 빠른 음량 펌핑 대신 작은 밝기 변화.
- 정렬: 폐곡선의 DFT 계수 5개 모드 `[-4,-2,1,4,6]`로 빛 조각의 위치를 합성. 조각별 위상 편차가 350–555초 사이에 소멸하며 달 주변 물결 고리로 귀결된다. 부유물과 달·수면은 환경으로 남는다.

## 제작 명령

프로젝트 루트에서 실행한다.

```sh
pnpm nx run media:moonwater-score
pnpm nx run media:moonwater --stills --out=runs/dp-sts-moonwater-v03
pnpm nx run media:moonwater --out=runs/dp-sts-moonwater-v03
```

기존 영상이 있는 폴더는 덮어쓰지 않는다. `v01`은 시안 비평 후 중단한 부분 렌더이며 납품본이 아니다. `v02`는 달의 원형 인지와 부유 입자 합성을 수정한 버전이다.

## 확인 범위

수치 검증에서 목표 폐곡선과 푸리에 재구성의 최대 오차는 약 `6.28e-16`이었다. 이는 조형 위치 계산 검증이며, 예술적 만족이나 생리학적 효과의 증거가 아니다.

정지 시안의 달 형태와 입자 합성 결함을 독립 비평 후 수정했다. v02 시각 방향은 정지 시안 단계에서 렌더 진행 가능 판정을 받았다. 최종 움직임과 직접 청각 평가는 별도로 표시한다. 실패한 청취 모델을 재사용하거나 음악을 직접 들었다고 주장하지 않는다.
