export type AsaasBillingType = 'UNDEFINED' | 'BOLETO' | 'CREDIT_CARD' | 'PIX';

export interface AsaasCustomerPayload {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  additionalEmails?: string;
  groupName?: string;
  foreignCustomer?: boolean;
}

export interface AsaasCustomer {
  id: string;
  object?: string;
  name?: string;
  email?: string;
  cpfCnpj?: string;
  externalReference?: string;
}

export interface AsaasPaymentPayload {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  daysAfterDueDateToRegistrationCancellation?: number;
  installmentCount?: number;
  totalValue?: number;
  installmentValue?: number;
  postalService?: boolean;
  callback?: {
    successUrl?: string;
    autoRedirect?: boolean;
  };
}

export interface AsaasPayment {
  id: string;
  object?: string;
  status?: string;
  value?: number;
  dueDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: AsaasBillingType;
  externalReference?: string;
}

export interface AsaasPixQrCode {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}
