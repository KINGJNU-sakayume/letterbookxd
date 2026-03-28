// TODO(L-1): 이 파일은 현재 프로덕션에서 사용되지 않습니다.
// 알라딘 API가 직접 Supabase DB를 통해 서빙되므로 이 mock 데이터는 삭제 가능합니다.
// 제거 전 SearchPage/Aladin API 통합 테스트 완료 후 삭제하세요.
import type { Work, EditionSet, Volume } from '../types';
import { mockAladinBooks } from './mockApiData';
import { groupBooks } from '../utils/bookGrouping';

const grouped = groupBooks(mockAladinBooks);

const zhivagoTranslations = [
  {
    key: 'original',
    label: '원문 직역 (AI)',
    text: '그들은 함께 가고 있었다. 그들은 죽은 자를 묻으러 가고 있었다. 빗속에서. 아직 눈도 내리지 않은, 그러나 이미 겨울이 시작된 늦가을의 빗속에서. 행렬의 선두에는 성가대가 있었고, 그 뒤를 제복 차림의 학생들이 따르고 있었다. 타오르는 초들은 바람에 흔들렸고, 불꽃은 자꾸만 꺼지려 했다.',
  },
  {
    key: 'minumsa',
    label: '민음사 (2004)',
    text: '그들은 걷고 있었고, 걷다가 걷다가 성가대가 노래를 불렀다. 멈출 때면 발밑의 땅이, 사람들의 발과 말발굽과 빗속에 쏟아진 빗방울들이 모두 하나가 되어 땅속으로 가라앉는 것만 같았다. 행렬은 빗줄기가 바람에 날리는 들판을 걷고 있었다. 두 명의 사제와, 사제보다 먼저 걷는 성가대가 행렬을 이끌었다.',
  },
  {
    key: 'openbooks',
    label: '열린책들 (2010)',
    text: '행렬은 걸어가고 있었고, 성가대는 노래를 부르고 있었다. 쉬는 시간에는 발소리, 말발굽 소리, 빗소리만이 서로 뒤엉켜 들렸다. 행렬이 지나가는 들판은 비에 젖어 있었다. 맨 앞에는 두 명의 사제와 조촌집사가 걸었고, 그 뒤를 아이들과 학교 교원들이 따랐다. 아이들 손에 들린 초불이 바람에 흔들렸다.',
  },
  {
    key: 'munhakdongne',
    label: '문학동네 (2016)',
    text: '발걸음을 옮기는 사이사이 성가대의 노래가 들렸다. 쉬는 때면 지치고 무거워진 발소리와 말굽 소리, 빗소리만이 귀에 남았다. 행렬이 지나는 들판은 비로 흠뻑 젖어 있었다. 두 명의 신부가 행렬 앞에 서고 그 뒤를 교복을 입은 학생들이 따랐다. 바람이 불 때마다 아이들이 든 초의 불꽃은 가물거리다 꺼져버렸다.',
  },
];

export const works: Work[] = grouped.works.map((w) => {
  if (w.author === '보리스 파스테르나크') {
    return { ...w, translations: zhivagoTranslations };
  }
  return w;
});

export const editionSets: EditionSet[] = grouped.editionSets;
export const volumes: Volume[] = grouped.volumes;

export function getWorkById(id: string): Work | undefined {
  return works.find((w) => w.id === id);
}

export function getEditionSetsByWorkId(workId: string): EditionSet[] {
  return editionSets.filter((es) => es.workId === workId);
}

export function getVolumesByEditionSetId(editionSetId: string): Volume[] {
  return volumes
    .filter((v) => v.editionSetId === editionSetId)
    .sort((a, b) => a.volumeNumber - b.volumeNumber);
}

export function getEditionSetById(id: string): EditionSet | undefined {
  return editionSets.find((es) => es.id === id);
}

export function getVolumeById(id: string): Volume | undefined {
  return volumes.find((v) => v.id === id);
}
