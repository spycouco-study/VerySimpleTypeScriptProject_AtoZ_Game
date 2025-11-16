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
const __endPath = path.join("public");

// // TypeScript 파일 경로
// //const tsFilePath = path.join(__dirname, "src", "love game2.ts");
// const tsFilePath = path.join(__dirname, __endPath, "game.ts");

// public 폴더에서 정적 파일 제공 (index.html, assets 등)
app.use(express.static(path.join(__dirname, __endPath)));

function compileTS(file_path) {
    const tsCode = fs.readFileSync(file_path, "utf-8");
    const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, "./");
    
    const compiledCode = ts.transpileModule(tsCode, {
        compilerOptions: {
            ...parsedConfig.options,
            module: ts.ModuleKind.None,
            isolatedModules: true
        }
    }).outputText;

    // ✨ 수정된 부분: IIFE 로직 제거
    // 컴파일된 코드 원본을 그대로 반환합니다.
    const jsCode = compiledCode;
    
    return jsCode;
}

app.get("/game.js", (req, res) => {
    try {
        const url = req.get("referer");
        let filename = fileURLToPath(import.meta.url);
        let dirname = path.dirname(filename);
        let endPath = path.join("public", url.split("/").at(-2));
        let file_path = path.join(dirname, endPath, "game.ts");

        console.log("컴파일 경로:", file_path);
        const jsCode = compileTS(file_path);

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");

        res.type("application/javascript").send(jsCode);

    } catch (err) {
        console.error("컴파일 오류:", err);
        res.status(500).send(`console.error("컴파일 오류:", "${err.message}")`);
    }
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));