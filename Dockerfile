# Node.js 18 베이스 이미지 사용
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm i

# 소스 코드 복사
COPY . .

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

# 포트 노출
EXPOSE 8080

# 애플리케이션 실행(배포용)
#CMD ["npm", "start"]
# 애플리케이션 실행(개발용)
CMD ["npm", "run", "dev"]