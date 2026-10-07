import { TestBed } from '@angular/core/testing';
import { FirebaseAuthGateway } from './firebase_auth_gateway';

const mocks = vi.hoisted(() => {
  const auth: { currentUser: { getIdToken: () => Promise<string> } | null } = { currentUser: null };
  return {
    auth,
    initializeApp: vi.fn(() => ({ name: 'app' })),
    getAuth: vi.fn(() => auth),
    connectAuthEmulator: vi.fn(),
    signInWithEmailAndPassword: vi.fn(async () => undefined),
    signInWithPopup: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    unsubscribe: vi.fn(),
    on_state: null as null | ((user: unknown) => void),
    onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: unknown) => void) => {
      mocks.on_state = callback;
      return mocks.unsubscribe;
    }),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp }));
vi.mock('firebase/auth', () => ({
  getAuth: mocks.getAuth,
  connectAuthEmulator: mocks.connectAuthEmulator,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
  onAuthStateChanged: mocks.onAuthStateChanged,
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

describe('FirebaseAuthGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.currentUser = null;
  });

  it('initialises Firebase once and uses the Auth emulator in development', async () => {
    const gateway = TestBed.inject(FirebaseAuthGateway);

    await gateway.sign_in_with_email('a@b.test', 'pw');
    await gateway.sign_out();

    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'demo-assignr-helper' }),
    );
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(mocks.auth, 'http://localhost:9099', {
      disableWarnings: true,
    });
  });

  it('signs in with email and password', async () => {
    await TestBed.inject(FirebaseAuthGateway).sign_in_with_email('a@b.test', 'pw');

    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(mocks.auth, 'a@b.test', 'pw');
  });

  it('signs in with Google through a popup', async () => {
    await TestBed.inject(FirebaseAuthGateway).sign_in_with_google();

    expect(mocks.signInWithPopup).toHaveBeenCalledWith(mocks.auth, expect.anything());
  });

  it('signs out', async () => {
    await TestBed.inject(FirebaseAuthGateway).sign_out();

    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('reads the id token, or null when nobody is signed in', async () => {
    const gateway = TestBed.inject(FirebaseAuthGateway);
    expect(await gateway.get_id_token()).toBeNull();

    mocks.auth.currentUser = { getIdToken: async () => 'tok' };

    expect(await gateway.get_id_token()).toBe('tok');
  });

  it('reports user changes as app users and returns the unsubscribe function', async () => {
    const changes: unknown[] = [];

    const stop = await TestBed.inject(FirebaseAuthGateway).watch_user((user) => changes.push(user));
    mocks.on_state?.({ uid: 'u1', displayName: 'Alex Referee', email: 'a@b.test', photoURL: null });
    mocks.on_state?.({ uid: 'u2', displayName: null, email: 'c@d.test', photoURL: 'p.png' });
    mocks.on_state?.(null);

    expect(changes).toEqual([
      { uid: 'u1', display_name: 'Alex Referee', email: 'a@b.test', avatar_url: null },
      { uid: 'u2', display_name: 'c@d.test', email: 'c@d.test', avatar_url: 'p.png' },
      null,
    ]);
    stop();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
