export interface TenderResponse {
  tender: {
    name: string;
    number: string;
    type: string;
    price: string;
    currency: string;
    application_deadline: string;
    auction_date: string;
  };
  customer: {
    name: string;
    inn: string;
    ogrn: string;
    address: string;
    contacts: string;
  };
  delivery_terms: {
    delivery_period: {
      type: string;
      value: string;
    };
    delivery_location: string;
    payment_terms: {
      prepayment_percent: number;
      payment_days: number;
    };
    application_security: {
      amount: number | null;
      percent: number | null;
    };
    contract_security: {
      amount: number | null;
      percent: number | null;
    };
  };
  items: Array<{
    name: string;
    quantity: {
      value: string;
      unit: string;
    };
    specifications: Record<string, string>;
    requirements: string[];
    estimated_price: number | null;
  }>;
  special_conditions: {
    requirements_for_participants: string[];
    penalties: string[];
    other_conditions: string[];
  };
}
