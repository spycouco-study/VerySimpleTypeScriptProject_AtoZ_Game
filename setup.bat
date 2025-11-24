@echo off
REM =========================================
REM setup.bat - Auto installation + server execution
REM 터미널에서 .\setup.bat 실행
REM =========================================

REM 1. Check / Create package.json
IF NOT EXIST package.json (
    echo creating package.json
    call npm init -y

    REM 1-1. "type": "module" 항목 삽입 (인코딩: UTF8 필수)
    powershell -Command "(gc package.json) -replace '\"main\": \"server.js\"', '\"main\": \"server.js\",`n  \"type\": \"module\"' | Out-File package.json -Encoding UTF8"
    
    REM 1-2. "test" 스크립트를 "start" 및 "dev" 스크립트로 교체 (인코딩: UTF8 필수)
    powershell -Command "(gc package.json) -replace '\"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"', '\"start\": \"node server.js\",`n    \"dev\": \"nodemon server.js\"' | Out-File package.json -Encoding UTF8"
) ELSE (
    echo package.json check successful
)

REM 2. Check / Install node_modules
IF NOT EXIST node_modules (
    echo installing packages (express, cors, esbuild, body-parser, typescript, three, cannon-es)
    call npm install express cors esbuild body-parser typescript three cannon-es

    REM Three.js 타입 정의 파일 추가
    echo installing @types/three for typescript development
    call npm install @types/three

    REM nodemon 설치
    echo installing nodemon as devDependencies
    call npm install --save-dev nodemon
) ELSE (
    echo node_modules check successful
)

REM 3. Start server
echo starting server: npm start
call npm start

pause