import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  MediaConnectionAccessError,
  resolveReportMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  createPendingMediaSyncJob,
  listRecentMediaSyncJobsForReport,
  recoverStaleProcessingMediaSyncJobsForReport,
  MediaSyncJobsRepositoryError,
} from "@/src/lib/media-sync/media-sync-jobs-repository";
import {
  assertSafeMediaSyncJobPayload,
  MediaSyncJobRequestError,
  parseCreateMediaSyncJobRequest,
} from "@/src/lib/media-sync/media-sync-job-request";
import {
  buildCreateMediaSyncJobSuccessResponse,
  buildCreatePendingMediaSyncJobRepositoryInput,
  getInvalidMediaSyncJobJsonRouteError,
  getUnexpectedMediaSyncJobsRouteError,
  mapMediaSyncJobAccessRouteError,
  mapMediaSyncJobRequestRouteError,
  mapMediaSyncJobsRepositoryRouteError,
  mapMediaSyncJobsRoutePolicyError,
  MediaSyncJobsRoutePolicyError,
  type MediaSyncJobsRouteErrorResponse,
} from "@/src/lib/media-sync/media-sync-jobs-route-policy";
import type { SafeMediaSyncJob } from "@/src/lib/media-sync/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEDIA_SYNC_DATE_WINDOW_DAYS = 31;

const STALE_PROCESSING_JOB_MS =
  60 * 60 * 1_000;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(
  status: number,
  error: string,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  );
}

function routeErrorResponse(
  result: MediaSyncJobsRouteErrorResponse,
) {
  return jsonError(
    result.status,
    result.error,
  );
}

function isActiveMediaSyncJob(
  job: SafeMediaSyncJob,
): boolean {
  return (
    job.status === "pending" ||
    job.status === "processing"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeYmdOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (date.toISOString().slice(0, 10) !== normalized) {
    return null;
  }

  return normalized;
}

function getInclusiveDateWindowDays(dateFrom: string, dateTo: string) {
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return 0;
  }

  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function isMediaSyncDateWindowAllowed(dateFrom: string, dateTo: string) {
  const days = getInclusiveDateWindowDays(dateFrom, dateTo);

  return days >= 1 && days <= MAX_MEDIA_SYNC_DATE_WINDOW_DAYS;
}

function normalizeDataLevelOrDefault(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (
    normalized === "keyword" ||
    normalized === "creative" ||
    normalized === "mixed" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return "keyword";
}

async function getStoredMediaSyncSettings(input: {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, workspace_id, advertiser_id, meta")
    .eq("id", input.reportId)
    .eq("workspace_id", input.workspaceId)
    .eq("advertiser_id", input.advertiserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const meta = isPlainObject((data as any).meta) ? (data as any).meta : {};
  const dataSource = isPlainObject((meta as any).data_source)
    ? ((meta as any).data_source as Record<string, unknown>)
    : {};
  const mediaSync = isPlainObject((meta as any).media_sync)
    ? ((meta as any).media_sync as Record<string, unknown>)
    : {};

  const kind = String(dataSource.kind ?? "csv").trim().toLowerCase();
  const dateFrom = normalizeYmdOrNull(mediaSync.date_from);
  const dateTo = normalizeYmdOrNull(mediaSync.date_to);

  if (kind !== "api" || !dateFrom || !dateTo || dateFrom > dateTo) {
    return null;
  }

  if (!isMediaSyncDateWindowAllowed(dateFrom, dateTo)) {
    return null;
  }

  return {
    dateFrom,
    dateTo,
    dataLevel: normalizeDataLevelOrDefault(mediaSync.data_level),
    mode: "snapshot_replace" as const,
  };
}

function mediaSyncSettingMismatchResponse() {
  return jsonError(
    409,
    "MEDIA_SYNC_SETTINGS_REQUIRED",
  );
}

/**
 * media sync job 상태를 조회한다.
 *
 * 안전 원칙:
 * - reportId는 URL params에서만 사용한다.
 * - workspaceId, advertiserId는 access resolver 결과만 사용한다.
 * - run_sync 권한이 있는 사용자만 조회한다.
 * - credential, credential ciphertext, provider 원본 응답은 반환하지 않는다.
 * - report_rows 또는 staging rows 같은 대량 데이터는 조회하지 않는다.
 */
export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const access =
      await resolveReportMediaConnectionAccess({
        request,
        reportId: id,
        action: "run_sync",
      });

    await recoverStaleProcessingMediaSyncJobsForReport({
      reportId: access.reportId,
      workspaceId: access.workspaceId,
      advertiserId: access.advertiserId,
      staleMs: STALE_PROCESSING_JOB_MS,
    });

    const jobs =
      await listRecentMediaSyncJobsForReport({
        reportId: access.reportId,
        workspaceId: access.workspaceId,
        advertiserId: access.advertiserId,
        limit: 5,
      });

    const activeJob =
      jobs.find(isActiveMediaSyncJob) ?? null;

    const response = {
      ok: true as const,
      report_id: access.reportId,
      workspace_id: access.workspaceId,
      advertiser_id: access.advertiserId,
      access_scope: access.accessScope,
      active_job: activeJob,
      jobs,
    };

    assertSafeMediaSyncJobPayload(response);

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof
      MediaConnectionAccessError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobAccessRouteError({
          status: error.status,
          code: error.code,
        }),
      );
    }

    if (
      error instanceof
      MediaSyncJobsRepositoryError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobsRepositoryRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof
      MediaSyncJobsRoutePolicyError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobsRoutePolicyError(
          error.code,
        ),
      );
    }

    console.error(
      "[media-sync-jobs:get] Unexpected error",
      error,
    );

    return routeErrorResponse(
      getUnexpectedMediaSyncJobsRouteError(),
    );
  }
}

/**
 * media sync pending job을 생성한다.
 *
 * 안전 원칙:
 * - reportId는 URL params에서만 사용한다.
 * - body에서는 connectionId, 날짜 범위,
 *   dataLevel, mode만 읽는다.
 * - body의 workspaceId, advertiserId, reportId,
 *   userId, createdBy, provider, status 등은 신뢰하지 않는다.
 * - workspaceId, advertiserId, userId는
 *   access resolver 결과만 사용한다.
 * - run_sync 권한이 있는 사용자만 허용한다.
 * - pending job 생성까지만 수행한다.
 * - provider API 호출, worker 실행, ingestion 생성,
 *   report_rows 저장, report pointer 전환은 수행하지 않는다.
 */
export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } =
      await context.params;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return routeErrorResponse(
        getInvalidMediaSyncJobJsonRouteError(),
      );
    }

    const parsedRequest =
      parseCreateMediaSyncJobRequest({
        reportId: id,
        body,
      });

    const access =
      await resolveReportMediaConnectionAccess({
        request,
        reportId:
          parsedRequest.reportId,
        action: "run_sync",
      });

    const accessContext = {
      userId: access.userId,
      reportId: access.reportId,
      workspaceId:
        access.workspaceId,
      advertiserId:
        access.advertiserId,
      accessScope:
        access.accessScope,
      canRunSync:
        access.canRunSync,
    };

    const storedSettings = await getStoredMediaSyncSettings({
      reportId: access.reportId,
      workspaceId: access.workspaceId,
      advertiserId: access.advertiserId,
    });

    if (!storedSettings) {
      return mediaSyncSettingMismatchResponse();
    }

    if (
      parsedRequest.dateFrom !== storedSettings.dateFrom ||
      parsedRequest.dateTo !== storedSettings.dateTo ||
      parsedRequest.dataLevel !== storedSettings.dataLevel ||
      parsedRequest.mode !== storedSettings.mode
    ) {
      return mediaSyncSettingMismatchResponse();
    }

    const repositoryInput =
      buildCreatePendingMediaSyncJobRepositoryInput(
        accessContext,
        parsedRequest,
      );

    await recoverStaleProcessingMediaSyncJobsForReport({
      reportId: access.reportId,
      workspaceId: access.workspaceId,
      advertiserId: access.advertiserId,
      staleMs: STALE_PROCESSING_JOB_MS,
    });

    const job =
      await createPendingMediaSyncJob(
        repositoryInput,
      );

    const result =
      buildCreateMediaSyncJobSuccessResponse(
        accessContext,
        parsedRequest,
        job,
      );

    return NextResponse.json(
      result.body,
      {
        status: result.status,
      },
    );
  } catch (error) {
    if (
      error instanceof
      MediaConnectionAccessError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobAccessRouteError({
          status: error.status,
          code: error.code,
        }),
      );
    }

    if (
      error instanceof
      MediaSyncJobRequestError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobRequestRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof
      MediaSyncJobsRepositoryError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobsRepositoryRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof
      MediaSyncJobsRoutePolicyError
    ) {
      return routeErrorResponse(
        mapMediaSyncJobsRoutePolicyError(
          error.code,
        ),
      );
    }

    console.error(
      "[media-sync-jobs:post] Unexpected error",
      error,
    );

    return routeErrorResponse(
      getUnexpectedMediaSyncJobsRouteError(),
    );
  }
}
