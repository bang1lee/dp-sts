# dp-sts · Gujora / Yundol cover

후속 제작 완료: [이 커버로 만든 3분 영상](../../../runs/dp-sts-gujora-film-v01/artwork.mp4) · [영상 제작·검증 기록](film.md).

사용자: “구조라 해변과 윤돌섬의 사진을 찾고 맵핑해서 디비전 앨범커버의 상징적인 모습처럼 아트웍 하나 뽑아줘”

해석: 디비전은 Joy Division의 Unknown Pleasures로 이해한다고 사용자에게 먼저 알렸다. 검은 여백과 겹친 흰 파형의 조형 언어를 구조라 해안 곡선·윤돌섬의 비대칭 윤곽에 적용한다. 정사각형 한 장, 무문자. 사진 기반의 조형적 매핑이며 측량·수심·고도 데이터나 픽셀 단위 계산 매핑으로 주장하지 않는다.

## 실제 입력 사진

- 윤돌섬: https://ontrip.kr/travel-guides/details/3007738 에 연결된 한국관광공사 이미지 https://tong.visitkorea.or.kr/cms/resource/28/3007728_image2_1.JPG
- 구조라해수욕장: https://ontrip.kr/travel-guides/details/583071 에 연결된 한국관광공사 이미지 https://tong.visitkorea.or.kr/cms/resource/10/3519210_image2_1.jpg
- 앨범 참조 확인: https://collection.sciencemuseumgroup.org.uk/documents/aa110124225

사진은 참고 입력으로 보관한다. 원본 사진을 직접 제작한 것으로 표시하지 않는다. 초기 검색에서 잘못 섞인 굴업도 사진은 사용하지 않는다. 거제시 직접 이미지 요청은 실패해 관광 사진 자료를 사용했다. 별도 탐색한 Trip 사진은 최종 생성 입력에서 제외했다.

## 형태 대응

| 사진의 형상 | 커버에서의 대응 |
|---|---|
| 윤돌섬 왼쪽 높은 바위·수관 | 중앙 상부에서 비대칭으로 솟는 파형 |
| 오른쪽으로 낮아지는 섬의 실루엣 | 완만하게 가라앉는 선들의 꼬리 |
| 구조라의 오목한 해안 곡선 | 하부의 넓은 파형 분지 |
| 수면과 작은 물결 | 미세한 선의 높낮이와 간격 |

기본 제공 image_gen 도구로 실제 두 사진을 참조해 생성한다. 프롬프트와 출력은 runs/dp-sts-gujora-cover-v01/에 저장한다. 이미지 검수는 실제 출력으로 수행하며 사용자에게도 보여준다.

## 실제 출력

- [커버 PNG](../../../runs/dp-sts-gujora-cover-v01/dp-sts-gujora-yundol-cover.png): 실제 크기 1254×1254. 원본 그대로 저장, 별도 확대 없음.
- [사용한 전체 프롬프트](../../../runs/dp-sts-gujora-cover-v01/prompt.txt)
- [Astra의 실제 이미지 검수](review.md)

방법: 기본 제공 image_gen에 위 두 장의 실제 사진을 참조 이미지로 전달했다. Terra의 수치 매핑 코드나 고도 추출 알고리즘으로 제작한 것이 아니다. 프롬프트에 적힌 희망 크기와 실제 반환 크기를 구분한다. 사진의 인물·제트스키·건물·문자는 커버의 구성 요소로 사용하지 않았고, 섬의 윤곽과 해안의 곡선을 새 선화로 조형화했다.
