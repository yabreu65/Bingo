# CI media fixtures

These one-second synthetic MP3 and MP4 files are test-only assets. They are generated from FFmpeg signal sources and contain no commercial music. The CI media audit copies them into the temporary Vite public directory, validates them with `ffprobe`, checks HTTP range handling, and verifies real Chromium playback.
