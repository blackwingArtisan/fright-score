import type { Director } from '../director/director';
import { LocalDirector } from '../director/local';
import { RemoteDirector } from '../director/remote';

/**
 * Browser director choice. `VITE_FRIGHT_DIRECTOR=remote` sends requests to `/api/compose`
 * (the Bedrock-backed server function); anything else uses the free local director.
 * The Bedrock SDK is never bundled into the browser.
 */
export function createWebDirector(kind: string | undefined): Director {
  return kind === 'remote' ? new RemoteDirector('/api/compose') : new LocalDirector();
}
