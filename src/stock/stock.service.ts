import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

const execFileAsync = promisify(execFile);

const STATUS_INVEST_BASE_URL =
  'https://statusinvest.com.br/fundos-imobiliarios';
const STATUS_INVEST_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://statusinvest.com.br/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

export interface StockPositionInput {
  ticker: string;
  shares: number;
}

export interface ExpectativeDividendAsset {
  name: string;
  dividend: number;
  cotesQuantity: number;
}

export interface ExpectativeDividendMonth {
  source: 'statusinvest';
  referenceMonth: number;
  dividendTotal: number;
  assets: ExpectativeDividendAsset[];
}

interface StatusInvestResult {
  v?: number;
  et?: string;
  ed?: string;
  pd?: string;
}

interface StatusInvestDividend {
  value: number;
  referenceDate: string;
  paymentDate: string;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  async getExpectativeDividendMonth(
    positions: StockPositionInput[],
  ): Promise<ExpectativeDividendMonth> {
    const quantities = this.groupFiiPositions(positions);
    const symbols = [...quantities.keys()];
    const rates: Array<readonly [string, number]> = [];
    // O StatusInvest pode limitar requisições simultâneas originadas do IP
    // compartilhado do Cloud Run. Processamos em pequenos lotes para evitar
    // que uma importação de vários FIIs resulte em 502.
    for (let index = 0; index < symbols.length; index += 2) {
      const batch = symbols.slice(index, index + 2);
      rates.push(
        ...(await Promise.all(
          batch.map(
            async (symbol) =>
              [symbol, await this.fetchDividendRate(symbol)] as const,
          ),
        )),
      );
      if (index + 2 < symbols.length) await this.sleep(150);
    }
    const ratesBySymbol = new Map(rates);
    const assets = symbols.map((name) => ({
      name,
      dividend: ratesBySymbol.get(name) ?? 0,
      cotesQuantity: quantities.get(name) ?? 0,
    }));

    return {
      source: 'statusinvest' as const,
      referenceMonth: new Date().getMonth() + 1,
      dividendTotal: assets.reduce(
        (total, asset) => total + asset.dividend * asset.cotesQuantity,
        0,
      ),
      assets,
    };
  }

  private groupFiiPositions(
    positions: StockPositionInput[],
  ): Map<string, number> {
    const quantities = new Map<string, number>();
    for (const position of positions) {
      if (
        typeof position.ticker !== 'string' ||
        !/^[A-Z]{4}11$/.test(position.ticker.trim().toUpperCase()) ||
        typeof position.shares !== 'number' ||
        !Number.isFinite(position.shares) ||
        position.shares < 0
      ) {
        throw new BadRequestException('Posição de FII inválida.');
      }

      const symbol = position.ticker.trim().toUpperCase();
      quantities.set(symbol, (quantities.get(symbol) ?? 0) + position.shares);
    }
    return quantities;
  }

  private async fetchDividendRate(symbol: string): Promise<number> {
    const url = `${STATUS_INVEST_BASE_URL}/${symbol.toLowerCase()}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const { stdout } = await execFileAsync(
          'curl',
          [
            '--silent',
            '--show-error',
            '--location',
            '--compressed',
            '--max-time',
            '12',
            '--user-agent',
            STATUS_INVEST_HEADERS['User-Agent'],
            '--header',
            `Accept: ${STATUS_INVEST_HEADERS.Accept}`,
            '--header',
            `Accept-Language: ${STATUS_INVEST_HEADERS['Accept-Language']}`,
            '--referer',
            STATUS_INVEST_HEADERS.Referer,
            '--write-out',
            '\n%{http_code}',
            url,
          ],
          { maxBuffer: 2 * 1024 * 1024 },
        );
        const statusSeparator = stdout.lastIndexOf('\n');
        const html = stdout.slice(0, statusSeparator);
        const status = Number(stdout.slice(statusSeparator + 1));
        if (!status || status >= 400) throw new Error(`Status HTTP ${status}`);

        const dividends = this.parseStatusInvestDividends(html).slice(0, 5);
        return this.getMostFrequentRate(dividends);
      } catch (error) {
        lastError = error;
        if (attempt < 3) await this.sleep(attempt * 500);
      }
    }

    this.logger.warn(
      `Não foi possível consultar dividendos de ${symbol}; usando zero nesta resposta.`,
      lastError instanceof Error ? lastError.message : String(lastError),
    );
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseStatusInvestDividends(html: string): StatusInvestDividend[] {
    const inputMatch = html.match(/<input\b[^>]*\bid=["']results["'][^>]*>/i);
    if (!inputMatch?.[0]) {
      throw new Error('Campo results não encontrado.');
    }

    const valueMatch = inputMatch[0].match(/\bvalue=["']([^"']*)["']/i);
    if (!valueMatch?.[1]) {
      throw new Error('Valor do campo results não encontrado.');
    }
    const decoded = valueMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    let results: StatusInvestResult[];
    try {
      const parsed: unknown = JSON.parse(decoded);
      if (!Array.isArray(parsed)) throw new Error('Formato inválido.');
      results = parsed as StatusInvestResult[];
    } catch {
      throw new Error('Histórico de dividendos inválido.');
    }

    const validResults = results
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

    return validResults;
  }

  private getMostFrequentRate(dividends: StatusInvestDividend[]): number {
    const counts = new Map<number, number>();
    let mode = 0;
    let modeCount = 0;

    for (const dividend of dividends) {
      const count = (counts.get(dividend.value) ?? 0) + 1;
      counts.set(dividend.value, count);
      if (count > modeCount) {
        mode = dividend.value;
        modeCount = count;
      }
    }

    return mode;
  }

  private parseBrazilianDate(value: string): number {
    const [day, month, year] = value.split('/').map(Number);
    if (!day || !month || !year) return 0;
    return new Date(year, month - 1, day).getTime();
  }
}
