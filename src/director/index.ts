import { BedrockDirector } from './bedrock';
import { parseDirectorKind, type Director } from './director';
import { LocalDirector } from './local';
import { RemoteDirector } from './remote';

export { LocalDirector, BedrockDirector, RemoteDirector };
export type { Director };

/** Pick a director from an env value (`local` by default). */
export function createDirector(kind: string | undefined, env: Record<string, string | undefined> = {}): Director {
  switch (parseDirectorKind(kind)) {
    case 'bedrock':
      return BedrockDirector.fromEnv(env);
    case 'remote':
      return new RemoteDirector(env.FRIGHT_DIRECTOR_ENDPOINT ?? '/api/compose');
    case 'local':
    default:
      return new LocalDirector();
  }
}
