import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger(MarketService.name);

  async getFiiDividends(ticker: string): Promise<{ dividends: FiiDividend[] }> {
    const normalizedTicker = ticker.toLowerCase();
    const url = `${STATUS_INVEST_BASE_URL}/${normalizedTicker}`;
    let lastError: unknown;

    // Retry logic: 3 tentativas com backoff exponencial
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

        if (!status || status >= 400) {
          throw new Error(`Status HTTP ${status}`);
        }

        const dividends = this.parseStatusInvestDividends(html).slice(0, 5);
        return { dividends };
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Tentativa ${attempt}/3 falhou para ${normalizedTicker}:`,
          error instanceof Error ? error.message : String(error),
        );
        // Aguarda antes de tentar novamente (backoff exponencial)
        if (attempt < 3) {
          await this.sleep(attempt * 500);
        }
      }
    }

    // Após 3 tentativas, lança exceção
    this.logger.error(
      `Falha ao consultar dividendos de ${normalizedTicker} após 3 tentativas`,
      lastError instanceof Error ? lastError.stack : String(lastError),
    );
    throw new BadGatewayException(
      'Não foi possível consultar os dividendos no Status Invest.',
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
