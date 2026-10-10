/** State of a tenant's calendar feed as the API reports it. A revoked feed has no row, so it reads as no feed at all. */
export enum CalendarFeedStatus {
  /** The subscription link works. */
  ACTIVE = 'ACTIVE',
}
