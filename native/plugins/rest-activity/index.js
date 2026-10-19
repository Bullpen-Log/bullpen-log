/**
 * 세트 사이 휴식 시계를 다이나믹 아일랜드 · 잠금 화면에(Live Activity) — 위젯 확장 타깃 'RestActivity' 를 prebuild 때 만든다.
 * ios/ 는 저장소에 없고 매번 prebuild 로 만들어서(로컬 · CI 둘 다) 손으로 고친 Xcode 프로젝트는 남지 않는다 — 그래서 config plugin.
 * Swift 는 ./ios, 앱 쪽 시작 · 고침 · 끝은 modules/bullpen-native(startRest · endRest).
 *
 * 묶음 ID: 앱은 $(BP_APP_ID), 확장은 $(BP_APP_ID).RestActivity. 폰에 다른 ID 로 굽을 때는 PRODUCT_BUNDLE_IDENTIFIER 가 아니라
 * BP_APP_ID=com.bullpenlog.app.dev 처럼 덮는다(PRODUCT_BUNDLE_IDENTIFIER 를 덮으면 확장도 같은 ID 가 돼 굽기가 막힌다).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const NAME = 'RestActivity';
const SWIFT = ['RestActivityAttributes.swift', 'RestActivityWidget.swift'];
const PLIST = `${NAME}-Info.plist`;

const withRestActivity = (config) => {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSSupportsLiveActivities = true;
    return c;
  });

  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, NAME);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of SWIFT) fs.copyFileSync(path.join(__dirname, 'ios', f), path.join(dir, f));
      /* 확장의 판 · 빌드 번호는 앱과 같아야 한다 — 앱 것을 글자 그대로(CI 는 빌드 번호를 굽기 전에 둘 다 고친다) */
      const plist = fs
        .readFileSync(path.join(__dirname, 'ios', PLIST), 'utf8')
        .replace('$(MARKETING_VERSION)', c.version ?? '1.0.0')
        .replace('$(CURRENT_PROJECT_VERSION)', c.ios?.buildNumber ?? '1');
      fs.writeFileSync(path.join(dir, PLIST), plist);
      return c;
    },
  ]);

  config = withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const appId = c.ios?.bundleIdentifier ?? 'com.bullpenlog.app';
    const objects = proj.hash.project.objects;
    const configsOf = (listId) =>
      objects.XCConfigurationList[listId].buildConfigurations.map((b) => objects.XCBuildConfiguration[b.value]);

    /* 앱 묶음 ID 를 BP_APP_ID 로 — 덮어 굽는 길을 하나로 */
    const app = proj.getFirstTarget();
    for (const cfg of configsOf(app.firstTarget.buildConfigurationList)) {
      cfg.buildSettings.BP_APP_ID = appId;
      cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = '"$(BP_APP_ID)"';
    }

    if (proj.pbxTargetByName(NAME)) return c;
    objects.PBXTargetDependency ??= {};
    objects.PBXContainerItemProxy ??= {};

    const target = proj.addTarget(NAME, 'app_extension', NAME, `${appId}.${NAME}`);
    const group = proj.addPbxGroup([...SWIFT, PLIST], NAME, NAME);
    const main = objects.PBXProject[proj.hash.project.rootObject].mainGroup;
    proj.addToPbxGroup(group.uuid, main);
    proj.addBuildPhase(SWIFT, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const team = configsOf(app.firstTarget.buildConfigurationList)[0].buildSettings.DEVELOPMENT_TEAM;
    for (const cfg of configsOf(target.pbxNativeTarget.buildConfigurationList)) {
      Object.assign(cfg.buildSettings, {
        BP_APP_ID: appId,
        PRODUCT_BUNDLE_IDENTIFIER: `"$(BP_APP_ID).${NAME}"`,
        INFOPLIST_FILE: `${NAME}/${PLIST}`,
        IPHONEOS_DEPLOYMENT_TARGET: '16.4',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
        CODE_SIGN_STYLE: 'Automatic',
        SDKROOT: 'iphoneos',
        GENERATE_INFOPLIST_FILE: 'NO',
        ENABLE_BITCODE: 'NO',
        ...(team ? { DEVELOPMENT_TEAM: team } : {}),
      });
    }
    return c;
  });

  return config;
};

module.exports = withRestActivity;
