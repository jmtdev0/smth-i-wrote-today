# Media assets

The repository includes the code, tests, and documentation; binary assets are
not published to GitHub. The scene's music and video are served from the public
R2 bucket `youchosethis-media` at `https://youchosethis-media.sarda0x.com`.
Netlify sets the production variable `VITE_MEDIA_BASE_URL` to that origin.

| Local file | R2 key | Purpose |
| --- | --- | --- |
| `emelie trahan - you chose this.mp3` | `music/you-chose-this.mp3` | Looping music and the video synchronization clock. |
| `heaven-sky.mp4` | `video/heaven-sky.mp4` | Subtle video layered over Heaven's sky. |

`recordings/`, original images, and `portrait.png` are not uploaded to the
repository or R2. As a result, the occasional sky apparition is available in
the local version but omitted from the public one. `favicon.png` is local-only.

To run the complete audiovisual experience locally, place the media files in
`public/` using the names above. Builds and unit tests do not require them. Music
and video calibration is documented in [heaven-sky-source.md](./heaven-sky-source.md);
if you replace the media, check their synchronization as well.
