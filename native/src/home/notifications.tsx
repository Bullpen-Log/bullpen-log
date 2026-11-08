import { useFocusRefresh } from '~/shell/tab-pager';
import { inboxStore, useInbox } from '~/notifications/store';

/** Home and the inbox subscribe to the same server-wide unread count. */
export function useUnreadNotifications(): number {
  const state = useInbox();
  useFocusRefresh(() => void inboxStore.count(), { first: true });
  return state.unread ?? 0;
}
export const resetNotificationList = inboxStore.reset;
