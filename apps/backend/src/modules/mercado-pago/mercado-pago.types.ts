export interface MercadoPagoPixPaymentPayload {
  transactionAmount: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerDocumentType?: 'CPF' | 'CNPJ';
  payerDocumentNumber?: string;
  externalReference?: string;
  notificationUrl?: string;
  idempotencyKey?: string;
}

export interface MercadoPagoPayment {
  id: number;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  date_created?: string;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
}

export interface MercadoPagoPixQrCode {
  encodedImage?: string;
  payload?: string;
  ticketUrl?: string;
}
