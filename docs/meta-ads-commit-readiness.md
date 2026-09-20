# Meta 비활성 커밋 — 빌드와 배포 전 확인 기록

기록일: 2026-09-20. 브랜치: `meta-ads-api`.
기준 commit: `f714e95a374592a0f7581a2d82132ab043fab35e`.

현재 판정: **PENDING — 로컬 커밋용 기본 웹 빌드는 통과했다. 원격 push와 Preview 배포는 보류한다.**

## 커밋 범위

이 체크포인트는 기존 Meta 구현/이력 99개, 기존 인수인계 문서 3개와 이 문서 1개를
기록한다. 이번 확인 과정에서 기존 729개 source/document 파일 내용은 바꾸지 않았다.
변경된 공통 source는 staging/materialization/activation/finalization repository 4개뿐이다.
파일별 이유와 위험은 `meta-ads-offline-files.json`에 있다. 해당 manifest와
`meta-ads-offline-handoff.md`의 HEAD/미커밋 상태는 **이번 커밋 이전 snapshot의 역사 기록**이다.

Meta runtime gate는 `syncRuntimeEnabled=false`, `allowedDataLevels=[]` 그대로다.
UI/client, worker, scheduler, package/lockfile, 기존 SQL과 배포 설정은 변경하지 않았다.
신규 SQL은 검토·격리 fixture용 후보이며 배포 시 자동 적용되는 migration이 아니다.
실토큰 저장, OAuth, 운영 DB, 실제 Meta 호출, main 변경은 수행하지 않았다.

## 이번에 실행한 검증

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| 기본 `next build` (Next.js 16.1.6 / Turbopack) | PASS / exit 0 | 별도 source 및 node_modules 복사본; TypeScript 포함; static pages 16/16 |
| Meta staging/projection mock | PASS | global row index, projection authority, replay/conflict, runtime disabled |
| Meta canonical contract | PASS | 67개 negative case; delayed conversion/revenue KEEP; Naver/Google shared key fixture 동일 |
| Naver final lifecycle transient retry | PASS | materialization 완료, activation/finalization 재시도, Google lifecycle 대표 동작; DB/API 0 |
| Naver materialization batch reconciliation | PASS | 미커밋·기커밋 응답 손실과 잘못된 checkpoint 거부; DB/API 0 |
| 원래 작업본 SHA-256 비교 | PASS | 검사 시작 시 729개 파일 중 변경/삭제 0 |
| `git diff --check` | PASS | 기존 tracked source diff |

최초 빌드는 외부를 가리키는 node_modules 심볼릭 링크를 Turbopack이 거부했다.
격리 복사본 내부로 의존성을 복사한 뒤 동일한 기본 빌드가 통과했다. 저장소 설정을 바꾸거나
webpack으로 전환하지 않았다. 기존 middleware→proxy deprecation 경고는 남아 있다.

빌드는 실제 환경파일 없이 빈 child environment에 합성 Supabase URL/키와 합성 OpenAI 키를
넣었다. Node fetch/HTTP/DNS/socket에 네트워크 차단 guard를 적용했으며 로컬 내부 통신만
허용했다. build와 일부 mock 명령이 공유한 guard 기록에는 socket 차단 사건이 있다.
따라서 이를 'network attempts=0' 증거로 사용하지 않는다. 실제 계정/DB/서비스 인증이나
Preview 환경변수의 적합성, 브라우저 동작, 전체 provider/CSV worker 검증은 이 빌드 범위가 아니다.
빌드 산출물은 합성 설정을 포함하므로 원격에 `--prebuilt`로 배포하지 않는다.

## 기준 commit에서도 재현되는 staging 검사 실패

다음 두 기존 스크립트는 현재 작업본과 기준 commit의 별도 복사본에서 모두 exit 1이다.

| 스크립트 | 양쪽에서 같은 최초 실패 |
| --- | --- |
| `verify-google-ads-staging-repository.ts` | line 234: report_id가 RPC payload에 없어야 한다는 기대값 불일치 |
| `verify-media-sync-staging-repository-authoritative-payload.ts` | line 533: 같은 report_id 기대값 불일치 |

테스트를 통과시키려고 기존 계약/검사를 수정하지 않았다. 두 suite는 해당 assertion에서
중단됐으므로 나머지 case의 결과를 주장하지 않는다. 이 결과는 '새로 발생한 첫 실패 아님'을
확인한 것이며, 기존 staging suite 전체 PASS나 운영 무영향 증명은 아니다.
기존 검사 기대값과 현재 baseline 계약의 차이는 Preview 검토에서 별도로 다뤄야 한다.

## 원격 배포 확인 결과

- 읽기 전용 원격 ref 확인에서 `main`과 `meta-ads-api`는 모두 기준 SHA였다.
- 기준 commit의 GitHub status에는 Vercel dashboard와 Railway worker/scheduler 배포 연결이 있다.
  과거 status는 현재 어느 branch를 자동 배포하는지 증명하지 않는다.
- 연결된 Vercel API는 대상 `gyurinpapas-projects` scope 접근에 403을 반환했다.
  현재 연결로 project/branch/Preview 환경 설정을 검증할 수 없다.
- Railway media-sync worker와 scheduler들의 branch trigger는 아직 확인하지 못했다.
- 자동 실행 범위가 불명확하므로 push/Preview/Production 배포를 수행하지 않았다.

다음 행동은 대상 Vercel 팀 접근을 복구하고 Railway 자동 배포 branch를 읽기 전용으로
확인하는 것이다. 그 결과로 Meta 비활성 Preview의 안전한 대상을 확정한 뒤에만 push 또는
배포한다. Production 반영과 실제 Meta 활성화는 별도 단계다.

## 과거 PostgreSQL runner 사용 주의

과거 runner/ZIP과 SQL harness는 당시 기준 SHA 및 payload hash를 고정한 검증 기록이다.
이 커밋 이후 HEAD에서 일부 guard가 거부할 수 있다. 통과시키려고 기준 SHA/hash 검사를
변경하지 않는다. 재현이 필요하면 당시 기준의 별도 격리 checkout과 대응 payload를 사용한다.
이 문서 작성에서는 DB runtime/SQL을 실행하지 않았다.
