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

// BrAPI como fallback quando StatusInvest bloqueia (403)
const BRAPI_BASE_URL = 'https://brapi.dev/api/quote';

interface BrapiDividend {
  date: string;
  rate: number;
}

interface BrapiQuote {
  dividendsData?: {
    dividends?: BrapiDividend[];
  };
}

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

interface CacheEntry {
  value: number;
  expiresAt: number;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  // Cache em memória com TTL de 6 horas (dividendos não mudam com frequência)
  private readonly dividendCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

  async getExpectativeDividendMonth(
    positions: StockPositionInput[],
  ): Promise<ExpectativeDividendMonth> {
    const quantities = this.groupFiiPositions(positions);
    const symbols = [...quantities.keys()];
    const rates: Array<readonly [string, number]> = [];

    // Limpa cache expirado antes de processar
    this.cleanExpiredCache();

    this.logger.log(
      `Processando ${symbols.length} símbolos. Cache tem ${this.dividendCache.size} entradas.`,
    );

    // O StatusInvest bloqueia IPs do Cloud Run com 403. Usamos cache agressivo
    // e processamos apenas 1 símbolo por vez com delay de 2s entre requisições
    // para minimizar detecção de bot.
    let cacheHits = 0;
    let cacheMisses = 0;

    for (let index = 0; index < symbols.length; index += 1) {
      const symbol = symbols[index];
      const wasCached = this.dividendCache.has(symbol) &&
        this.dividendCache.get(symbol)!.expiresAt > Date.now();

      rates.push([symbol, await this.fetchDividendRate(symbol)] as const);

      if (wasCached) {
        cacheHits++;
      } else {
        cacheMisses++;
        // Delay maior entre requisições NOVAS para evitar rate limiting
        // (não precisa delay para cache hits)
        if (index + 1 < symbols.length) {
          await this.sleep(2000); // 2 segundos entre cada requisição nova
        }
      }
    }

    this.logger.log(
      `Processamento concluído: ${cacheHits} cache hits, ${cacheMisses} requisições novas`,
    );
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

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [symbol, entry] of this.dividendCache.entries()) {
      if (entry.expiresAt < now) {
        this.dividendCache.delete(symbol);
      }
    }
  }

  private async fetchDividendRate(symbol: string): Promise<number> {
    // Verifica cache primeiro
    const cached = this.dividendCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Cache hit para ${symbol}: ${cached.value}`);
      return cached.value;
    }

    // Tenta StatusInvest primeiro (mais rápido quando funciona)
    const statusInvestRate = await this.tryStatusInvest(symbol);
    if (statusInvestRate !== null) {
      // Salva no cache
      this.dividendCache.set(symbol, {
        value: statusInvestRate,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return statusInvestRate;
    }

    // Fallback: tenta BrAPI se StatusInvest falhou
    this.logger.log(`Tentando BrAPI como fallback para ${symbol}...`);
    const brapiRate = await this.tryBrapi(symbol);
    if (brapiRate !== null) {
      // Salva no cache
      this.dividendCache.set(symbol, {
        value: brapiRate,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      return brapiRate;
    }

    // Se ambos falharam, retorna 0
    this.logger.error(`Todas as fontes falharam para ${symbol}; usando zero.`);
    return 0;
  }

  private async tryStatusInvest(symbol: string): Promise<number | null> {
    const url = `${STATUS_INVEST_BASE_URL}/${symbol.toLowerCase()}`;
    let lastError: unknown;

    // Apenas 1 tentativa para StatusInvest (se falhar, vai para BrAPI)
    for (let attempt = 1; attempt <= 1; attempt += 1) {
      try {
        const { stdout } = await execFileAsync(
          'curl',
          [
            '--silent',
            '--show-error',
            '--location',
            '--compressed',
            '--max-time',
            '15', // Aumentado de 12 para 15 segundos
            '--user-agent',
            STATUS_INVEST_HEADERS['User-Agent'],
            '--header',
            `Accept: ${STATUS_INVEST_HEADERS.Accept}`,
            '--header',
            `Accept-Language: ${STATUS_INVEST_HEADERS['Accept-Language']}`,
            '--referer',
            STATUS_INVEST_HEADERS.Referer,
            '--header',
            'Cache-Control: no-cache',
            '--header',
            'Pragma: no-cache',
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
        const rate = this.getMostFrequentRate(dividends);

        this.logger.log(`StatusInvest: Dividendo de ${symbol} = ${rate}`);
        return rate;
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Se for 403, não tenta novamente (IP bloqueado)
        if (errorMsg.includes('403')) {
          this.logger.warn(`StatusInvest bloqueou requisição (403) para ${symbol}`);
          return null;
        }

        this.logger.warn(`StatusInvest falhou para ${symbol}: ${errorMsg}`);
        return null;
      }
    }

    return null;
  }

  private async tryBrapi(symbol: string): Promise<number | null> {
    try {
      // BrAPI usa fetch nativo (mais simples, não precisa curl)
      const response = await fetch(
        `${BRAPI_BASE_URL}/${symbol}?range=1y&interval=1mo&dividends=true`,
        {
          headers: {
            'User-Agent': 'InvestWealth/1.0',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`BrAPI status ${response.status}`);
      }

      const data = (await response.json()) as { results?: BrapiQuote[] };
      const quote = data.results?.[0];
      const dividends = quote?.dividendsData?.dividends;

      if (!dividends || dividends.length === 0) {
        this.logger.warn(`BrAPI: Sem dados de dividendos para ${symbol}`);
        return null;
      }

      // Pega os últimos 5 dividendos e calcula a moda
      const recentDividends = dividends
        .slice(-5)
        .map((d) => d.rate)
        .filter((rate) => typeof rate === 'number' && rate > 0);

      if (recentDividends.length === 0) {
        return null;
      }

      // Calcula a moda (valor mais frequente)
      const counts = new Map<number, number>();
      let mode = 0;
      let modeCount = 0;

      for (const rate of recentDividends) {
        const count = (counts.get(rate) ?? 0) + 1;
        counts.set(rate, count);
        if (count > modeCount) {
          mode = rate;
          modeCount = count;
        }
      }

      this.logger.log(`BrAPI: Dividendo de ${symbol} = ${mode}`);
      return mode;
    } catch (error) {
      this.logger.warn(
        `BrAPI falhou para ${symbol}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
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
