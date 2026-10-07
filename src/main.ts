import { bootstrapApplication } from '@angular/platform-browser';
import { app_config } from './app/app.config';
import { AppComponent } from './app/core/components/app/app.component';

bootstrapApplication(AppComponent, app_config).catch((error: unknown) =>
  console.error('Application bootstrap failed', error),
);
