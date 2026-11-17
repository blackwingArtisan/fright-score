import { BedrockDirector } from '../../src/director/bedrock';
import { handleCompose } from '../../src/server/compose';

/**
 * Cloudflare Pages Function for the web app's AI director (`VITE_FRIGHT_DIRECTOR=remote`).
 * Needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION as Pages secrets, plus an optional
 * FRIGHT_BEDROCK_MODEL. Not deployed by default; the static site works fully without it.
 */
interface PagesContext {
  request: Request;
  env: Record<string, string | undefined>;
}

export const onRequestPost = async (context: PagesContext): Promise<Response> =>
  handleCompose(context.request, BedrockDirector.fromEnv(context.env));
