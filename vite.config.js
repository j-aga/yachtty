import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const PHRASES = path.resolve(import.meta.dirname, 'voice/phrases.json');

/**
 * While developing, the game posts every line it speaks to /__voice. They are
 * collected in voice/phrases.json, which `npm run voices` turns into audio.
 */
function voiceRecorder() {
  return {
    name: 'yachtty-voice-recorder',
    configureServer(server) {
      server.middlewares.use('/__voice', (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const lines = JSON.parse(body);
            let known = [];
            try {
              known = JSON.parse(fs.readFileSync(PHRASES, 'utf8'));
            } catch {
              // First line ever.
            }
            const all = [...new Set([...known, ...lines])].sort((a, b) => a.localeCompare(b));
            if (all.length !== known.length) {
              fs.mkdirSync(path.dirname(PHRASES), { recursive: true });
              fs.writeFileSync(PHRASES, JSON.stringify(all, null, 2) + '\n');
            }
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  // Relative paths, so the built game works at any address, such as
  // https://<user>.github.io/yachtty/ on GitHub Pages.
  base: './',
  plugins: [voiceRecorder()],
});
