import { handleGoogleRefreshRequestHttp } from '@/src/lib/media-sync/google-refresh-request-http';
import {
  GOOGLE_REFRESH_REVISION_ENABLED,
  GOOGLE_REFRESH_REVISION_EXECUTION_APPROVED,
  requestGoogleRefreshRevision,
} from '@/src/lib/media-sync/google-refresh-revision-server';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGoogleRefreshRequestHttp({
    request, reportId: (await context.params).id,
    enabled: GOOGLE_REFRESH_REVISION_ENABLED && GOOGLE_REFRESH_REVISION_EXECUTION_APPROVED,
    submit: requestGoogleRefreshRevision,
  });
}
