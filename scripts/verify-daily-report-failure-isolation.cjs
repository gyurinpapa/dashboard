// Offline runner test: real entrypoint, synthetic dependencies, no network or DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const entry = path.join(__dirname, 'daily-report-v2-scheduler.ts');
const compiled = ts.transpileModule(fs.readFileSync(entry, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
class SchedulerError extends Error {
  constructor(code) { super('synthetic error'); this.code = code; }
}
async function run({ ids = ['a', 'b'], enabled = true, act = () => 'created_or_replayed' } = {}) {
  const calls = [], logs = [], imports = [];
  const proc = { env: { DAILY_REPORT_V2_SCHEDULER_ENABLED: enabled ? '1' : '0' } };
  const modules = {
    '../src/lib/media-sync/daily-report-v2-scheduler': {
      DailyReportV2SchedulerError: SchedulerError,
      runDailyReportV2SchedulerOnce: async ({ reportId, targetDate }) => {
        calls.push(reportId);
        return { action: act(reportId, calls.filter(id => id === reportId).length), reportId, targetDate };
      },
    },
    '../src/lib/media-sync/daily-report-v2-scheduler-repository': {
      createDailyReportV2SchedulerDatabaseDependencies: () => ({
        listCandidates: async () => ids.map(reportId => ({ reportId })),
      }),
    },
    '../src/lib/media-sync/naver-searchads-daily-scheduler': {
      getPreviousCompletedSeoulCalendarDate: () => '2026-09-30',
    },
  };
  vm.runInNewContext(compiled, {
    process: proc,
    console: { log: value => logs.push(JSON.parse(value)), error: value => logs.push(JSON.parse(value)) },
    require: name => { imports.push(name); assert.ok(modules[name], 'Unexpected import'); return modules[name]; },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { calls, logs, imports, exitCode: proc.exitCode };
}
async function main() {
  let result = await run({ enabled: false });
  assert.deepEqual(result.calls, []); assert.deepEqual(result.imports, []);
  console.log('PASS disabled entry performs no dependency imports or work');

  result = await run({ act: id => { if (id === 'a') throw new SchedulerError('EXACT_JOB_FAILED'); return 'created_or_replayed'; } });
  assert.deepEqual(result.calls, ['a', 'b']); assert.equal(result.exitCode, 1);
  assert.equal(result.logs.filter(x => x.action === 'report_blocked_failed_job').length, 1);
  console.log('PASS failed report first: later report runs, failed report called once, failure exit retained');

  result = await run({ act: id => { if (id === 'b') throw new SchedulerError('EXACT_JOB_FAILED'); return 'created_or_replayed'; } });
  assert.deepEqual(result.calls, ['a', 'b']); assert.equal(result.exitCode, 1);
  console.log('PASS failed report last preserves earlier successful dispatch');

  result = await run({ act: (id, count) => {
    if (id === 'a' && count === 2) throw new SchedulerError('EXACT_JOB_FAILED');
    return count === 1 ? 'snapshot_materialized' : 'snapshot_activated';
  } });
  assert.deepEqual(result.calls, ['a', 'b', 'a', 'b']); assert.equal(result.exitCode, 1);
  console.log('PASS blocked snapshot stops its own continuation while another snapshot completes');

  for (const error of [new SchedulerError('EXACT_JOB_SCOPE_MISMATCH'), new SchedulerError('CREATE_RESULT_FAILED'), Object.assign(new Error('uncertain'), { code: 'EXACT_JOB_FAILED' })]) {
    result = await run({ act: () => { throw error; } });
    assert.deepEqual(result.calls, ['a']); assert.equal(result.exitCode, 1);
  }
  console.log('PASS scope mismatch, ambiguous create and untyped error still stop the run');

  result = await run({ ids: ['a', 'a'] });
  assert.deepEqual(result.calls, []); assert.equal(result.exitCode, 1);
  console.log('PASS duplicate discovery rejected before dispatch');

  result = await run({ act: () => 'snapshot_materialized' });
  assert.equal(result.calls.filter(x => x === 'a').length, 65);
  assert.equal(result.calls.filter(x => x === 'b').length, 65);
  assert.equal(result.exitCode, 1);
  console.log('PASS existing snapshot continuation limit preserved');

  result = await run(); assert.deepEqual(result.calls, ['a', 'b']); assert.equal(result.exitCode, undefined);
  console.log('PASS successful dispatch unchanged; no retry after job creation');
  console.log('PASS_OFFLINE_REPORT_FAILURE_ISOLATION; live_db=0; live_api=0; deployments=0');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
