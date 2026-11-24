import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PostalAddress } from "@haru/contracts";
@Injectable()
export class PostalService {
  /** Consulta endereço, não frete. Host fixo e validação impedem URLs arbitrárias. */
  async lookup(cep: string): Promise<PostalAddress> {
    if (!/^\d{8}$/.test(cep))
      throw new BadRequestException("CEP deve conter oito números");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("upstream");
      const data = await response.json();
      if (data.erro) throw new NotFoundException("CEP não encontrado");
      if (typeof data.localidade !== "string" || !/^[A-Z]{2}$/.test(data.uf))
        throw new Error("invalid response");
      return {
        cep,
        city: data.localidade,
        state: data.uf,
        shippingAvailable: false,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException(
        "Consulta de CEP indisponível. Tente novamente.",
      );
    }
  }
}
