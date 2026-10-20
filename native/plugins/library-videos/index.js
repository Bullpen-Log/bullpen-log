/**
 * 운동 · 드릴 영상(720p HEVC, 저장소 library-hevc/<uuid>.mp4)을 앱 안 LibraryVideos/ 폴더로 싣는다 — 2026-10-20 김민: "앱 안에 넣을 거야".
 * LocalVideoModule 이 Bundle 의 LibraryVideos/<uuid>.mp4 를 먼저 찾고, 없으면 처음 볼 때 받아 폰에 둔다.
 *
 * 영상은 git 에 없다(700MB) — prebuild 때 아래 차례로 처음 찾은 폴더에서 가져온다. 없으면 영상 없이 굽는다(실패 아님).
 *   1. BP_LIBRARY_VIDEOS 환경변수
 *   2. native/LibraryVideos — GitHub 굽기가 scripts/fetch-library-videos.mjs 로 받아 둔다
 *   3. ~/bullpen-library-bundle/hevc — 맥에서 npm run library:bundle -- --hevc 가 구운 곳
 * 복사는 APFS 복제(clone)라 맥에서는 디스크를 더 안 쓰고 바로 끝난다. Xcode 에는 폴더 참조(파란 폴더) 하나로 넣어 하위 경로가 그대로 남는다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const NAME = 'LibraryVideos';
const KEY = /^[\w-]{1,64}\.mp4$/;

function sourceDir(projectRoot) {
  const dirs = [process.env.BP_LIBRARY_VIDEOS, path.join(projectRoot, NAME), path.join(os.homedir(), 'bullpen-library-bundle', 'hevc')];
  return dirs.find((d) => d && fs.existsSync(d) && fs.readdirSync(d).some((f) => KEY.test(f))) ?? null;
}

const withLibraryVideos = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const src = sourceDir(c.modRequest.projectRoot);
      const projectName = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
      const dest = path.join(c.modRequest.platformProjectRoot, projectName, NAME);
      /* 지난 prebuild 의 옛 영상이 남지 않게 늘 새로 */
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest, { recursive: true });
      if (!src) {
        console.warn(`[library-videos] 영상 폴더가 없어 영상 없이 굽는다 — 앱이 처음 볼 때 받는다`);
        return c;
      }
      let n = 0;
      let bytes = 0;
      for (const f of fs.readdirSync(src)) {
        if (!KEY.test(f)) continue;
        fs.copyFileSync(path.join(src, f), path.join(dest, f), fs.constants.COPYFILE_FICLONE);
        bytes += fs.statSync(path.join(dest, f)).size;
        n++;
      }
      console.log(`[library-videos] ${src} → ${n}개 · ${(bytes / 1048576).toFixed(0)}MB`);
      return c;
    },
  ]);

  /* 폴더가 비어 있어도 참조는 넣는다 — 빈 폴더면 앱 안 영상 0개(앱이 볼 때 받음) */
  config = withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const rel = `${projectName}/${NAME}`;
    const refOf = () =>
      Object.values(proj.pbxFileReferenceSection()).find((r) => r && typeof r === 'object' && String(r.path).replace(/"/g, '') === rel);
    if (!refOf()) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: rel, groupName: projectName, isBuildFile: true, project: proj });
    }
    /* addResourceFileToGroup 은 확장자로 종류를 정해 폴더를 모른다 — 폴더 참조로 바꿔야 LibraryVideos/<uuid>.mp4 경로가 앱 안에 남는다 */
    const ref = refOf();
    if (ref) {
      ref.lastKnownFileType = 'folder';
      /* 확장자 없는 경로라 비어 있는 칸(fileEncoding · explicitFileType)이 'undefined' 글자로 적히지 않게 */
      for (const k of Object.keys(ref)) if (ref[k] === undefined || ref[k] === 'undefined') delete ref[k];
    }
    return c;
  });
  return config;
};

module.exports = withLibraryVideos;
