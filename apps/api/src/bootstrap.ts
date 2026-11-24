import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";

/** Compartilhada com testes para exercitar a mesma validação e política HTTP de produção. */
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
    bodyParser: true,
    // A assinatura do webhook é calculada sobre os bytes recebidos.
    rawBody: true,
  });
  app.setGlobalPrefix("api");
  app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
  const origins = (process.env.WEB_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((value) => value.trim());
  // O site é estático e fica em outra origem: CORS só para as origens configuradas.
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "X-Haru-Request", "Authorization"],
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    // Header customizado + JSON impedem submissão cross-site por formulário simples.
    // O webhook vem do Melhor Envio, sem esse header: quem o autentica é a assinatura.
    const isWebhook = req.path === "/api/melhor-envio/webhook";
    if (
      !isWebhook &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ) {
      const origin = req.headers.origin;
      if (
        req.headers["x-haru-request"] !== "1" ||
        !req.is("application/json") ||
        (origin && !origins.includes(origin))
      ) {
        res.status(403).json({ message: "Origem ou formato não permitido" });
        return;
      }
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  );
  app.enableShutdownHooks();
  return app;
}
