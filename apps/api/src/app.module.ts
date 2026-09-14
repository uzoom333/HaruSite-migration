import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { IsInt, IsString, Matches, Max, Min } from "class-validator";
import type { Request, Response } from "express";
import { DatabaseService } from "./database.service";
import { CatalogService } from "./catalog.service";
import { CartService } from "./cart.service";
import { PostalService } from "./postal.service";

/** DTO estrito: rejeita preço, campos extras, números fracionários e quantidades negativas. */
export class SetCartItemDto {
  @IsString() @Matches(/^[A-Z0-9-]{1,60}$/) sku!: string;
  @IsInt() @Min(0) @Max(99) quantity!: number;
}
@Controller()
class StoreController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly cart: CartService,
    private readonly postal: PostalService,
    private readonly db: DatabaseService,
  ) {}
  @Get("health") async health() {
    this.db.first("SELECT 1");
    return { status: "ok", database: "connected" };
  }
  @Get("products") products() {
    return this.catalog.list();
  }
  @Get("products/:slug") product(@Param("slug") slug: string) {
    return this.catalog.bySlug(slug);
  }
  @Get("postal/:cep") address(@Param("cep") cep: string) {
    return this.postal.lookup(cep);
  }
  @Get("cart") async getCart(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cart.read(await this.cart.session(req, res));
  }
  @Put("cart/items") async setItem(
    @Body() dto: SetCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cart.set(
      await this.cart.session(req, res),
      dto.sku,
      dto.quantity,
    );
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [StoreController],
  providers: [
    DatabaseService,
    CatalogService,
    CartService,
    PostalService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
