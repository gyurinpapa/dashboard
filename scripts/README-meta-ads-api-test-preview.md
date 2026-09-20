# Meta 최소 API 테스트 요청 미리보기

계정 없이 다음에 확인할 요청을 검토하는 **offline 도구**다. 실제 호출 기능은 없다.
요청 생성은 기존 v26.0 account/Insights builder를 사용하며 출력에서 인증 정보를 제거한다.
기존 canonical 결과, 서버 실행 모듈, provider gate, Naver/Google/CSV, UI/SQL은 수정하지 않는다.

## 파일과 변경 이유

| 신규 파일 | 이유 |
| --- | --- |
| `src/lib/media-sync/meta-ads-api-test-preview.ts` | 부분 설정 검증·누락 표시·기존 request builder와 일치하는 미리보기 |
| `scripts/preview-meta-ads-api-test.ts` | 미연결 기본값·합성 예시·수동 설정을 받는 네트워크 차단 CLI |
| `scripts/verify-meta-ads-api-test-preview.ts` | 요청 일치·비밀정보 미사용·실행 옵션 거부·CLI 검증 |
| `scripts/README-meta-ads-api-test-preview.md` | 사용법과 최소 테스트 범위 |

이 패키지는 기존 Meta 구현이 있는 `meta-ads-api` 격리 작업공간에 더하는 전체 신규 파일이다.
이전 account-preflight, insights-request, canonical 및 fixture 파일이 필요하다. 원본 보호
저장소 `/Users/damon/Projects/dashboard`에 자동 적용하는 파일은 아니다.

## 바로 확인하기

현재 격리 저장소 루트에서 실행한다. 의존성을 새로 설치하거나 실제 환경 파일을 읽지 않는다.

```sh
env -i PATH="$PATH" node --import tsx scripts/preview-meta-ads-api-test.ts
```

정상 기본 출력은 `status: INCOMPLETE`, `inputSource: UNCONNECTED_DRAFT`다. 실패가 아니라
실제 계정이 아직 없는 현재 상태를 나타낸다. 누락은 다음 여섯 항목이다.

- 계정 ID, 통화, 시간대, 확인할 하루의 날짜
- 전환 action_type, 매출 action_type

계정 path는 `/v26.0/act_<AD_ACCOUNT_ID>`, 날짜 query는 `null`로 표시한다.
`impression`, `["7d_click", "1d_view"]`는 기존 draft의 교체 가능한 후보를 그대로 사용한다.
Meta의 전체 계정에 대한 권장값/기본값, v26.0 실계정 지원 보증으로 해석하지 않는다.

완성된 요청 형태를 합성 설정으로 보려면:

```sh
env -i PATH="$PATH" node --import tsx scripts/preview-meta-ads-api-test.ts --example
```

이 경우 `inputSource: SYNTHETIC_EXAMPLE`, `status: CONFIGURED_PREVIEW`이며 기존 fixture의
합성 계정 ID와 action 라벨을 사용한다. `liveExecutionEnabled`는 항상 `false`다.
`CONFIGURED_PREVIEW`는 입력 형식이 완성되었다는 뜻이며, 승인/권한/운영 준비 판정이 아니다.

선택 가능한 **토큰 없는 설정**:

| 옵션 | 의미 |
| --- | --- |
| `--account-id` | `act_` 없는 숫자 문자열. 큰 ID도 숫자로 변환하지 않음 |
| `--currency` | 명시적 대문자 3글자 통화 코드 |
| `--timezone` | 명시적 유효 시간대 |
| `--date` | `YYYY-MM-DD` 하루. API의 since/until에 같은 날짜 사용 |
| `--conversion-action`, `--revenue-action` | 각각 정확히 하나의 action_type. 자동 합산 없음 |
| `--report-time` | 명시적인 보고 시점 라벨 |
| `--attribution-window` | 기여 기간 라벨. 여러 개면 이 옵션만 반복 가능; 기존 후보 전체를 대체 |

`--example`은 수동 옵션과 함께 사용할 수 없다. `--help`는 단독 사용한다.
날짜를 생략하면 오늘 날짜로 추측하지 않는다. currency/timezone은 로컬 정책 대조용이며
Insights API query에 임의 파라미터로 추가하지 않는다. action_type 두 값도 응답 매핑용이다.
입력값의 의미/실계정 지원 여부는 별도 검증 대상이며 이 도구는 형식과 기존 계약만 확인한다.

## 미리보기의 최소 요청 계약

| 순서 | 예정 요청 | 제한 |
| --- | --- | --- |
| 1 | `GET /v26.0/act_{id}` — id/account_id/currency/timezone_name | 계정 metadata 한 번 |
| 2 | `GET /v26.0/act_{id}/insights` | metadata 일치 후, 하루·ad level·첫 페이지·limit 25 |

총 최대 2회는 **향후 테스트 계획**이다. 지금 호출 수는 0이다. 추가 페이지, 자동 재시도,
breakdown, OAuth/token debug 요청, DB/RPC, job 생성, materialization/activation/finalization,
worker 활성화, migration, commit/push, 배포는 이 도구에 없다.

25는 Insights 페이지의 요청 제한이다. 계정 전체 광고를 확인했다거나 canonical 25행이
생긴다는 뜻이 아니다. canonical 변환 시 모두 0인 fact는 DROP하고 지연 전환/매출 행은
KEEP한다. 선택한 action 누락은 0으로 추론하지 않는다. RAW는 기존 canonical staging
totalRows 계약 그대로이며 이 preview가 RAW나 report를 생성하지 않는다.

## 검증

```sh
env -i PATH="$PATH" node --import tsx scripts/verify-meta-ads-api-test-preview.ts
env -i PATH="$PATH" ./node_modules/.bin/tsc --noEmit --incremental false
env -i PATH="$PATH" ./node_modules/.bin/eslint src/lib/media-sync/meta-ads-api-test-preview.ts scripts/preview-meta-ads-api-test.ts scripts/verify-meta-ads-api-test-preview.ts
```

검증은 실제 request builder와 미리보기 path/query를 비교하며, 단일 날짜와 limit=25,
after 없음, 인증 정보 제외, 미완성 항목의 null 유지, 잘못된 날짜/ID/기여 기간 거부를 확인한다.
코드 import 전에 socket/DNS/fetch를 차단하고 credential 관련 환경 변수 접근도 감시한다.
CLI가 `--run`, 토큰, 임의 URL·입출력 파일 경로를 거부하는지도 확인한다.

이번 실행 결과: **116개 PASS**, 전체 TypeScript 검사 PASS, 신규 TS 세 파일 lint PASS.
`NETWORK_ATTEMPTS=0`, `CREDENTIAL_READS=0`, `DB_EXECUTIONS=0`을 확인했다.
기본 draft와 합성 예시 CLI 모두 실제 실행을 비활성으로 표시했다.

## 남아 있는 실제 검증

계정 확보 전에도 preview는 사용할 수 있다. 계정 확보·별도 승인 후에는 이 계획에 따라
최소 읽기 응답을 확인하는 실행 경로를 별도로 검토해야 한다. 현재 preview에 토큰을
추가하거나 `--run`을 붙여 실행하는 방식은 지원하지 않는다.

실제 계정 접근, token scope/만료, 통화·시간대, 전환/매출 action_type과 attribution 의미,
누락 action 응답, v26.0 호환성, REST/JWT·권한·운영 성능은 아직 증명되지 않았다.
운영 연결 완료나 모든 캠페인/광고 조회 완료로 보고하지 않는다.
