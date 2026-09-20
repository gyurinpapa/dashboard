# Meta 계정 미연결 상태에서의 개발 계약

이 단계는 계정 정보 조회와 정책 대조를 mock으로 검증한다. 실제 계정, 토큰,
OAuth, DB, job, worker, runtime gate, 배포를 만들거나 변경하지 않는다.

## 추가 파일

| 파일 | 이유 |
| --- | --- |
| `src/lib/media-sync/meta-ads-account-preflight.ts` | v26.0 계정 metadata GET 생성·응답 검증·명시적 정책 대조, 주입된 transport만 허용 |
| `scripts/verify-meta-ads-account-preflight.ts` | 실제 네트워크를 차단한 요청·실패·정책 변경·collector 연계 검증 |
| `scripts/fixtures/meta-ads-connection-draft.json` | 계정 미연결 상태와 교체할 정책 후보를 명시한 비실행 설정 예시 |
| `scripts/README-meta-ads-account-preflight.md` | 현재 검증 범위와 추후 계정 연결 절차 |

기존 파일은 수정하지 않는다. UI/client, Naver/Google/CSV 실행 경로와 공통 DB 함수에
연결하지 않는다. 향후 route/worker 연결 시에는 그 변경에 대한 별도 영향 검증이 필요하다.

## 미연결 설정

`fixtures/meta-ads-connection-draft.json`은 실행용 `MetaAdsAccountPolicy`가 아니다.
`scope`, 통화, 시간대, 전환·매출 action_type은 `null`이며 기존 정책 validator에서
거부된다. 이 파일을 자동으로 읽거나 null을 실제 계정 값으로 대체하는 경로는 없다.

`impression`과 `["7d_click", "1d_view"]`는 개발용 정책 **후보**이다. 모든 계정에
대한 Meta 권장값, 기본값 또는 현재 v26.0의 지원 보증이라는 뜻은 아니다.
나중에 원하는 보고 의미와 계정 응답을 확인하여 변경할 수 있다.
전환·매출은 각각 정확히 하나의 action_type을 명시해야 한다. 테스트의
`fixture.explicit_conversion` / `fixture.explicit_revenue`는 합성 라벨이며 실계정 설정이 아니다.

기존 계약: 선택한 action이 응답에 없으면 미확정으로 거부한다. 임의 합산이나
0 보정은 하지 않는다. 모든 지표가 0인 fact만 DROP하고 지연 전환/매출 row는 KEEP한다.
이 엄격한 계약과 실제 Meta sparse action 응답의 호환성은 실제 응답 검토 대상이다.

## 서버 코드 계약

- `buildMetaAdsAccountMetadataRequest`: `GET /v26.0/act_{id}` 및
  `fields=id,account_id,currency,timezone_name`. Bearer 토큰은 header에만 포함한다.
  반환한 요청 객체는 인증 header를 담으므로 로그·브라우저·디스크로 보내지 않는다.
- `readMetaAdsAccountMetadata`: `fetchImpl`이 필수이다. native fetch fallback 및 자동
  재시도가 없다. timeout은 기본 10초(최대 30초), 응답은 기본 64 KiB(최대 256 KiB)이다.
  redirect, HTTP/API error, 초과 응답, ID 불일치를 거부하고 오류 본문은 노출하지 않는다.
- `parseMetaAdsAccountMetadata`: 문자열 계정 ID를 그대로 비교하여 큰 ID의 정밀도를
  보존한다. 반환값은 계정 ID/통화/시간대뿐이다. 계정 상태나 토큰 권한을 인증하지 않는다.
- `verifyMetaAdsAccountPolicyMetadata`: 신뢰한 연결 scope, 기존 정책, 기간, raw metadata를
  대조한다. 통화/시간대가 다르면 기존 정책이나 checkpoint를 자동 변경하지 않고 거부한다.
  같은 시간대를 나타내는 별칭도 문자열이 다르면 명시적 정책 재검토가 필요하다.

이 모듈을 호출하는 운영 경로는 없다. `fetchImpl`에 실제 fetch를 넣으면 네트워크를
사용하므로 별도 승인 전에는 테스트의 mock만 사용한다. metadata 확인 성공만으로
sync 권한, Insights 권한, 토큰 만료, 데이터 의미, 운영 성능이 검증되는 것은 아니다.

## 오프라인 검증

저장소 루트에서 기존 의존성을 사용한다. 실제 환경 변수/secret이 자식 테스트에 전달되지 않는다.

```sh
env -i PATH="$PATH" node --import tsx scripts/verify-meta-ads-account-preflight.ts
env -i PATH="$PATH" ./node_modules/.bin/tsc --noEmit --incremental false
env -i PATH="$PATH" ./node_modules/.bin/eslint src/lib/media-sync/meta-ads-account-preflight.ts scripts/verify-meta-ads-account-preflight.ts
```

이번 실행 결과: 오프라인 106개 검증 PASS, 전체 TypeScript 검사 PASS, 신규 TS 파일 lint PASS.
mock 계정 metadata → 명시적 정책 → 기존 collector에서 수집 7행 / canonical 6행을 확인했다.
정책 변경 후 이전 cursor 재사용은 fetch 전에 거부됐다. 네트워크 시도 0, DB 실행 0이다.
이 단계 시작 시점의 기존 파일 717개는 내용 변경이 없다.

## 계정이 준비된 뒤

1. 별도 승인 후 최소 읽기 요청으로 계정 ID·통화·시간대를 확인한다.
2. 실제 반환 action_type과 원하는 전환/매출 정의, 보고 시점, 기여 기간을 대조한다.
3. 기존 credential 모듈과 명시적 계정 정책을 사용한다. 설정 변경 후 이전 수집 cursor는
   재사용하지 않는다. 보호 RPC를 사용하는 서버 실행 모듈은 기존 mock 검증 상태이다.
4. REST/JWT·운영 권한·최소 API 검증이 통과한 다음에만 worker/gate/배포를 검토한다.

## 근거와 한계

- [Meta 공식 SDK의 계정 필드 정의](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py): account_id, currency, timezone_name.
- [Meta 공식 SDK의 Insights 옵션 정의](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py): impression, 7d_click, 1d_view라는 라벨이 정의되어 있다.

2026-09-20에 공식 저장소의 main 정의를 참고했다. SDK를 설치하지 않았다. 개발자 문서
본문은 접근 오류로 직접 대조하지 못했으며, main은 v26.0 고정 증거가 아니다.
API 버전은 기존 프로젝트 계약 v26.0을 유지한다. 계정 미연결 개발 결과를 실제 API
호환성 또는 운영 연결 완료로 보고하지 않는다.
