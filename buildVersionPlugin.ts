import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

const buildVersion = randomUUID();

export const buildVersionPlugin: Plugin = {
  name: 'awc-build-version',
  apply: 'build',
  config: () => ({ define: { __AWC_BUILD_VERSION__: JSON.stringify(buildVersion) } }),
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'build-version.json',
      source: JSON.stringify({ version: buildVersion }),
    });
  },
};
