# Etrylue Performance — Meta 오프라인 구현 인수인계

현재 판정: **PASS — 오프라인 구현과 인수인계 snapshot 확정. 운영 연결은 미완료다.**

기록일: 2026-09-20. 현재 연결할 실제 Meta 계정이 없으므로 계정을 요구하며 개발을 중단하지
않고 credential·정책·collector·보호 RPC 통합·요청 preview까지 진행했다. 실계정값은 추측하지 않았다.

## 기준과 상태

| 항목 | 확정 값 |
| --- | --- |
| 저장소 | `https://github.com/gyurinpapa/dashboard.git` |
| 작업 브랜치 | `meta-ads-api` |
| 기준/현재 HEAD | `f714e95a374592a0f7581a2d82132ab043fab35e` |
| working tree | 기준 대비 기존 4개 수정 + 신규 95개 = 99개 파일/과거 전달물 |
| 이번 인수인계 변경 | 문서·manifest·검증 기록 3개 추가; 기존 726개 파일 내용 그대로 |
| commit/push/deploy | 수행하지 않음 |
| Meta gate | `syncRuntimeEnabled=false`, `allowedDataLevels=[]` |
| source snapshot SHA-256 | `337b29f6e7397b058c876830d2e0b3f832a48c3fd770e76c59ebab5a19e6ef46` |

**HEAD가 기준 commit과 같다는 것은 working tree도 identical하다는 뜻이 아니다.** 초기 격리
브랜치 생성 시 identical이었지만, 현재는 위 미커밋 구현이 존재한다. main을 checkout/수정하지
않았으며 보호 로컬 `/Users/damon/Projects/dashboard`에 접근하지 않았다. 원격 최신 상태를
이번 문서 작성 과정에서 새로 조회하거나 이 작업을 원격에 게시하지 않았다.

## 구현한 동작

1. **credential**: 기존 `MEDIA_CREDENTIAL_ENCRYPTION_KEY` AES-256-GCM 계약을 재사용한다.
   Meta AAD는 연결·workspace·광고주·provider·계정 ID를 묶는다. 실토큰 저장/OAuth는 수행하지 않았다.
2. **canonical 수집**: API v26.0, ad × day, breakdown 없음, device 빈 문자열,
   row_level/data_level `creative`, reason `meta_ads_ad_daily_insights`를 유지한다.
   네이티브 fetch 기반 builder/collector이며 Meta SDK를 설치하지 않았다.
3. **지표 의미**: conversion/revenue action_type과 보고 시점·기여 기간은 명시적으로 설정한다.
   자동 합산이나 누락 action의 0 보정은 하지 않는다. 5개 지표 모두 0인 fact만 DROP하고
   지연 전환/매출 행은 KEEP한다. RAW는 canonical staging totalRows다.
4. **checkpoint와 projection**: 원본 claim에 묶어 page append/CAS를 재개하고, collected checkpoint를
   복수 projection에 handoff한다. materialization은 2,000행 batch이며 primary report는 compatibility mirror다.
5. **완료**: 서버 통합은 신규 claim-protected activation/finalization RPC를 사용한다. 오래된 claim과
   done replay의 잘못된 claim을 거부한다. claim transfer를 지원하는 복구 경로는 구현하지 않았다.
6. **계정 검증**: collectPage 전에 계정 ID·통화·시간대를 확인한다. 실패하면 Insights와 checkpoint RPC를
   호출하지 않는다. 성공 cache는 같은 실행 객체 안에서만 공유하며 새 객체는 다시 검사한다.
   완료 단계는 이미 수집된 receipt와 보호 RPC를 사용하여 Meta API 장애 때문에 복구가 막히지 않는다.
7. **미연결 preview**: 계정 metadata 1회 + 하루치 Insights 첫 페이지 1회·limit 25의 계획을 출력한다.
   추가 페이지/재시도/실행 모드가 없고, 토큰·임의 URL·입출력 경로 인수를 받지 않는다.

## 검증 근거와 정확한 범위

| 영역 | 확인 결과 | 증거의 범위 |
| --- | --- | --- |
| credential | 84개 PASS | 이전 도구 실행; 전달 ZIP 2개 파일 모두 현재와 동일 |
| 계정 정책 | 141개 PASS | 이전 도구 실행; 전달 ZIP 2개 파일 모두 현재와 동일 |
| 계정 metadata | 106개 PASS | 이전 도구 실행; 전달 ZIP 4개 파일 모두 현재와 동일 |
| 서버 통합 | 128개 PASS | 이전 도구 실행; 최신 전달 ZIP 3개 파일 모두 현재와 동일 |
| 요청 preview | 116개 PASS | 이전 도구 실행; 전달 ZIP 4개 파일 모두 현재와 동일 |
| 전체 TypeScript / 변경 파일 lint | PASS | 이전 턴 실행; 이번 인수인계에서 기존 코드 불변 |
| 초기 PG fixture 파일 | 구현 변경 0 | acceptance의 27개 중 문서 1개만 기록된 후속 수정; 나머지 26개 파일 일치 |
| 최신 PG claim 전달물 | 59/59 파일 일치 | runner 내장 payload와 현재 파일 byte 비교 |
| Mac isolated PostgreSQL | 사용자 로그 PASS | page 18 / handoff 28 / completion 13 / claim 38 사례. 이번에 Mac 파일을 직접 열거나 DB를 재실행하지 않음 |

mock 통합은 수집 7행 → canonical 6행 → projection 2개·12행 → `done/100%`를 확인했다.
사용자가 제출한 최신 PG claim 로그도 같은 완료 결과와 실제 rollback·두 세션 경쟁·PG 재시작
replay·published/CSV sentinel 보존을 보고한다. 2,001행/2,000행 batch의 마지막 handoff 측정은
4.31초이며 운영 지연시간과 같다는 의미가 아니다. 중복되는 suite의 사례 수를 합산하거나
퍼센트로 운영 준비율을 계산하지 않는다. 이번 인수인계에서는 테스트/DB/API 재실행을 하지 않았다.

## 별도 위험 표시: 기존 공통 모듈 4개

공통 staging/materialization/activation/finalization repository를 변경했다. Meta allowlist와
명시적 context/target/creative/주입 RPC guard를 추가했다. 다른 provider의 분기는 유지하지만,
Naver/Google도 읽는 파일이므로 **공통 코드 영향 위험이 있는 변경**으로 취급한다. staging에는
새 Meta 모듈 import도 있다. 소스 조건 보존과 대표 common-RPC fixture 비교를 전체 상품 collector,
운영 CSV worker, UI 집계/필터 결과의 포괄적 무영향 증명으로 확대하지 않는다.

UI/client, provider gate, worker, package/lockfile, 기존 SQL 파일은 변경하지 않았다.
새 SQL 7개는 검토·격리 테스트용 후보이며 운영 migration이 아니다. READ ONLY 감사 SQL 3개도
자동 실행하지 않는다. 과거 ZIP 4개와 단계별 resume runner는 이력 보존용이며 현재 작업을
과거 payload로 되돌릴 수 있으므로 최신 구현 적용 명령으로 사용하지 않는다.

## 실제 계정 없이 아직 증명하지 못한 것

- 실제 token scope·만료·계정 접근과 Insights 접근 권한, OAuth/app 설정.
- 계정의 통화·시간대, 전환/매출 action_type, attribution 의미와 실제 누락 action 응답.
- v26.0 실계정 응답 호환성. 공식 SDK main의 라벨 참고는 특정 버전 호환성 증명이 아니다.
- Supabase REST/JWT/Auth 및 운영 권한. 수집 baseline의 프로젝트 ref는 독립 검증되지 않았다.
- DB metadata는 네 번의 READ ONLY transaction에서 수집됐다. DB 전체의 단일 snapshot이 아니다.
- trigger helper 3개의 owner/ACL은 원본 export가 없어 격리 PG에서만 가정했다.
- claim fence는 신규 wrapper에만 적용된다. 구 RPC 직접 호출과 privileged SQL을 막는 fence가 아니다.
- 실제 worker 연결·배포·운영 성능과 전체 provider/CSV/UI 회귀 검증.

## 계정 없는 상태의 사용법

격리 저장소 루트에서 기존 의존성을 사용한다. 새 설치나 실제 환경파일 로드는 하지 않는다.

```sh
env -i PATH="$PATH" node --import tsx scripts/preview-meta-ads-api-test.ts
env -i PATH="$PATH" node --import tsx scripts/preview-meta-ads-api-test.ts --example
```

기본 `INCOMPLETE`는 계정이 없다는 정상 표시다. 여섯 누락 항목은 계정 ID·통화·시간대·하루 날짜·
전환 action_type·매출 action_type이다. `--example`은 합성 입력이고 `CONFIGURED_PREVIEW`도 실행
승인/권한 확인을 뜻하지 않는다. 기존 후보 `impression` + `7d_click/1d_view`는 계정에 맞게
나중에 수정한다. 실제 계정이나 지표 의미를 가정하여 null을 채우지 않는다.

필요할 때 이미 존재하는 검증 명령을 사용할 수 있다. 승인 없이 PG runtime runner나 SQL을
실행하라는 지시가 아니다.

```sh
env -i PATH="$PATH" node --import tsx scripts/verify-meta-ads-server-execution.ts
env -i PATH="$PATH" node --import tsx scripts/verify-meta-ads-api-test-preview.ts
env -i PATH="$PATH" ./node_modules/.bin/tsc --noEmit --incremental false
```

## 전달본과 파일별 이유

ZIP은 원래 구현 99개와 인수인계 문서 3개, 총 102개 파일의 전체 내용을
`dashboard-meta-ads-api/` 아래에 담는다. node_modules·환경파일·실토큰·빌드 산출물·전체 baseline
repository는 포함하지 않는다. 자동 적용/삭제/checkout/commit 기능도 없다. 기반 repo의 나머지
파일과 의존성이 필요하다. 파일별 SHA-256·크기·원래 파일 해시는 `meta-ads-offline-files.json`,
검증 출처는 `meta-ads-offline-verification.json`을 기준으로 한다. manifest 자기 해시와 ZIP은
source snapshot 계산에서 제외하며, ZIP 전달 해시는 별도로 제공한다.

아래 목록은 **인수인계 문서 추가 전의 구현/이력 99개**다. 오래된 README·acceptance의 next_scope는
당시 기록이며 현재 다음 단계는 이 문서를 따른다.

| 파일 | 구분 | 필요한 이유 | 위험/실행 범위 |
| --- | --- | --- | --- |
| `scripts/README-meta-ads-account-preflight.md` | 신규 | 미연결 draft·계정 metadata 대조·106개 offline 검증 설명 | DOCUMENTATION |
| `scripts/README-meta-ads-api-test-preview.md` | 신규 | 실행 없는 최소 API 요청 CLI·116개 검증과 사용법 | DOCUMENTATION |
| `scripts/README-meta-ads-isolated-harness.md` | 신규 | 초기 격리 PostgreSQL harness 사용법·사용자 제출 결과·당시 제약 | DOCUMENTATION |
| `scripts/README-meta-ads-server-preflight-integration.md` | 신규 | 수집 전 metadata와 완료 복구 통합·128개 mock 검증 설명 | DOCUMENTATION |
| `scripts/export-meta-ads-isolated-fixture.ts` | 신규 | isolated fixture 합성 데이터·IPC fixture 생성; 네트워크 차단 | OFFLINE_FIXTURE_TOOL |
| `scripts/export-meta-ads-materialization-handoff-fixture.ts` | 신규 | materialization handoff fixture 합성 데이터·IPC fixture 생성; 네트워크 차단 | OFFLINE_FIXTURE_TOOL |
| `scripts/export-meta-ads-page-checkpoint-fixture.ts` | 신규 | page checkpoint fixture 합성 데이터·IPC fixture 생성; 네트워크 차단 | OFFLINE_FIXTURE_TOOL |
| `scripts/fixtures/meta-ads-ad-daily-insights.json` | 신규 | 합성 ad daily 입력·canonical 기대값·거부 사례 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-connection-draft.json` | 신규 | 계정 미연결 null 설정과 교체 가능한 지표 정책 후보 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-db-authority-baseline.json` | 신규 | READ ONLY 수집 DB 함수 정의/권한 baseline; 프로젝트 ref 독립 확인 아님 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-insights-pages.json` | 신규 | 3개 합성 API page와 7 fetched/6 canonical 기대값 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-isolated-db-authority.json` | 신규 | 격리 fixture용 테이블·기존/보조 함수·제약·권한 정의 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-isolated-runtime-acceptance.json` | 신규 | 초기 사용자 제출 PG 결과 및 당시 파일 해시·검증 한계 기록 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/fixtures/meta-ads-postgres-environment-preflight.json` | 신규 | 과거 PG 바이너리 준비 환경 진단 기록; 현재 운영 준비 판정 아님 | FIXTURE_OR_HISTORICAL_RECORD |
| `scripts/meta-checkpoint-retry.zip` | 신규 | 과거 checkpoint retry 전달본 보존; 현재 구현 재적용용 아님 | HISTORICAL_DO_NOT_AUTO_RUN |
| `scripts/meta-finalize-alias-retry.zip` | 신규 | 과거 finalize alias retry 전달본 보존; 현재 구현 재적용용 아님 | HISTORICAL_DO_NOT_AUTO_RUN |
| `scripts/meta-rpc-name-retry.zip` | 신규 | 과거 rpc name retry 전달본 보존; 현재 구현 재적용용 아님 | HISTORICAL_DO_NOT_AUTO_RUN |
| `scripts/meta-timezone-retry.zip` | 신규 | 과거 timezone retry 전달본 보존; 현재 구현 재적용용 아님 | HISTORICAL_DO_NOT_AUTO_RUN |
| `scripts/meta_ads_completion_claim_harness.py` | 신규 | completion claim 단계의 private PostgreSQL fixture·재시작·롤백 검증 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/meta_ads_completion_harness.py` | 신규 | completion 단계의 private PostgreSQL fixture·재시작·롤백 검증 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/meta_ads_isolated_harness.py` | 신규 | isolated 단계의 private PostgreSQL fixture·재시작·롤백 검증 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/meta_ads_materialization_handoff_harness.py` | 신규 | materialization handoff 단계의 private PostgreSQL fixture·재시작·롤백 검증 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/meta_ads_page_checkpoint_harness.py` | 신규 | page checkpoint 단계의 private PostgreSQL fixture·재시작·롤백 검증 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/prepare-meta-ads-postgres-runtime.sh` | 신규 | PG17.6 바이너리 준비와 source hash 검증; DB 실행과 분리 | OPT_IN_LOCAL_BUILD_DO_NOT_AUTO_RUN |
| `scripts/preview-meta-ads-api-test.ts` | 신규 | 미연결/합성/수동 설정의 요청 미리보기 CLI; live 실행 없음 | OFFLINE_PREVIEW_ONLY |
| `scripts/resume-meta-ads-checkpoint-test.py` | 신규 | 당시 checkpoint test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-completion-claim-test.py` | 신규 | 최신 사용자 PG claim 검증에 사용한 격리 Mac runner; payload 59개 현재 일치 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-completion-test.py` | 신규 | 당시 completion test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-db-checkpoint-case-test.py` | 신규 | 당시 db checkpoint case test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-db-checkpoint-roles-test.py` | 신규 | 당시 db checkpoint roles test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-db-checkpoint-test.py` | 신규 | 당시 db checkpoint test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-finalize-alias-test.py` | 신규 | 당시 finalize alias test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-handoff-generated-row-test.py` | 신규 | 당시 handoff generated row test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-materialization-handoff-test.py` | 신규 | 당시 materialization handoff test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-rpc-name-test.py` | 신규 | 당시 rpc name test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/resume-meta-ads-timezone-test.py` | 신규 | 당시 timezone test 단계의 격리 Mac 재개 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/run-meta-ads-isolated-mac.py` | 신규 | 최초 격리 Mac 검증 workspace 준비 및 실행 runner 보존 | OPT_IN_ISOLATED_RUNTIME_DO_NOT_AUTO_RUN |
| `scripts/sql/audit-meta-ads-dependency-closure-readonly.sql` | 신규 | DB 함수 의존성 closure의 READ ONLY 감사 질의 | READ_ONLY_QUERY_NOT_EXECUTED |
| `scripts/sql/audit-meta-ads-reference-dependencies-readonly.sql` | 신규 | 참조 테이블/함수 의존성의 READ ONLY 감사 질의 | READ_ONLY_QUERY_NOT_EXECUTED |
| `scripts/sql/audit-meta-ads-transitive-dependencies-readonly.sql` | 신규 | 전이 함수 의존성과 권한의 READ ONLY 감사 질의 | READ_ONLY_QUERY_NOT_EXECUTED |
| `scripts/sql/create-activate-meta-ads-snapshot-fanout.sql` | 신규 | 복수 projection 활성화의 원자성·baseline 검사 SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-completion-claim-fence.sql` | 신규 | 원본 claim 검증을 추가한 activation/finalization wrapper SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-finalization-contract.sql` | 신규 | Meta 완료·connection last_sync 계약 SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-materialization-handoff.sql` | 신규 | 원자적 checkpoint handoff·projection materialization SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-page-checkpoint-contract.sql` | 신규 | same-claim page checkpoint 테이블·load/CAS/append SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-snapshot-materialization.sql` | 신규 | Meta snapshot 생성·bounded materialization SQL 후보 | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/sql/create-meta-ads-staging-contract.sql` | 신규 | Meta canonical/staging SQL 후보와 기존 함수 baseline guard | SQL_REVIEW_ONLY_NOT_APPLIED |
| `scripts/verify-meta-ads-account-policy.ts` | 신규 | 명시적 계정·통화·시간대·전환/매출·attribution 정책 검증 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-account-preflight.ts` | 신규 | 계정 metadata 요청·응답 및 명시적 정책 대조 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-ad-daily-insights-collector.ts` | 신규 | bounded page 수집·재시도·cursor 및 정책 일치 검사 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-api-test-preview.ts` | 신규 | 미리보기 요청 일치·누락·토큰 미사용·live 옵션 거부 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-atomic-fanout-contract.ts` | 신규 | Meta 복수 projection activation/finalization의 원자 계약 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-canonical-contract.ts` | 신규 | canonical grain·지표·DROP/KEEP·기존 Naver/Google fixture 계약 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-completion-claim-contract.ts` | 신규 | 원본 claim·completion token·projection 완료 상태 계약 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-credentials.ts` | 신규 | 기존 AES-256-GCM 재사용, 연결 scope를 묶는 Meta 전용 AAD offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-insights-wire-contract.ts` | 신규 | Insights 요청·wire 응답·paging 및 token 비노출 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-materialization-handoff-contract.ts` | 신규 | collected checkpoint와 projection target의 handoff 계약 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-materialization-handoff-repository.ts` | 신규 | 신규 handoff RPC와 2,000행 materialization 재개 adapter offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-materialization-handoff-sql-contract.ts` | 신규 | materialization handoff sql contract 정적/fixture/mock 계약 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-page-checkpoint-contract.ts` | 신규 | 원본 claim에 묶인 page checkpoint·cursor·digest 계약 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-page-checkpoint-repository.ts` | 신규 | 신규 page load/CAS/append RPC의 요청·응답 adapter offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-page-checkpoint-sql-contract.ts` | 신규 | page checkpoint sql contract 정적/fixture/mock 계약 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-server-execution.ts` | 신규 | credential·metadata·collector·보호 RPC를 주입 transport로 통합 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-sql-contract.ts` | 신규 | 기존 DB 함수 복원 동등성·Meta SQL object/privilege 범위 정적 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-staging-orchestrator.ts` | 신규 | page 수집과 pending append·확정 checkpoint 순서 조정 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify-meta-ads-staging-projection-contract.ts` | 신규 | 공통 repository의 Meta 분기와 staging/projection 계약 mock 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_completion_claim_harness.py` | 신규 | completion claim harness 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_completion_claim_runner.py` | 신규 | completion claim runner 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_completion_claim_sql.py` | 신규 | completion claim sql 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_completion_harness.py` | 신규 | completion harness 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_completion_runner.py` | 신규 | completion runner 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_db_checkpoint_runner.py` | 신규 | db checkpoint runner 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_isolated_harness.py` | 신규 | isolated harness 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_materialization_handoff_harness.py` | 신규 | materialization handoff harness 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_materialization_handoff_runner.py` | 신규 | materialization handoff runner 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_page_checkpoint_harness.py` | 신규 | page checkpoint harness 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `scripts/verify_meta_ads_page_checkpoint_parser.py` | 신규 | page checkpoint parser 안전 guard·정적 계약·runner 동작의 offline 검증 | OFFLINE_VERIFIER |
| `src/lib/media-sync/media-sync-finalization-repository.ts` | 수정 | Meta provider 허용과 creative·주입 RPC guard | HIGH_SHARED_CODE_REVIEW |
| `src/lib/media-sync/media-sync-snapshot-activation-repository.ts` | 수정 | Meta provider 허용과 명시적 projection authority·주입 RPC guard | HIGH_SHARED_CODE_REVIEW |
| `src/lib/media-sync/media-sync-snapshot-materialization-repository.ts` | 수정 | Meta scope 보존 및 creative/target/주입 RPC guard | HIGH_SHARED_CODE_REVIEW |
| `src/lib/media-sync/media-sync-staging-repository.ts` | 수정 | Meta provider 분기·명시적 context와 주입 RPC guard·Meta batch 변환 | HIGH_SHARED_CODE_REVIEW |
| `src/lib/media-sync/meta-ads-account-policy.ts` | 신규 | 명시적 계정·통화·시간대·전환/매출·attribution 정책 검증 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-account-preflight.ts` | 신규 | 계정 metadata 요청·응답 및 명시적 정책 대조 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-ad-daily-insights-collector.ts` | 신규 | bounded page 수집·재시도·cursor 및 정책 일치 검사 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-api-test-preview.ts` | 신규 | 토큰 없는 하루·첫 페이지·25행 테스트 계획과 누락 항목 미리보기 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-canonical-row.ts` | 신규 | ad × day canonical 변환, 지표 선택과 all-zero DROP·지연 전환 KEEP 계약 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-completion-claim-contract.ts` | 신규 | 원본 claim·completion token·projection 완료 상태 계약 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-completion-claim-repository.ts` | 신규 | 신규 claim-protected activation/finalization RPC adapter | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-credentials.ts` | 신규 | 기존 AES-256-GCM 재사용, 연결 scope를 묶는 Meta 전용 AAD | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-insights-request.ts` | 신규 | v26.0 Insights GET·명시적 attribution·header-only token 요청 생성 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-insights-response.ts` | 신규 | wire 응답·계정/기간·paging endpoint 검증과 canonical 전달 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-materialization-handoff-contract.ts` | 신규 | collected checkpoint와 projection target의 handoff 계약 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-materialization-handoff-repository.ts` | 신규 | 신규 handoff RPC와 2,000행 materialization 재개 adapter | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-page-checkpoint-contract.ts` | 신규 | 원본 claim에 묶인 page checkpoint·cursor·digest 계약 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-page-checkpoint-repository.ts` | 신규 | 신규 page load/CAS/append RPC의 요청·응답 adapter | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-server-execution.ts` | 신규 | credential·metadata·collector·보호 RPC를 주입 transport로 통합 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-staging-contract.ts` | 신규 | Meta canonical scope·row identity·staging batch 정규화 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-staging-orchestrator.ts` | 신규 | page 수집과 pending append·확정 checkpoint 순서 조정 | META_ONLY_UNREGISTERED |
| `src/lib/media-sync/meta-ads-staging-projection-contract.ts` | 신규 | canonical dataset에서 독립 report projection의 완료 계약 | META_ONLY_UNREGISTERED |

이번 신규 문서: `docs/meta-ads-offline-handoff.md`(판정과 사용법),
`docs/meta-ads-offline-files.json`(99개 파일 scope/hash),
`docs/meta-ads-offline-verification.json`(검증 출처와 한계).

## 다음 대화에서 이어갈 명령

> Etrylue Performance Meta 작업을 이 handoff와 source hash 기준으로 이어간다.
> `meta-ads-api` / base `f714e95a374592a0f7581a2d82132ab043fab35e`이며 99개 미커밋 구현/이력 파일이 있다.
> 실제 계정은 아직 없다. 추가 계정 입력을 요구하며 같은 offline 검증을 반복하지 않는다.
> main·보호 로컬·실토큰·OAuth·실제 API·운영 DB·job·worker gate·배포는 별도 승인 없이 변경하지 않는다.
> 먼저 manifest에 따른 현재 파일 일치 여부를 확인한다. 기존 파일의 미승인 변경은 덮어쓰지 않는다.
> 계정이 준비되면 explicit action 정책과 최소 읽기 테스트 실행 경로를 검토한다.
> preview는 live runner가 아니며 --run을 지원하지 않는다. 실제 조회는 별도 승인 후 최대 두 요청으로
> 시작하고, 해당 검증이 통과한 뒤에만 운영 연결·권한·배포를 검토한다.

현재 판정: **PASS — 오프라인 구현과 인수인계 기준 확정; 실제 API/운영 연결 미완료.**

## 지금 단 하나의 우선순위

계정이 준비되면 **최소 실제 읽기 테스트의 실행 경로와 계정·지표 설정을 검토**한다.
계정이 없는 현재는 이 snapshot을 기준으로 유지하며, 반복 테스트나 runtime 활성화를 하지 않는다.

### 이후 예정

별도 승인 후 계정 metadata + 하루 Insights 첫 페이지 확인 → action/attribution 의미 확정 →
REST/JWT·권한·worker 연결 및 운영 적용 검토. 앞 단계의 결과 없이 다음을 완료로 판정하지 않는다.
