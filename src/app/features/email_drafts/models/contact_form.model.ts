/** The add contact dialog form value. */
export interface IContactFormModel {
  display_name: string;
  email_address: string;
  /** True once the person has ticked the consent confirmation. */
  consent_attested: boolean;
}
