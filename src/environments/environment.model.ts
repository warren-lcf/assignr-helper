/** Firebase web app configuration (public identifiers, not secrets). */
export interface IFirebaseWebConfig {
  api_key: string;
  auth_domain: string;
  project_id: string;
  app_id: string;
}

/** Build-time environment for the Angular app. */
export interface IEnvironment {
  production: boolean;
  firebase: IFirebaseWebConfig;
  /** Auth emulator URL, or null to use real Firebase Auth. */
  auth_emulator_url: string | null;
}
