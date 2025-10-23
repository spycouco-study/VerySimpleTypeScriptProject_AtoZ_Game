import express from "express";
import ts from "typescript";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = 8080;

// ES 모듈에서 __dirname 정의
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const tsFilePath = path.join(__dirname, "src", "game.ts");

function compileTS() {
  const tsCode = fs.readFileSync(tsFilePath, "utf-8");
  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: true,
    },
  }).outputText;
  return jsCode;
}

app.get("/game.js", (req, res) => {
  try {
    const jsCode = compileTS();
    res.type("application/javascript").send(jsCode);
  } catch (err) {
    console.error("컴파일 오류:", err);
    res.status(500).send(`console.error("컴파일 오류:", ${err.message})`);
  }
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
