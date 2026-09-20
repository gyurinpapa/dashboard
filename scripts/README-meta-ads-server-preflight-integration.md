# Meta 계정 검증 → 서버 실행 통합

## 변경 범위

`meta-ads-api`, HEAD `f714e95a374592a0f7581a2d82132ab043fab35e`의 기존 격리 작업에 적용했다.
이번 작업은 이전 Meta 구현을 보존하며 아래 세 파일만 변경한다.

| 파일 | 변경 이유 | 기존 매체 영향 |
| --- | --- | --- |
| `src/lib/media-sync/meta-ads-server-execution.ts` | 수집 전에 기존 계정 metadata reader로 ID·통화·시간대 대조 | Meta 전용, 운영 경로 미등록 |
| `scripts/verify-meta-ads-server-execution.ts` | metadata 연계와 실패·재개를 기존 전체 흐름 mock으로 검증 | 테스트 전용 |
| `scripts/README-meta-ads-server-preflight-integration.md` | 통합 동작과 실제 검증 범위 기록 | 문서 전용 |

Naver/Google/CSV, 공통 RPC/SQL, UI/client, worker, provider gate는 수정하지 않는다.
이 ZIP은 위 변경 파일의 **전체 내용**이며, 이전 Meta 구현이 있는 격리 작업공간에 대한
증분 전달본이다. 특히 이전 `meta-ads-account-preflight.ts` 및 미연결 draft fixture가 필요하다.
보호 로컬 `/Users/damon/Projects/dashboard`에 자동 적용하는 스크립트는 포함하지 않는다.

## 실행 순서

`createMetaAdsServerExecution()`은 신뢰한 원본 job/connection, 명시적 정책과 target을
검사하고 기존 credential codec으로 토큰을 복호화한다. 생성 자체로 fetch/RPC는 실행하지 않는다.

`collectPage()`는 다음 순서로 동작한다.

1. 주입된 fetch로 `GET /v26.0/act_{id}?fields=id,account_id,currency,timezone_name` 요청을 생성·실행한다.
2. 계정 ID는 기존 reader에서 문자열 그대로 비교하고, 통화·시간대는 생성 시 확정한 정책과 비교한다.
3. 확인된 경우에만 기존 checkpoint RPC 및 Insights collector로 진행한다.
4. metadata 불일치·HTTP/API 오류·파싱 실패 등은 안전한 `ACCOUNT_UNCONFIRMED`로 반환한다.
   응답 본문, 토큰, 암호문, key 또는 원래 오류 cause를 전달하지 않는다.

성공한 계정 확인은 **같은 실행 객체 안에서만** 공유한다. 동시에 대기하는 수집 호출은 같은
확인을 기다린다. 실패 시 cache를 지워 다음 호출이 다시 확인할 수 있게 한다. 새로운 실행
객체는 재개할 때도 재검사한다. 영구적인 권한 cache나 주기적 권한 확인이라는 의미는 아니다.

정책·계정 metadata가 바뀌어도 기존 checkpoint를 수정하거나 삭제하지 않는다. 미연결 draft는
실행 가능한 정책이 아니므로 constructor 단계에서 거부한다. caller가 `accountVerified` 같은
임의 플래그를 보내도 검증을 건너뛰지 못한다.

이미 수집한 checkpoint를 이용하는 `materialize()`, `activate()`, `finalize()` 및 완료 replay는
Meta 요청을 추가하지 않는다. 기존 보호 RPC가 원본 claim·checkpoint·completion token을 검증한다.
계정 API 장애가 DB 완료 복구까지 막지 않게 하는 선택이다. 완료 단계에서 새 데이터 수집을
허용한다는 의미는 아니다. 기존 claim transfer 거부 계약과 공통 RPC 범위는 그대로다.

## 검증 결과

- 서버 통합 mock 검증 **128개 PASS**. 실제 네트워크는 application import 전에 차단한다.
- 합성 credential 암호화/복호화 → mock metadata → 명시적 정책 → 실제 collector 코드 → mock 보호 RPC.
- 수집 7행, canonical 6행, projection 2개, materialized 12행, `done` / `100%`.
- 잘못된 계정·통화·시간대와 HTTP/API 오류: Insights 호출 0, checkpoint RPC 0.
- 재개 시 metadata 변경 거부 및 기존 checkpoint/row 보존, 정상 응답 복구 후 중복 없는 수집.
- 동일 실행 객체의 확인 공유, 실패 후 재확인, 새 실행 객체의 재검사.
- metadata 응답 대기 중 RPC 차단, 이후 동시 호출의 기존 RPC 오류 전달.
- 계정 API 실패 상태에서도 materialization·activation·finalization·done replay 정상 동작.
- 기존 lost-ack 복구, stale claim 거부, 잘못된 RPC 응답 거부, 2,001행의 2,000+1 batch 유지.
- `meta_ads.syncRuntimeEnabled=false` 유지.
- 전체 TypeScript 검사 PASS, 수정한 TS 두 파일 lint PASS.
- 작업 시작 시점과 파일 hash 비교: 위 Meta 두 파일 외 기존 719개 파일 변경 없음.

검증 명령은 저장소의 기존 의존성을 사용한다. 실제 환경 변수나 key를 테스트에 넘기지 않는다.
테스트 자식 프로세스에는 코드에 명시된 **합성 key**만 전달된다.

```sh
env -i PATH="$PATH" node --import tsx scripts/verify-meta-ads-server-execution.ts
env -i PATH="$PATH" ./node_modules/.bin/tsc --noEmit --incremental false
env -i PATH="$PATH" ./node_modules/.bin/eslint src/lib/media-sync/meta-ads-server-execution.ts scripts/verify-meta-ads-server-execution.ts
```

## 범위와 다음 단계

이번 검증은 injected fetch/RPC를 쓰는 mock 통합이다. 실제 Meta API 호출, DB 실행,
실제 토큰 저장, OAuth 변경, job 생성, worker 활성화, migration, commit/push, 배포는 없다.
Meta SDK 의존성도 추가하지 않는다. SQL runtime은 이번 단계에서 실행하지 않았다.

계정 ID·통화·시간대의 일치는 token scope/만료, Insights 권한, action_type 의미, 기여 기간의
v26.0 실계정 지원 또는 운영 성능을 증명하지 않는다. 계정이 생기기 전에는 별도 승인을
요구하는 실제 호출 도구의 **요청 미리보기와 offline 검증**까지 준비할 수 있다.
실제 계정과 action 응답 검토가 가능해진 뒤에 최소 API 확인 및 운영 연결 여부를 결정한다.
