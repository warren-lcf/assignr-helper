/**
 * Optional features a scheduling provider may support. The UI hides any action
 * whose capability the connection's provider does not declare.
 */
export enum ProviderCapability {
  OPEN_GAMES = 'OPEN_GAMES',
  ASSIGNMENT_RESPONSE = 'ASSIGNMENT_RESPONSE',
  GAME_REQUEST = 'GAME_REQUEST',
  AVAILABILITY = 'AVAILABILITY',
  WEBHOOKS = 'WEBHOOKS',
  MATCH_REPORT_SUBMIT = 'MATCH_REPORT_SUBMIT',
}
