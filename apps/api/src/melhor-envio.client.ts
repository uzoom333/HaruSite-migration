import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseService } from "./database.service";

const HOSTS = {
  sandbox: "https://sandbox.melhorenvio.com.br",
  production: "https://melhorenvio.com.br",
} as const;
const SCOPES =
  "shipping-calculate cart-read cart-write shipping-checkout shipping-generate shipping-print shipping-tracking orders-read";
const DAY = 86400000;

/** A requisição pode ter sido processada do outro lado: não repetir sem conferir. */
export class UnknownOutcomeError extends ServiceUnavailableException {}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
const sha = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class MelhorEnvioClient {
  private refreshing?: Promise<string>;
  constructor(private readonly db: DatabaseService) {}

  get environment(): keyof typeof HOSTS {
    const value = process.env.MELHOR_ENVIO_ENV || "sandbox";
    if (value !== "sandbox" && value !== "production")
      throw new ServiceUnavailableException("MELHOR_ENVIO_ENV inválida");
    return value;
  }
  private required(name: string): string {
    const value = process.env[name];
    if (!value) throw new ServiceUnavailableException(`${name} não configurada`);
    return value;
  }

  /** Início do OAuth. O state é de uso único e expira em dez minutos. */
  authorizeUrl(): string {
    const state = randomBytes(32).toString("hex");
    this.db.run("DELETE FROM oauth_states WHERE expires_at<?", [Date.now()]);
    this.db.run("INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)", [
      sha(state),
      Date.now() + 600000,
    ]);
    const query = new URLSearchParams({
      client_id: this.required("MELHOR_ENVIO_CLIENT_ID"),
      redirect_uri: this.required("MELHOR_ENVIO_REDIRECT_URI"),
      response_type: "code",
      state,
      scope: SCOPES,
    });
    return `${HOSTS[this.environment]}/oauth/authorize?${query}`;
  }
  async finishAuthorization(code: string, state: string): Promise<void> {
    const { changes } = this.db.run(
      "DELETE FROM oauth_states WHERE state_hash=? AND expires_at>=?",
      [sha(state), Date.now()],
    );
    if (!changes) throw new BadRequestException("Autorização inválida ou expirada");
    await this.requestToken({
      grant_type: "authorization_code",
      redirect_uri: this.required("MELHOR_ENVIO_REDIRECT_URI"),
      code,
    });
  }
  private async requestToken(fields: Record<string, string>): Promise<string> {
    let data: { access_token?: string; refresh_token?: string; expires_in?: number };
    try {
      const response = await fetch(`${HOSTS[this.environment]}/oauth/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": this.required("MELHOR_ENVIO_USER_AGENT"),
        },
        body: JSON.stringify({
          client_id: this.required("MELHOR_ENVIO_CLIENT_ID"),
          client_secret: this.required("MELHOR_ENVIO_CLIENT_SECRET"),
          ...fields,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("oauth");
      data = await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Autorização do Melhor Envio falhou");
    }
    if (!data.access_token || !data.refresh_token || !data.expires_in)
      throw new ServiceUnavailableException("Resposta de autorização inválida");
    this.db.run(
      `INSERT INTO oauth_tokens(environment,access_token,refresh_token,expires_at) VALUES(?,?,?,?)
       ON CONFLICT(environment) DO UPDATE SET access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at`,
      [
        this.environment,
        data.access_token,
        data.refresh_token,
        Date.now() + data.expires_in * 1000,
      ],
    );
    return data.access_token;
  }
  /** Uma renovação por vez: o refresh token pode ser trocado a cada uso. */
  private refresh(row: TokenRow): Promise<string> {
    this.refreshing ??= this.requestToken({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }).finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  private row(): TokenRow | undefined {
    return this.db.first<TokenRow>(
      "SELECT access_token,refresh_token,expires_at FROM oauth_tokens WHERE environment=?",
      [this.environment],
    );
  }
  private async token(): Promise<string> {
    if (process.env.MELHOR_ENVIO_TOKEN) return process.env.MELHOR_ENVIO_TOKEN;
    const row = this.row();
    if (!row) throw new ServiceUnavailableException("Melhor Envio não conectado");
    // Renova com folga: o refresh token vale mais que o de acesso, mas também expira.
    return row.expires_at - Date.now() < 5 * DAY ? this.refresh(row) : row.access_token;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const agent = this.required("MELHOR_ENVIO_USER_AGENT");
    const send = async (token: string) => {
      try {
        return await fetch(`${HOSTS[this.environment]}/api/v2/me/${path}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "User-Agent": agent,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new UnknownOutcomeError("Melhor Envio não respondeu");
      }
    };
    const used = await this.token();
    let response = await send(used);
    if (response.status === 401 && !process.env.MELHOR_ENVIO_TOKEN) {
      const row = this.row()!;
      // Outra requisição pode já ter renovado enquanto esta esperava.
      response = await send(
        row.access_token !== used ? row.access_token : await this.refresh(row),
      );
    }
    if (response.status >= 500)
      throw new UnknownOutcomeError("Melhor Envio indisponível");
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new UnknownOutcomeError("Resposta inválida do Melhor Envio");
    }
    if (response.status === 400 || response.status === 422)
      throw new UnprocessableEntityException({
        message: "Melhor Envio recusou os dados",
        details: data,
      });
    if (!response.ok)
      throw new ServiceUnavailableException("Melhor Envio recusou a requisição");
    return data as T;
  }
}
