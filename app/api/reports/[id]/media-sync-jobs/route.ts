import { NextResponse } from "next/server";

import {
  MediaConnectionAccessError,
  resolveReportMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "@/src/lib/media-sync/media-sync-jobs-repository";
import {
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const repositoryInput =
      buildCreatePendingMediaSyncJobRepositoryInput(
        accessContext,
        parsedRequest,
      );

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