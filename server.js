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

app.use(
  express.static(path.join(__dirname, __endPath), {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    },
  })
);

// 가정: 이 함수는 Express 앱 내에서 사용되며, req, res 객체를 받습니다.
app.get("/game.js", async (req, res) => {
  // 비동기 함수로 변경
  try {
    const url = req.get("referer");
    // 이 파일(서버 파일)의 경로를 기반으로 절대 경로를 구합니다.
    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);

    // 1. 요청의 Referer를 기반으로 게임 폴더 경로를 계산합니다.
    // (주의: Referer 기반 경로 계산은 보안 및 안정성 측면에서 권장되지 않지만, 기존 로직을 따릅니다.)
    const folderName = url.split("/").at(-2);

    // 2. game.ts 대신 이미 빌드된 game.js 파일의 경로를 설정합니다.
    // 예시: /path/to/server/public/game_folder/game.js
    const endPath = path.join("public", folderName);
    const file_path = path.join(dirname, endPath, "game.js"); // 확장자를 .js로 변경

    console.log("읽을 JS 파일 경로:", file_path);

    // 3. 파일 시스템에서 game.js 파일을 비동기적으로 읽어옵니다.
    const jsCode = await fs.readFile(file_path, { encoding: "utf-8" });

    // 캐싱 방지 헤더 (개발 환경에서 유용)
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    // 4. 읽어온 JavaScript 코드를 클라이언트에 전송합니다.
    res.type("application/javascript").send(jsCode);
  } catch (err) {
    // 파일이 없거나(빌드되지 않았거나) 경로 오류가 발생한 경우 처리
    if (err.code === "ENOENT") {
      console.error(
        `컴파일 오류: game.js 파일을 찾을 수 없습니다. game.ts가 빌드되었는지 확인하세요. (${err.message})`
      );
      res
        .status(404)
        .send(
          `console.error("오류:", "game.js 파일을 찾을 수 없습니다. 빌드가 필요합니다.")`
        );
    } else {
      console.error("파일 읽기 오류:", err);
      res
        .status(500)
        .send(`console.error("파일 읽기 오류:", "${err.message}")`);
    }
  }
});

app.get("/:gameId/game_metadata", (req, res) => {
  const { gameId } = req.params;
  const metadataPath = path.join(__endPath, gameId, "game_metadata.json");

  fs.readFile(metadataPath, "utf8", (err, data) => {
    if (err) {
      return res.status(404).json({ error: "Metadata not found" });
    }
    res.json(JSON.parse(data));
  });
});

app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
