/** Permission keys checked against the caller's effective role. */
export enum PermissionKey {
  GAMES_READ = 'games.read',
  GAMES_RESPOND = 'games.respond',
  REPORTS_WRITE = 'reports.write',
  CONNECTIONS_MANAGE = 'connections.manage',
  SYNC_RUN = 'sync.run',
  EMAIL_SEND = 'email.send',
  QUICK_LINKS_MANAGE = 'quick_links.manage',
  PLATFORM_MANAGE = 'platform.manage',
}
