import { loadConfig } from "./config.js";
import { makeApp } from "./app.js";

const cfg = loadConfig();
makeApp(cfg).listen(cfg.port, () => {
  console.log(`relay listening on :${cfg.port}`);
});
