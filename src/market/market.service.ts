import { BadGatewayException, Injectable } from '@nestjs/common';

const STATUS_INVEST_BASE_URL =
  'https://statusinvest.com.br/fundos-imobiliarios';

export interface FiiDividend {
  value: number;
  referenceDate: string;
  paymentDate: string;
}

interface StatusInvestResult {
  v?: number;
  et?: string;
  ed?: string;
  pd?: string;
}

@Injectable()
export class MarketService {
  async getFiiDividends(ticker: string): Promise<{ dividends: FiiDividend[] }> {
    const normalizedTicker = ticker.toLowerCase();

    try {
      const response = await fetch(
        `${STATUS_INVEST_BASE_URL}/${normalizedTicker}`,
      );
      if (!response.ok) throw new Error(`Status ${response.status}`);

      const html = await response.text();
      return { dividends: this.parseStatusInvestDividends(html).slice(0, 5) };
    } catch {
      throw new BadGatewayException(
        'Não foi possível consultar os dividendos no Status Invest.',
      );
    }
  }

  private parseStatusInvestDividends(html: string): FiiDividend[] {
    const match = html.match(
      /<input[^>]*id=["']results["'][^>]*value=["']([^"']*)["'][^>]*>/i,
    );
    if (!match?.[1]) throw new Error('Campo de dividendos não encontrado.');

    let results: StatusInvestResult[];
    try {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/gi, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const parsed: unknown = JSON.parse(decoded);
      if (!Array.isArray(parsed)) throw new Error('Formato inválido.');
      results = parsed as StatusInvestResult[];
    } catch {
      throw new Error('Histórico de dividendos inválido.');
    }

    return results
      .filter(
        (
          result,
        ): result is StatusInvestResult & {
          v: number;
          ed: string;
          pd: string;
        } =>
          result.et?.toLowerCase() === 'rendimento' &&
          typeof result.v === 'number' &&
          Number.isFinite(result.v) &&
          typeof result.ed === 'string' &&
          typeof result.pd === 'string',
      )
      .sort(
        (a, b) => this.parseBrazilianDate(b.ed) - this.parseBrazilianDate(a.ed),
      )
      .map((result) => ({
        value: result.v,
        referenceDate: result.ed,
        paymentDate: result.pd,
      }));
  }

  private parseBrazilianDate(value: string): number {
    const [day, month, year] = value.split('/').map(Number);
    if (!day || !month || !year) return 0;
    return new Date(year, month - 1, day).getTime();
  }
}
