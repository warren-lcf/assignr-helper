import { IEnvironment } from './environment.model';

/** Development environment: the Firebase Auth emulator with a demo project (no real credentials). */
export const environment: IEnvironment = {
  production: false,
  firebase: {
    api_key: 'demo-api-key',
    auth_domain: 'demo-assignr-helper.firebaseapp.com',
    project_id: 'demo-assignr-helper',
    app_id: 'demo-app-id',
  },
  auth_emulator_url: 'http://localhost:9099',
};
