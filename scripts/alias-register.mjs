/** alias-loader 를 켜 준다. node --import ./scripts/alias-register.mjs 로 쓴다. */
import { register } from 'node:module';
register('./alias-loader.mjs', import.meta.url);
