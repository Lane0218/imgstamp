const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const keepPrefixes = [
  '/.vite',
  '/node_modules/sharp',
  '/node_modules/@img',
  '/node_modules/detect-libc',
  '/node_modules/semver',
];

module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon',
    ignore: (file) => {
      if (!file) return false;
      const normalized = file.replace(/\\/g, '/');
      const withLeadingSlash = normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;
      // Keep exact paths and their children
      if (keepPrefixes.some((prefix) => withLeadingSlash.startsWith(prefix))) {
        return false;
      }
      // Keep parent directories so fs-extra can traverse into whitelisted modules
      if (
        keepPrefixes.some((prefix) =>
          prefix.startsWith(`${withLeadingSlash}/`),
        )
      ) {
        return false;
      }
      return true;
    },
  },
  rebuildConfig: {},
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Lane0218',
          name: 'imgstamp',
        },
        draft: false,
      },
    },
  ],
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main/main.ts',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/preload.ts',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new AutoUnpackNativesPlugin(),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};
