import 'server-only';
/**
 * 앱(/api/rpc)이 부를 수 있는 서버 액션 모듈 — 허용 목록. 이름은 '<파일>.<함수>'(예: 'auth.login').
 *
 * 서버 액션('use server' 파일의 export)은 이미 누구나 POST 로 부를 수 있는 입구이고 각자 로그인 · 권한을 확인한다(requireUser ·
 * requireAdmin). 여기 넣는다고 열리는 면이 늘지 않는다 — 그래서 모듈째 넣는다. analysis.tsx 는 화면 조각(JSX)을 돌려줘 앱이 못 써서 뺐다.
 * 새 액션 파일을 만들면 여기에 한 줄 더한다(빠뜨리면 앱에서 'unknown-action').
 */
import * as abs from '@/app/actions/abs';
import * as admin from '@/app/actions/admin';
import * as app from '@/app/actions/app';
import * as appAdmin from '@/app/actions/app-admin';
import * as appShoot from '@/app/actions/app-shoot';
import * as appAnalysis from '@/app/actions/app-analysis';
import * as appArmcare from '@/app/actions/app-armcare';
import * as appLibrary from '@/app/actions/app-library';
import * as appMechanics from '@/app/actions/app-mechanics';
import * as appNutrition from '@/app/actions/app-nutrition';
import * as appTraining from '@/app/actions/app-training';
import * as appTrainingParts from '@/app/actions/app-training-parts';
import * as appWorkout from '@/app/actions/app-workout';
import * as armcare from '@/app/actions/armcare';
import * as auth from '@/app/actions/auth';
import * as board from '@/app/actions/board';
import * as calendarEvent from '@/app/actions/calendar-event';
import * as checkin from '@/app/actions/checkin';
import * as community from '@/app/actions/community';
import * as content from '@/app/actions/content';
import * as dayCards from '@/app/actions/day-cards';
import * as exerciseHistory from '@/app/actions/exercise-history';
import * as exerciseLog from '@/app/actions/exercise-log';
import * as exerciseNote from '@/app/actions/exercise-note';
import * as favorite from '@/app/actions/favorite';
import * as featuredVideo from '@/app/actions/featured-video';
import * as mechanics from '@/app/actions/mechanics';
import * as nutrition from '@/app/actions/nutrition';
import * as onboardingState from '@/app/actions/onboarding-state';
import * as org from '@/app/actions/org';
import * as orgCalendar from '@/app/actions/org-calendar';
import * as orgJoin from '@/app/actions/org-join';
import * as orgNotes from '@/app/actions/org-notes';
import * as orgNotices from '@/app/actions/org-notices';
import * as orgRecord from '@/app/actions/org-record';
import * as orgReport from '@/app/actions/org-report';
import * as patchNote from '@/app/actions/patch-note';
import * as pitchLab from '@/app/actions/pitch-lab';
import * as pitchSetup from '@/app/actions/pitch-setup';
import * as planEdit from '@/app/actions/plan-edit';
import * as profile from '@/app/actions/profile';
import * as program from '@/app/actions/program';
import * as rehab from '@/app/actions/rehab';
import * as shoot from '@/app/actions/shoot';
import * as support from '@/app/actions/support';
import * as trainingDays from '@/app/actions/training-days';
import * as trainingSetup from '@/app/actions/training-setup';
import * as velocity from '@/app/actions/velocity';
import * as velocityAdmin from '@/app/actions/velocity-admin';
import * as velocityRecording from '@/app/actions/velocity-recording';
import * as warmup from '@/app/actions/warmup';
import * as workout from '@/app/actions/workout';

export const RPC_MODULES: Record<string, Record<string, unknown>> = {
  abs: abs,
  admin: admin,
  app: app,
  'app-admin': appAdmin,
  'app-shoot': appShoot,
  'app-analysis': appAnalysis,
  'app-armcare': appArmcare,
  'app-library': appLibrary,
  'app-mechanics': appMechanics,
  'app-nutrition': appNutrition,
  'app-training': appTraining,
  'app-training-parts': appTrainingParts,
  'app-workout': appWorkout,
  armcare: armcare,
  auth: auth,
  board: board,
  'calendar-event': calendarEvent,
  checkin: checkin,
  community: community,
  content: content,
  'day-cards': dayCards,
  'exercise-history': exerciseHistory,
  'exercise-log': exerciseLog,
  'exercise-note': exerciseNote,
  favorite: favorite,
  'featured-video': featuredVideo,
  mechanics: mechanics,
  nutrition: nutrition,
  'onboarding-state': onboardingState,
  org: org,
  'org-calendar': orgCalendar,
  'org-join': orgJoin,
  'org-notes': orgNotes,
  'org-notices': orgNotices,
  'org-record': orgRecord,
  'org-report': orgReport,
  'patch-note': patchNote,
  'pitch-lab': pitchLab,
  'pitch-setup': pitchSetup,
  'plan-edit': planEdit,
  profile: profile,
  program: program,
  rehab: rehab,
  shoot: shoot,
  support: support,
  'training-days': trainingDays,
  'training-setup': trainingSetup,
  velocity: velocity,
  'velocity-admin': velocityAdmin,
  'velocity-recording': velocityRecording,
  warmup: warmup,
  workout: workout,
};
