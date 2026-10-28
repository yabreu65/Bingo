import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const mediaPath = /^\/music\/.*\.(?:mp3|mp4|webm|wav|ogg|m4a)(?:\?.*)?$/i;

const mediaFileExists = (root, pathname) => {
  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, pathname.slice(1));
  return filePath.startsWith(`${rootPath}${path.sep}`) && fs.existsSync(filePath);
};

const rejectMissingMedia = (root) => (request, response, next) => {
  const pathname = decodeURIComponent(request.url?.split('?')[0] || '');
  if (mediaPath.test(pathname) && !mediaFileExists(root, pathname)) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('Media resource not found');
    return;
  }
  next();
};

const missingMediaReturns404 = () => ({
  name: 'missing-media-returns-404',
  configureServer(server) {
    server.middlewares.use(rejectMissingMedia(path.join(projectRoot, 'public')));
  },
  configurePreviewServer(server) {
    server.middlewares.use(rejectMissingMedia(path.join(projectRoot, 'dist')));
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [missingMediaReturns404(), react()],
})
