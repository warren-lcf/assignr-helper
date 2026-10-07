import { INavDefinition } from '../models/nav_definition.model';

/** The main navigation, in display order. The first entry is the landing page. */
export const NAV_DEFINITIONS: readonly INavDefinition[] = [
  { path: 'games', label: 'Games', icon: 'sports_soccer' },
  { path: 'my-schedule', label: 'My Schedule', icon: 'event' },
  { path: 'availability', label: 'Availability', icon: 'event_available' },
  { path: 'match-reports', label: 'Match Reports', icon: 'assignment' },
  { path: 'email-drafts', label: 'Email Drafts', icon: 'mail' },
  { path: 'quick-links', label: 'Quick Links', icon: 'link' },
  { path: 'statements', label: 'Statements', icon: 'payments' },
  { path: 'connections', label: 'Connections', icon: 'sync_alt' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];
