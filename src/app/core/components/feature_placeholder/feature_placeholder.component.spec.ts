import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../services/translation/app_translation.service';
import { FeaturePlaceholderComponent } from './feature_placeholder.component';

describe('FeaturePlaceholderComponent', () => {
  function render(title: string) {
    TestBed.configureTestingModule({
      imports: [FeaturePlaceholderComponent],
      providers: [
        {
          provide: AppTranslationService,
          useValue: { translate: (key: string) => (key === 'Games' ? 'Matches' : key) },
        },
      ],
    });
    const fixture = TestBed.createComponent(FeaturePlaceholderComponent);
    fixture.componentRef.setInput('title', title);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the translated page title and a coming-soon empty state', () => {
    const element = render('Games');

    expect(element.textContent).toContain('Matches');
    expect(element.textContent).toContain('Coming soon');
    expect(element.textContent).toContain('This screen is not built yet.');
  });

  it('uses the page container and empty state from the ui-kit', () => {
    const element = render('Settings');

    expect(element.querySelector('hch-page-container')).not.toBeNull();
    expect(element.querySelector('hch-empty-state')).not.toBeNull();
  });
});
