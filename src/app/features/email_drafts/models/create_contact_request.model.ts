/** Body of the create contact request. */
export interface ICreateContactRequest {
  display_name: string;
  email_address: string;
  /** Always true: the person adding the contact confirms the contact agreed to these emails. */
  consent_attested: true;
}
