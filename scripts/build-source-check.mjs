// Source-only audit build: no application launch, personal data, or packaged assets.
import {build} from 'esbuild';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.JIBUN_SOURCE_CHECK_DIR && resolve(process.env.JIBUN_SOURCE_CHECK_DIR);
if (!out || out === root || out.startsWith(root + '\\') || out.startsWith(root + '/')) {
  throw new Error('Set JIBUN_SOURCE_CHECK_DIR to a new directory outside the candidate.');
}
if (existsSync(out)) throw new Error('Source-check output already exists; use a new directory.');

const emptyData = {
  'samples.json': [],
  'web-vol1.json': {pages: {}},
  'web-outlines.json': {},
  'web-samples.json': {'ue5-range': {pages: {}}},
  'range-code-source.json': {files: {}},
  'web-range-v2.json': {pages: {}, chapters: [], files: []},
  'web-vol1-v2.json': {pages: {}, chapters: [], files: []},
  'code-practice.json': [],
};
const placeholders = {
  name: 'source-check-placeholders',
  setup(builder) {
    builder.onResolve({filter: /^\/design-kit\//}, args => ({path: args.path, external: true}));
    builder.onResolve({filter: /\.json$/}, args => {
      const name = basename(args.path);
      if (Object.hasOwn(emptyData, name) && /(?:^|[\\/])data[\\/]/.test(args.path)) {
        return {path: name, namespace: 'empty-bookshelf'};
      }
    });
    builder.onLoad({filter: /.*/, namespace: 'empty-bookshelf'}, args => ({
      contents: JSON.stringify(emptyData[args.path]), loader: 'json',
    }));
    builder.onResolve({filter: /palette\.css$/}, args => {
      if (args.path.includes('materials/design-kit/colors/')) {
        return {path: 'palette.css', namespace: 'neutral-palette'};
      }
    });
    builder.onLoad({filter: /.*/, namespace: 'neutral-palette'}, () => ({
      contents: '/* Build-only placeholder. Original Radix palette is excluded. */', loader: 'css',
    }));
  },
};

const version = JSON.parse(readFileSync(join(root, 'release.json'), 'utf8')).version;
const define = {
  'process.env.NODE_ENV': '"production"',
  '__YOHAKU_SHARED__': 'true',
  '__YOHAKU_VERSION__': JSON.stringify(version),
  '__YOHAKU_DESIGN_REVIEW__': 'false',
  '__YOHAKU_BOOK_DESIGN__': 'true',
};
mkdirSync(out, {recursive: true});
const browserResult = await build({
  absWorkingDir: root, entryPoints: ['main.tsx'], bundle: true, format: 'esm',
  platform: 'browser', target: ['chrome110', 'edge110'], minify: true,
  outfile: join(out, 'app.js'), define, plugins: [placeholders], legalComments: 'eof', metafile: true,
});
const serverResult = await build({
  absWorkingDir: root, entryPoints: ['server.ts'], bundle: true, format: 'esm',
  platform: 'node', target: 'node22', outfile: join(out, 'server.mjs'),
  define, plugins: [placeholders], legalComments: 'eof', metafile: true,
});

const bundledPackages = new Set();
for (const result of [browserResult, serverResult]) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input.replaceAll('\\', '/').match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) bundledPackages.add(match[1]);
  }
}
writeFileSync(join(out, 'BUNDLED-PACKAGES.json'), JSON.stringify([...bundledPackages].sort(), null, 2));

let notices = '自分図書館 source-check build — third-party notices\n\n';
for (const name of ['react', 'react-dom', 'scheduler', 'lucide-react']) {
  const dir = join(root, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  notices += `${name} ${pkg.version}\n${readFileSync(join(dir, 'LICENSE'), 'utf8')}\n\n`;
}
notices += 'PDF.js-derived CSS — app/terms.css\n';
notices += 'Copyright 2014 Mozilla Foundation. Adapted and modified from PDF.js v5.6.205 web/text_layer_builder.css for application-specific selectors, sizing and overlay behavior.\n';
notices += readFileSync(join(root, 'licenses', 'PDFJS-APACHE-2.0.txt'), 'utf8');
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.txt'), notices);
writeFileSync(join(out, 'SOURCE-CHECK.json'), JSON.stringify({
  version, edition: 'shared', sourceOnly: true, runnable: false,
  missing: ['PDF.js assets', 'fonts', 'illustrations', 'launcher', 'runtime'],
}, null, 2));
console.log('Source-check bundles and notices written to ' + out);
