class BitrixService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.BITRIX_BASE_URL || '';
    this.apiKey = process.env.BITRIX_API_KEY || '';
  }
}

export default BitrixService;
