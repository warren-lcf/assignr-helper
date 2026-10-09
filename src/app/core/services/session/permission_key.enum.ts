/** Permission keys the API reports for the signed-in user's effective role. Mirrors the backend. */
export enum PermissionKey {
  GAMES_READ = 'games.read',
  GAMES_RESPOND = 'games.respond',
  REPORTS_WRITE = 'reports.write',
  CONNECTIONS_MANAGE = 'connections.manage',
  SYNC_RUN = 'sync.run',
  EMAIL_SEND = 'email.send',
  QUICK_LINKS_MANAGE = 'quick_links.manage',
  CALENDAR_FEED_MANAGE = 'calendar_feed.manage',
  PLATFORM_MANAGE = 'platform.manage',
}
