# 윤돌섬 · 연결된 장 — 3분 영상

첨부한 섬·해안 선화의 구도를 보존하며 선을 실제 3D 입자와 짧은 연결선으로 구성했다. 음악은 BWV 846 전주곡 첫 네 마디를 반복하는 새 앰비언트 편곡이다.

## 보기와 듣기

- [3분 본편](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-particles-v01/artwork.mp4)
- [15초 미리보기](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-particles-v01/delivery/preview-15s.mp4)
- [3분 WAV](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-ambient-v01/audio.wav)
- [9시점 검수 이미지](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-particles-v01/delivery/contact-sheet.jpg)
- [Astra 시안별 검토](particle-review.md)
- [사용자 디렉션과 수정 이유](particle-direction.md)

## 이번 출력의 표현

원본 커버에서 읽은 선의 밝은 지점을 서로 다른 깊이로 역투영했다. 카메라가 작은 궤도로 움직이고 음악의 저·중·고역 분석값이 이웃한 입자들의 흐름에 영향을 준다. 중간부에는 물결·연기의 시간차를 깊이에 배치하며, 후반에는 기준 형상으로 돌아온다. 이 표현은 사용자의 ‘입자와 장, 시간의 4차원’을 위한 예술적 은유다.

섬과 전경 해변을 물로 구분하고, 사람은 왼쪽 엄마와 아이·중앙 남자 셋·오른쪽 남녀 커플로 설계했다. 원통 화롯대·불·상승하는 연기·별밤·해변 뒤쪽 유목을 더했다. 모든 성별과 관계가 작은 실루엣만으로 명확히 보인다는 뜻은 아니다. 연기와 별빛의 수용·회귀는 상위 존재의 환대를 빛으로 표현하는 해석이다.

음악의 실제 음형은 Strudel을 통해 구성한 476개 이벤트다. [Mutopia의 BWV 846 원전](https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.ly) 첫 네 마디와 대조한 음표를 사용했다. [Aphex Twin 「#3」 공식 재생](https://aphextwin.bandcamp.com/track/3)의 큰 음량 변화를 수치 분석해 3분으로 정규화하고 편곡에 반영했다. 특정 원곡 악기·장비나 편곡 전체의 동일 재현은 확인하지 않았다. 원곡 녹음을 혼합하지 않은 새로운 합성 음원이다.

## 실제 확인한 사항

| 항목 | 결과 |
|---|---|
| 본편 | 180.000초, 1080×1080, 24fps, 4,320프레임 |
| 음원 | 48kHz 스테레오, 원본 WAV 24bit |
| 전체 영상·음원 디코딩 | 통과 |
| 음원 비정상 수치·풀스케일 이상 샘플 | 각각 0개 |
| 영상 속 디코딩 음원 피크 | 0.6500355 |
| 실제 생성된 입자 | 154,890개, 선의 정점 5,490개 |
| 원본 이미지·음원·제어 데이터·보존 코드 출처 | 해시 일치 |
| 15초 미리보기 | 360프레임, 전체 디코딩 통과 |

[기계 검증 결과](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-particles-v01/delivery/delivery.json)와 [실행 기록](/Users/light_one/AI_project/Media/ambient-lab/runs/dp-sts-gujora-particles-v01/render.json)을 보관한다. 출처 해시는 이번 출력에 사용한 파일의 연결성을 확인하며 모든 기기에서 픽셀 단위 동일 결과를 보장하지 않는다. 정지 표본 검토를 전체 연속 시청이나 음악 직접 청취 검수로 확대하지 않는다.

## 다시 실행하기

이전 버전을 덮어쓰지 않는 새 출력 경로를 사용한다. Nx의 `media:gujora-particles`는 장면을 렌더하고 `media:gujora-particles-verify`는 본편을 검사하고 전달 자료를 만든다. 음원 생성은 `media:gujora-ambient-score`, `media:gujora-ambient-audio`이며 기존 출력이 있으면 새 경로를 지정한다. 상세 인자는 [구현 기록](particle-implementation.md)을 따른다.
