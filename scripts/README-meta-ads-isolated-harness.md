# Etrylue Performance — Meta isolated PostgreSQL harness

현재 상태: **격리 PostgreSQL fixture 검증 PASS**. 2026-09-20 사용자가 제출한 Mac 실행 로그의 최종 JSON으로 확인했다.
Meta 6행/2개 projection, 실제 롤백·동시성·재시도, 기존 공통 RPC 비교, 시간대 정책 검증,
2,001행 시나리오(2,000행 batch, 8.843초)가 통과했다. 운영 성능과 전체 provider collector 검증은 범위 밖이다.
증거 출처·제약·실행 코드 27개 해시는 `fixtures/meta-ads-isolated-runtime-acceptance.json`에 기록했다.
이 도구는 Production 적용/배포 도구가 아니다. 기존 SQL 후보 파일은 수정하지 않는다.

## 파일과 실행 모드

- `fixtures/meta-ads-isolated-db-authority.json`: 제출된 네 번의 READ ONLY 자료를 합친 테이블 25개, 기존 함수 17개, 보조 함수 12개의 정의. 중복 정의는 동일성 검사 후 통합했다.
- `export-meta-ads-isolated-fixture.ts`: 기존 Meta canonical adapter를 실제로 호출하여 6개 staging row와 JS fingerprint 비교 벡터를 출력한다. fetch/socket/DNS를 차단한다.
- `meta_ads_isolated_harness.py`: Python 표준 라이브러리로 SQL 준비와 선택적인 격리 실행을 담당한다. DB 연결 라이브러리를 설치하지 않는다.
- `verify_meta_ads_isolated_harness.py`: 실제 DB 없이 대상 거부·권한 범위가 아닌 환경변수 미사용·준비 모드·정의 보존을 검사한다.

저장소 루트에서 준비만 실행한다. 출력 디렉터리는 아직 존재하지 않아야 한다.

```bash
python scripts/meta_ads_isolated_harness.py --prepare /tmp/meta-ads-harness-review
python scripts/verify_meta_ads_isolated_harness.py
```

준비 모드는 PostgreSQL 바이너리 없이 실행 가능하며, 이미 설치된 Node/tsx로 fixture를 만든다.
새 디렉터리에 `bootstrap.sql`, `seed.sql`, `candidate.sql`, `fixture.json`, `manifest.json`을 생성한다.
**SQL 미리보기는 첫 문장에서 예외를 발생시킨다. SQL Editor에 붙여 넣어 실행하지 않는다.**
미리보기의 끝은 `ROLLBACK`이다. 내부 SQL은 실행 모드에서 확인된 새 클러스터에만 전달한다.

## 격리 실행 계약

실행 단계에서는 아래 형태를 사용한다. Mac에서 완료한 검증은 같은 harness와 2,001행 설정을 사용했다.

```bash
python scripts/meta_ads_isolated_harness.py \
  --prepare /tmp/meta-ads-harness-run \
  --run-isolated \
  --pg-bin /absolute/path/to/postgresql-17.6/bin
```

요구 조건:

- `meta-ads-api`, HEAD `f714e95a374592a0f7581a2d82132ab043fab35e`.
- Python 3.9 이상, 프로젝트의 Node/tsx, PostgreSQL **17.6**의 `postgres`, `initdb`, `pg_ctl`, `psql`과 pgcrypto **1.3**.
- 비-root OS 사용자. 바이너리 설치·다운로드·sudo 전환은 harness가 수행하지 않는다.
- `--run-isolated`와 `--pg-bin`을 함께 지정해야 한다. DB URL, host, port, 기존 DB/클러스터 경로 입력은 받지 않는다.

새 `/tmp/meta-ads-pg-*` 경로를 mode 0700으로 만들고, TCP를 비활성화한다.
전용 Unix socket만 사용하며 외부 `PGHOST`, `DATABASE_URL`, `.pgpass`, `.psqlrc`, OAuth/secret 설정을 사용하지 않는다.
socket의 trust 인증은 이 전용 디렉터리 안에서만 적용된다. anon/authenticated/service_role 등은 NOLOGIN 로컬 역할이다.

SQL 제출 전 data directory, socket, TCP 비활성화, PostgreSQL 버전, DB 이름, cluster system identifier를 검사한다.
실제 SQL 세션에도 data directory·DB 이름·system identifier 검사를 넣는다.
실행 파일은 보호 저장소 `/Users/damon/Projects/dashboard`를 작업 대상으로 허용하지 않는다.
성공적으로 서버를 정지한 뒤 자신이 만든 임시 클러스터만 제거한다. 정지 실패 시 삭제하지 않는다.

## 재현과 검증 시나리오

| 영역 | 수행할 검사 |
|---|---|
| 정의 | 기존 함수·보조 함수 29개의 PostgreSQL 반환 정의 해시 비교, 후보의 원본 변경 감지 |
| 스키마 | 25개 테이블의 컬럼·생성 컬럼·제약조건·인덱스·RLS·정책·트리거 재현 |
| 합성 데이터 | 회사 `000` → 사용자/프로필 → tenant → workspace/회원 → 광고주/리포트 순서로 생성 |
| 기존 계약 | 동일 합성 데이터로 Naver/Google의 append→prepare→batch→complete→activate→finalize를 원본/후보 DB에서 비교 |
| Meta | 6개 canonical row → staging/checkpoint → 리포트 2개 snapshot → atomic activation → finalization |
| 재시도 | staging 중복 삽입 0; processing 중 지난 batch offset 거부·상태 보존 및 prepare checkpoint 재조회; success 후 batch 재실행의 삽입 0·상태 보존; 완료 토큰 일치, 활성화 반환값 폐기 후 재시도, 완료 재시도 무변경 |
| 거부 | 범위·행 수·중복/누락 target·published 기준 변경 및 활성화 전 완료 요청 |
| 롤백 | 두 번째 리포트 UPDATE에서 오류, 전체 UPDATE 뒤 오류, 실패 전후 테이블 상태 동일성 |
| 동시성 | 한 세션이 job lock을 보유할 때 다른 활성화 세션의 lock timeout과 상태 보존 |
| 기존 데이터 | CSV 리포트와 기존 Naver/Google 리포트, 이전/published 행 및 포인터 보존 |
| fingerprint | JS row key, fixture 전용 jsonb 직렬화 oracle, PostgreSQL jsonb::text와 SHA-256 비교 |
| 범위 경계 | 기본 2,001행/2,000행 batch. `--performance-rows 100000`으로 10만 행 선택 가능 |

실행 결과는 `runtime-result.json`에 저장한다. 오류가 발생하면 PASS 결과를 만들지 않는다.
SQL 세션 기본 timeout은 15초/lock timeout 2초이며 원본 함수 자체 설정은 그대로 유지한다.
별도로 각 psql 프로세스에 60초의 클라이언트 제한이 있다. 대용량 처리는 2,000행씩 호출한다.

## 판정의 한계

1. 네 번의 자료는 별도 시점의 READ ONLY 결과다. 프로젝트 식별자는 독립적으로 확인되지 않았다.
2. 다음 보조 함수 3개는 원본 owner/ACL이 수집되지 않았다. 로컬에서 postgres owner와 service_role 전용 EXECUTE를 가정한다. 이 부분의 운영 권한 동일성은 증명하지 않는다.
   - `etrylue_v2_assign_media_connection_tenant_scope()`
   - `etrylue_v2_guard_report_public_identity()`
   - `etrylue_v2_assign_report_tenant_scope()`
3. `supabase_auth_admin`, `dashboard_user`의 전체 운영 역할 속성/멤버십과 schema ACL 전체를 재현하는 도구가 아니다. Supabase Auth 서버·JWT 검증·REST 권한 통합은 검사 범위 밖이다.
4. Naver/Google 검사는 공통 RPC의 대표 합성 데이터 비교다. 전체 상품 collector/실제 API 결과, CSV worker 전체 실행과 UI 필터 회귀를 대신하지 않는다.
5. 2,001행 또는 10만 행 측정은 로컬 환경의 결과다. Production 자원·지연시간과 같다고 판정하지 않는다.
6. 원본 함수의 권한·정의나 SQL 후보를 자동 수정하지 않는다. 함수 guard/hash가 불일치하면 중단한다.
7. 오프라인 구문 검사와 단위 검사는 실제 PostgreSQL의 실행·동시성·롤백·성능 PASS가 아니다.

다음 단계는 실제 API 호출 없이 Meta 서버 수집기·페이지네이션의 변경 허용 파일 목록을 READ ONLY로 확정하는 것이다.
이번 PASS는 운영 DB 적용이나 Meta runtime 활성화를 승인하지 않는다.
