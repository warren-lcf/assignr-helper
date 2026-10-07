import { IEnvironment } from './environment.model';

/**
 * Production environment. The Firebase web config is a set of public
 * identifiers that ship in every client bundle; it is not a secret.
 */
export const environment: IEnvironment = {
  production: true,
  firebase: {
    api_key: 'AIzaSyD1Ovhp7LQ4b_flEALmvMt_xgH_yy-YkQs',
    auth_domain: 'assignr-helper-prod.firebaseapp.com',
    project_id: 'assignr-helper-prod',
    app_id: '1:480126608992:web:a49733cc0f9f6f5e1f8505',
  },
  auth_emulator_url: null,
};
