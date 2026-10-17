# Sky video

Requested source: [Emelie Trahan — you chose this (lyric video)](https://www.youtube.com/watch?v=1fXSbALhjIo).

Downloaded with yt-dlp and converted to H.264/MP4 without audio, with faststart
enabled. Downloading it does not make it public domain or grant redistribution
rights.

The site's music excerpt is approximately 72.39 seconds long; the video is
162.3 seconds. Approximate calibration: `videoTime = 2.25 + 0.88 × musicTime`.
Alignment uses pitch-tolerant musical chroma comparison and the audio envelope.
Local anchors: 5 s → 6.7 s; 25 s → 24.2 s; 45 s → 41.9 s. Analysis resolution:
0.1 s. The video repeats musical sections; the first matching section was
selected.

The music playback clock drives the video, including music-loop wraps. Player
time synchronization cannot remove possible differences in the original edit.
Reproducible analysis: `tools/align-sky-video.py` and
`tools/align-sky-chroma.py`.
