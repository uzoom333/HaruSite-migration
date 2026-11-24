import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { MelhorEnvioClient } from "./melhor-envio.client";
import { ShipmentService } from "./shipment.service";
import { ShippingService } from "./shipping.service";

export class QuoteItemDto {
  @IsString() @Matches(/^[a-z0-9-]{1,60}$/) slug!: string;
  @IsInt() @Min(1) @Max(9) quantity!: number;
}
export class QuoteDto {
  @IsString() @Matches(/^\d{8}$/) cep!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}
export class RecipientDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Matches(/^\d{11}$/) document!: string;
  @IsOptional() @IsString() @Matches(/^\d{10,11}$/) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @Length(1, 120) address!: string;
  @IsString() @Length(1, 20) number!: string;
  @IsOptional() @IsString() @Length(0, 80) complement?: string;
  @IsString() @Length(1, 80) district!: string;
  @IsString() @Length(1, 80) city!: string;
  @IsString() @Matches(/^[A-Z]{2}$/) uf!: string;
  @IsString() @Matches(/^\d{8}$/) cep!: string;
}
export class CreateShipmentDto {
  @IsString() @Matches(/^[A-Za-z0-9-]{1,60}$/) reference!: string;
  @IsInt() @Min(1) serviceId!: number;
  @ValidateNested() @Type(() => RecipientDto) to!: RecipientDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];
}
const sameText = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const key = process.env.ADMIN_KEY ?? "";
    const sent = context.switchToHttp().getRequest<Request>().headers.authorization ?? "";
    // Sem chave forte configurada, as rotas administrativas ficam fechadas.
    if (key.length < 32 || !sameText(sent, `Bearer ${key}`))
      throw new UnauthorizedException();
    return true;
  }
}

@Controller("shipping")
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}
  @Post("quote") @HttpCode(200) @Throttle({ default: { ttl: 60000, limit: 30 } })
  quote(@Body() dto: QuoteDto) {
    return this.shipping.quote(dto.cep, dto.items);
  }
}

@Controller("melhor-envio")
export class MelhorEnvioController {
  constructor(
    private readonly client: MelhorEnvioClient,
    private readonly shipments: ShipmentService,
  ) {}
  @Post("connect") @HttpCode(200) @UseGuards(AdminGuard)
  connect() {
    return { url: this.client.authorizeUrl() };
  }
  @Get("callback")
  async callback(@Query("code") code: unknown, @Query("state") state: unknown) {
    if (typeof code !== "string" || typeof state !== "string")
      throw new UnauthorizedException();
    await this.client.finishAuthorization(code, state);
    return { connected: true };
  }
  @Post("webhook") @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
    const signature = req.headers["x-me-signature"];
    if (!secret || !req.rawBody || typeof signature !== "string")
      throw new UnauthorizedException();
    // A documentação não fixa a codificação; o exemplo dela é base64.
    const expected = createHmac("sha256", secret).update(req.rawBody).digest("base64");
    if (!sameText(signature, expected)) throw new UnauthorizedException();
    const data = (req.body as { data?: { id?: unknown; status?: string; tracking?: string } })?.data;
    if (typeof data?.id === "string") this.shipments.apply(data.id, data);
    return { received: true };
  }
}

@Controller("shipments")
@UseGuards(AdminGuard)
export class ShipmentController {
  constructor(private readonly shipments: ShipmentService) {}
  @Post() create(@Body() dto: CreateShipmentDto) {
    return this.shipments.create(dto.reference, dto.serviceId, dto.to, dto.items);
  }
  @Get(":reference") find(@Param("reference") reference: string) {
    return this.shipments.find(reference);
  }
  @Post(":reference/buy") @HttpCode(200) buy(@Param("reference") reference: string) {
    return this.shipments.buy(reference);
  }
  @Post(":reference/generate") @HttpCode(200) generate(@Param("reference") reference: string) {
    return this.shipments.generate(reference);
  }
  @Post(":reference/print") @HttpCode(200) print(@Param("reference") reference: string) {
    return this.shipments.print(reference);
  }
  @Post(":reference/sync") @HttpCode(200) sync(@Param("reference") reference: string) {
    return this.shipments.sync(reference);
  }
}
