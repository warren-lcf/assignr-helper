/** The signed-in person as the app sees them. */
export interface IAuthUser {
  uid: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
}
