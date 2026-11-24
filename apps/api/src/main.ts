import { createApp } from "./bootstrap";
async function main() {
  const app = await createApp();
  await app.listen(
    Number(process.env.API_PORT || 3001),
    process.env.API_HOST || "127.0.0.1",
  );
  console.log("HARU API pronta");
}
main().catch(() => {
  console.error("Não foi possível iniciar a API. Confira a configuração.");
  process.exitCode = 1;
});
